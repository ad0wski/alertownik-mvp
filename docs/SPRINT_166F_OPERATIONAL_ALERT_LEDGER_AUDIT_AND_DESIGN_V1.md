# Sprint 166F-1 — Persistent Operational Alert Ledger and Storm-Protection Design

Design-only sprint: no migration executed, no SQL run, no Resend call, no
writer wiring. Closes the gap Sprint 166D-1 §I.2 explicitly deferred: *"A
persisted 'last alert sent per fingerprint' store (new table + proposed,
not-executed SQL migration) to make cooldown real across invocations
rather than only unit-tested in isolation."*

## A. Audit — read-only, no code changed before this section was written

| Area | Finding | Reference |
|---|---|---|
| `scheduled_writer_runs` | Live table (Preview only). One row per invocation, `finished_at IS NULL` while open, closed exactly once. Atomic open/close via two SECURITY DEFINER RPCs, not yet executed as of the lock migration but the run-history migration (V1) is live. | `docs/sql/PROPOSED_SPRINT_166C_RUN_HISTORY_MIGRATION_V1.sql`, `docs/sql/PROPOSED_SPRINT_166C_ATOMIC_LOCK_MIGRATION_V2.sql` |
| `open_scheduled_writer_run` / `close_scheduled_writer_run` | Exactly the atomic pattern this sprint's ledger RPCs mirror: partial unique index for the atomic guarantee, `SECURITY DEFINER` + `set search_path = ''`, internal `automation_identities` re-check, closed-vocabulary validation raised as exceptions *before* any row is touched, stale-row auto-housekeeping inside the same function call. | `src/lib/scheduledWriterRunSafety.ts`, `src/lib/scheduledWriterHistory.ts` |
| `scheduledSourceFetch` retry flow | Bounded retry: `MAX_FETCH_ATTEMPTS = 2`, one fixed-delay retry, never exponential, never a second retry after a retry fails. `RetryState.willRetryWithinRun` already tells a caller whether a transient failure has another attempt coming *within the same invocation* — there is no cron yet, so "next scheduled run" is always unknown. | `src/lib/scheduledWriterRunSafety.ts` |
| `write-candidates` route | Derives `environmentTag` via `getConfiguredDatabaseEnvironmentTag() ?? "unknown"`, a fresh `runId` via `randomUUID()` per invocation, and a `registrySourceId` (string or `null`) per source via `getRegistrySourceId(sourceKey)`. Per-source outcomes: `success | no_proposals | fetch_error | timeout | write_error`, each optionally carrying a `FetchDiagnosticCode`. Top-level `RunOutcome`: `success | partial_failure | total_failure | skipped_kill_switch | skipped_lock_held | abandoned`. | `src/app/api/cron/write-candidates/route.ts` |
| `automationErrorClassifier` | Pure, already covers `RunOutcome` → `AutomationErrorCategory` and `SourceRunOutcome` → category. **Gap found:** `categoryFromRunOutcome` maps `"abandoned"` to `"lock_held"` — the same category as a genuinely still-running lock. Semantically these are opposite: a live lock should never alert (expected concurrency guard); an *abandoned* run (auto-closed by the atomic RPC's stale-lock housekeeping — see `open_scheduled_writer_run`'s `stale_lock_auto_closed` branch) means a previous invocation likely crashed or hung, which **should** alert. This sprint's policy (§C) treats `abandoned` as its own case, never reusing the `lock_held` suppression path. | `src/lib/automationErrorClassifier.ts` |
| `automationAlerting` | Shared closed vocabularies (`AutomationErrorCategory`, `AutomationSeverity`, `RetryState`, `AdminActionRequired`, `NotificationStatus`) — reused as-is, not duplicated. | `src/lib/automationAlerting.ts` |
| `alertDeduplication` | `buildAlertFingerprint(sourceKey, category, environmentTag)` and `isWithinCooldown(lastAlertSentAt, now, cooldownMs)` already exist as pure, tested logic with `DEFAULT_ALERT_COOLDOWN_MS = 6h`. No storage — this sprint adds the storage, reusing both functions rather than reimplementing them. | `src/lib/alertDeduplication.ts` |
| `alertEmailTemplate` / `notificationAdapterFactory` / `resendNotificationAdapter` | Fully built (166D-1/166E-1/166E-2A), still not wired to any live route. `sendResendEmail` already returns a closed `ResendErrorCategory` — this sprint's `provider_status` column reuses that exact vocabulary rather than inventing a parallel one. | `src/lib/alertEmailTemplate.ts`, `src/lib/notificationAdapterFactory.ts`, `src/lib/resendNotificationAdapter.ts` |
| `source_checks`, `source_notice_candidates`, `automation_identities` | Existing tables follow one consistent RLS shape: writer identity gets narrow INSERT/UPDATE (or, post-166C Stage 2b, no direct table grant at all — SECURITY DEFINER functions only), admins get `SELECT`-only via `admin_profiles`, no other role has any access. This sprint's ledger follows the same shape from day one (function-only writes), never starting with a direct-INSERT policy that would need a later hardening migration. | `docs/sql/PROPOSED_SCHEDULED_WRITER_RLS_MIGRATION_V1.sql`, `docs/sql/PROPOSED_SPRINT_166C_RUN_HISTORY_MIGRATION_V1.sql` |
| `environment_tag` / `trigger` / `run_id` / `source_id` recognition | `environment_tag`: `getConfiguredDatabaseEnvironmentTag()` (server-only, `SUPABASE_ENVIRONMENT_TAG`). `trigger`: `"cron" \| "manual"`, always `"manual"` today (no cron wired). `run_id`: the caller-generated UUID passed to `open_scheduled_writer_run`, reused here as an optional FK. `source_id`: the registry UUID string from `getRegistrySourceId`, `null` for run-level (non-source-specific) events. | as above |

