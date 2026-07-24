# Sprint 166J-B — Retention Policy and Runbook (Design Only)

**Nothing in this document has been executed.** No DELETE has run, no
function has been created, no Cron entry exists, and no route calls
anything described here. This is a design + prepared-SQL package only, for
`scheduled_writer_runs` and `operational_notification_events`.

---

## 1. Are 90 / 180 / 30 days reasonable for MVP?

Yes, with one refinement. At current pilot volume (both tables at 0 rows
today, four sources total) these windows are generous relative to actual
data growth — the real constraint is audit value, not storage. The
refinement: the original three-bucket split (success/error/suppressed)
doesn't map 1:1 onto the two tables' actual closed vocabularies (see §3),
so this document defines the policy per actual column value rather than
per abstract category.

## 2. Closed retention policy, per actual value

### `scheduled_writer_runs.outcome`

| `outcome` | Retention | Rationale |
|---|---|---|
| `success` | **90 days** from `finished_at` | Routine confirmation the writer ran; short window is enough to answer "did last week's run happen." |
| `partial_failure`, `total_failure` | **180 days** from `finished_at` | The most valuable diagnostic trail for recurring source problems — kept twice as long as success on purpose. |
| `skipped_kill_switch`, `skipped_lock_held` | **90 days** from `finished_at` | Operationally equivalent to "nothing happened, by design" — same window as success, not the error window, since these are not failures. |
| `abandoned` | **180 days** from `finished_at` | A stale, auto-recovered lock is itself diagnostically interesting (why did a run not finish cleanly) — treated like an error, not like success. |
| any row with `finished_at IS NULL` (an open run) | **never** eligible, regardless of `started_at` age | An open row is either a genuinely in-progress run or evidence of a bug in the close-run path — never silently deleted by time alone. |

### `operational_notification_events.status`

| `status` | Retention | Rationale |
|---|---|---|
| `sent` | **90 days** from `sent_at` | Mirrors `success` — confirms a real notification went out; short-term confirmation value. |
| `failed` | **180 days** from `finished_at` | Mirrors the run error window — the adapter/provider failure trail is valuable audit data. |
| `abandoned` | **30 days** from `finished_at` | Mirrors the original suppressed/abandoned assumption — "the system correctly declined to send" is useful to confirm briefly, not as long-term audit trail. |
| `claimed` older than 1 day | **never auto-deleted — flagged as an anomaly instead** | A `claimed` row this old means the stale-claim auto-abandon logic inside `claim_operational_notification_event` did not run as designed (its own `p_stale_claim_after_seconds` default is 300s). This is a bug signal, not routine data — the retention report (§5) surfaces it explicitly rather than silently pruning it. |

### `suppressed_reason` (`suppress_cooldown`, `suppress_duplicate`, etc.)

No retention rule is needed today: reading the live RPC bodies
(`claim_operational_notification_event`), a suppressed claim attempt
(cooldown or duplicate) **returns its result directly to the caller and
never inserts a row** — `suppressed_reason` exists as a column on the table
for a possible future design where suppressed attempts are persisted, but
under the current, live function bodies no row is ever created with this
column populated. The prepared cleanup script (§6) still includes a
no-op-safe clause for this column so it activates automatically, without any
code change, if a future migration starts persisting suppressed attempts.

### The Preview synthetic test record

**Keep indefinitely.** Both prepared SQL files explicitly exclude it by a
hardcoded `fingerprint`/`id` predicate (documented, not a secret) — see the
comments in `PROPOSED_SPRINT_166J_RETENTION_CLEANUP_V1.sql` §0. This is the
only concrete evidence a real end-to-end Preview test was ever exercised and
has documentation value independent of its age.

## 3. What must be retained for diagnostic reasons, regardless of age

- Any row where `finished_at IS NULL` (§2, both tables) — never time-based
  eligible.
- The Preview synthetic test record — excluded by id, not by policy.
- Any `claimed` row that IS still within its stale-claim window — obviously
  not time-eligible in the first place, but called out explicitly so no
  future edit of this document accidentally lowers the bar below the
  RPC's own 300-second minimum.

