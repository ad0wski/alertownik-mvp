# Sprint 166C — Automatic Source Monitoring: Audit and Design

**Status:** Audit and design phase. Nothing activated: no Vercel Cron entry added, no kill switch set to `true`, no write-capable endpoint invoked, no SQL executed, no secret added or read, no Production data touched. Branch `sprint-166c-automatic-source-monitoring-v1`, not merged to `main`.

**Goal for this sprint:** design (and, where unambiguous, safely implement OFF-by-default) the path from "one manually-triggered canary write, proven safe in Sprint 166B" to "a real, unattended, scheduled check-and-candidate pipeline across multiple official sources" — without ever auto-publishing an alert.

---

## A. What already exists (Sprints 134–166B) — audit

| Concern | Current state | File |
|---|---|---|
| Dry-run check | `GET /api/cron/check-sources` (any allowlisted source), `GET /api/cron/check-michalowice` (Michałowice only, the one wired in `vercel.json`) — zero Supabase import, structurally zero-write | `src/lib/cronCheckSources.ts`, `src/app/api/cron/check-*.ts` |
| Scheduled write | `GET /api/cron/write-candidates` — inserts `pending` candidates + `source_checks` rows only | `src/app/api/cron/write-candidates/route.ts`, `src/lib/scheduledWriter.ts` |
| Cron schedule | **One entry only**: `check-michalowice` at `0 5 * * *` (daily). `write-candidates` is **not** in `vercel.json` — can only run via a manual authenticated HTTP call | `vercel.json` |
| Kill switches | `SCHEDULED_CHECKS_ENABLED` (Layer 1), `SCHEDULED_WRITES_ENABLED` (Layer 2) — both Vercel env vars, both persist across deploys, both currently `false`/`true` depending on environment (Preview: `true`/`false` as of Sprint 166B close; Production: unknown to this sprint, never touched) | `src/lib/cronCheckSources.ts`, `src/lib/scheduledWriter.ts` |
| Environment pairing guard | Layer 0 — `SUPABASE_ENVIRONMENT_TAG` + `SUPABASE_EXPECTED_PROJECT_REF`, both must match the actual running environment and actual Supabase project ref | `src/lib/databaseEnvironmentGuard.ts` |
| Auth | `CRON_SECRET` bearer token, constant-time compare | `src/lib/cronCheckSources.ts` (`checkCronAuth`) |
| Writer identity | Separate Supabase Auth account (`SUPABASE_SCHEDULED_WRITER_EMAIL`/`PASSWORD`), RLS-scoped via `automation_identities` membership — no `alerts` access, no admin table access | `src/lib/scheduledWriter.ts` |
| Source allowlist | `SAFE_CHECK_SOURCE_IDS = ["michalowice-komunikaty", "wkd-aktualnosci"]` (exactly 2 sources total, ever) — write route further narrows to `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS`, default `["michalowice-komunikaz"]` only, always filtered through the `SAFE_CHECK_SOURCE_IDS` ceiling | `src/lib/sourceCheck.ts` |
| Per-run cap | `SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN`, default `1` | `src/lib/scheduledWriter.ts` |
| Dedup | Three-way in-memory fuzzy classifier (`new`/`duplicate`/`ambiguous`, thresholds 0.9/0.6) + optional DB-level exact-fingerprint unique constraint (`SCHEDULED_WRITER_FINGERPRINT_ENABLED`, migration proposed but not applied) | `src/lib/scheduledWriter.ts` |
| No-auto-publish | Structural: `scheduledWriter.ts`/`write-candidates/route.ts` never import any publish/Builder/draft helper — no code path exists from this route to `alerts` | (whole module) |
| Run status/history | **Read-only admin panel** (`buildScheduledWriterActivity`) derived from existing `source_notice_candidates` rows — **no persisted per-run log**. Explicitly documented gap: `WRITER_MONITORING_UNTRACKED_NOTE` | `src/lib/writerCandidateActivity.ts` |
| Concurrency protection | **None**, beyond the optional DB-level fingerprint unique constraint (which only catches an exact-content race, not overlapping runs generally) | — |
| Retry | **None** — a fetch timeout or 5xx is recorded as a failure and the run ends; no automatic retry of any kind | `src/app/api/cron/write-candidates/route.ts` (`fetchAndParseProposals`) |
| Alerting | **None** — failures are visible only in the HTTP response of that one invocation, or (for the cron-wired dry-run) in Vercel's own cron-execution logs | — |
| Preview/Production separation | **Solved** (Sprint 165C/166B) — separate Supabase projects, separate Vercel-scoped env vars, Layer 0 guard structurally prevents cross-environment writes | `src/lib/databaseEnvironmentGuard.ts` |

