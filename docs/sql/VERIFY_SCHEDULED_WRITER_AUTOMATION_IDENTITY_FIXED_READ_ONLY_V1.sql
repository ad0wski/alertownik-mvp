-- ============================================================================
-- READ ONLY — NO DATABASE MODIFICATION
-- ============================================================================
-- Sprint 148 — Phase 4 correction verification companion for
-- docs/sql/FIX_SCHEDULED_WRITER_AUTOMATION_IDENTITY_V1.sql.
--
-- THIS FILE CONTAINS SELECT STATEMENTS ONLY. Safe to run at any time, any
-- number of times — it changes nothing. No email, password, token, or
-- other credential value is selected anywhere in this file.
-- ============================================================================


-- ── 1. Mistaken admin UUID: gone from automation_identities ─────────────
-- Expected: 0 rows.

select user_id, created_at
from public.automation_identities
where user_id = 'b5f0bcd3-8398-4a6c-a144-fae4af412fd3';


-- ── 2. Mistaken admin UUID: still an admin (untouched, as required) ─────
-- Expected: exactly 1 row — Adam's admin membership must be intact.

select user_id, created_at
from public.admin_profiles
where user_id = 'b5f0bcd3-8398-4a6c-a144-fae4af412fd3';


-- ── 3. Mistaken admin UUID: still a valid auth.users row (untouched) ────
-- Expected: exactly 1 row (id, created_at only — no email/credential
-- columns selected).

select id, created_at
from auth.users
where id = 'b5f0bcd3-8398-4a6c-a144-fae4af412fd3';


-- ── 4. Correct technical UUID: exists in auth.users ─────────────────────
-- Expected: exactly 1 row.

select id, created_at
from auth.users
where id = '104b2caa-2443-4d17-90cc-f10cd41da746';


-- ── 5. Correct technical UUID: now present in automation_identities ─────
-- Expected: exactly 1 row.

select user_id, created_at
from public.automation_identities
where user_id = '104b2caa-2443-4d17-90cc-f10cd41da746';


-- ── 6. Correct technical UUID: NOT present in admin_profiles ────────────
-- Expected: 0 rows — this is the critical separation check.

select user_id, created_at
from public.admin_profiles
where user_id = '104b2caa-2443-4d17-90cc-f10cd41da746';


-- ── 7. Full contents of automation_identities: no unexpected extra rows ─
-- Expected: exactly 1 row total, user_id = 104b2caa-2443-4d17-90cc-f10cd41da746.

select user_id, created_at
from public.automation_identities
order by created_at;


-- ============================================================================
-- END OF READ-ONLY VERIFICATION ARTIFACT
-- ============================================================================
-- Expected state after the fix:
--   §1 → 0 rows
--   §2 → 1 row
--   §3 → 1 row
--   §4 → 1 row
--   §5 → 1 row
--   §6 → 0 rows
--   §7 → exactly 1 row total, user_id = 104b2caa-2443-4d17-90cc-f10cd41da746
-- ============================================================================
