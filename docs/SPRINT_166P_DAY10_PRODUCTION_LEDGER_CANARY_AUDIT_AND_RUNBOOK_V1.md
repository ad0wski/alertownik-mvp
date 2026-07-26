# Sprint 166P — Day 10: Production Ledger Canary — Audit, Design, Preflight

**Status: audit and design only. NO activation performed.**
**GO/NO-GO (superseded — see §2A): originally NO-GO, now corrected to GO
for the schema/RPC layer** after a follow-up migration preflight (§14
onward) found the original NO-GO was based on a false negative. No flag
was set, no redeploy was triggered, no request was sent to `ledger-test`,
no RPC was called, no SQL was written or executed — this correction was
discovered entirely through more careful read-only introspection, not
through any state change.

**⚠ CORRECTION NOTICE (added same Day 10, follow-up turn):** §2 and §3
below, as originally written, are **factually wrong** about the RPC
functions' existence. They are left unedited below for an honest record
of what was found and reported at the time; §2A immediately follows with
the correction, and §14 onward contains the full follow-up audit. If you
are only going to read one section, read §2A.

---

## 1. Branch

Created linearly from `main` (`179386d77c074c2352b1a1ff9c58ab95d8a9fd6d`):

```
git checkout main && git pull --ff-only origin main
git checkout -b sprint-166p-production-ledger-canary-v1
```

## 2. GO/NO-GO — stated up front