## B. Gaps this sprint must close (per the brief)

1. **Schedule for automatic source checking** — currently only the dry-run is scheduled; `write-candidates` has no cron entry at all.
2. **Concurrent/repeated-run protection** — no lock exists; two overlapping invocations (a slow run + a retriggered one, or Vercel Cron firing twice near a deploy boundary) could both attempt writes simultaneously.
3. **Candidate deduplication** — already fairly strong (in-memory fuzzy + optional DB-level exact fingerprint), but the DB-level guard is still an *optional* migration, not yet applied anywhere.
4. **Per-run candidate cap** — exists (`SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN`), already enforced server-side only.
5. **Run status and history** — does not exist; only the current *state* (existing candidate rows) is visible, never a log of past invocations (success/failure, counts, duration, per-source outcome).
6. **Retry only for transient errors** — does not exist in any form; a timeout/5xx today is identical in effect to a permanent 404/parse failure (both just "this run found nothing this time").
7. **Persistent kill switch** — effectively already true (Vercel env vars persist independently of deploys/commits), but this sprint should make that guarantee explicit and add a single documented "master switch" story rather than two switches whose combined semantics must be remembered.
8. **Alerting after failures** — does not exist in any form.
9. **Preview/Production separation** — already solved; this sprint must not weaken it, and any new schedule/table must be added identically to both scopes without ever collapsing them.
10. **Safe transition from one source to many** — the source allowlist mechanism already supports this (add to `SAFE_CHECK_SOURCE_IDS` after a per-source parser/risk review, then widen `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS`), but has only ever been exercised with one write-allowed source; this sprint should make the *process* of adding a second, third, etc. source explicit and safe, not just theoretically possible.
11. **No auto-publish** — already structurally guaranteed; this sprint must preserve that invariant through every new piece of code added.

## C. Proposed implementation scope (staged, each stage independently safe)

