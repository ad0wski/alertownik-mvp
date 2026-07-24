# Sprint 166H — Production Automation Readiness Audit

Read-only audit sprint. No migration executed, no Environment Variable
changed, no Production data touched, no runtime code changed. Prepares a
migration package and rollout runbook for a future, separately-approved
activation.

---

## 1. Full request path (as implemented today, unchanged by this sprint)

`GET /api/cron/write-candidates` (`src/app/api/cron/write-candidates/route.ts`):

1. **Layer 0 — environment/database pairing guard**
   (`checkDatabaseEnvironmentGuard()`, no I/O). Requires `VERCEL_ENV`,
   `SUPABASE_ENVIRONMENT_TAG`, the actual project ref parsed from
   `NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_EXPECTED_PROJECT_REF` to all
   be present and mutually consistent. Fails closed with a generic 503 if
   not. **In Production today, `SUPABASE_ENVIRONMENT_TAG` and
   `SUPABASE_EXPECTED_PROJECT_REF` are both absent (§4) — this layer fails
   closed in Production regardless of anything else.**
2. **Layer 1 + 2 — kill switches.** `SCHEDULED_CHECKS_ENABLED` (present in
   Production) and `SCHEDULED_WRITES_ENABLED` (absent in Production, so
   effectively false) must both be `"true"`. 503 otherwise, generic
   message, same shape as Layer 0's failure.
3. **Cron auth.** `checkCronAuth` against `CRON_SECRET` (present in
   Production). 401/503 otherwise.
4. **Layer 3 — writer credentials.** `SUPABASE_SCHEDULED_WRITER_EMAIL` /
   `_PASSWORD` must be configured (both absent in Production today) and
   sign-in must succeed against a Supabase Auth account that is a member
   of `automation_identities` (Production already has exactly one such
   identity row, per §3 — but no credentials exist yet to authenticate as
   it, and the underlying tables this identity would act against don't
   exist yet in Production either).
5. **Atomic run-open** — `open_scheduled_writer_run` RPC. Requires
   `public.scheduled_writer_runs` and the RPC itself to exist — **neither
   exists in Production today.**
6. **Per-source fetch + write**, one try/catch per source; per-source
   outcome one of `success | no_proposals | fetch_error | timeout | write_error`.
7. **Aggregate `RunOutcome` computed**: `success | total_failure | partial_failure`.
8. **`close_scheduled_writer_run` RPC** — closes the run row with outcome,
   counts, generic `error_summary`. Failure swallowed, never fails the
   response.
9. **Operational notification integration (Sprint 166G-1/166G-3)** — if
   `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED` is `"true"` (absent in
   Production today, so this entire block is skipped): construct the
   ledger + adapter, `await attemptOperationalNotification(...)`, which
   internally calls `claim_operational_notification_event` →
   (adapter send, gated separately by `OPERATIONAL_EMAIL_ALERTS_ENABLED`,
   also absent in Production) → `finish_operational_notification_event`.
   Every step here already fails silently and never affects the route's
   own response (Sprint 166G-1 §A.7/A.8, re-verified unchanged this
   sprint — no code was read as suspect or modified).
10. **Response returned.** `NextResponse.json({ ok: true, ... })` or, on an
    uncaught top-level error, a generic 500 after still attempting to
    close the run with `outcome: "total_failure"`.

**Conclusion: today, in Production, this route fails closed at Layer 0
(missing `SUPABASE_ENVIRONMENT_TAG`/`SUPABASE_EXPECTED_PROJECT_REF`) before
ever reaching Layer 1. Even if Layer 0 were satisfied, it would then fail
at Layer 1+2 (`SCHEDULED_WRITES_ENABLED` absent). Even if all flags were
set, step 5 would error outright — `scheduled_writer_runs` and its RPC do
not exist. This sprint's migration package (§6 below, and the SQL files it
produced) closes the schema gap; the flag/credential gaps remain a
separate, later, explicit decision per the rollout runbook.**

## 2. Required database objects (all already live and audited on Preview)

| Object | Purpose |
|---|---|
| `scheduled_writer_runs` (table) | Run history + concurrency lock |
| `scheduled_writer_runs_one_open_per_scope` (unique index) | At most one open run per `(environment_tag, trigger)` |
| `open_scheduled_writer_run` / `close_scheduled_writer_run` (RPC) | Only write path to the table above |
| `operational_notification_events` (table) | Notification ledger |
| `operational_notification_events_one_claim_per_scope` (unique index) | At most one open claim per `(environment_tag, fingerprint)` |
| `operational_notification_events_scope_recency` (index) | Supports the claim function's own cooldown lookup |
| `claim_operational_notification_event` / `finish_operational_notification_event` (RPC) | Only write path to the ledger |
| `admin_profiles`, `automation_identities`, `alert_sources` (existing) | Referenced by RLS policies / FKs — already present in both projects |

