-- Sprint 188A — read-only verification for the proposed source-geography
-- migration. Safe to run before AND after
-- PROPOSED_SPRINT_188A_SOURCE_GEOGRAPHY_V1.sql — contains no writes.
--
-- Run before: confirms the five new columns do not exist yet on either
-- table (all expected today, 2026-08-03 — this migration has not been
-- applied).
-- Run after (only if the forward migration is applied): confirms exactly
-- the expected columns exist with the expected nullability, the
-- lifecycle_status CHECK constraint allows exactly the 8 canonical
-- values, and every existing row has NULL in every new column (proves no
-- backfill silently ran).

-- 1. New columns on alert_sources exist with the right nullability/type.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'alert_sources'
  and column_name in ('wojewodztwo', 'powiat', 'gmina', 'miejscowosc', 'lifecycle_status')
order by column_name;

-- 2. New columns on alerts exist with the right nullability/type.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'alerts'
  and column_name in ('wojewodztwo', 'powiat', 'gmina', 'miejscowosc')
order by column_name;

-- 3. The lifecycle_status CHECK constraint's exact definition (must allow
--    exactly the 8 canonical values, or be absent entirely before the
--    migration).
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.alert_sources'::regclass
  and conname like '%lifecycle_status%';

-- 4. Every existing alert_sources row has NULL in every new column —
--    proves no backfill ran.
select
  count(*) as total_rows,
  count(*) filter (where wojewodztwo is not null) as rows_with_wojewodztwo,
  count(*) filter (where powiat is not null) as rows_with_powiat,
  count(*) filter (where gmina is not null) as rows_with_gmina,
  count(*) filter (where miejscowosc is not null) as rows_with_miejscowosc,
  count(*) filter (where lifecycle_status is not null) as rows_with_lifecycle_status
from public.alert_sources;

-- 5. Every existing alerts row has NULL in every new column — same proof
--    for the second table.
select
  count(*) as total_rows,
  count(*) filter (where wojewodztwo is not null) as rows_with_wojewodztwo,
  count(*) filter (where powiat is not null) as rows_with_powiat,
  count(*) filter (where gmina is not null) as rows_with_gmina,
  count(*) filter (where miejscowosc is not null) as rows_with_miejscowosc
from public.alerts;

-- 6. RLS policy count/coverage on both tables is unchanged by this
--    migration (nullable columns added, no policy touched).
select polname, polcmd
from pg_policy
where polrelid = 'public.alert_sources'::regclass
order by polname;

select polname, polcmd
from pg_policy
where polrelid = 'public.alerts'::regclass
order by polname;