### A.1 — When does a run have a final result?

Only at `close_scheduled_writer_run` (or the atomic open's own stale-lock
auto-close, which *is* a final result: `abandoned`). A per-source result is
final the moment its `Promise.all` entry resolves — before the run itself
closes. The ledger must therefore accept notification candidates from
*both* granularities: one run-level event (`abandoned`, `total_failure`,
`skipped_kill_switch`, …) and per-source events (a specific source's
`transient_fetch` exhausted, `permanent_fetch`, `write_error`).

### A.2 — Recognizing retry exhaustion

`RetryState.willRetryWithinRun === false` **and** `category ===
"transient_fetch"` — the exact same condition already computed by
`buildRetryState`. No new logic needed; the policy in §C reads this field
directly.

### A.3 — The eight-way distinction this sprint's policy must make

| Case | Existing signal |
|---|---|
| Transient, retry pending | `category="transient_fetch"`, `retry.willRetryWithinRun=true` |
| Transient, retry exhausted | `category="transient_fetch"`, `retry.willRetryWithinRun=false` |
| Permanent | `category="permanent_fetch"` or `"write_error"` |
| Configuration error | `category="credentials_not_configured"` |
| Authentication/environment error | `category="environment_guard_blocked"` (Layer 0 pairing mismatch — the closest existing category to a real "auth" failure; the codebase has no separate provider-auth category at the automation-run level, only at the Resend-send level, which is a different, later concern) |
| Abandoned run | **new distinct input flag**, `isAbandonedRun: true` (see A gap above) — never folded into `lock_held` |
| `lock_held` (still-open, non-stale) | `category="lock_held"`, `isAbandonedRun: false` |
| Success | `category="none"` |

### A.4 — Safe to persist

