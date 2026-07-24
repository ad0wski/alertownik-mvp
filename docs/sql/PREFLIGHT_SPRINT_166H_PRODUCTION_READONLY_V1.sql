-- PREFLIGHT — Sprint 166H — Production readiness check, READ-ONLY.
--
-- Run this in alertownik-mvp (project ref puhcjyffosgohbmxrczb) BEFORE
-- applying PROPOSED_SPRINT_166H_PRODUCTION_SCHEDULED_WRITER_AND_LEDGER_MIGRATION_V1.sql.
-- Every statement below is a SELECT / to_regclass / pg_catalog lookup —
-- nothing here writes, and nothing here needs to be run inside a
-- transaction. Confirmed safe to run repeatedly.
--
-- STOP and do not proceed to the migration if ANY of these checks come
-- back unexpected — see the inline "-- expect" comment on each line.

-- 1. Confirm the two target tables do not already exist (expect both NULL —
--    if either is NOT NULL, STOP: something already created them outside
--    this runbook, and the migration below must not blindly re-run).
select
  to_regclass('public.scheduled_writer_runs') as scheduled_writer_runs,
  to_regclass('public.operational_notification_events') as operational_notification_events;

-- 2. Confirm the four RPC function names are not already taken (expect 0
--    rows — a name collision here means someone else already defined a
--    function with one of these exact names for a different purpose).
select proname from pg_proc
where proname in (
  'open_scheduled_writer_run', 'close_scheduled_writer_run',
  'claim_operational_notification_event', 'finish_operational_notification_event'
);

-- 3. Confirm the two dependency tables this migration references via FK
--    already exist with the expected key types (expect: automation_identities
--    exists with user_id uuid; alert_sources exists with id uuid; admin_profiles
--    exists with user_id uuid).
select
  to_regclass('public.automation_identities') as automation_identities,
  to_regclass('public.alert_sources') as alert_sources,
  to_regclass('public.admin_profiles') as admin_profiles;

select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'automation_identities' and column_name = 'user_id')
    or (table_name = 'alert_sources' and column_name = 'id')
    or (table_name = 'admin_profiles' and column_name = 'user_id'))
order by table_name;
-- expect all three data_type = 'uuid'

-- 4. Confirm at least one automation identity already exists (expect >= 1
--    — if 0, the migration is still safe to apply, but no writer can ever
--    authenticate against these functions until an identity is provisioned;
--    this is a separate, later manual step, not part of this migration).
select count(*) as automation_identity_count from public.automation_identities;

-- 5. Confirm gen_random_uuid() is available (expect >= 1 — either via the
--    pgcrypto extension or Postgres's own built-in pg_catalog function,
--    both satisfy the table's DEFAULT clause).
select count(*) as pgcrypto_installed from pg_extension where extname = 'pgcrypto';

-- 6. Row counts on tables this migration does NOT modify, purely so the
--    post-migration verification script has a documented baseline to
--    compare against (expect these to be unchanged after the migration).
select
  (select count(*) from public.alert_sources) as alert_sources_count,
  (select count(*) from public.source_notice_candidates) as source_notice_candidates_count,
  (select count(*) from public.alerts) as alerts_count,
  (select count(*) from public.admin_profiles) as admin_profiles_count;

-- If every check above matches its "-- expect" comment, the migration is
-- safe to apply. If anything is unexpected, STOP and report back before
-- proceeding — do not attempt to interpret or work around an unexpected
-- result in the same session.
