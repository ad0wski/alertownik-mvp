# Sprint 166K-D — Production Retention Design (Design Only, Not Active)

**Nothing in this document is executable.** There is no SQL file
accompanying this document. No cleanup mechanism for Production exists in
this repository, in any Cron entry, or in any application code path. This
document exists to answer "what would Production retention look like"
without creating anything a future session could accidentally run.

---

## 1. Relationship to the Preview cleanup design

Sprint 166K-C hardened `docs/sql/PROPOSED_SPRINT_166J_RETENTION_CLEANUP_V1.sql`
and its preflight sibling for `alertownik-preview` only — that file's own
`v_expected_environment_tag` guard unconditionally refuses to run outside
`environment_tag = 'preview'` (see that file's Revision 2 header). **This
document does not change that file, does not weaken that guard, and does
not make it Production-capable.** Production retention, if it is ever
activated, requires its own separate, separately-reviewed SQL file — the
same discipline already applied to every other Production action in this
project (the 166H migration, the 166J-A ACL hardening each had their own
dedicated, reviewed file).

## 2. Why Production cannot reuse the Preview synthetic-record identifiers

The Preview cleanup script protects two specific, real, already-created
rows: the Sprint 166F-2B ledger test row
(`fingerprint = 'sprint-166f-2b-controlled-preview-ledger-test-1'`) and the
Sprint 166G-3 writer test run
(`id = f16fb737-c836-411a-a509-d3b0aea4d5cc`). **Neither row exists in
Production.** Production has zero rows in both tables today (confirmed by
the 166J-A ACL hardening checkpoint's own read-only verification). A future
Production retention design must never reference these two Preview-only
identifiers — doing so would be either a no-op (harmless but meaningless)
or, worse, a copy-paste trap if a future editor "helpfully" tries to make
it match a Production row by coincidence. If Production ever accumulates
its own controlled-test rows worth preserving indefinitely (e.g. from
Phase D/E of the rollout runbook), **that future session must define its
own durable business-key identification for those specific rows**,
following the exact same preferred-first, fallback-second method Sprint
166K-C established:
1. Prefer a durable, human-chosen business key already present on the row
   (a `fingerprint`, if the row is in `operational_notification_events`).
2. If no such key exists (as `scheduled_writer_runs` structurally lacks
   one), require an explicit, `NULL`-by-default operator parameter,
   independently re-verified against the row's other properties, never a
   hardcoded UUID default.

## 3. Retention windows (unchanged from the approved policy — restated for clarity)

| Table / status | Window | Measured from |
|---|---|---|
| `scheduled_writer_runs`, `outcome IN ('success','skipped_kill_switch','skipped_lock_held')` | 90 days | `finished_at` |
| `scheduled_writer_runs`, `outcome IN ('partial_failure','total_failure','abandoned')` | **180 days** | `finished_at` |
| `operational_notification_events`, `status = 'sent'` | 90 days | `sent_at` |
| `operational_notification_events`, `status IN ('failed')` | 180 days | `finished_at` |
| `operational_notification_events`, `status = 'abandoned'` (i.e. suppressed/abandoned) | **30 days** | `finished_at` |
| Either table, any open row (`finished_at IS NULL`) | never time-eligible | n/a |
| `claimed` rows older than 1 day | never auto-deleted — anomaly flag only | n/a |

This restates, and does not change, `SPRINT_166J_RETENTION_POLICY_AND_RUNBOOK_V1.md`
§2 — Production and Preview share the same policy *values*; they will
never share the same *protected-record identifiers* (§2 above) or the same
*executable file* (§4 below).

## 4. What a future, separately-approved Production retention file must contain

Not written here, and not to be written until Production has accumulated
enough real run history to make a preflight report meaningful (mirroring
this project's own stated principle — see
`SPRINT_166J_RETENTION_POLICY_AND_RUNBOOK_V1.md` §1 — "the real constraint
is audit value, not storage" at low row counts). When that future session
begins, the resulting file must, at minimum, carry every property Sprint
166K-C's Preview file now has:

- `v_dry_run boolean := true` by default, unconditionally.
- A second, independent confirmation phrase required alongside
  `v_dry_run = false` before any real execution.
- `v_batch_limit` defaulting to, and never exceeding, **500 rows per table
  per run**, validated as a positive integer before use.
- A hard `v_expected_environment_tag` guard — for a Production file, this
  constant would read `'production'`, and the file must refuse to run
  (unconditional `RAISE EXCEPTION`) if that value is ever anything else,
  mirroring the Preview file's own guard exactly.
- The entire script wrapped in exactly one `BEGIN; ... COMMIT;` controlled
  transaction — never multiple independent statements a partial failure
  could leave half-applied.
- Fail-closed on: missing tables, an unresolved/ambiguous protected
  record (§2 above), an invalid batch limit, and any other guard already
  established in the Preview file's Revision 2 design.
- The exact FK-safe deletion order already established: children
  (`operational_notification_events`) before parents
  (`scheduled_writer_runs`), with the same `NOT EXISTS` guard.
- No CASCADE, no TRUNCATE, no DROP, no dynamic SQL — structurally
  identical constraints to the Preview file.
- Its own dedicated, separate read-only preflight report file (mirroring
  `PREFLIGHT_SPRINT_166J_RETENTION_READONLY_V1.sql`), run and read by
  Adam before the cleanup file is ever considered.
- Its own dedicated runbook section (extending
  `SPRINT_166H_PRODUCTION_ROLLOUT_RUNBOOK_V1.md`'s FAZA H, §1 of that
  phase's action list) requiring its own explicit, separate approval —
  never implied by approval of any earlier phase.

## 5. What this document explicitly does NOT do

- It does not create a `docs/sql/*.sql` file for Production retention.
- It does not add a Cron entry, route, or RPC function for cleanup.
- It does not change `PROPOSED_SPRINT_166J_RETENTION_CLEANUP_V1.sql` or
  `PREFLIGHT_SPRINT_166J_RETENTION_READONLY_V1.sql` in any way.
- It does not grant itself, or any future reader, permission to run SQL
  against Production — every future step here still requires Adam's own
  separate, explicit, phase-scoped approval, per FAZA H's own terms.
