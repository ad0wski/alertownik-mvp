-- VERIFY — Sprint 166H — Production post-migration verification, READ-ONLY.
--
-- Run this in alertownik-mvp (project ref puhcjyffosgohbmxrczb) immediately
-- after applying PROPOSED_SPRINT_166H_PRODUCTION_SCHEDULED_WRITER_AND_LEDGER_MIGRATION_V1.sql
-- (or V2). Every statement is a SELECT — nothing here writes.
--
-- BUGFIX — Sprint 166P Day 10: section 7 originally queried
-- information_schema.routine_privileges, which (like
-- information_schema.routines) is filtered to only the grants the
-- CURRENT querying role itself holds or granted — a role that is neither
-- the function owner nor `authenticated` sees ZERO rows here even when
-- the underlying GRANT is present and correct. This produced a false
-- "nothing granted" read during this audit. Section 7 now uses
-- has_function_privilege(), which reports the true, role-independent
-- grant state (mirrors how section 6 already used raw pg_proc rather
-- than information_schema.routines for the same reason). If you ever ran
-- the old version of this file and concluded the migration wasn't
-- applied, re-run this corrected version before trusting that
-- conclusion — see SPRINT_166P_DAY10_PRODUCTION_LEDGER_CANARY_AUDIT_AND_RUNBOOK_V1.md
-- §2A for the full incident writeup.
--
-- Section 2's "expect 0, 0" comment is also now conditional — see that
-- section's own updated note. This file has not yet been run in this
-- corrected form as of this edit; still read-only, still not executed
-- automatically.

-- 1. Both tables exist.
select
  to_regclass('public.scheduled_writer_runs') as scheduled_writer_runs,
  to_regclass('public.operational_notification_events') as operational_notification_events;
-- expect both non-null

-- 2. Row counts — compare against your own immediately-prior baseline,
--    not a hardcoded "expect 0, 0". That expectation only held the very
--    first time this file was written, before any real scheduled-writer
--    run had ever occurred in Production; it no longer applies once
--    legitimate activity exists. The only thing this migration itself
--    must never cause is an UNEXPECTED change versus your own baseline
--    taken immediately before (pure DDL applies zero data changes).
select
  (select count(*) from public.scheduled_writer_runs) as scheduled_writer_runs_count,
  (select count(*) from public.operational_notification_events) as operational_notification_events_count;
-- expect: identical to your own preflight baseline, whatever it was

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

-- 7. Grants on the four functions — expect authenticated = true, and
--    anon/public = false, for every one. Uses has_function_privilege()
--    (role-independent, unlike information_schema.routine_privileges —
--    see this file's header) joined against pg_proc so it lists all four
--    even if this connection's own role has no EXECUTE grant itself.
select
  p.proname,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('public', p.oid, 'EXECUTE') as public_role_can_execute
from pg_proc p
where p.proname in (
  'open_scheduled_writer_run', 'close_scheduled_writer_run',
  'claim_operational_notification_event', 'finish_operational_notification_event'
)
order by p.proname;
-- expect 4 rows, authenticated_can_execute = true, anon/public = false, for each

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