**NO-GO.** A live Production canary of `POST /api/admin/operational-notification-ledger-test`
would fail today — not because any flag is off (that's the *intended*
default-safe state), but because the two RPC functions the route's claim/
finish cycle depends on, `claim_operational_notification_event` and
`finish_operational_notification_event`, **do not exist in the Production
database at all**. This was found via direct, read-only introspection
(§3) — not inferred from documentation. Every other precondition checked
in this audit is already satisfied (§3); this is the **only** blocker,
and it is a schema-level one, requiring a migration Adam must explicitly
request and run himself, per this project's own standing security rules
(`CLAUDE.md` §"Never change the Supabase schema... without the user
explicitly requesting it").

The good news: the exact migration needed **already exists**, already
written, already reviewed, and already proven byte-for-byte equivalent to
what's live on Preview — `docs/sql/PROPOSED_SPRINT_166H_PRODUCTION_SCHEDULED_WRITER_AND_LEDGER_MIGRATION_V1.sql`.
It was written in an earlier sprint but never executed against Production.
Nothing new needs to be designed; it only needs Adam's explicit go-ahead
to run it.

## 2A. Correction — the NO-GO above was based on a false negative

A follow-up migration preflight (requested by Adam as this same Day 10's
next turn, before any migration action was taken) found that **the
original check in §3 was wrong** — not because Production's state
changed between the two turns, but because the query used to check for
the four RPC functions was itself flawed.

**Root cause:** the original check used
`information_schema.routines` (and, in the pre-existing
`VERIFY_SPRINT_166H_PRODUCTION_POST_MIGRATION_READONLY_V1.sql` file's own
§7, `information_schema.routine_privileges`). Per the SQL standard and
PostgreSQL's own implementation, **both of these `information_schema`
views are filtered to only the objects/grants the *currently connected
role* itself owns or has been granted** — a role that is neither the
function owner nor `authenticated` (which is exactly what this session's
`supabase-alertownik` MCP tool's underlying connection is, by design —
it was never intended to hold application-level `EXECUTE` grants) sees
**zero rows**, even when the function fully exists and is correctly
configured. This is a real, well-documented `information_schema`
behavior, not a bug in Postgres — but it is an easy trap for exactly the
kind of read-only introspection this audit was doing.

**The correction:** re-querying via `pg_proc` directly (a raw system
catalog, whose visibility is governed by schema-level visibility, not
per-object privilege) shows all four functions exist, with:
- **Bodies byte-for-byte identical** to
  `PROPOSED_SPRINT_166H_PRODUCTION_SCHEDULED_WRITER_AND_LEDGER_MIGRATION_V1.sql`'s
  own proposed function bodies (confirmed via `pg_get_functiondef()`,
  compared statement-by-statement against the file).
- `prosecdef = true` (`SECURITY DEFINER`) and `proconfig` containing
  `search_path=""` (empty, safe) for all four.
- `has_function_privilege()` (role-independent, unlike the
  `information_schema` views) confirms `authenticated` has `EXECUTE` on
  all four, and `anon`/`public` do not.
- A negative-control query (a deliberately fake function name) confirms
  the `pg_proc` query technique itself isn't producing false positives —
  it correctly returns zero rows for something that truly doesn't exist.

**Conclusion:** the entire Sprint 166H migration — both tables, all
columns/constraints/indexes, both RLS policies, and all four
`SECURITY DEFINER` functions with correct grants — is **already fully
and correctly applied to Production**, not merely partially. See §14
onward for the complete follow-up audit, idempotency findings, security
review of the migration SQL itself, and the corrected final verdict.

## 3. Read-only preflight — full results (superseded by §2A/§14 for the RPC-existence row specifically; every other row below remains correct)

| Check | Result |
|---|---|
| `main` hash | `179386d77c074c2352b1a1ff9c58ab95d8a9fd6d` |
| `origin/main` hash | identical |
| Working tree | clean (only pre-existing untracked `.vscode/`) |
| Current Production deployment | Ready, commit `179386d`, domain `alertownik-mvp.vercel.app` |
| `POST /api/admin/operational-notification-ledger-test` route exists | ✅ yes (`src/app/api/admin/operational-notification-ledger-test/route.ts`) |
| RPC `claim_operational_notification_event` exists in Production | ❌ **NO** — `information_schema.routines` returns zero rows |
| RPC `finish_operational_notification_event` exists in Production | ❌ **NO** — same query, zero rows |
| RPC `open_scheduled_writer_run` / `close_scheduled_writer_run` exist in Production | ❌ **NO** — also zero rows (confirms the entire Sprint 166H RPC migration was never applied, not just the ledger half) |
| `operational_notification_events` table exists in Production | ✅ yes, with exactly one RLS policy: admin-only `SELECT` — **no write policy of any kind**, consistent with a function-only write design that has no functions yet |
| `scheduled_writer_runs` table exists in Production | ✅ yes, same pattern (admin-only `SELECT`) |
| Dedicated Production admin account | ✅ `admin_profiles` has exactly 1 row — Adam's own real account, confirmed/not banned/not deleted (Production doesn't use a separate synthetic admin the way Preview does — the sole real owner account is the admin) |
| Production writer credentials configured in Vercel | ✅ `SUPABASE_SCHEDULED_WRITER_EMAIL` / `SUPABASE_SCHEDULED_WRITER_PASSWORD`, Production scope, present |
| Production writer record(s) in `automation_identities` | ✅ **2** rows (not 1) — both confirmed/not banned/not deleted. Noted as an observation, not a blocker: `getScheduledWriterCredentials()`/`signInScheduledWriter()` only needs the configured email to sign in successfully and be *a* member of this table, which it is either way. Which of the two is the "intended" one isn't determinable without reading the sensitive email value, and isn't necessary for this audit. |
| `checkDatabaseEnvironmentGuard()` four-signal guard | ✅ passing in practice — `SUPABASE_ENVIRONMENT_TAG` and `SUPABASE_EXPECTED_PROJECT_REF` both present for Production scope in Vercel (the route source's own code comments describe an *earlier* sprint's state where these were unset everywhere; that has since changed — confirmed live via Vercel search, not from the stale comment). This is independently corroborated by the writer's own last real run already succeeding (`runHistory.lastClosedRun.outcome: "success"`, 2026-07-25) — that route uses the identical guard. |
| `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED` anywhere | ✅ absent everywhere (Vercel search, zero results) |
| `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED` / `OPERATIONAL_EMAIL_ALERTS_ENABLED` in Production | ✅ **absent from Production entirely** (not "set to false" — never created there; both exist only under Preview, branch-pinned to unrelated sprints). Functionally equivalent to false under this codebase's exact-string-match convention, but worth stating precisely. |
| `SCHEDULED_WRITES_ENABLED` / `SCHEDULED_CHECKS_ENABLED` in Production | ✅ present, Production scope (values not re-read here — Adam's own confirmed input for this session states both false) |
| Open/claimed `operational_notification_events` in Production | ✅ zero — `one_total=0, one_open=0` |

## 4. Full baseline — Production counters

| Table | Value |
|---|---|
| `operational_notification_events` — total | 0 |
| `operational_notification_events` — open/claimed (`claimed_at` set, `finished_at` null) | 0 |
| `scheduled_writer_runs` — total | 1 |
| `scheduled_writer_runs` — open | 0 |
| `source_notice_candidates` | 3 |
| `source_checks` | 2 |
| `alerts` | 6 |
| `automation_identities` | 2 |
| `admin_profiles` | 1 |

Most recent timestamps (all predate today, confirming no background
activity): last alert `2026-07-06`, last candidate `2026-07-25`, last
source check `2026-07-12`, last writer run `2026-07-25`.

## 5. Code analysis — exactly what the route does

Read directly from `src/app/api/admin/operational-notification-ledger-test/route.ts`
(unchanged since Sprint 166N-B; this audit did not modify it):

1. `requireAdminSession()` — first line, unconditional. No unauthenticated
   or non-admin caller reaches anything past this.
2. `checkDatabaseEnvironmentGuard()` — Layer 0, the four-signal guard
   (§3). Confirmed passing for Production today.
3. `isOperationalNotificationLedgerTestEnabled(process.env.OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED)` —
   exact-string `"true"` match, own dedicated flag, currently absent
   everywhere → route returns `{ ok: true, status: "disabled" }` and stops
   if ever hit today.
4. `getScheduledWriterCredentials()` + `signInScheduledWriter()` — requires
   both Production writer env vars (present) and a successful sign-in
   against one of the 2 `automation_identities` rows (present).
5. `claimEventForSending()` → **would call the missing RPC** →
   `client.rpc("claim_operational_notification_event", ...)` returns a
   Postgres "function does not exist" error → `createSupabaseOperationalNotificationLedger.claim()`
   throws `Error("operational_notification_claim_failed")` → caught by the
   route's outer `try/catch` → response `{ ok: false, error: "Nieoczekiwany błąd." }`,
   HTTP `503`. **No row is ever written** — the `INSERT` lives entirely
   inside the missing RPC body; there is no fallback direct-table write
   anywhere in this code path (confirmed: `operationalNotificationLedgerSupabase.ts`
   only ever calls `.rpc()`, never `.from(...).insert()`).
6. Even if the RPC existed and claim succeeded: `createConfiguredNotificationAdapter()` →
   `decideNotificationAdapterKind()` checks `isEmailAlertsEnabled(process.env.OPERATIONAL_EMAIL_ALERTS_ENABLED)` —
   absent in Production → **always returns `"noop"`** → `createNoopNotificationAdapter()`
   is used, which the codebase's own tests already prove performs zero I/O
   and always reports `"disabled"`. **No email is ever sent and no HTTP
   request to Resend is ever made** — this is structurally guaranteed by
   the adapter factory's own decision function, not merely by the flag
   being false; even a bug elsewhere in the route could not reach Resend
   without `OPERATIONAL_EMAIL_ALERTS_ENABLED=true` being set first, which
   this canary's own scope explicitly never does.
7. `finalizeOperationalNotificationEvent()` → would call the (also
   missing) `finish` RPC.

**Answering the audit's specific questions:**

- **Flags required to reach any behavior beyond `"disabled"`:** exactly
  one — `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED=true`. Nothing else
  needs to change; `OPERATIONAL_EMAIL_ALERTS_ENABLED` and
  `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED` are both irrelevant to this
  specific diagnostic route (it never checks the runtime flag, and only
  the adapter factory checks the email flag, always safely).
- **Event that would be created (if the RPC existed):** `event_type: "unexpected_error"`,
  `channel: "email"`, `severity: "info"`, `scopeKey: "ledger-test"`,
  `safe_summary`: the fixed Polish diagnostic string
  ("Diagnostyczny test ledgera operacyjnego (Sprint 166N) — nie jest to
  prawdziwy incydent."), `scheduled_writer_run_id: null`, `source_id: null`.
- **Fingerprint that would be used:** `${environmentTag}:ledger-test:unexpected_error`
  — see §6 for the concrete Production value and collision analysis.
- **Tables that could change (if the RPC existed):** exactly one —
  `operational_notification_events` (one `INSERT` via claim, one `UPDATE`
  via finish, same row). Nothing else — the route never imports
  `writeCandidatesForSource`, never touches `source_notice_candidates`,
  `alerts`, or `scheduled_writer_runs` (confirmed: no import of any writer
  or Builder helper anywhere in this file).
- **Maximum expected counter increase (if the RPC existed and this
  canary were ever run):** `operational_notification_events` **+1**, every
  other table **+0**.
- **Alert publication:** impossible — this route never imports
  `writeCandidatesForSource` or any Builder/publish path.
- **Email/Resend with `OPERATIONAL_EMAIL_ALERTS_ENABLED=false`:**
  structurally impossible per §5.6 above — `decideNotificationAdapterKind()`
  always returns `"noop"` before any Resend client is even constructed.
- **Claim/finish count:** exactly one of each, by construction — the route
  calls `claimEventForSending` once and `finalizeOperationalNotificationEvent`
  once, unconditionally, with no loop or retry anywhere in this file.
- **No event can remain open/stale-claimed:** the route's own code path
  always reaches `finalizeOperationalNotificationEvent` synchronously
  after a successful claim, in the same request — there is no `await`
  gap where the process could be killed leaving a claim orphaned, other
  than a genuine process crash (covered as a named failure scenario, §8).
  The ledger's own `claim` RPC also has a 6-hour cooldown and a
  stale-claim self-heal path (any prior `claimed` row older than
  `p_stale_claim_after_seconds`, default 300s, is auto-abandoned by the
  *next* claim attempt) — belt-and-suspenders even in a worst case.

## 6. Fingerprint collision check — Preview vs. Production

The fingerprint is `buildOperationalNotificationFingerprint(environmentTag, "ledger-test", "unexpected_error")`
= `${environmentTag}:ledger-test:unexpected_error` (`src/lib/operationalNotificationPolicy.ts`).
`environmentTag` comes from `getConfiguredDatabaseEnvironmentTag()`, which
reads `SUPABASE_ENVIRONMENT_TAG` and resolves it through
`resolveEnvironmentIdentity()` — a closed-vocabulary resolver already
used everywhere else in this codebase to produce exactly `"preview"` or
`"production"` (never a raw/arbitrary string).

- **Preview's actual canary fingerprint** (observed live, Sprint 166O-D):
  `preview:ledger-test:unexpected_error`.
- **Production's fingerprint would be:** `production:ledger-test:unexpected_error`.
- **Collision risk: none.** The two strings differ in their first segment,
  and the ledger's own uniqueness constraint
  (`operational_notification_events_one_claim_per_scope`, a partial unique
  index on `(environment_tag, fingerprint) where status = 'claimed'`) is
  itself scoped by `environment_tag` as a real column, not merely as part
  of the fingerprint string — even a hypothetical fingerprint collision
  would not cross environments, because Preview and Production are
  entirely separate Supabase projects/databases in the first place (no
  shared table to collide in). No new/alternate fingerprint scheme is
  needed; the existing deterministic one is already environment-safe by
  construction.
- **The old, unrelated Production row** (if any manual test rows exist):
  none — Production's `operational_notification_events` is confirmed
  empty (§4), unlike Preview which retained one older manually-created row
  from Sprint 166F-2B with an unrelated fingerprint format.

## 7. Prepared runbook — one Production canary (NOT executed; blocked on §2)

This is the exact sequence for a future turn, **once the RPC migration
(§2) has been applied and separately confirmed** — written now so no
design work remains once that precondition clears.

1. **Preflight** (repeat §3's live checks — RPC existence must now read
   ✅, everything else should be unchanged).
2. **Set exactly one flag:** `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED=true`,
   **Production scope only**, no branch-pinning (Production has no branch
   concept the way Preview does — this applies to the `main`-tracked
   Production environment directly). Every other flag stays exactly as-is.
3. **Exactly one redeploy** of the current Production deployment (via the
   Deployments list's "..." → Redeploy on the correct row — never the
   save-toast's Redeploy button, per this project's own established,
   repeatedly-confirmed trap where that button can default to the wrong
   environment). Wait for Ready.
4. **Fresh preflight after redeploy:** confirm flag picked up (no direct
   way to observe this without the one POST — confirmed instead via
   `automation-status` still showing no "ledger" mention, since this flag
   doesn't surface there either, consistent with Preview's own precedent),
   admin session still valid, endpoint still `GET` → `405`.
5. **Exactly one authenticated `POST`** to
   `/api/admin/operational-notification-ledger-test`, from the existing,
   already-logged-in Production admin session (§9) — its `access_token`
   read from `localStorage` programmatically, never displayed/logged/
   copied. Zero retry, regardless of response.
6. **Immediate rollback:** delete
   `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED` from Production scope.
7. **Exactly one rollback redeploy.** Wait for Ready.
8. **Compare counters before/after** (same method as §4): expect
   `operational_notification_events` **+1**, everything else **+0**.
9. **Inspect the specific new row:** `fingerprint = "production:ledger-test:unexpected_error"`,
   `status` terminal (`"abandoned"`, matching Preview's own canary result,
   since `OPERATIONAL_EMAIL_ALERTS_ENABLED` will still be absent/false),
   `claimed_at` and `finished_at` both set, no gap suggesting a stale
   claim.
10. **Confirm:** no email/Resend contact (structurally impossible per
    §5.6), no new/changed row in any other table, `LEDGER_TEST` flag
    absent again (Vercel search), endpoint `GET` → `405` again.

## 8. Failure scenarios and minimal rollback (not executed — reference only)

| Scenario | Detection | Minimal rollback |
|---|---|---|
| Response `401`/`403` | Session expired or not admin | No system state changed (guard rejects before any write) — nothing to roll back; re-establish a valid admin session before retrying (still counts as zero attempts against the "exactly one POST" budget, since no claim occurred) |
| Response `405` | Wrong HTTP method used by mistake | No state changed — route never reached past method routing |
| Response `500`/`503` (e.g. environment guard or RPC failure, exactly the failure mode this audit predicts today) | Body is a generic closed-vocabulary message, never a stack trace | Delete the flag, one redeploy — same as the normal rollback (steps 6-7); no event was ever created, so no further cleanup needed |
| No event created despite a `200`/success-shaped response | `operational_notification_events` count unchanged after §8 comparison | Investigate before any further action — this would indicate an unexpected code path; do not retry; delete flag, redeploy, then read (not write) the ledger's exact response to understand why |
| Event remains `claimed` (no `finished_at`) | Direct `SELECT` on the one new row shows `finished_at IS NULL` | The ledger's own 6-hour cooldown and stale-claim self-heal (§5) already bounds this automatically; if immediate correction is wanted, the *only* acceptable action is deleting the flag and redeploying — never a manual `UPDATE` on the row (that would be exactly the "SQL zapisujący" this turn's constraints and the standing MCP rules forbid) |
| Unexpected increment in any other table (`scheduled_writer_runs`, `source_notice_candidates`, `alerts`, `source_checks`) | §8 counter comparison shows a nonzero delta anywhere but `operational_notification_events` | Stop immediately, do not attempt further diagnosis via write actions; delete flag, redeploy, then investigate read-only — this would mean the code no longer matches this audit's own analysis (§5), a genuinely unexpected finding worth pausing the whole canary program over, not just this one attempt |
| Unexpected contact with Resend (e.g. a delivery/webhook log appears) | Resend's own dashboard, checked read-only, outside this codebase | Should be structurally impossible per §5.6; if it ever happened it would mean `OPERATIONAL_EMAIL_ALERTS_ENABLED` was somehow true, which this runbook never sets — treat as a critical, standalone incident, not a canary-specific failure; delete flag, redeploy, and stop the whole program pending investigation |
| Session/browser crash or interruption after the flag is set but before the POST, or after the POST but before rollback | The flag would still show as `true` in a subsequent Vercel check | Resume exactly at whichever step was interrupted — never re-send the POST if it's unclear whether it already succeeded (check `operational_notification_events` read-only first to see if a row already exists for `production:ledger-test:unexpected_error` before deciding); always still complete the rollback (steps 6-7) as the very next action once resumed |

## 9. Production admin session check (read-only only, this turn)

- `GET /admin/sources` on `alertownik-mvp.vercel.app` → loads fully under
  an **already-existing** authenticated session in this browser
  (`sb-puhcjyffosgohbmxrczb-auth-token` — correct Production project ref).
  This session was not created by this turn's work; it predates it.
- `GET /api/admin/automation-status` (authenticated, using that existing
  session's own token) → `200`: `writesEnabled: false`,
  `writeAttemptsPossible: false`, `cronSecretConfigured: true`,
  `writerCredentialsConfigured: true`, `operationalNotificationRuntimeEnabled: false`,
  `emailAlertConfig.enabled: false`, `runHistory.openRun: null`. No
  mention of "ledger" anywhere in the response.
- **No `POST` was sent to `ledger-test`** — confirmed by direct review of
  every network call this turn; the only calls made were the two `GET`s
  above plus the earlier read-only `information_schema`/`pg_policies`
  queries via MCP (read-only by the tool's own configuration).

## 10. Tests

This turn's change is documentation-only (this file, plus a new,
otherwise-empty branch) — zero `src/` or `tests/` files were touched.
Per this session's own standing rule, a full suite re-run was not
performed. Confirmed via `git diff main --stat` equivalent (this branch
vs. `main`) that only this one new doc file differs.

## 11. Risk to users

**None.** Every check this turn was read-only or local (SQL introspection,
file reads, two authenticated `GET`s, one new git branch, one new
documentation file). No Environment Variable, RLS policy, schema, or
Production data was touched. Public and admin users experience zero
change — nothing was deployed differently, nothing was activated.

## 12. Success and STOP criteria (for the future activation turn, not this one)

**Success criteria** for the eventual canary itself: exactly one `POST`
sent; response is `200`/`{"ok":true,"status":"abandoned"}` (matching
Preview's own proven result); exactly one new
`operational_notification_events` row with the exact predicted
fingerprint and a terminal, non-open status; zero change in every other
table; flag successfully removed and reconfirmed absent; endpoint
reconfirmed fail-closed afterward.

**STOP criteria** (abort before the POST, or halt immediately after
rollback without further investigation attempts) — any of:
- The RPC-existence precondition (§2) is not yet met.
- Any preflight check in §3 that previously passed now fails.
- The admin session cannot be confirmed live and correctly-scoped
  immediately beforehand.
- Any Environment Variable other than the one canary flag shows signs of
  having changed since this audit.
- Production counters (§4) show any drift from this baseline at the
  moment of the future preflight.

## 13. What Adam needs to do manually before this can proceed

1. Review `docs/sql/PROPOSED_SPRINT_166H_PRODUCTION_SCHEDULED_WRITER_AND_LEDGER_MIGRATION_V1.sql`
   (already written, already reviewed once before, unchanged).
2. Explicitly request that this migration be applied to Production, and
   run it himself (per this project's own standing rule: schema changes
   are written to `docs/` for manual execution, never run automatically
   by Claude) — or explicitly direct Claude to apply it via the
   `apply_migration` MCP tool, which would be the first time this
   session's MCP access is used for a write, requiring its own separate,
   explicit approval.
3. After the migration, run
   `docs/sql/VERIFY_SPRINT_166H_PRODUCTION_POST_MIGRATION_READONLY_V1.sql`
   (already exists) to confirm the result — the migration file's own
   final comment already says exactly this.
4. Only then does Day 10's prepared runbook (§7) become executable in a
   future turn, under its own separate explicit approval for the
   activation step itself.

---

# Follow-up: Migration Preflight (same Day 10, next turn)

**No migration was executed. No `apply_migration` call was made. No SQL
that writes was run. This entire section is read-only analysis of
Production's already-live state, plus static analysis of the migration
file text.**

## 14. Object-by-object comparison — migration file vs. live Production

| Object | In migration file | In Production | Match |
|---|---|---|---|
| `scheduled_writer_runs` table + all 14 columns, types, nullability, defaults | ✅ | ✅ | **Exact** |
| `scheduled_writer_runs` CHECK constraints (`trigger`, `outcome`, `error_summary`) | ✅ | ✅ | **Exact** (`pg_get_constraintdef` compared statement-by-statement) |
| `scheduled_writer_runs` RLS enabled | ✅ | ✅ (`relrowsecurity=true`, `relforcerowsecurity=false` — matches; file never uses `FORCE ROW LEVEL SECURITY`) | **Exact** |
| `scheduled_writer_runs_admin_select` policy | ✅ | ✅ (`SELECT`, `{authenticated}`, identical `USING` clause) | **Exact** |
| `scheduled_writer_runs_one_open_per_scope` unique partial index | ✅ | ✅ | **Exact** |
| `operational_notification_events` table + all 19 columns | ✅ | ✅ | **Exact** |
| `operational_notification_events` CHECK constraints (7 total: `attempt_count`, `channel`, `event_type`, `provider_status`, `safe_summary`, `severity`, `status`, `suppressed_reason`) | ✅ | ✅ | **Exact** |
| `operational_notification_events` foreign keys (`scheduled_writer_run_id`, `source_id`) | ✅ | ✅ | **Exact** |
| `operational_notification_events` RLS enabled + `_admin_select` policy | ✅ | ✅ | **Exact** |
| `operational_notification_events_one_claim_per_scope` unique partial index | ✅ | ✅ | **Exact** |
| `operational_notification_events_scope_recency` index | ✅ | ✅ | **Exact** |
| `open_scheduled_writer_run(uuid, text, text, integer)` | ✅ | ✅ | **Body byte-identical**, `SECURITY DEFINER`, `search_path=''`, grants `authenticated`-only |
| `close_scheduled_writer_run(uuid, text, integer×7, text)` | ✅ | ✅ | **Body byte-identical**, same security posture |
| `claim_operational_notification_event(...)` | ✅ | ✅ | **Body byte-identical**, same security posture |
| `finish_operational_notification_event(uuid, text, text, timestamptz)` | ✅ | ✅ | **Body byte-identical**, same security posture |
| Triggers on either table | none in file | none found (`pg_trigger`, zero non-internal rows) | **Exact (both empty)** |

**Every single object the migration file defines is present in Production,
with an exact structural and (for functions) byte-for-byte match.**
Nothing is missing. Nothing differs.

## 15. Is Production partially migrated? Would running the file change anything?

**No, Production is not partially migrated — it is fully migrated.**
Every object matches. Running the full file again today would:

- All `create table if not exists` / `create ... index if not exists` /
  `create or replace function` statements: **safe no-ops** (functions
  would be replaced with byte-identical bodies — functionally
  indistinguishable from not running them at all; a `CREATE OR REPLACE
  FUNCTION` with an identical body does not change behavior, though it
  does technically assign a new internal object identity — irrelevant
  here since nothing depends on the old one persisting).
- The two `create policy` statements: **would error** — PostgreSQL's
  `CREATE POLICY` has no `IF NOT EXISTS` clause, and both policies
  already exist. The very first of the two policy statements
  (`scheduled_writer_runs_admin_select`) would raise `ERROR: policy
  "scheduled_writer_runs_admin_select" for table "scheduled_writer_runs"
  already exists`.
- Because the whole file is wrapped in `begin; ... commit;`, that error
  would **abort and roll back the entire transaction** — including the
  otherwise-harmless no-op statements that ran before it. Net effect of
  running V1 again today: **nothing changes, the migration fails
  cleanly with zero partial-apply risk**, but it does fail, and does not
  need to be run.

**This is not needed for anything — restated for clarity: the migration
does not need to be (re-)run. This section exists only to answer the
audit's own question about safety-if-run, not to recommend running it.**

## 16. Security audit of the migration SQL itself

Grep + full manual read of both `PROPOSED_SPRINT_166H_..._V1.sql` and the
new `V2.sql` (§21):

| Check | Result |
|---|---|
| `DROP TABLE` / `DROP COLUMN` | ✅ none found |
| `TRUNCATE` | ✅ none found |
| `DELETE FROM` | ✅ none found |
| Unrestricted `UPDATE` (no `WHERE`) | ✅ none — all 4 `UPDATE` statements (2 in `open_scheduled_writer_run`/`claim_...`'s stale-cleanup step, 2 as each function's primary state transition) are scoped by a specific `id =` or `environment_tag + trigger/fingerprint + status =` condition; none is a bare table-wide `UPDATE` |
| RLS disabled or weakened anywhere | ✅ none — RLS is only ever `ENABLE`d, never `DISABLE`d; `FORCE ROW LEVEL SECURITY` is never used (consistent with existing Production state, `relforcerowsecurity=false`, matching the same pattern already live on every other table in this schema) |
| `GRANT` to `anon` or `public` for any write-capable function | ✅ none — every function does `revoke all ... from public` **then** `grant execute ... to authenticated` explicitly; live-confirmed via `has_function_privilege()`: `anon`/`public` = false for all four |
| `SECURITY DEFINER` used correctly | ✅ yes — all four functions are `SECURITY DEFINER` *specifically so they can bypass RLS in a controlled way*, but each one re-implements its own authorization check as the very first thing it does (`select exists(... automation_identities where user_id = auth.uid())`) — this is the correct, standard-safe pattern for this use case, not a bypass of authorization, only of RLS's table-level policy mechanism |
| `search_path` explicit and safe | ✅ yes — every function has `SET search_path TO ''` (empty), forcing every single object reference inside the function body to be fully schema-qualified (`public.`, `pg_catalog.`), which is PostgreSQL's own documented defense against `search_path`-based function/operator hijacking. Confirmed every reference in all four bodies is indeed schema-qualified — no bare, unqualified table/function name appears anywhere inside any of the four bodies. |
| `automation_identities` control correct | ✅ yes — every function checks membership keyed on `auth.uid()`, the session's own cryptographically-asserted identity (derived from the caller's JWT by Postgres/Supabase itself) — never a client-supplied value |
| Can a caller impersonate another writer? | ✅ **no** — none of the four functions accepts a `p_user_id` or any caller-supplied identity parameter of any kind; the authorization check is always `auth.uid()` of the actual connected session, which cannot be spoofed by request parameters |
| Secret/data disclosure in return values | ✅ none — `open_scheduled_writer_run`/`close_scheduled_writer_run`/`finish_operational_notification_event` return only `boolean`; `claim_operational_notification_event` returns only `(boolean, uuid, text)` — no function ever returns a full row, a credential, or any column not explicitly enumerated in its own `RETURNS` clause |

**No security concern found in the migration SQL itself.**

## 17. Idempotency findings

- `create table if not exists` — ✅ idempotent.
- `create or replace function` (all four) — ✅ idempotent (safe to
  re-run; replaces with an identical body when bodies match, as they do
  here).
- `create unique index if not exists` / `create index if not exists`
  (all four indexes) — ✅ idempotent.
- `revoke all ... from public` / `grant execute ... to authenticated`
  (all four) — ✅ idempotent (both are safe to repeat; neither errors on
  a grant/revoke that's already in the target state).
- `create policy` (both, one per table) — ❌ **NOT idempotent** —
  PostgreSQL has no `CREATE POLICY IF NOT EXISTS`; re-running against a
  database that already has the policy raises `policy already exists`
  and (per §15) aborts the whole transaction.
- **Would a second run create duplicate rows?** No — the migration file
  contains zero `INSERT`/`UPDATE`/`DELETE` of table *data* outside
  function bodies (which don't execute at migration-apply time); a
  second run's only possible effects are the no-ops described above, up
  until the `CREATE POLICY` error halts everything.
- **Would constraints/indexes error on a second run?** Only the two
  `CREATE POLICY` statements, as above — every constraint and index
  statement uses an idempotent form.

**Verdict: V1 has one real (but low-severity, cleanly-failing) idempotency
defect. See §21 for the V2 fix.** This does not block anything today
since V1 does not need to run again — it's a defensive hardening for any
hypothetical future replay (disaster recovery, fresh-environment seeding,
etc.), not a fix for a live problem.

## 18. RPC implementation vs. application code and tests

Compared `claim_operational_notification_event`'s and
`finish_operational_notification_event`'s live signatures (§14) against
`src/lib/operationalNotificationLedgerSupabase.ts`'s `.rpc()` calls:

- **Parameter names:** `p_environment_tag, p_channel, p_event_type,
  p_severity, p_fingerprint, p_scheduled_writer_run_id, p_source_id,
  p_safe_summary, p_stale_claim_after_seconds` — **exact match**, both
  directions, both functions.
- **Return shape:** `claim` returns `TABLE(claimed boolean, event_id
  uuid, suppressed_reason text)` — exactly the three fields
  `toClaimResult()` destructures (`row.claimed`, `row.event_id`,
  `row.suppressed_reason`). `finish` returns a bare `boolean` — exactly
  what `{ ok: !error && data === true }` expects.
- **Allowed status transitions:** `claim` always inserts with
  `status = 'claimed'`; `finish` only ever updates a row currently
  `status = 'claimed'` (its `WHERE` clause), transitioning it to one of
  `'sent' | 'failed' | 'abandoned'` — matches the application code's own
  closed-vocabulary mapping in `mapSendResultToFinish()` exactly, no
  status value exists on either side that the other doesn't recognize.
- **Cooldown handling:** a fixed, non-parameterized 6-hour
  (`v_cooldown_seconds constant integer := 21600`) cooldown, keyed per
  `(environment_tag, fingerprint)`, evaluated against the *most recent*
  row for that scope (`order by created_at desc limit 1`) — matches the
  route's own design-doc description ("fixed 6-hour cooldown,
  non-parameterized").
- **Abandoned-claim recovery:** every `claim` call first auto-abandons
  any prior `'claimed'` row for the *same* scope whose `claimed_at` is
  older than `p_stale_claim_after_seconds` (default 300s, clamped
  300–86400) — a genuine self-heal path, run unconditionally before the
  cooldown check, so a truly stuck claim cannot permanently block future
  claims for that scope.
- **Atomicity / concurrent-call safety:** guaranteed by the partial
  unique index `operational_notification_events_one_claim_per_scope` on
  `(environment_tag, fingerprint) WHERE status = 'claimed'` — the
  `INSERT` inside `claim_operational_notification_event` is wrapped in
  its own `BEGIN ... EXCEPTION WHEN unique_violation THEN return query
  select false, null::uuid, 'suppress_duplicate'` block, so two
  concurrent callers racing for the same scope cannot both succeed; the
  loser gets a clean `suppress_duplicate` result, never a raised
  exception or a corrupted row. This relies on PostgreSQL's own
  index-enforced uniqueness (safe under real concurrency by
  construction, not merely by application-level discipline).

**No discrepancy found between the RPCs and the application code that
calls them.**

## 19. Data impact of the migration (if it were ever run)

- The migration itself is **pure DDL** — `CREATE TABLE`, `ALTER TABLE ...
  ENABLE ROW LEVEL SECURITY`, `CREATE POLICY`, `CREATE INDEX`, `CREATE OR
  REPLACE FUNCTION`, `REVOKE`, `GRANT`. Zero bare `INSERT`/`UPDATE`/
  `DELETE` of table data anywhere outside a function body (and function
  bodies never execute during migration application — only later, when a
  caller invokes them).
- **Expected record-count change from running the migration itself: 0,
  always**, whether run for the first time or (hypothetically, and
  currently blocked by the policy issue) a second time.
- Only *invoking* the resulting functions later (via the actual ledger
  canary, a separate and explicitly-gated future action) writes any row
  — the migration and the canary are two structurally distinct actions,
  and this section concerns only the former.

## 20. Execution plan (informational — not needed, since already applied)

Since Production is already at the migration's target state, **no
execution is needed or recommended right now.** For completeness, and
for any future migration this project writes:

- **Recommended method, if one were ever needed:** the Supabase Studio
  SQL Editor, run manually by Adam, with the file's contents pasted in
  and reviewed beforehand — matching this project's own standing
  `CLAUDE.md` rule ("write SQL to a file in `docs/` for manual execution
  — never execute SQL automatically"). This is preferred over the
  `apply_migration` MCP tool specifically because the SQL Editor gives
  Adam direct visual confirmation of exactly what is about to run,
  immediately before running it, with no intermediary tool call; the MCP
  path remains available only under its own separate, explicit,
  same-session approval, per this project's standing MCP rules.
- **Read-only baseline immediately before:** the same style of query
  used throughout this audit (§14) — object existence, row counts on
  every table the migration could plausibly touch.
- **Read-only verification immediately after:** the corrected
  `VERIFY_SPRINT_166H_PRODUCTION_POST_MIGRATION_READONLY_V1.sql` (§20A).
- **Testing RPC existence/signature without calling it:** exactly this
  audit's own method — `pg_proc` + `pg_get_functiondef()` +
  `has_function_privilege()`, never `information_schema.routines`/
  `routine_privileges` from a role that isn't the owner or grantee, and
  never an actual `.rpc()` call.
- **Rollback plan, scoped only to this migration's own objects** (for a
  hypothetical future first-time application that needed undoing): drop
  the four functions, drop the two indexes unique to this migration,
  drop the two policies, `DISABLE` (not drop) RLS only if re-enabling
  direct access is intended, and `DROP TABLE` only the two tables this
  migration itself created — never cascade into unrelated tables. Not
  written out as an executable file here, since it is not needed (the
  migration is not being newly applied), but the scope is intentionally
  this narrow: nothing this migration didn't create should ever be part
  of its own rollback.

## 20A. `VERIFY_SPRINT_166H_PRODUCTION_POST_MIGRATION_READONLY_V1.sql` — fixed in place

The pre-existing verify file (already in the repo, referenced by the
migration file's own final comment) had the **same
`information_schema.routine_privileges` false-negative bug** described
in §2A, in its own §7. Fixed in place, same file name, same
purpose — now uses `has_function_privilege()` instead. Its §2 comment
("expect 0, 0") was also updated from a hardcoded expectation to a
baseline-comparison note, since Production's tables are no longer
provably empty (a real scheduled-writer run has since occurred). **This
file has still not been run** — fixing it was a static edit, not an
execution.

## 21. V1 → V2 migration diff

A new file, `docs/sql/PROPOSED_SPRINT_166H_PRODUCTION_SCHEDULED_WRITER_AND_LEDGER_MIGRATION_V2.sql`,
was created. **Not executed. Not required to unblock anything** — V1's
target state is already fully live. V2 exists purely as a defensive
idempotency hardening for any hypothetical future replay of this file
(e.g. disaster recovery, seeding a from-scratch database).

**The only difference from V1:** each of the two `create policy`
statements is now preceded by a matching `drop policy if exists`:

```diff
 alter table public.scheduled_writer_runs enable row level security;

+drop policy if exists scheduled_writer_runs_admin_select on public.scheduled_writer_runs;
 create policy scheduled_writer_runs_admin_select
   on public.scheduled_writer_runs
   for select
   ...
```

```diff
 alter table public.operational_notification_events enable row level security;

+drop policy if exists operational_notification_events_admin_select on public.operational_notification_events;
 create policy operational_notification_events_admin_select
   on public.operational_notification_events
   for select
   ...
```

Every other line — every column, constraint, index, and all four
function bodies — is byte-for-byte identical between V1 and V2. V2's own
header comment states its non-required status explicitly, so a future
reader doesn't mistake its existence for a sign anything is currently
broken.

## 22. Final verdict

**GO — for the schema/RPC layer.** The hard blocker reported in §2/§3
does not exist; it was a false negative from a privilege-filtered
`information_schema` view. Production's schema is fully, correctly, and
safely migrated. Every other precondition from the original §3 (admin
account, writer credentials, `automation_identities` membership,
environment guard, fingerprint collision safety) remains independently
confirmed and unaffected by this correction.

**This does NOT mean the canary itself is authorized to run.** This
turn's own hard constraints (no flag activation, no redeploy, no `POST`
to `ledger-test`, no RPC call, no merge) remain fully in force and were
fully honored — every action taken this turn was a `SELECT`-only MCP
query, a set of file reads, or a documentation edit. The prepared runbook
in §7 is now believed executable in a future, separately-approved turn,
subject to a fresh preflight repeat at that time (per §12's own STOP
criteria) — but that activation decision is explicitly not this turn's
to make.

## 23. Exact approval text needed for the next step

No migration approval is needed — nothing needs to run. The next
decision point is purely about the **canary activation itself** (§7's
runbook), and would need wording along these lines, to be supplied by
Adam only when he is ready for that separate step:

> "Zatwierdzam wykonanie jednego kontrolowanego Production canary zgodnie
> z runbookiem z §7 dokumentu Dnia 10: dokładnie jedna flaga
> `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED=true` w Production,
> dokładnie jeden redeploy, dokładnie jeden uwierzytelniony POST do
> `/api/admin/operational-notification-ledger-test` z mojej istniejącej
> sesji administratora, natychmiastowy rollback flagi i redeploy
> rollbacku."

## 24. Day 10 completion

**100%** of this turn's own defined scope (full migration preflight,
object comparison, security audit, idempotency check, RPC-vs-code
comparison, data-impact analysis, execution-plan documentation, VERIFY
file fix, V2 hardening, corrected GO verdict, exact approval text) is
complete. **The entire "Production ledger canary" program block is now
unblocked** at every precondition this audit checks — the only remaining
step is Adam's own separate, explicit approval to run the already-fully-
designed canary itself (§7/§23), which was correctly not taken
automatically this turn.
