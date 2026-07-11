-- ============================================================================
-- Sprint 148 — Phase 4: register the technical scheduled-writer account
-- ============================================================================
-- Adds the ONE dedicated Supabase Auth technical account (created manually
-- by Adam in Sprint 148 Phase 3, dashboard-only) to
-- public.automation_identities — and ONLY to this table, never to
-- public.admin_profiles.
--
-- UUID confirmed by Adam as the technical account's auth.users.id:
--   b5f0bcd3-8398-4a6c-a144-fae4af412fd3
--
-- This is the ONLY row this statement adds. No other identity, no bulk
-- insert, no admin_profiles change, no RLS/policy change, no GRANT/REVOKE
-- change (grant hardening was already applied and verified in Phase 2).
-- ============================================================================


begin;

insert into public.automation_identities (user_id)
values ('b5f0bcd3-8398-4a6c-a144-fae4af412fd3');

commit;


-- ============================================================================
-- POST-APPLY VERIFICATION
-- ============================================================================
-- Run docs/sql/VERIFY_SCHEDULED_WRITER_AUTOMATION_IDENTITY_READ_ONLY_V1.sql
-- (SELECT only) immediately after and share the result before Phase 5.
-- ============================================================================
