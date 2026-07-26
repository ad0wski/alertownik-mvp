# Sprint 172 — Source Health Persistence (Plan Day 5)

**Status: code, tests, and migration files ready. Migration NOT executed.
Not merged to `main`, not deployed. Awaiting Adam's decision.**

This is a checkpoint document, not a closeout — per this sprint's explicit
instruction, the agent stops here and presents the full plan for review
before any SQL runs.

---

## 1. Audit — read-only, before any code

Read in full: `source_checks` live schema (via Supabase MCP, read-only),
its RLS policies, `src/types/alertSource.ts`, `src/lib/sourceHealth.ts`,
`src/lib/supabaseSourceWrites.ts`, `src/components/SourceHealthDashboard.tsx`,
`src/components/SourceApiCheckPanel.tsx`, `src/app/admin/sources/page.tsx`,
`tests/e2e/sourceHealth.spec.ts`, `tests/e2e/sourceCheck.spec.ts`,
`docs/SPRINT_171_SOURCE_HEALTH_OBSERVABILITY_V1.md`, and the closest
existing precedent, `docs/sql/PROPOSED_SPRINT_164A_LINK_HEALTH_PERSISTENCE_V1.sql`
(+ its VERIFY/ROLLBACK pair), which this sprint's SQL files deliberately
mirror in structure and tone.

Confirmed live via read-only queries (never write queries):

- `source_checks.result` CHECK constraint (`source_checks_result_check`):
  `no_changes | found_notice | alert_created | needs_followup` — no
  failure value, confirmed exactly as Sprint 171 documented.
