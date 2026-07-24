-- VERIFY — Sprint 166J-A — Production ACL hardening verification, READ-ONLY.
--
-- Run this in alertownik-mvp (project ref puhcjyffosgohbmxrczb) immediately
-- after applying PROPOSED_SPRINT_166J_PRODUCTION_ACL_HARDENING_V1.sql.
-- Every statement is a SELECT — nothing here writes.

-- 1. anon has zero EXECUTE on any of the four functions; authenticated
--    still has EXECUTE on all four; service_role/postgres unaffected.
select
  p.proname,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute,
  has_function_privilege('postgres', p.oid, 'EXECUTE') as postgres_can_execute
from pg_proc p
where p.proname in (
  'open_scheduled_writer_run', 'close_scheduled_writer_run',
  'claim_operational_notification_event', 'finish_operational_notification_event'
)
order by p.proname;
-- expect: anon_can_execute = false for all 4 rows;
--         authenticated_can_execute = true for all 4 rows;
--         service_role_can_execute = true for all 4 rows;
--         postgres_can_execute = true for all 4 rows.

-- 2. anon has zero direct table privilege on either table; authenticated
--    retains SELECT only (no INSERT/UPDATE/DELETE); service_role/postgres
--    unaffected.
select
  c.relname,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
  has_table_privilege('anon', c.oid, 'INSERT') as anon_insert,
  has_table_privilege('anon', c.oid, 'UPDATE') as anon_update,
  has_table_privilege('anon', c.oid, 'DELETE') as anon_delete,
  has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
  has_table_privilege('authenticated', c.oid, 'INSERT') as authenticated_insert,
  has_table_privilege('authenticated', c.oid, 'UPDATE') as authenticated_update,
  has_table_privilege('authenticated', c.oid, 'DELETE') as authenticated_delete,
  has_table_privilege('service_role', c.oid, 'INSERT') as service_role_insert,
  has_table_privilege('postgres', c.oid, 'INSERT') as postgres_insert
from pg_class c
where c.relname in ('scheduled_writer_runs', 'operational_notification_events')
order by c.relname;
-- expect: anon_select/anon_insert/anon_update/anon_delete = false for both
--         rows; authenticated_select = true for both rows;
--         authenticated_insert/update/delete = false for both rows;
--         service_role_insert = true for both rows;
--         postgres_insert = true for both rows.

-- 3. RLS is still enabled on both tables, unchanged by this hardening.
select relname, relrowsecurity
from pg_class
where relname in ('scheduled_writer_runs', 'operational_notification_events');
-- expect relrowsecurity = true for both.

-- 4. Exactly the same two admin-only SELECT policies still exist, byte-
--    for-byte unchanged (this hardening never touches RLS policies).
select tablename, policyname, cmd, roles
from pg_policies
where tablename in ('scheduled_writer_runs', 'operational_notification_events')
order by tablename;
-- expect exactly 2 rows total, both cmd = SELECT, both roles = {authenticated}.

-- 5. Both tables remain empty — this hardening performs no data change,
--    and no RPC/writer/claim activity happened as part of it.
select
  (select count(*) from public.scheduled_writer_runs) as scheduled_writer_runs_count,
  (select count(*) from public.operational_notification_events) as operational_notification_events_count;
-- expect 0, 0 (or whatever count already existed immediately before this
-- hardening ran — compare against the value recorded in the Sprint 166J
-- checkpoint, not necessarily literal 0 if a real run happened in between).

-- If every result above matches its "-- expect" comment, the hardening is
-- verified complete and correct. This file does not check application
-- behavior — the accompanying checkpoint's own manual/automated test
-- results (npm run test:e2e for the writer/ledger suites) are the source
-- of truth for confirming the real writer session still functions after
-- this change.