Migration order (enforced by FK dependency, and by this sprint's combined
migration file): `scheduled_writer_runs` and its RPCs first, then
`operational_notification_events` and its RPCs (its FK references
`scheduled_writer_runs.id`).

## 3. Preview vs. Production comparison (live, read-only, this session)

Preview identified via a fresh click on the project card literally labeled
`alertownik-preview` in the organization's project list (never a typed
URL). Production identified the same way, card labeled `alertownik-mvp`.

| Check | alertownik-preview (`nowvcdbtgaigutyxpmdp`) | alertownik-mvp / Production (`puhcjyffosgohbmxrczb`) |
|---|---|---|
| `scheduled_writer_runs` | Exists | **Missing** |
| `operational_notification_events` | Exists | **Missing** |
| Columns (both tables combined) | 34 (15 + 19), matches repo files exactly | N/A — tables absent |
| Indexes (both tables combined) | 5, matches design exactly | N/A |
| RLS policies (both tables combined) | 2, both admin-only SELECT | N/A |
| `open_scheduled_writer_run` | Exists, `prosecdef=true`, `search_path=''` | **Missing** |
| `close_scheduled_writer_run` | Exists, `prosecdef=true`, `search_path=''` | **Missing** |
| `claim_operational_notification_event` | Exists, `prosecdef=true`, `search_path=''` | **Missing** |
| `finish_operational_notification_event` | Exists, `prosecdef=true`, `search_path=''` | **Missing** |
| Name collisions on any of the 4 function names | N/A | **None found** (0 rows) |
| `automation_identities` | Exists | Exists, **1 row** (a writer identity is already provisioned) |
| `admin_profiles` | Exists | Exists, 1 row |
| `alert_sources` | Exists | Exists, 4 rows |
| `source_notice_candidates` | Exists, 6 rows (post Sprint 166G-3) | Exists (row count not the focus of this audit — unrelated to migration readiness) |
| FK target types (`alert_sources.id`, `automation_identities.user_id`, `admin_profiles.user_id`) | `uuid` | `uuid` — **fully compatible** |
| `pgcrypto` / `gen_random_uuid()` availability | Available | Available (1 row in `pg_extension`) |
| Migration files in `docs/sql` vs. live Preview schema | Structurally consistent — column counts, index counts, policy counts, and function security properties all match the repo's own migration files exactly | N/A |

**No blocking obstacle found for applying the schema migration to
Production.** No naming collision, no FK type mismatch, no missing
dependency.

## 4. Vercel Environment Variable audit (metadata only — no value read or disclosed)

| Variable | Preview scope | Production |
|---|---|---|
| `SCHEDULED_CHECKS_ENABLED` | General (all Preview branches) | **Present** (updated Jul 15) |
| `SCHEDULED_WRITES_ENABLED` | General (all Preview branches) | **Absent** |
| `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED` | Branch-specific (`sprint-166g-runtime-ledger-integration-v1`) | **Absent** |
| `OPERATIONAL_EMAIL_ALERTS_ENABLED` | Branch-specific (`sprint-166e-preview-email-alerting-v1`) | **Absent** |
| `OPERATIONAL_ALERT_EMAIL_TO` / `_FROM` | Branch-specific (same branch as above) | **Absent** |
| `RESEND_API_KEY` | Branch-specific (same branch as above) | **Absent** |
| `CRON_SECRET` | General | **Present** (added Jul 12) |
| `SUPABASE_SCHEDULED_WRITER_EMAIL` / `_PASSWORD` | General | **Absent** |
| `SUPABASE_ENVIRONMENT_TAG` | General | **Absent** |
| `SUPABASE_EXPECTED_PROJECT_REF` | General | **Absent** |
| `SCHEDULED_WRITER_SOURCE_REGISTRY_IDS` / `_ALLOWED_SOURCE_IDS` / `_MAX_CANDIDATES_PER_RUN` / `_FINGERPRINT_ENABLED` | General (Preview) | Not checked individually this sprint — same "absent unless proven present" default applies; not required for the schema-only migration this sprint prepares |

