-- ============================================================================
-- READ ONLY — NO DATABASE MODIFICATION
-- ============================================================================
-- Sprint 161B — Admin Authorization and alert_sources RLS Closure v1.
--
-- Purpose: verify the live state of `alert_sources`'s RLS policies both
-- BEFORE and AFTER applying
-- docs/sql/SPRINT_161B_ALERT_SOURCES_RLS_HARDENING.sql. Run it once before
-- (to confirm the finding — the four policies still read
-- `auth.role() = 'authenticated'`) and once after (to confirm the
-- replacement policies are live and admin_profiles-based).
--
-- THIS FILE CONTAINS SELECT STATEMENTS ONLY.
-- It does not, and must never be edited to, contain INSERT, UPDATE,
-- DELETE, ALTER, CREATE, DROP, GRANT, or REVOKE.
-- It was NOT executed as part of Sprint 161B — no read-only Supabase
-- MCP/CLI connection was available in this session. Run it manually in the
-- Supabase SQL Editor whenever convenient — every query below only reads
-- Postgres/PostgREST catalog metadata, never application data, and
-- changes nothing regardless of when or how many times it's run.
-- ============================================================================


-- ── 1. RLS policies on alert_sources ────────────────────────────────────────
-- Reveals: policy name, which command it applies to, which Postgres
-- role(s) it targets, whether it's PERMISSIVE or RESTRICTIVE, and its
-- USING / WITH CHECK expressions. Before applying the hardening file,
-- expect to see the four original "Authenticated admins can ..." names
-- with `auth.role() = 'authenticated'` in the qual/with_check columns —
-- this IS the finding. After applying, expect the four new "Admins can
-- ... alert sources" names instead, each referencing admin_profiles.
--
-- Also included: alerts, source_checks, source_notice_candidates, and
-- automation_identities, so this file can serve as a single
-- post-Sprint-161B confirmation that those four tables were genuinely
-- left untouched (their policy rows should be byte-for-byte identical to
-- what docs/sql/INSPECT_LIVE_RLS_READ_ONLY.sql and
-- docs/sql/VERIFY_SCHEDULED_WRITER_RLS_READ_ONLY_V1.sql already recorded).

select
  schemaname,
  tablename,
  policyname,
  permissive,   -- 'PERMISSIVE' or 'RESTRICTIVE'
  roles,
  cmd,          -- one of: SELECT, INSERT, UPDATE, DELETE, ALL
  qual        as using_expression,
  with_check  as with_check_expression
from pg_policies
where schemaname = 'public'
  and tablename in (
    'alert_sources', 'alerts', 'source_checks',
    'source_notice_candidates', 'automation_identities'
  )
order by tablename, cmd, policyname;


-- ── 2. RLS enabled/forced status ─────────────────────────────────────────────
-- Confirms row level security is actually ON (not just that policies
-- exist — a table can have policies defined while RLS itself is
-- disabled, which would make every policy above a no-op).

select
  relname             as table_name,
  relrowsecurity      as rls_enabled,
  relforcerowsecurity as rls_forced
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in (
    'alert_sources', 'alerts', 'source_checks',
    'source_notice_candidates', 'automation_identities'
  );


-- ── 3. Table-level GRANTs on alert_sources ──────────────────────────────────
-- RLS policies only restrict what an already-GRANTed role can do — they
-- never grant access on their own. Confirms the underlying Postgres GRANTs
-- match what the policies above assume, the same cross-check
-- docs/sql/INSPECT_LIVE_RLS_READ_ONLY.sql already performs for the other
-- three tables.

select
  table_name,
  grantee,
  privilege_type,
  is_grantable
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'alert_sources'
order by grantee, privilege_type;


-- ── 4. Confirm admin_profiles membership the admin depends on ──────────────
-- Read-only visibility into how many rows exist in admin_profiles — does
-- NOT select any contact/identity column from auth.users, only the count
-- and the bare user_id, so this is safe to run without exposing account
-- details. A non-zero count here is what makes the "ADMIN LOCKOUT RISK:
-- LOW" claim in the hardening file's header verifiable rather than
-- asserted.

select
  count(*) as admin_profile_count
from public.admin_profiles;

select
  user_id
from public.admin_profiles
order by user_id;


-- ============================================================================
-- END OF READ-ONLY VERIFICATION ARTIFACT
-- ============================================================================
-- Expected BEFORE applying SPRINT_161B_ALERT_SOURCES_RLS_HARDENING.sql:
--   §1 shows alert_sources with exactly four policies named
--   "Authenticated admins can select/insert/update/delete sources", each
--   with `auth.role() = 'authenticated'` as the using/with_check
--   expression — confirming the finding.
--
-- Expected AFTER applying it:
--   §1 shows alert_sources with exactly four policies named
--   "Admins can select/insert/update/delete alert sources", each
--   referencing `admin_profiles` in the using/with_check expression, and
--   NO policy targeting `automation_identities` on alert_sources at all.
--   §1's rows for alerts/source_checks/source_notice_candidates/
--   automation_identities are unchanged from before.
--   §2 shows rls_enabled = true for all five tables (unchanged).
--   §4 shows at least one row — the existing admin's row, unchanged by
--   this migration.
-- ============================================================================