- No error-message column exists on `source_checks`.
- RLS on `source_checks`: four `admin_profiles`-gated policies
  (SELECT/INSERT/UPDATE/DELETE) with **no column-level restriction** —
  an admin can already insert a row with any `result` value the CHECK
  constraint allows. A fifth, separate, narrower policy ("Scheduled
  writer can insert automated source_checks") only allows the
  `automation_identities` role to insert `result IN ('no_changes',
  'found_notice')`, with `related_alert_id IS NULL` and
  `created_by = auth.uid()` enforced in the same `with_check` clause.
- Live row counts (informational, for the before/after comparison in
  Faza A of the merge that preceded this sprint): `alert_sources` = 4,
  `source_checks` = 2, `source_notice_candidates` = 3, `alerts` = 3,
  `scheduled_writer_runs` = 1, `operational_notification_events` = 1.
- Existing precedent for a length-capped safe error field:
  `scheduled_writer_runs.error_summary` already has
  `CHECK (char_length(error_summary) <= 200)` — this sprint's
  `source_checks.error_summary` reuses the exact same cap for
  consistency.

## 2. The exact gap (unchanged from Sprint 171's finding, now being closed)

`SourceCheckResult` is a closed four-value union with no failure state.
A failed manual check has never been persisted anywhere — Sprint 171
added a session-only (never-persisted) mirror as a stopgap. This sprint
proposes the actual fix.

## 3. Proposed schema change

Two changes to `source_checks`, both additive and nullable:

1. Extend the `result` CHECK constraint to also allow `'failed'`
   (alongside the original four values — nothing removed).
2. Two new nullable columns:
   - `error_code text` — CHECK-restricted to the same closed vocabulary
     as `src/lib/scheduledWriterRunSafety.ts`'s `FetchDiagnosticCode`
     (`http_4xx | http_5xx | non_html_content_type | network_error |
     timeout_10s | parse_exception`).
   - `error_summary text` — CHECK `char_length(error_summary) <= 200`,
     same cap as `scheduled_writer_runs.error_summary`.

**No new columns for "last attempt", "last success", or "consecutive
failures".** All three are computed in application code
(`buildSourceHealthRows`) from the existing `checked_at`/`result`
columns plus the two new ones — walking the loaded check history rather
than maintaining a second, potentially-drifting counter. This keeps the
migration to exactly one constraint change + two columns, matches this
codebase's existing "pure functions over raw history" architecture
(Sprint 137's own header comment), and avoids a class of bug where a
stored counter and the underlying history silently disagree.

### Field-by-field mapping (brief §12 → implementation)

| Requirement | Where it comes from |
|---|---|
| Data ostatniej próby | `MAX(checked_at)` across all rows for the source (existing `checked_at`, now meaningful for failures too) — `SourceHealthRow.lastCheckAt` |
| Data ostatniego sukcesu | `MAX(checked_at) WHERE result <> 'failed'` — new `SourceHealthRow.lastSuccessAt`, computed |
| Wynik ostatniej próby | `result` of the most recent row (now can be `'failed'`) — `SourceHealthRow.lastCheckResult` |
| Liczba kolejnych błędów | Count of trailing `'failed'` rows in history, newest-first — new `SourceHealthRow.consecutiveFailures`, computed |
| Bezpieczny kod błędu | New `error_code` column — `SourceHealthRow.lastErrorCode` |
| Bezpieczne podsumowanie błędu | New `error_summary` column — `SourceHealthRow.lastErrorSummary` |
| Moment ostatniego błędu | `checked_at` of the most recent `result = 'failed'` row — already covered by `lastCheckAt` when that row is the latest one (status `"failing"`) |

## 4. Update rules — success vs. failure

- **On success** (any result other than `"failed"`): `consecutiveFailures`
  resets to 0 for that source going forward; `lastSuccessAt` becomes that
  check's `checked_at`; `error_code`/`error_summary` are `null` on that
  row.
- **On failure** (`result: "failed"`): `consecutiveFailures` increments
  by exactly 1 relative to the immediately preceding check for that
  source (computed, not stored — see §3); `lastSuccessAt` is untouched
  (it reflects the most recent actual success, however far back); the row
  carries `error_code` + `error_summary`.
- **A failure right after a success starts a fresh streak of 1** — it
  does not resume counting from an older, already-broken streak (tested
  explicitly).
- Status derivation (`SourceHealthStatus`) gains a fifth value,
  `"failing"`, which takes priority over `"stale"`/`"checked_recently"`:
  a source whose most recent *logged* attempt failed is worse than merely
  "not checked in a while", and must never render as healthy just because
  the failure happened recently.

## 5. RLS and permissions

**No RLS policy change in the migration.** The four existing
`admin_profiles`-gated policies already cover the two new plain columns
with zero modification — an admin who could already insert any
`source_checks` row can now also insert one with `result: 'failed'` plus
the two new columns, through the exact same authenticated Supabase client
path (`createSourceCheck` in `src/lib/supabaseSourceWrites.ts`) every
other write already uses.

**The scheduled-writer policy is explicitly untouched.** Its own
`with_check` clause still only allows `result IN ('no_changes',
'found_notice')` — the automation identity still cannot log a failure,
matching this sprint's constraint (zero writer, zero cron changes). If a
future sprint wants the scheduled writer to log its own failures, that
needs its own separate, deliberate migration — not a side effect of this
one. `VERIFY_SPRINT_172_...READ_ONLY_V1.sql` §6 explicitly checks this
policy's `with_check` clause is unchanged after the migration.

**No new grants for `anon`/`public`.** Nothing in this migration touches
anonymous read access to `source_checks` (which has none today — only
`alert_sources` has a public-read policy, and that's untouched).

## 6. Backfill

**None needed, none performed.** `'failed'` did not exist before this
migration, so every existing `source_checks` row is, by construction, a
genuinely completed check with one of the original four result values.
`error_code`/`error_summary` are simply `NULL` for all of them via
`ALTER TABLE ADD COLUMN`'s implicit default — no `UPDATE` statement
appears anywhere in the forward migration file.

## 7. Files

- **`docs/sql/PROPOSED_SPRINT_172_SOURCE_CHECK_FAILURE_PERSISTENCE_V1.sql`**
  — the forward migration. `begin`/`commit` wrapped, `drop constraint if
  exists` + `add constraint` for the CHECK, `add column if not exists`
  ×2, `comment on column` ×2. No `DELETE`, `TRUNCATE`, or unbounded
  `UPDATE` anywhere.
- **`docs/sql/VERIFY_SPRINT_172_SOURCE_CHECK_FAILURE_PERSISTENCE_READ_ONLY_V1.sql`**
  — six read-only `SELECT`s: new-column shape, the exact CHECK constraint
  definitions (result + the two new ones), a row-level sanity check that
  no unexpected backfill happened, RLS policy list, and the
  scheduled-writer policy's `with_check` clause specifically. Safe to run
  before AND after the forward migration.
- **`docs/sql/ROLLBACK_SPRINT_172_SOURCE_CHECK_FAILURE_PERSISTENCE_V1.sql`**
  — drops exactly the two new columns and restores the original
  four-value CHECK constraint. Includes an explicit, commented-out
  pre-check `SELECT` and a written warning: if any row already has
  `result = 'failed'` when this runs, restoring the narrower constraint
  will fail with a constraint violation until those rows are handled by
  hand — the rollback deliberately does not delete or rewrite them for
  you.

## 8. Application code (ready, gated behind the migration)

All of the following is written and tested on this branch, but **must
not be deployed before the migration runs** — every touch point says so
in its own comments:

- **`src/types/alertSource.ts`** — `SourceCheckResult` gains `"failed"`;
  `SourceCheck`/`SourceCheckInput` gain optional `errorCode`
  (`FetchDiagnosticCode`) and `errorSummary` (`string`).
- **`src/lib/sourceHealth.ts`** — `SourceHealthStatus` gains `"failing"`;
  `SourceHealthRow` gains `lastSuccessAt`, `consecutiveFailures`,
  `lastErrorCode`, `lastErrorSummary`; `buildSourceHealthRows` computes
  all four from full per-source check history (not just the latest row);
  new pure helpers `sanitizeErrorSummary` (trims + caps at 200 chars,
  defense-in-depth alongside the DB's own CHECK) and
  `describePersistedFailure` (panel-display formatter, fail-closed —
  returns `null` for any status other than `"failing"`).
- **`src/lib/supabaseSourceWrites.ts`** — `rowToSourceCheck` reads the two
  new columns (simply `undefined` today, since the columns don't exist
  yet — no crash, no special-casing needed); `createSourceCheck` writes
  them via `sanitizeErrorSummary`.
- **`src/app/api/sources/check/route.ts`** — the failure branch of
  `SourceCheckApiResponse` gains an optional `errorCode` field, populated
  from the existing internal `FetchDiagnosticCode` diagnostic
  (`manualSourceCheckFetch.ts` already computes this — this only forwards
  it to the client instead of discarding it).
- **`src/components/SourceApiCheckPanel.tsx`** — on a failed check, now
  offers a "Zapisz błąd w historii →" button (mirroring the existing
  "Zapisz check w historii" button for successes), calling
  `createSourceCheck({ result: "failed", errorCode, errorSummary })`.
- **`src/components/SourceHealthDashboard.tsx`** — renders
  `describePersistedFailure(row)` inline per row (styled red), alongside
  — not replacing — Sprint 171's session-only banner. New
  `resultLabels`/`statusBadgeClass` entries for `"failed"`/`"failing"`.
- **`src/app/admin/sources/page.tsx`** — per-source check-history cap
  raised from 3 to 10 (`CHECK_HISTORY_LIMIT`) so `consecutiveFailures`
  has real signal to work with; `CHECK_RESULT_OPTIONS`/`resultConfig`
  gain a `"failed"` entry so an admin can also log a failure by hand via
  the generic (non-safe-list) check form.

**Compatibility guarantee:** every new field is optional/nullable end to
end. A row loaded before the migration (or before this code deploys)
simply has `errorCode`/`errorSummary` as `undefined` and a `result` from
the original four values — `buildSourceHealthRows` treats that exactly as
it does today, and no code path anywhere infers `"failing"` or
`"checked_recently"` from an absence of data. Absence of data always
means `"never_checked"`/`"unregistered"` (unchanged), never a false
`"zdrowe"` claim.

## 9. Test coverage

`tests/e2e/sourceHealthPersistence.spec.ts` (19 tests):

- First-ever success (no history) — healthy, 0 failures.
- First-ever failure — status `"failing"`, exactly 1 failure, no last
  success.
- Several consecutive failures — count matches exactly, latest error
  wins.
- Success after prior failures — streak resets to 0, status returns to
  healthy.
- A failure right after a success — fresh streak of 1, doesn't
  accumulate an older run.
- No check history at all — `"never_checked"`, fail-closed.
- No registry match — `"unregistered"`, fail-closed.
- Pre-migration-shaped rows (no `errorCode`/`errorSummary` keys at all,
  only original result values) — never crash, never show as failing.
- Independence from candidate counting (`recentCandidateCount` unaffected
  by check results).
- `sanitizeErrorSummary`: trims + caps at 200 chars; `undefined` → `null`;
  whitespace-only → `null`; a normal message passes through unchanged.
- `describePersistedFailure`: healthy/stale rows → `null`; single failure
  → summary with no streak suffix; a streak → count mentioned; last
  success time mentioned when present; never leaks anything resembling a
  stack trace or secret through the summary field.

Full targeted run this sprint: `sourceHealth.spec.ts`, `sourceCheck.spec.ts`,
`sourceHealthPersistence.spec.ts`, `sessionCheckOutcome.spec.ts`,
`wordpressRestParser.spec.ts`, `pruszkowRestParser.spec.ts`,
`manualSourceCheckFetchRetry.spec.ts`, `manualSourceCheckWordpressRest.spec.ts`,
`manualSourceCheckPruszkowRest.spec.ts`, `adminApiRouteAuth.spec.ts`,
`candidateQueue.spec.ts` (explicit "no impact on candidates/alerts"
coverage) — **129/129 passed.**

`npm run typecheck`, `npm run lint`, `npm run build` — all clean, zero
errors/warnings. Local dev-server smoke test: `/`, `/login`,
`/admin/sources` all `200` (a stale `.next` build cache caused a
transient false `404` mid-session — cleared and re-verified, not a code
issue; confirmed separately by the already-clean `npm run build`).

## 10. Security audit

`git diff main -- src tests docs` scanned for secret/token/password/
bearer/authorization patterns — no matches. The three new SQL files
scanned for `DELETE`/`TRUNCATE`/unbounded `UPDATE` — no matches (only
comment text describing the absence of such statements). No RLS policy
was loosened; no `anon`/`public` grant was added; no
`NEXT_PUBLIC_`-prefixed secret was touched; no service_role usage
anywhere.

## 11. Migration preflight checklist (per item 22 of the brief)

- [x] SQL syntax reviewed by hand (standard `ALTER TABLE`/`ADD
  CONSTRAINT`/`ADD COLUMN`/`COMMENT ON COLUMN` — no exotic syntax).
- [x] Dependencies: none beyond `source_checks` existing (it does, live,
  confirmed via `list_tables`).
- [x] Table/column names verified against the live schema, not assumed
  (`source_checks_result_check` confirmed via `pg_get_constraintdef`
  before writing the migration).
- [x] RLS policies inventoried before writing the migration (`pg_policies`
  query) — confirmed no policy needs to change.
- [x] No index changes proposed (neither `error_code` nor `error_summary`
  is queried in a way that needs one yet — `buildSourceHealthRows` reads
  the full per-source history already loaded by `getSourceChecks`, not a
  filtered query on these columns).
- [x] Operation order: constraint swap first, then new columns, all
  inside one transaction (`begin`/`commit`) — either all of it applies or
  none of it does.
- [x] Read-only verification queries prepared for both before and after.

## 12. What this session did NOT do

**No SQL was executed.** No `apply_migration` call was made. No
`execute_sql` write query was made — every Supabase MCP call this sprint
was a read (`list_tables`, `pg_policies`/`pg_constraint` introspection via
`execute_sql` with `SELECT` only). No Environment Variable was changed.
No cron was touched. No writer identity was touched. No email/Resend was
touched. No alert was auto-published. No manual source check was run
against Production. No merge to `main` was performed.

## 13. Branch

`sprint-172-source-health-persistence-v1`, branched from `main` at
`f02fa67`. Not merged to `main`. **Stopping here per the sprint's own
explicit instruction — full checkpoint below awaits Adam's decision
before the migration file is ever run.**