**Absent always means `false`/disabled** — every flag this codebase reads
uses an exact-string-match parser (`value === "true"`, nothing else), with
no environment-specific default logic. An absent variable behaves
identically to one explicitly set to `"false"` or any other non-`"true"`
value.

**Key finding:** even after the schema migration, Production cannot
reach Layer 5 of the request path (§1) — it would still fail at Layer 0
(`SUPABASE_ENVIRONMENT_TAG`/`SUPABASE_EXPECTED_PROJECT_REF` both absent)
and Layer 1+2 (`SCHEDULED_WRITES_ENABLED` absent) and Layer 3 (writer
credentials absent). This is a safety margin, not a gap to be "fixed" by
this sprint — closing it is explicitly Phase E of the rollout runbook, a
separate future decision.

### Cron / automatic invocation

- `vercel.json` contains exactly one cron entry: `/api/cron/check-michalowice`,
  schedule `0 5 * * *` (daily, 05:00 UTC).
- That route (`src/app/api/cron/check-michalowice/route.ts`) is a
  **dry-run-only** wrapper — same kill switches and `CRON_SECRET` auth as
  `/api/cron/check-sources`, zero Supabase import, never writes a
  candidate, run, or ledger row.
- `/api/cron/write-candidates` (the actual writer) has **no cron entry at
  all** — it can only ever be invoked by a direct, authenticated HTTP
  request. A normal visit to any public or admin page never triggers it.
- Vercel Deployment Protection is Production-default (no "Require Login"
  toggle was found enabled specifically blocking this in earlier Preview
  testing this project; Production's own public pages already work
  unauthenticated, confirmed by this sprint's own Sprint 166G Production
  smoke test) — irrelevant to `/api/cron/*` routes specifically, which
  gate on `CRON_SECRET`, not on Vercel's browser-session protection.

## 5. Resilience and security risk register

