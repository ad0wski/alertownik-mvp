-- VERIFY — Sprint 166H — Production post-migration verification, READ-ONLY.
--
-- Run this in alertownik-mvp (project ref puhcjyffosgohbmxrczb) immediately
-- after applying PROPOSED_SPRINT_166H_PRODUCTION_SCHEDULED_WRITER_AND_LEDGER_MIGRATION_V1.sql.
-- Every statement is a SELECT — nothing here writes.

-- 1. Both tables exist.
select
  to_regclass('public.scheduled_writer_runs') as scheduled_writer_runs,
  to_regclass('public.operational_notification_events') as operational_notification_events;
-- expect both non-null

-- 2. Both tables are empty (this is a fresh migration — no run or claim has
--    ever happened in Production).
select
  (select count(*) from public.scheduled_writer_runs) as scheduled_writer_runs_count,
  (select count(*) from public.operational_notification_events) as operational_notification_events_count;
-- expect 0, 0

-- 3. RLS enabled on both.
select relname, relrowsecurity
from pg_class
where relname in ('scheduled_writer_runs', 'operational_notification_events');
-- expect relrowsecurity = true for both

-- 4. Exactly one policy per table, both admin-only SELECT (no direct writer
--    write path exists at any point).
select tablename, policyname, cmd, roles
from pg_policies
where tablename in ('scheduled_writer_runs', 'operational_notification_events')
order by tablename;
-- expect exactly 2 rows total, both cmd = SELECT, both roles = {authenticated}

-- 5. Indexes.
select tablename, indexname
from pg_indexes
where tablename in ('scheduled_writer_runs', 'operational_notification_events')
order by tablename, indexname;
-- expect 5 rows total:
--   scheduled_writer_runs_pkey, scheduled_writer_runs_one_open_per_scope
--   operational_notification_events_pkey,
--   operational_notification_events_one_claim_per_scope,
--   operational_notification_events_scope_recency

-- 6. All four functions exist, SECURITY DEFINER, empty search_path.
select proname, prosecdef, proconfig
from pg_proc
where proname in (
  'open_scheduled_writer_run', 'close_scheduled_writer_run',
  'claim_operational_notification_event', 'finish_operational_notification_event'
)
order by proname;
-- expect 4 rows, prosecdef = true for all, proconfig containing
-- 'search_path=' (empty) for all

-- 7. Grants on the four functions — expect authenticated only, never
--    PUBLIC or anon.
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_name in (
  'open_scheduled_writer_run', 'close_scheduled_writer_run',
  'claim_operational_notification_event', 'finish_operational_notification_event'
)
order by routine_name, grantee;
-- expect grantee = authenticated only, for each

-- 8. No unexpected table grant exists for any writer-shaped role (no
--    direct INSERT/UPDATE/DELETE grant on either table for any role).
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_name in ('scheduled_writer_runs', 'operational_notification_events')
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
-- expect 0 rows

-- 9. Confirm every other table this migration must never have touched is
--    unchanged — compare these counts against the PREFLIGHT script's own
--    output from immediately before the migration.
select
  (select count(*) from public.alert_sources) as alert_sources_count,
  (select count(*) from public.source_notice_candidates) as source_notice_candidates_count,
  (select count(*) from public.alerts) as alerts_count,
  (select count(*) from public.admin_profiles) as admin_profiles_count,
  (select count(*) from public.automation_identities) as automation_identities_count;

-- If every result above matches its "-- expect" comment and section 9's
-- counts are identical to the preflight script's output, the migration is
-- verified complete and correct. Do not activate any runtime flag or
-- deploy any code change based on this alone — that is a separate,
-- later phase (see the rollout runbook).