### Stage 1 — Persisted run history (code + proposed SQL, not executed)
- New table `scheduled_writer_runs` (proposed SQL in `docs/sql/PROPOSED_SPRINT_166C_RUN_HISTORY_MIGRATION_V1.sql`, **not run this sprint**): one row per invocation of `write-candidates` (or its future scheduled sibling), columns: `id`, `started_at`, `finished_at`, `trigger` (`cron`/`manual`), `environment_tag`, `sources_checked`, `sources_failed`, `candidates_inserted`, `duplicates_skipped`, `ambiguous_candidates`, `capped_skipped`, `duplicates_prevented_by_database`, `outcome` (`success`/`partial_failure`/`total_failure`/`skipped_kill_switch`/`skipped_lock_held`), `error_summary` (short, non-sensitive text only, same convention as existing diagnostics).
- RLS: writer identity gets INSERT-only (never SELECT/UPDATE/DELETE) — matching the existing `automation_identities` pattern exactly; admin gets SELECT-only via the existing `admin_profiles` pattern.
- Code: a pure `buildRunHistoryInsert()` builder (mirrors `buildAutomatedSourceCheckInsert`'s shape/safety pattern) plus a `ScheduledWriterHistoryWriter` interface, both fully unit-testable with a fake writer, zero network. The route would call this only if the table exists — until the migration is applied, this stage's code path is simply never exercised (no schema means no attempt, gracefully skipped, mirroring the existing `content_fingerprint` "optional column" pattern from Sprint 150).
- **Nothing here requires the migration to be applied to be merged** — the code can exist, tested, and dormant.

### Stage 2 — Concurrency / repeated-run protection
- A lightweight advisory lock using the same `scheduled_writer_runs` table (or, if the migration is deferred, a narrower dedicated `scheduled_writer_lock` single-row table) — an in-progress run inserts a `started_at`-stamped row with no `finished_at`; a new invocation checks for any lock row younger than a generous timeout (e.g. 5 minutes — well above this route's realistic single-source runtime) with no `finished_at`, and if found, returns `{ok:false, outcome:"skipped_lock_held"}` immediately, doing no fetch, no write, no auth-bypassing side effect.
- This is deliberately **not** a Postgres advisory lock (`pg_advisory_lock`) — the scheduled-writer identity's RLS-constrained session has no reason to be granted that privilege, and a row-based lock is auditable in the same table as everything else, with the same RLS boundary.
- Fully testable in isolation (fake clock, fake writer) — no code path here can ever write a candidate or alert; it only ever short-circuits before the existing write logic runs.

### Stage 3 — Retry, transient errors only
- A small, pure `classifyFetchFailure()` function distinguishing **transient** (`timeout`, `http_5xx`, generic `network_error`) from **permanent** (`http_4xx`, `non_html_content_type`, a parse exception) — retry only ever applies to the transient set.
- Retry policy: at most 1 retry, after a short fixed delay (e.g. 2s), same request, same timeout — never a retry loop, never exponential backoff without a hard ceiling, never more than 2 total attempts per source per invocation. A second transient failure is reported honestly as a failure, not silently retried again.
- This changes `fetchAndParseProposals()`'s internals only — the function's return shape and every caller's contract stays identical, so this is a pure hardening, not a new capability.

### Stage 4 — Alerting after failures
- No new external service dependency (would require an npm package or a new webhook secret, both against this project's "confirm before adding" rules) — instead, the *first* alerting mechanism is simply making failures loud in the existing, already-reviewed surface: the persisted run-history row itself (Stage 1) is the alert. A `total_failure` or `skipped_lock_held` (if it recurs across consecutive runs — itself a sign of a stuck lock) outcome is queryable and could drive a future admin-panel banner.
- A genuine push/email/Slack alert is **out of scope for this sprint** — flagged as a follow-up decision requiring an explicit new integration (and, per project rules, Adam's explicit approval to add any new package/webhook/secret).

### Stage 5 — Persistent kill switch, restated
- No code change needed — `SCHEDULED_CHECKS_ENABLED`/`SCHEDULED_WRITES_ENABLED` already persist as ordinary Vercel environment variables, independent of any deploy or commit. This stage is **documentation only**: a single runbook section stating plainly "these are the two switches, they survive every future deploy on this branch/environment scope, turning them off is always sufcient to stop everything immediately" — removing any ambiguity about whether a code change could ever silently re-enable them.

### Stage 6 — Vercel Cron entry for `write-candidates` (the actual "automatic" part)
- **Explicitly the last stage**, and the one this sprint's safety rules forbid touching without a separate approval: adding a `crons[]` entry for `write-candidates` in `vercel.json` (Production only — Preview deployments are never cron-triggered by Vercel at all, only Production; this is a Vercel platform fact, not a design choice, and is actually a fifth free layer of Preview/Production separation).
- Proposed schedule: mirror the existing dry-run's cadence (`0 5 * * *`, once daily) to start — never more frequent without a separate, explicit review of Supabase Free-tier request quotas.
- **Not added in this sprint.**

### Stage 2b — Atomic concurrency lock (this session — corrects Stage 2/Etap D)

**Why the Etap D wiring was insufficient, discovered by audit before any live migration:** the first live wiring of Stage 2 used a `SELECT` (`findActiveLock()`) → decide (`isRunLockHeld()`) → `INSERT` sequence. This has a genuine TOCTOU (time-of-check-to-time-of-use) race: two concurrent invocations can both execute the `SELECT` before either has inserted, both see no active lock, and both proceed to `INSERT`. (In practice, the Etap D migration also granted the writer identity no `SELECT` at all, making `findActiveLock()` a structural no-op for an unrelated reason — but even a `SELECT` policy fix would still leave the underlying race; the fix must be atomic inside one database operation, not merely readable.)

**The corrected mechanism** (`docs/sql/PROPOSED_SPRINT_166C_ATOMIC_LOCK_MIGRATION_V2.sql`, **not yet executed**):
1. A **partial `UNIQUE INDEX`** on `(environment_tag, trigger)` `WHERE finished_at IS NULL` — Postgres itself guarantees at most one open row per scope can ever exist, enforced at the storage layer, not by application logic. A concurrent `INSERT` violating it fails with `23505 unique_violation` — there is no window where two callers can both believe they succeeded.
2. Two `SECURITY DEFINER` functions, `open_scheduled_writer_run(...)` and `close_scheduled_writer_run(...)`, are the **only** way to write this table from now on — the old direct-table `INSERT`/`UPDATE` RLS policies from the V1 migration are dropped. Each function re-implements the `automation_identities`-membership check itself (a `SECURITY DEFINER` function bypasses table RLS entirely — the function body is now the authorization boundary), and returns only a boolean, never a row. **No `SELECT` grant is added anywhere** — the "return only what's needed via a narrower function" approach the brief asked for, instead of widening RLS.
3. `open_scheduled_writer_run()` first closes any **stale** open row for the same scope (`finished_at IS NULL AND started_at < now() - interval`, using `RUN_LOCK_STALE_AFTER_MS` as the single source of truth for the threshold, passed explicitly from the app on every call), then attempts the `INSERT`. A `unique_violation` (still genuinely locked) and any unexpected error from the function call are treated **identically** by the route: `opened: false` → fail closed, no source fetch, no candidate write, ever.
4. A new `outcome` value, `'abandoned'`, is added to the existing `CHECK` constraint (by name, confirmed live via `pg_constraint` before writing the migration) for a stale lock the housekeeping step force-closes.

**Revision 2 (this session — post read-only security audit, verdict SAFE AFTER FIX, applied before any live execution):**
- `p_stale_after_seconds` is now validated inside `open_scheduled_writer_run()` **before** any `UPDATE`/`INSERT` runs: must be non-null and within `[300, 86400]` seconds, or the function raises a plain, non-secret exception and touches zero rows. The audit found this parameter previously had no bound at all — a negative value would have pushed the stale-close threshold into the future, incorrectly abandoning a genuinely fresh, still-running lock; the route's own call site (always `300`, `RUN_LOCK_STALE_AFTER_MS / 1000`) is unaffected.
- Both functions now use `set search_path = ''` instead of `set search_path = public` (the stricter Supabase/Postgres-recommended hardening for `SECURITY DEFINER` functions). Every object reference was already fully qualified; the two remaining implicit calls (`now()`, `make_interval()`) are now explicit `pg_catalog.now()` / `pg_catalog.make_interval()`.
- `close_scheduled_writer_run()` now validates `p_outcome` against the exact allowed set (including `'abandoned'`), validates every counter is non-null and `>= 0`, and caps `error_summary` at 200 characters — all before its `UPDATE` runs. A matching table-level `CHECK` constraint (`scheduled_writer_runs_error_summary_length_check`) backstops the length cap for any future write path.
- None of this changes either function's public contract (argument count/order/names, return type) or any call site. `src/lib/scheduledWriterRunSafety.ts` gained mirrored, pure-TS specification functions (`isStaleAfterSecondsValid`, `isCloseRunInputValid`, `ALLOWED_RUN_OUTCOMES`, `ERROR_SUMMARY_MAX_LENGTH`) tested in isolation — 25 new tests in `scheduledWriterRunSafety.spec.ts` covering the exact boundary values (NULL, 0, negative, 299, 300, 86400, 86401 for the staleness window; an invalid outcome; a negative value for every individual counter; the error-summary length boundary). Still **not executed** against any Supabase project.

**Live code (this session):**
- `src/lib/scheduledWriterRunSafety.ts` — `RunLockRow`/`isRunLockHeld`/`RUN_LOCK_STALE_AFTER_MS` kept as a documented **specification** of the intended semantics (still directly tested), now explicitly annotated as superseded-as-a-live-mechanism by the atomic SQL function; `RunHistoryWriter.openRun` now returns `{ opened: boolean }` instead of requiring a separate lock-check step; `RunOutcome` gained `'abandoned'`.
- `src/lib/scheduledWriterHistory.ts` — `openRun`/`closeRun` now call `.rpc('open_scheduled_writer_run', ...)` / `.rpc('close_scheduled_writer_run', ...)` instead of `.from(table).insert()/.update()`.
- `src/app/api/cron/write-candidates/route.ts` — the whole `findActiveLock` → `isRunLockHeld` → conditional-insert block replaced with a single atomic `openRun()` call; `opened: false` → one clear `503` response (`reason: "lock_held"`), no separate "skipped" history row (a blocked attempt no longer creates a database row at all — cleaner than the Etap D version, which briefly opened-then-closed a doomed row for a blocked attempt).
- 17 new/updated route-level tests, including a genuine `Promise.all` two-invocations-race test against a shared in-memory fake modeling the unique-index semantics (mirroring the technique `scheduledWriterConcurrency.spec.ts` already uses for the `content_fingerprint` constraint).

**PASS / STOP / ROLLBACK for the migration itself:**
- **PASS:** the unique index and both functions exist exactly as specified; `pg_policies` shows exactly one remaining policy (`scheduled_writer_runs_admin_select`); the outcome `CHECK` constraint includes `'abandoned'`; row count unchanged (0) immediately after; Production untouched throughout.
- **STOP:** any unexpected object already existing under these names; the row count is non-zero before running (would mean the V1 migration's state has drifted from what's documented); any error mid-transaction (the whole file is `BEGIN`/`COMMIT`-wrapped, so a failure rolls back cleanly with no partial state).
- **ROLLBACK (if ever needed after execution):** `DROP FUNCTION` both functions, `DROP INDEX scheduled_writer_runs_one_open_per_scope`, re-create the two dropped policies from the V1 migration file, revert the outcome `CHECK` constraint to the V1 list, drop `scheduled_writer_runs_error_summary_length_check` — all reversible, none destructive to any existing row. Reverting the outcome `CHECK` constraint specifically requires first confirming (read-only) that no row already has `outcome = 'abandoned'` — `ADD CONSTRAINT` re-validates all existing rows and would fail otherwise.

**Two-concurrent-invocations test plan (once migrated, for a future session — not performed this session):** from Adam's own terminal, fire two `write-candidates` requests as close together as possible (e.g. two parallel `curl`/`Invoke-RestMethod` calls); read `scheduled_writer_runs` back (read-only, via the Supabase dashboard — the writer itself still can't `SELECT`) to confirm exactly one row was created for that instant, and that exactly one HTTP response was `200 ok:true` while the other was `503 reason:"lock_held"`.

### Stage 2b closure — live migration executed and concurrency test PASSED (this session)

The Revision 2 migration (`docs/sql/PROPOSED_SPRINT_166C_ATOMIC_LOCK_MIGRATION_V2.sql`) was executed exactly once against `alertownik-preview` (project ref `nowvcdbtgaigutyxpmdp`). All 9 read-only post-migration checks passed: the partial unique index, both `SECURITY DEFINER` functions with `prosecdef=true` and empty `search_path`, exactly one remaining RLS policy (`scheduled_writer_runs_admin_select`), the writer INSERT/UPDATE policies gone, `'abandoned'` present in the outcome `CHECK`, the `error_summary` length `CHECK` present, and the row count unchanged (0) immediately after.

`SCHEDULED_WRITES_ENABLED` was then set to `true` for the Preview environment only (all Preview branches; Production untouched — it has no such variable at all), a new Preview deployment was built from an empty commit, and the real two-concurrent-invocations test was run exactly once (via `vercel curl` against the deployment, to pass through Vercel Deployment Protection) with a genuinely fresh `CRON_SECRET` entered interactively and never persisted.

**Result — PASS, exactly as designed:**
- Request #1: `ok:true`, `dryRun:false`, `checkedSources:1`, `successfulSources:1`, `candidatesInserted:1`, `sourceChecksInserted:1`, `published:false`.
- Request #2: `ok:false`, `reason:"lock_held"`, `"Poprzednie uruchomienie wciąż trwa."` — blocked before any fetch or write, exactly the atomic lock's designed behavior.
- Counters (read-only, before → after): `alerts` 7 → 7 (unchanged), `source_notice_candidates` 4 → 5 (+1, matching the single winning request), `source_checks` 4 → 5 (+1).
- `scheduled_writer_runs`: **exactly one row exists**, for `environment_tag='preview'`, `trigger='manual'` — the blocked request never created a second row at all (the unique-index rejection happens at `INSERT` time, before any row can exist). `finished_at` is set (closed), `outcome='success'`, and `sources_checked=1`/`sources_failed=0`/`candidates_inserted=1` match request #1's response exactly. Zero rows anywhere in the table have `finished_at IS NULL`.
- Production was never called, read, or written during any part of this test.

Immediately after the test, `SCHEDULED_WRITES_ENABLED` was reset to `false` for Preview (Production untouched, `SCHEDULED_CHECKS_ENABLED` left `true`) — the test candidate and its `scheduled_writer_runs` row are intentionally **not** deleted; they remain as the live evidence of this closed test.

### Stage 7 — Safe one-source-to-many-sources transition
- Documented process (not new code): (a) add the new source to `officialSourceChecklist.ts` and `SAFE_CHECK_SOURCE_IDS`, (b) write and pass a parser fixture test for that source's actual HTML shape (matching the existing WKD/Michałowice pattern), (c) run the *dry-run* endpoint against it manually for at least one real invocation to confirm proposals look sane, (d) only then add its id to `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS`, one source at a time, each addition its own explicit approval — never a batch enable.

## D. What is safe to implement now (this session), OFF by default

Given the above, the following are unambiguous, structurally isolated from any live effect, and were implemented + tested this session (see §E):
- `classifyFetchFailure()` (Stage 3) — pure classification, no behavior change to any route yet.
- The retry wrapper itself, added to `write-candidates/route.ts`'s internal `fetchAndParseProposals()` — bounded to exactly one retry, transient failures only. This is a live code change to a route that is currently unreachable in Production (Layer 0 guard unconfigured there, per Sprint 165B/166B) and gated behind the same four pre-existing layers in Preview — so it changes *what happens if the route ever runs*, never *whether* it can run today.
- Run-history builder + writer interface (Stage 1's code half) — new, additive, unused until a future migration is applied and a future route change wires it in. Not wired into the live route this session (that wiring is Stage 1's remaining "future session" work, deliberately not rushed).
- Lock-check pure logic (Stage 2's decision function) — new, additive, not yet wired into the live route.
- Proposed SQL migration for `scheduled_writer_runs` — written, **not executed**, following the exact same "expand, don't apply yet" convention as the Sprint 150 `content_fingerprint` migration.

## E. What was NOT done this session (explicitly deferred)

- No Vercel Cron entry added or modified (`vercel.json` unchanged).
- No kill switch set to `true` anywhere.
- No SQL executed against any Supabase project.
- No secret added, generated, or read.
- No `write-candidates` (or any write-capable endpoint) invoked.
- No Production data read or written.
- No merge to `main`.
- The run-history writer and lock-check logic are not yet wired into the live `write-candidates` route — that wiring, plus the actual migration, are the concrete next steps for a future, separately-approved session.

## F. Next manual approval point

Both gates that were open at the end of the previous session are now closed:
1. ~~Executing `PROPOSED_SPRINT_166C_ATOMIC_LOCK_MIGRATION_V2.sql` against `alertownik-preview`~~ — **done**, see Stage 2b above.
2. ~~A real two-concurrent-invocations test and a controlled write against the resulting live deployment~~ — **done, PASS**, see "Stage 2b closure" above.

What remains before this sprint's scope is fully complete is unchanged from the original brief and still requires its own separate, explicit approval before any of it starts: a real Vercel Cron entry (Stage 6), a genuine alerting mechanism (Stage 4), and the second-source transition process (Stage 7). None of these were started this session.

---

## Automation readiness — percent complete (this sprint's honest assessment)

| Component | Before this session | After this session |
|---|---|---|
| Dry-run pipeline | 100% (unchanged, proven since Sprint 142) | 100% |
| Single controlled write (manual trigger) | 100% (proven live in Sprint 166B) | 100% |
| Retry for transient errors | 100% (implemented, tested, live-wired in Etap D) | 100% (unchanged) |
| Persisted run history | 60% (live-wired against the migrated V1 table in Etap D) | 75% (open/close now atomic-RPC-based, correctly tested; still not live-migrated) |
| Concurrency/lock protection | 30% (Etap D wiring existed but was a structural no-op — SELECT-then-INSERT race + no SELECT grant) | **100%** — atomic mechanism designed, implemented, unit/race-tested, migrated live to `alertownik-preview`, and confirmed PASS in a real two-concurrent-invocations test with a genuine `write-candidates` deployment |
| Persisted run history | 75% (open/close RPC-based, correctly tested; not yet live-migrated) | **100%** — live-migrated, and a real row (outcome `success`, correct counters) was created and closed correctly during the live test |
| Alerting | 0% | 10% (unchanged — design only) |
| Scheduled (cron-triggered) writes | 0% | 0% (explicitly deferred — Stage 6, untouched this session) |
| Multi-source safety process | design-only | design-only (unchanged — Stage 7) |

**Overall automatic-source-monitoring readiness: ~80–85%** (up from ~55–60% earlier this session) — the atomic lock is not just designed but now proven live: migration executed, 9/9 read-only checks PASS, and a real two-concurrent-invocations test against the deployed Preview endpoint confirmed exactly one request processed while the other was cleanly blocked by the lock, with zero double-writes, zero orphaned open runs, and zero Production contact. What remains before "Dokończenie bezpiecznego silnika automatyzacji" is considered fully complete is deliberately unstarted and out of this session's scope: (a) a real Vercel Cron entry (Stage 6), (b) a genuine alerting mechanism beyond the run-history row itself (Stage 4), (c) the second-source transition process (Stage 7) — each its own separate, later approval gate.
