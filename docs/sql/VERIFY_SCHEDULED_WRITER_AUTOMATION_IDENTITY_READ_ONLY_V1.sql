-- ============================================================================
-- READ ONLY — NO DATABASE MODIFICATION
-- ============================================================================
-- Sprint 148 — Phase 4 verification companion for
-- docs/sql/INSERT_SCHEDULED_WRITER_AUTOMATION_IDENTITY_V1.sql.
--
-- THIS FILE CONTAINS SELECT STATEMENTS ONLY. Safe to run at any time, any
-- number of times — it changes nothing.
-- ============================================================================


-- ── 1. The technical identity exists in automation_identities, and ONLY
-- once ────────────────────────────────────────────────────────────────────
-- Expected: exactly 1 row, user_id = b5f0bcd3-8398-4a6c-a144-fae4af412fd3.

select user_id, created_at
from public.automation_identities
order by created_at;


-- ── 2. The same UUID does NOT exist in admin_profiles ───────────────────
-- Expected: 0 rows. This is the critical separation check — the technical
-- account must never be treated as, or confused with, admin membership.

select user_id, created_at
from public.admin_profiles
where user_id = 'b5f0bcd3-8398-4a6c-a144-fae4af412fd3';


-- ── 3. The UUID corresponds to a real auth.users row (sanity check only,
-- no email/password ever selected) ──────────────────────────────────────
-- Expected: exactly 1 row. Only confirms the row exists — does not select
-- email, password, or any other identifying/secret column.

select id, created_at
from auth.users
where id = 'b5f0bcd3-8398-4a6c-a144-fae4af412fd3';


-- ============================================================================
-- END OF READ-ONLY VERIFICATION ARTIFACT
-- ============================================================================
-- Expected state:
--   §1 → exactly 1 row, user_id = b5f0bcd3-8398-4a6c-a144-fae4af412fd3
--   §2 → 0 rows
--   §3 → exactly 1 row
-- ============================================================================
