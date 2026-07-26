-- Sprint 172 — read-only verification for the proposed source_checks
-- failure-persistence migration. Safe to run before AND after
-- PROPOSED_SPRINT_172_SOURCE_CHECK_FAILURE_PERSISTENCE_V1.sql — contains
-- no writes.
--
-- Run before: confirms the two new columns do not exist yet and the
-- result CHECK constraint does not yet allow 'failed' (both expected
-- today).
-- Run after (only if the forward migration is applied): confirms exactly
-- the two expected columns exist with the expected types/constraints,
-- the result CHECK constraint now allows exactly five values, and every
-- existing row's new columns are NULL (no unexpected backfill happened).

-- 1. New columns exist with the right nullability/type.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'source_checks'
  and column_name in ('error_code', 'error_summary')
order by column_name;

-- 2. The result CHECK constraint's exact definition (must include 'failed'
--    after the migration, alongside the original four values — nothing
--    removed, nothing else added).
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.source_checks'::regclass
  and conname = 'source_checks_result_check';

-- 3. The two new CHECK constraints on error_code/error_summary exist and
--    have the expected shape.
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.source_checks'::regclass
  and conname like '%error_code%' or conname like '%error_summary%';

-- 4. Every existing row has NULL error_code/error_summary — proves no
--    backfill ran (there should be no rows with result = 'failed' either,
--    since that value didn't exist before this migration).
select
  count(*) as total_rows,
  count(*) filter (where error_code is not null) as rows_with_error_code,
  count(*) filter (where error_summary is not null) as rows_with_error_summary,
  count(*) filter (where result = 'failed') as rows_with_failed_result
from public.source_checks;

-- 5. RLS is still enabled and all four admin_profiles-gated policies plus
--    the one scheduled-writer policy are unchanged in count and command
--    coverage by this migration.
select polname, polcmd
from pg_policy
where polrelid = 'public.source_checks'::regclass
order by polname;

-- 6. The scheduled-writer INSERT policy's own with_check clause still
--    only allows 'no_changes'/'found_notice' — confirms this migration
--    did not implicitly widen what the writer identity can insert.
select polname, pg_get_expr(polwithcheck, polrelid) as with_check
from pg_policy
where polrelid = 'public.source_checks'::regclass
  and polname = 'Scheduled writer can insert automated source_checks';