## 4. Foreign-key relationship and safe deletion order

`operational_notification_events.scheduled_writer_run_id` references
`scheduled_writer_runs(id)` with no `ON DELETE` clause — the default
`NO ACTION` (`RESTRICT`-equivalent) applies. Deleting a `scheduled_writer_runs`
row that is still referenced by any `operational_notification_events` row
(**of any age, from any bucket**) fails with a foreign-key violation, not a
silent no-op.

**Safe order, always**:
1. Delete eligible `operational_notification_events` rows first (children).
2. Delete eligible `scheduled_writer_runs` rows second (parents), **only**
   for rows that are both (a) individually retention-eligible by their own
   `outcome` window, **and** (b) have zero remaining
   `operational_notification_events` rows referencing them (checked via
   `NOT EXISTS`, not assumed from step 1 alone — a linked event might have
   its own longer retention window and still exist after step 1).

This order and the `NOT EXISTS` guard are both encoded directly in
`PROPOSED_SPRINT_166J_RETENTION_CLEANUP_V1.sql` — never left as an
assumption for the operator to get right by hand.

## 5. Read-only reporting (prepared, not executed)

`docs/sql/PREFLIGHT_SPRINT_166J_RETENTION_READONLY_V1.sql` reports, without
deleting anything:
- how many rows in each table currently qualify for deletion under §2,
  broken out by bucket;
- how many `scheduled_writer_runs` rows are outcome-eligible but blocked by
  a still-referencing event (the FK guard from §4, made visible rather than
  silently skipped);
- how many `claimed` rows are older than 1 day (the anomaly flag from §2);
- confirmation the Preview synthetic record is excluded and still present.

## 6. Prepared cleanup script — dry-run by default

`docs/sql/PROPOSED_SPRINT_166J_RETENTION_CLEANUP_V1.sql` is a single
`DO $$ ... $$` block with:
- a `v_dry_run boolean := true` flag at the very top — the operator must
  manually edit this to `false` and re-paste the file to ever perform a
  real deletion; the file as written and prepared **cannot** delete
  anything by being pasted and run as-is;
- a `v_batch_limit` cap (default 500 rows per table per run) — bounds the
  size of any single execution, deliberately preventing "one giant delete"
  even once dry-run is turned off;
- `RAISE NOTICE` output of exactly how many rows would be (or were)
  affected in each table, for both the dry-run and real path — the
  operator always sees a number before/after, never a silent result;
- the Preview synthetic record excluded by explicit id;
- the FK-safe order and `NOT EXISTS` guard from §4.

## 7. Operational rollback / recovery if a real cleanup deletes something unwanted

Since this is a `DELETE`, not a schema change, there is no forward
"rollback SQL" that can undo it — the only real recovery path is a Supabase
Point-in-Time-Recovery (PITR) restore of the affected table(s), which is
Adam's own decision to invoke via the Supabase dashboard, never something
this codebase automates. To make that recovery path realistic if ever
needed:
- the batch cap (§6) keeps any single accidental run small and bounded in
  time, narrowing the PITR restore window needed;
- the mandatory dry-run-first flow means the operator always sees the
  affected-row count *before* a real deletion, catching an unexpectedly
  large number before it happens rather than after.

## 8. Path to real activation (not this sprint)

Once real Production volume exists and the dry-run report has been run a
few times by hand with results that look right, the natural next steps —
each its own future, separately-approved sprint, exactly like every other
automation step in this project — are: (a) wrap the now-proven DELETE
logic in a `SECURITY DEFINER` function mirroring the existing RPC pattern
(no new grant surface — callable only by the writer identity or a new,
narrower "retention" identity), and (b) invoke it from a new, dedicated
Cron entry with its own kill switch, following the exact phased-rollout
discipline already used for Sprint 166G/166H/166J-A. Nothing here is
scheduled, and no code path in this repository calls the prepared SQL file
automatically.
