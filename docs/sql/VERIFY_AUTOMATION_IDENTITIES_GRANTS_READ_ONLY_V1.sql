-- ============================================================================
-- READ ONLY — NO DATABASE MODIFICATION
-- ============================================================================
-- Sprint 147 — narrow verification companion for
-- docs/sql/PROPOSED_AUTOMATION_IDENTITIES_GRANT_HARDENING_V1.sql (and its
-- rollback). Scoped specifically to public.automation_identities — for
-- the full four-table verification, see
-- docs/sql/VERIFY_SCHEDULED_WRITER_RLS_READ_ONLY_V1.sql (Sprint 144/146).
--
-- THIS FILE CONTAINS SELECT STATEMENTS ONLY. No INSERT, UPDATE, DELETE,
-- ALTER, CREATE, DROP, GRANT, or REVOKE. Safe to run at any time, any
-- number of times, before or after the grant-hardening proposal — it
-- changes nothing.
-- ============================================================================


-- ── 1. Current grants ────────────────────────────────────────────────────────
-- BEFORE hardening is applied: `authenticated` should show SELECT,
-- TRUNCATE, TRIGGER, REFERENCES (the verified Sprint 146 finding).
-- AFTER hardening is applied: `authenticated` should show SELECT only.
-- `anon` should show zero rows in both cases. `postgres` retains full,
-- grantable access throughout (table owner) — unaffected either way.

select table_name, grantee, privilege_type, is_grantable
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'automation_identities'
order by grantee, privilege_type;


-- ── 2. RLS still enabled ─────────────────────────────────────────────────────
-- Expected, unaffected by the grant-hardening proposal either way:
-- rls_enabled = true, rls_forced = false.

select relname as table_name, relrowsecurity as rls_enabled, relforcerowsecurity as rls_forced
from pg_class
where relnamespace = 'public'::regnamespace
  and relname = 'automation_identities';


-- ── 3. Policies unchanged ────────────────────────────────────────────────────
-- Expected, unaffected by the grant-hardening proposal either way:
-- exactly one policy, "Automation identities can read their own
-- membership row" (SELECT, `auth.uid() = user_id`, no WITH CHECK). The
-- grant-hardening proposal touches only GRANT/REVOKE — never RLS
-- policies — so this result must be identical before and after.

select policyname, permissive, roles, cmd, qual as using_expression, with_check as with_check_expression
from pg_policies
where schemaname = 'public' and tablename = 'automation_identities'
order by cmd, policyname;


-- ── 4. Current membership (should be empty until a future, separately-
-- approved sprint populates it) ─────────────────────────────────────────────

select user_id, created_at
from public.automation_identities
order by created_at;


-- ============================================================================
-- END OF READ-ONLY VERIFICATION ARTIFACT
-- ============================================================================
-- Expected state BEFORE hardening (Sprint 146, already confirmed live):
--   §1 → authenticated: SELECT, TRUNCATE, TRIGGER, REFERENCES (4 rows)
--   §2 → true, false
--   §3 → 1 row (self-row SELECT policy)
--   §4 → 0 rows
--
-- Expected state AFTER hardening (if and when approved and applied):
--   §1 → authenticated: SELECT only (1 row)
--   §2 → true, false (unchanged)
--   §3 → 1 row, identical to before (unchanged)
--   §4 → 0 rows (unchanged, unless a separately-approved sprint has since
--        added a real automation identity)
-- ============================================================================
