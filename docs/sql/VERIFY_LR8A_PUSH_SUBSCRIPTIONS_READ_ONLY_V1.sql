-- LR-8A — read-only verification after PROPOSED_LR8A_PUSH_SUBSCRIPTIONS_V1.sql.
-- Every query only reads catalog views (query 7 reads one boolean).

-- 1. RLS enabled on all three tables (expect three rows, rowsecurity = true)
select tablename, rowsecurity from pg_tables
 where schemaname = 'public'
   and tablename in ('push_subscriptions', 'push_deliveries', 'push_gateway_secret');

-- 2. anon has NO table privileges (expect zero rows)
select table_name, privilege_type from information_schema.role_table_grants
 where grantee = 'anon' and table_schema = 'public'
   and table_name in ('push_subscriptions', 'push_deliveries', 'push_gateway_secret');

-- 3. authenticated has nothing on push_gateway_secret (expect zero rows)
select table_name, privilege_type from information_schema.role_table_grants
 where grantee = 'authenticated' and table_schema = 'public' and table_name = 'push_gateway_secret';

-- 4. Policies exist only for authenticated and all use admin_profiles (expect 6 rows)
select tablename, policyname, cmd, roles, qual, with_check from pg_policies
 where schemaname = 'public'
   and tablename in ('push_subscriptions', 'push_deliveries', 'push_gateway_secret')
 order by tablename, cmd;

-- 5. Functions are SECURITY DEFINER with a pinned search_path and take the
--    token first (expect 2 rows: push_subscribe 5 args, push_unsubscribe 2)
select p.proname, p.prosecdef, p.proconfig, pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('push_subscribe', 'push_unsubscribe');

-- 6. Who may execute them (expect anon only — plus the owner — not PUBLIC)
select routine_name, grantee from information_schema.role_routine_grants
 where routine_schema = 'public' and routine_name in ('push_subscribe', 'push_unsubscribe')
 order by routine_name, grantee;

-- 7. Gateway token hash configured (expect true after the LR-8B insert)
select exists (select 1 from public.push_gateway_secret) as gateway_token_configured;

-- 8. Unique idempotency key present
select conname from pg_constraint where conname = 'push_deliveries_alert_subscription_key';
