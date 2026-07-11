-- ============================================================================
-- READ ONLY — NO DATABASE MODIFICATION
-- ============================================================================
-- Sprint 145 — verification companion for
-- docs/sql/PROPOSED_SCHEDULED_WRITER_RLS_MIGRATION_V1.sql and its rollback.
--
-- THIS FILE CONTAINS SELECT STATEMENTS ONLY. No INSERT, UPDATE, DELETE,
-- ALTER, CREATE, DROP, GRANT, or REVOKE. Safe to run at any time, any
-- number of times, before or after the proposed migration — it changes
-- nothing.
--
-- Use this both BEFORE applying the migration (to reconfirm the exact
-- pre-migration state matches this package's assumptions — the same role
-- the Sprint 144 inspection artifact played) and AFTER applying it (to
-- confirm the new state matches what was intended, per this file's
-- inline expectations).
-- ============================================================================


-- ── 1. automation_identities: schema ─────────────────────────────────────────
-- Expected AFTER migration: user_id (uuid, not null), created_at
-- (timestamptz, not null, default now()). Expected BEFORE migration: this
-- query returns zero rows (table does not exist yet).

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'automation_identities'
order by ordinal_position;


-- ── 2. automation_identities: RLS enabled/forced ────────────────────────────
-- Expected AFTER migration: rls_enabled = true, rls_forced = false.

select relname as table_name, relrowsecurity as rls_enabled, relforcerowsecurity as rls_forced
from pg_class
where relnamespace = 'public'::regnamespace
  and relname = 'automation_identities';


-- ── 3. automation_identities: policies ──────────────────────────────────────
-- Expected AFTER migration: exactly one policy, "Automation identities can
-- read their own membership row", PERMISSIVE, {authenticated}, SELECT,
-- USING (auth.uid() = user_id), WITH CHECK null. No INSERT/UPDATE/DELETE
-- policy should exist.

select policyname, permissive, roles, cmd, qual as using_expression, with_check as with_check_expression
from pg_policies
where schemaname = 'public' and tablename = 'automation_identities'
order by cmd, policyname;


-- ── 4. automation_identities: grants ────────────────────────────────────────
-- Expected AFTER migration: `anon` has NO rows at all (fully revoked).
-- `authenticated` has exactly one row: SELECT. `postgres` retains full
-- grantable access (table owner).

select table_name, grantee, privilege_type, is_grantable
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'automation_identities'
order by grantee, privilege_type;


-- ── 5. source_notice_candidates: policies ───────────────────────────────────
-- Expected AFTER migration: SIX policies —
--   "Admins can select/insert/update/delete source_notice_candidates"
--   (admin_profiles-based, one per command)
--   "Scheduled writer can select source_notice_candidates"
--   "Scheduled writer can insert pending source_notice_candidates"
-- The four original "Authenticated admins can ..." policies should be
-- ABSENT (replaced, not merely supplemented).

select policyname, permissive, roles, cmd, qual as using_expression, with_check as with_check_expression
from pg_policies
where schemaname = 'public' and tablename = 'source_notice_candidates'
order by cmd, policyname;


-- ── 6. source_checks: policies ──────────────────────────────────────────────
-- Expected AFTER migration: FIVE policies —
--   "Admins can select/insert/update/delete source_checks"
--   (admin_profiles-based, one per command)
--   "Scheduled writer can insert automated source_checks"
-- The four original "Authenticated admins can ..." policies should be
-- ABSENT.

select policyname, permissive, roles, cmd, qual as using_expression, with_check as with_check_expression
from pg_policies
where schemaname = 'public' and tablename = 'source_checks'
order by cmd, policyname;


-- ── 7. alerts: policies — MUST BE COMPLETELY UNCHANGED ──────────────────────
-- Expected: identical to the Sprint 144 live-audit findings — "Admins can
-- read all/insert/update/delete alerts" (admin_profiles-based) + "Public
-- can read published alerts" (anon). If this differs from the Sprint 144
-- record at all, STOP and investigate before proceeding — this migration
-- should never have touched this table.

select policyname, permissive, roles, cmd, qual as using_expression, with_check as with_check_expression
from pg_policies
where schemaname = 'public' and tablename = 'alerts'
order by cmd, policyname;


-- ── 8. admin_profiles: policies — MUST BE COMPLETELY UNCHANGED ──────────────
-- Expected: identical to the Sprint 144 live-audit findings — exactly one
-- policy, "Admins can read their own admin profile" (SELECT, own row
-- only). If this differs at all, STOP and investigate.

select policyname, permissive, roles, cmd, qual as using_expression, with_check as with_check_expression
from pg_policies
where schemaname = 'public' and tablename = 'admin_profiles'
order by cmd, policyname;


-- ── 9. Cross-check: exactly one admin_profiles row still exists ────────────
-- Confirms the single-admin-account model is unaffected. Selects id/email
-- only — never credential material.

select id, email
from auth.users
where id in (select user_id from public.admin_profiles)
order by id;


-- ── 10. Cross-check: automation_identities membership (should be empty
-- until a future, separately-approved sprint populates it) ────────────────

select user_id, created_at
from public.automation_identities
order by created_at;


-- ============================================================================
-- END OF READ-ONLY VERIFICATION ARTIFACT
-- ============================================================================
-- After running: compare every result against the "Expected" comment
-- above each query, and against
-- docs/SCHEDULED_WRITER_RLS_DEPLOYMENT_RUNBOOK_V1.md's checklist. Any
-- mismatch means STOP before relying on the migration having applied
-- correctly — investigate the discrepancy rather than proceeding.
-- ============================================================================