Environment tag, channel, event type, severity, fingerprint, run id,
source id, status, attempt count, timestamps, suppressed reason, provider
status (closed `ResendErrorCategory` vocabulary, e.g. `"auth_error"` — the
category name, never the provider's message string), a length-capped
`safe_summary` built only from closed-vocabulary labels (mirrors
`error_summary`'s existing `${sourcesFailed}/${sourcesChecked} sources
failed` convention — counts and category names only).

### A.5 — Never to persist

`RESEND_API_KEY` or any secret/token; a stack trace; a raw exception
message; the full raw Resend response body; any URL with query parameters
(only the closed source id, never the fetched URL itself — mirrors
`write-candidates`'s existing "never a raw source URL" convention).

### A.6 — Extend or new table?

**New table.** `scheduled_writer_runs` is a one-row-per-invocation *run*
ledger; conflating it with a per-fingerprint, per-notification-attempt
ledger (which must support cooldown lookups keyed by fingerprint across
many different runs, and per-source granularity that a run row does not
have) would overload one table with two different lifecycles and unique-
index requirements. A `scheduled_writer_run_id` **foreign key** links the
two without merging them — matching how `source_notice_candidates` already
references sources by id rather than embedding source data inline.

---

## B. Final notification policy (Etap 3 — implemented as `operationalNotificationPolicy.ts`)

Closed decision vocabulary:

```
notify
suppress_retry_pending
suppress_lock_held
suppress_duplicate
suppress_cooldown
suppress_success
suppress_not_actionable
fail_closed
```

Default behavior (pure, no I/O — `decideNotificationCategory`):

| Input | Decision |
|---|---|
| `isAbandonedRun: true` | `notify` (never suppressed as `lock_held`) |
| `category: "none"` | `suppress_success` |
| `category: "lock_held"`, not abandoned | `suppress_lock_held` |
| `category: "transient_fetch"`, `retry.willRetryWithinRun: true` | `suppress_retry_pending` |
| `category: "transient_fetch"`, `retry.willRetryWithinRun: false` | `notify` |
| `category: "permanent_fetch" \| "write_error" \| "unexpected_error"` | `notify` |
| `category: "credentials_not_configured" \| "environment_guard_blocked"` | `notify` (severity always `critical`, reused from `severityForCategory`) |
| `category: "kill_switch_disabled"` | `suppress_not_actionable` (expected, deliberate operator choice) |
| anything else | `fail_closed` |

Cooldown and duplicate-claim suppression are **not** decided by this pure
function — they require the persisted store (§D) and are applied by the
orchestrator (§F) *after* `decideNotificationCategory` returns `notify`,
exactly mirroring how `isWithinCooldown` was already designed as a
separate, composable step in 166D-1.

`severity`, `adminActionRequired`, and `retryState` are unchanged —
reused directly from `severityForCategory` / `buildAdminActionRequired` /
`buildRetryState`, never reimplemented. `eventType` is a new closed union
(`operationalNotificationPolicy.ts`) distinguishing `abandoned_run` from
every `AutomationErrorCategory`, one-to-one, so the ledger's `event_type`
column and this module's own switch can never silently drift apart.
Default cooldown: `DEFAULT_ALERT_COOLDOWN_MS` (6h), reused unchanged from
`alertDeduplication.ts`.

---

## C. Persistent ledger table design (Etap 4)

`public.operational_notification_events` (name confirmed — no existing
table name in this codebase better fits; `scheduled_writer_runs` is
reserved for run-level history as established in §A.6).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid primary key default gen_random_uuid()` | |
| `created_at` | `timestamptz not null default now()` | |
| `updated_at` | `timestamptz not null default now()` | Set explicitly by the finalize RPC on every transition — no trigger, matching this codebase's existing "the writing function sets every column it touches" convention (no triggers exist anywhere else in this schema). |
| `environment_tag` | `text not null` | |
| `channel` | `text not null check (channel = 'email')` | Single-member closed set today; a real second channel would need a migration, deliberately — never an open string. |
| `event_type` | `text not null check (...)` | Closed set, one-to-one with the TS `OperationalNotificationEventType` union. |
| `severity` | `text not null check (severity in ('info','warning','critical'))` | Reuses `AutomationSeverity`'s exact vocabulary. |
| `fingerprint` | `text not null` | `buildOperationalNotificationFingerprint` output — see §E. |
| `scheduled_writer_run_id` | `uuid references public.scheduled_writer_runs(id)` | Nullable — some events (e.g. a future manually-triggered health check) may have no associated run. |
| `source_id` | `text` | Nullable — `null` for run-level (non-source-specific) events. |
| `status` | `text not null check (status in ('claimed','sent','failed','suppressed','abandoned'))` | |
| `attempt_count` | `integer not null default 1 check (attempt_count >= 0)` | |
| `claimed_at` | `timestamptz` | |
| `finished_at` | `timestamptz` | |
| `sent_at` | `timestamptz` | |
| `suppressed_reason` | `text check (suppressed_reason is null or suppressed_reason in (...))` | Closed set matching the policy's own `suppress_*` literals. |
| `provider_status` | `text check (provider_status is null or provider_status in (...))` | Reuses `ResendErrorCategory`'s exact vocabulary plus `'sent'`. |
| `safe_summary` | `text check (safe_summary is null or char_length(safe_summary) <= 200)` | Same 200-char cap as `scheduled_writer_runs.error_summary`. |
| `cooldown_until` | `timestamptz` | Set by the claim RPC; read by the *next* claim attempt for the same fingerprint. |

No `error_summary` column exists on this table — deliberately, per the
"never persist raw error_summary" rule. `safe_summary` is the only free-
text field, and it is built exclusively from closed-vocabulary labels
(see §E) — no code path may pass a raw exception message or provider
response into it.

---

## D. Atomic RPCs and permissions (Etap 5 — file written, NOT executed)

`docs/sql/PROPOSED_SPRINT_166F_OPERATIONAL_NOTIFICATION_LEDGER_V1.sql`
mirrors `PROPOSED_SPRINT_166C_ATOMIC_LOCK_MIGRATION_V2.sql` exactly:

- **`claim_operational_notification_event(...)`** — the only way a row is
  ever inserted. In one atomic function call: re-checks
  `automation_identities` membership; validates every closed-vocabulary
  argument (raises before touching any row); auto-abandons a stale
  `claimed` row for the same `(environment_tag, fingerprint)` scope past a
  bounded staleness window (mirrors `open_scheduled_writer_run`'s
  `stale_lock_auto_closed` housekeeping); checks the most recent row for
  that scope's `cooldown_until` — if still in the future, returns
  `claimed = false, suppressed_reason = 'suppress_cooldown'` with **no
  insert**; otherwise attempts the `INSERT`, relying on a **partial unique
  index on `(environment_tag, fingerprint) WHERE status = 'claimed'`** to
  make "is one already claimed" and "claim it" one atomic operation — a
  `unique_violation` here means a genuine concurrent claim won the race,
  returned as `claimed = false, suppressed_reason = 'suppress_duplicate'`,
  never as an uncaught exception.
- **`finish_operational_notification_event(...)`** — the only way a claim
  is ever closed. Validates `status ∈ {sent, failed, abandoned}` and
  `provider_status` against its closed set before the `UPDATE`; the
  `WHERE id = p_id AND status = 'claimed'` guard makes it impossible to
  finalize an already-finalized or never-claimed row twice (identical
  pattern to `close_scheduled_writer_run`'s `finished_at is null` guard).

Permissions: `revoke all ... from public`, `grant execute ... to
authenticated` only — no `SELECT`/`INSERT`/`UPDATE` grant on the table
itself for the writer identity at all (function-only, from day one,
unlike `scheduled_writer_runs`'s original v1 which needed a later
hardening pass). Admins get `SELECT` only via a policy mirroring
`scheduled_writer_runs_admin_select`. RLS is enabled on the table. Every
`SECURITY DEFINER` function uses `set search_path = ''` with fully
qualified references (`pg_catalog.now()`, `pg_catalog.make_interval()`),
matching the Revision 2 hardening already applied to the 166C migration.
`environment_tag` is a plain column value, never a role or schema — the
same migration file and functions serve both Preview and Production
identically; only the *data* is ever scoped per environment, exactly like
`scheduled_writer_runs` today. Production is never touched by this sprint
— the file is written for review only.

**Open design question flagged, not resolved by assumption:** whether
`claim_operational_notification_event` should accept the caller's
`p_cooldown_seconds` as a parameter (flexible per event type) or hard-code
`DEFAULT_ALERT_COOLDOWN_MS / 1000` server-side (simpler, matches how
`open_scheduled_writer_run`'s `p_stale_after_seconds` **is** a parameter
but always called with one constant). This design takes the **parameter**
approach (bounded to a sane range, mirroring `p_stale_after_seconds`'s own
`[300, 86400]` bounds check) since a future `kill_switch_disabled`-class
event might reasonably want a different cooldown than a `permanent_fetch`
— but this is a genuine judgment call, not a fact derivable from existing
code, and is called out explicitly here rather than silently decided.

---

## E. Fingerprint and cooldown

`buildOperationalNotificationFingerprint(environmentTag, scopeKey,
eventType)` → `` `${environmentTag}:${scopeKey}:${eventType}` `` — same
shape as the existing `buildAlertFingerprint`, generalized to accept
`eventType` (which distinguishes `abandoned_run` from `lock_held`, unlike
the existing function which only ever received an `AutomationErrorCategory`)
and a generic `scopeKey` (`sourceId` for source-level events, the literal
`"run"` for run-level events with no single source). Same environment
never collides with another (environment_tag is always the first
segment); same error on a different source never collides with a
different source's fingerprint; the exact same recurring problem on the
same source in the same environment always produces the same fingerprint,
which is what lets `cooldown_until` suppress a flapping source without
silencing a genuinely new failure elsewhere.

---

## F. Concurrency

Two parallel claim attempts for the same `(environment_tag, fingerprint)`
can never both return `claimed = true` — the partial unique index is
enforced by Postgres itself during the `INSERT`, identical to
`scheduled_writer_runs_one_open_per_scope`. This sprint's tests (§ Etap 8)
simulate this with the same in-memory "shared committed set" fake writer
pattern already used in `tests/e2e/scheduledWriterConcurrency.spec.ts` —
no live database needed to prove the *application's* reaction to a
conflict is correct; the database's own guarantee can only be verified
live, after Adam approves and applies the actual migration.

---

## G. Content safety

`safe_summary` is built by a pure function that only ever concatenates
closed-vocabulary labels and counts (mirrors
`${sourcesFailed}/${sourcesChecked} sources failed`) — never an argument
of type "whatever the caller wants to log." `provider_status` is the
Resend `ResendErrorCategory` name only, never `error.message`. No column
on this table can ever hold a secret, token, stack trace, or raw
provider/source response body — enforced structurally (no such column
exists) rather than only by convention.

---

## H. Sprint 166F-2A Hardening Addendum

Final migration hardening pass before Adam's decision to apply the
migration in Preview only. No SQL executed, no writer wiring, no Resend
call — all changes below are static, reviewed edits to the not-yet-run
migration file and its supporting TypeScript specification.

### H.1 — Canonical abandoned-vs-lock_held resolution

`automationErrorClassifier.categoryFromRunOutcome` is **live** — wired
into `runHistoryStatus.ts` (the shipped `/admin/sources` run-history
display) and pinned by an existing test asserting
`categoryFromRunOutcome("abandoned") === "lock_held"`. Changing its
return value would be a live regression to an already-shipped admin
panel, not a safe change to make as a side effect of this sprint.
Resolution: a new, canonical, single-purpose function,
`isAbandonedRunOutcome(outcome: RunOutcome): boolean`
(`src/lib/operationalNotificationPolicy.ts`), returning `true` only for
`outcome === "abandoned"`. Every future caller wiring this policy to a
real run outcome must derive `isAbandonedRun` from **this** function,
called against the raw `RunOutcome` — never re-derived from `category`
alone (which cannot make the distinction at all) or from
`categoryFromRunOutcome`'s own output (which has already discarded it).
Regression tests added (`tests/e2e/operationalNotificationPolicy.spec.ts`,
describe block "Sprint 166F-2A — canonical abandoned vs. lock_held
adapter") prove, using the real classifier end-to-end: `skipped_lock_held`
→ `suppress_lock_held`; `abandoned` → `notify`; and that `abandoned` never
travels the `suppress_lock_held` path regardless of category alone.

### H.2 — Cooldown: fixed 6 hours, never a caller parameter

The 166F-1 draft's "open design question" (§D above) is now **resolved**:
`p_cooldown_seconds` is removed from the claim RPC's public contract
entirely. A parameter the write path controls is a parameter a bug (or a
future careless caller) could use to silently weaken the ledger's own
storm protection — exactly the failure mode this table exists to
prevent. The cooldown is now a single fixed constant, `21600` seconds (6
hours), declared once inside `claim_operational_notification_event()`
itself (`v_cooldown_seconds constant integer := 21600;`) and mirrored in
TypeScript as `NOTIFICATION_COOLDOWN_SECONDS`
(`src/lib/operationalNotificationLedger.ts`) — a value tests can assert
against by name, never passed anywhere as an actual argument. Both the
pure `decideNotificationPolicy`'s default (`DEFAULT_ALERT_COOLDOWN_MS` =
21,600,000 ms) and this new SQL/TS constant now provably agree: 21600
seconds, one number, three places it's asserted to match
(`alertDeduplication.ts`, `operationalNotificationLedger.ts`, the SQL
migration), never two independently-chosen values that could drift. A
future per-event-type cooldown remains possible but requires a new,
separately-reviewed migration that reintroduces a bounds-checked
parameter — never a silent runtime toggle.

### H.3 — `source_id` type correction

The 166F-1 draft typed `source_id` as a bare `text`. Corrected to `uuid
references public.alert_sources(id) on delete set null` — matching
`source_notice_candidates.source_id`'s existing, established convention
exactly (`docs/supabase_source_notice_candidates.sql`): a nullable FK,
`ON DELETE SET NULL` (never `CASCADE`), so this ledger's own history
survives a source later being removed from the registry.
`scheduled_writer_run_id`'s FK deliberately keeps no `ON DELETE` clause
(defaults to `NO ACTION`) — unlike `alert_sources`, rows in
`scheduled_writer_runs` are never deleted by any role (see that table's
own migration: "No delete policy for any role"), so `NO ACTION` can never
block a legitimate delete that could otherwise happen.

### H.4 — `attempt_count` upper bound

Added a defensive upper bound (`<= 1000`) alongside the existing `>= 0`
check. Neither RPC currently increments this column past its initial
value of `1` — the cap exists only in case a future migration adds a
retry-within-claim path, matching this codebase's general preference for
bounded rather than unbounded counters.

### H.5 — The `'suppressed'` status remains reserved, not reachable

Audit finding, documented rather than silently left as dead code: neither
RPC ever writes a row with `status = 'suppressed'`. A `suppress_cooldown`
or `suppress_duplicate` result is returned to the caller **without**
inserting a new row — the existing row already on file (the still-open
claim being duplicated, or the prior row carrying the active
`cooldown_until`) already documents why. Inserting a fresh row for every
suppressed attempt would itself be a storm-protection failure mode
(unbounded table growth under a frequently-retried, flapping source).
`'suppressed'` stays in the `CHECK` constraint as a reserved value for a
possible future where the higher-level policy's own `suppress_*`
decisions — `suppress_retry_pending`, `suppress_lock_held`,
`suppress_success`, `suppress_not_actionable` (none of which ever reach
this RPC at all, since the orchestrator only calls `claim()` after
`decideNotificationPolicy` has already returned `"notify"`) — might also
warrant a persisted audit row. That remains a distinct, separate decision,
never silently assumed.

### H.6 — RPC result vocabulary vs. the Etap 5 checklist wording

The Etap 5 instruction's example result vocabulary (`claimed`,
`suppressed_cooldown`, `suppressed_duplicate`, `suppressed_in_flight`,
`fail_closed`) is **conceptually** satisfied, using this codebase's own
existing naming rather than a second, parallel vocabulary:
`suppressed_in_flight` and `suppressed_duplicate` describe the exact same
case (an existing open claim blocks a new one) — the migration and TS
both call this `suppress_duplicate`, matching `NotificationDecision`'s own
literal exactly; introducing a second name for the identical concept
would itself be the kind of "two conflicting sources of truth" Etap 2
explicitly warns against. `fail_closed` is realized as the function
**raising an exception** for any invalid/unrecognized input (never
silently returned as a normal row) — identical to
`open_scheduled_writer_run`'s own established convention, where the
caller's `.catch(() => ({ opened: false }))` (mirrored here as a future
`.catch(() => fail-closed)`) collapses every unexpected error into the
same safe, fail-closed outcome.

## Status update (Sprint 166F-2A/2B, 2026-07-24)

- Migration applied in Preview (`alertownik-preview`): **done**.
- Controlled concurrency test: **PASS**.
- Controlled cooldown test: **PASS**.
- Runtime integration with the scheduled writer: **not started**.

Full detail: `docs/SPRINT_166F_PREVIEW_LEDGER_VALIDATION_CHECKPOINT_V1.md`.