| # | Concern | Existing safeguard | Gap | Risk | Recommendation for Sprint 166I |
|---|---|---|---|---|---|
| 1 | Alert storm (many notifications in a short window) | 6-hour fixed, non-parameterized cooldown per `(environment_tag, fingerprint)`; run-level scope means at most one notification per run regardless of source count | No cross-fingerprint rate limit (many distinct fingerprints could each notify once within the same window) | Low — run-level scoping already caps this tightly | Consider a per-environment "N notifications per hour" ceiling only if per-source notification (a documented future extension) is ever added |
| 2 | Multiple parallel invocations | Partial unique index (`one_open_per_scope`) makes a second concurrent open atomically fail at the database layer; verified under a genuine two-connection race in Sprint 166F-2B | None identified | Low | None — already hardened |
| 3 | Duplicate claims | Partial unique index (`one_claim_per_scope`) on the ledger; verified under a genuine race | None identified | Low | None — already hardened |
| 4 | Cooldown | Fixed 21600s constant inside the function itself, not a caller parameter — cannot be silently weakened by a bug in the calling code | None identified | Low | None |
| 5 | Stuck / abandoned runs | Both `open_scheduled_writer_run` and `claim_operational_notification_event` auto-abandon a stale row (>300s, bounded 300–86400s) for the exact same scope before attempting a new open/claim | Stale threshold is caller-supplied (validated range only) — a future caller could legitimately pass a very long threshold, delaying auto-recovery | Low | Document the production-intended value (300s, matching every existing call site) explicitly in the runbook so a future change is a conscious decision |
| 6 | Source fetch timeouts | Per-source try/catch classifies `timeout` as its own outcome; a single slow source cannot block others (already-shipped batch design) | None identified | Low | None |
| 7 | Partial success across multiple sources | `RunOutcome` closed vocabulary distinguishes `success`/`partial_failure`/`total_failure`; already exercised in tests | None identified | Low | None |
| 8 | Misconfigured credentials | Layer 3 fails closed with a generic message; does not distinguish "not configured" from "sign-in failed" in the response (deliberately, to avoid information leakage) | Operator-side: no automated alert today if credentials silently expire (email alerts are the mechanism for this, currently off in Production by design) | Medium (until Phase H) | Explicitly a rollout-runbook gate — do not skip Phase E/F's real-run verification just because it "should" work |
| 9 | Supabase unavailability | Any RPC-level throw propagates naturally; `.catch()` wrappers exist at each call site to avoid an unhandled rejection, converting to a fail-closed response | No circuit breaker / backoff — a sustained Supabase outage would produce one failed run per invocation, not a cascading retry storm (there is no automatic retry at all — see #15) | Low | None required before Sprint 166I; note for later if invocation frequency ever increases materially |
| 10 | Resend unavailability | Adapter failures map to `finish(status: "failed")`, never crash the route; email is entirely optional and off by default | None identified beyond normal provider-outage handling | Low | None |
| 11 | Run outcome misclassification | `RunOutcome` is a closed, tested 6-value enum; `categoryFromRunOutcome` explicitly tested for every value including the `abandoned` vs. `lock_held` distinction (Sprint 166G-1 audit) | None identified | Low | None |
| 12 | Unbounded history-table growth | No TTL/archival policy exists for either table today | Confirmed gap — over months of real cron activity (Phase G), both tables grow unbounded | Medium (only relevant once Phase G is decided) | Design a retention/archival policy (e.g., archive or delete run rows older than N days) as part of the Phase G decision, not before |
| 13 | Wrong-environment execution | Layer 0's 4-signal guard (`VERCEL_ENV`, `SUPABASE_ENVIRONMENT_TAG`, actual project ref, `SUPABASE_EXPECTED_PROJECT_REF`) already fails closed on any single mismatch, with its own 72-test suite (Sprint 165C) | Production has never had `SUPABASE_ENVIRONMENT_TAG`/`SUPABASE_EXPECTED_PROJECT_REF` configured — meaning this guard has never actually been exercised end-to-end in Production, only in Preview | Medium until Phase E | Phase E's controlled test is exactly the first real exercise of this guard in Production — treat its pass/fail as a first-class success criterion, not an assumed pass |
| 14 | Leak of raw error/stack/token/source content | Every persisted string (`error_summary`, `safe_summary`) is built from closed-vocabulary labels and counts only, length-capped, never a raw exception; RPC arguments are validated before any write; `not authorized` is the only auth-failure message, never distinguishing reasons | None identified in the audited code paths | Low | None |
| 15 | Manual or automatic retry | No automatic retry exists anywhere in this pipeline today (confirmed by code review, not merely by convention) — every controlled test across Sprints 166F/166G was explicitly one-shot, by operator discipline, not by a code-level guarantee | The one-shot discipline lives in the **test scripts**, not in the route itself — nothing in the route rejects a second, independent, legitimately-authenticated request in rapid succession (that is what the concurrency lock and cooldown are for, and they already handle it — see #2, #3) | Low | None required — #2/#3 already cover the actual risk; do not add an artificial route-level retry counter, which would just duplicate the lock's own guarantee |

## 6. Migration package produced (not executed)

- `docs/sql/PREFLIGHT_SPRINT_166H_PRODUCTION_READONLY_V1.sql`
- `docs/sql/PROPOSED_SPRINT_166H_PRODUCTION_SCHEDULED_WRITER_AND_LEDGER_MIGRATION_V1.sql`
- `docs/sql/VERIFY_SPRINT_166H_PRODUCTION_POST_MIGRATION_READONLY_V1.sql`
- `docs/sql/ROLLBACK_SPRINT_166H_PRODUCTION_MIGRATION_V1.sql`
- `docs/SPRINT_166H_PRODUCTION_ROLLOUT_RUNBOOK_V1.md` (Phases A–H)

The migration file is a single, final-state package (not a literal replay
of Preview's three historical incremental files) — see the file's own
header comment for the full rationale. No runtime code was changed to
produce this package; the four function bodies are transcribed unchanged
from the versions already live and verified on `alertownik-preview`.

## 7. `supabase-alertownik` MCP — reconfirmed

Still configured with `project_ref=puhcjyffosgohbmxrczb` (Production),
read-only. Not used for any Preview-environment claim in this audit — all
Preview reads in §3 were performed via a freshly-opened Supabase dashboard
SQL Editor tab, navigated by clicking the `alertownik-preview` project
card. All Production reads in §3 were performed the same way, via the
`alertownik-mvp` card — not via this MCP connection, to keep the audit
trail independent of the MCP's own configuration.

## 8. Recommended scope for Sprint 166I

1. Execute Phase A (schema migration) only, with a fresh preflight/approval
   gate — do not bundle it with any flag change.
2. Revisit risk register items #12 (retention policy) and #8/#13
   (credentials + environment-guard real-world exercise) explicitly before
   Phase E.
3. Do not open the Phase G (Cron) or Phase H (email) decisions in the same
   sprint as Phase A — each has already been scoped as a separate,
   later decision in the rollout runbook.
