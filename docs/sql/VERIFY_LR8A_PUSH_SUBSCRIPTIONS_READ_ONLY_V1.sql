-- LR-8A — read-only verification after PROPOSED_LR8A_PUSH_SUBSCRIPTIONS_V1.sql.
-- Every query only reads catalog views.

-- 1. RLS enabled on both tables (expect two rows, rowsecurity = true)
select tablename, rowsecurity from pg_tables
 where schemaname = 'public' and tablename in ('push_subscriptions', 'push_deliveries');

-- 2. anon has NO table privileges (expect zero rows)
select table_name, privilege_type from information_schema.role_table_grants
 where grantee = 'anon' and table_schema = 'public'
   and table_name in ('push_subscriptions', 'push_deliveries');

-- 3. Policies exist only for authenticated and all use admin_profiles (expect 6 rows)
select tablename, policyname, cmd, roles, qual, with_check from pg_policies
 where schemaname = 'public' and tablename in ('push_subscriptions', 'push_deliveries')
 order by tablename, cmd;

-- 4. Functions are SECURITY DEFINER with a pinned search_path
select p.proname, p.prosecdef, p.proconfig from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('push_subscribe', 'push_unsubscribe');

-- 5. Who may execute them (expect anon + authenticated, not PUBLIC)
select routine_name, grantee from information_schema.role_routine_grants
 where routine_schema = 'public' and routine_name in ('push_subscribe', 'push_unsubscribe')
 order by routine_name, grantee;

-- 6. Unique idempotency key present
select conname from pg_constraint where conname = 'push_deliveries_alert_subscription_key';
