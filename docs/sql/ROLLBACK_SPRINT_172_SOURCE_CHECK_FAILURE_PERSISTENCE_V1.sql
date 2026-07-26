-- Sprint 172 — Rollback for
-- PROPOSED_SPRINT_172_SOURCE_CHECK_FAILURE_PERSISTENCE_V1.sql.
-- NOT EXECUTED. Only relevant if the forward migration was applied first.
--
-- IMPORTANT — data-loss note: if any row was inserted with
-- result = 'failed' after the forward migration ran (i.e. the app code
-- from this branch was also deployed and an admin logged at least one
-- failed check), restoring the original result CHECK constraint will
-- FAIL with a constraint-violation error until those rows are handled —
-- Postgres will not let you add a CHECK that existing data violates. This
-- rollback deliberately does NOT delete or rewrite those rows for you
-- (no DELETE, no UPDATE anywhere in this file, matching the sprint's own
-- "no unbounded UPDATE/DELETE" constraint) — run the SELECT below FIRST,
-- and if it returns any rows, decide by hand (with Adam) whether to
-- delete them, change their result to a pre-existing value, or keep the
-- 'failed' capability instead of rolling back.

-- Run this first. If it returns 0 rows, the rollback below is safe.
-- select id, source_id, checked_at, result, error_code, error_summary
-- from public.source_checks
-- where result = 'failed';

begin;

alter table public.source_checks
  drop column if exists error_code,
  drop column if exists error_summary;

alter table public.source_checks
  drop constraint if exists source_checks_result_check;

alter table public.source_checks
  add constraint source_checks_result_check
    check (result = any (array[
      'no_changes'::text,
      'found_notice'::text,
      'alert_created'::text,
      'needs_followup'::text
    ]));

commit;

-- Nothing else touched: no other table, no RLS policy, no index.
