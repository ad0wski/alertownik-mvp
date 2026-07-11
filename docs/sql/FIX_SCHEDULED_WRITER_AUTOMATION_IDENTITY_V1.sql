-- ============================================================================
-- MANUAL DATABASE CHANGE — RUN ONLY AFTER REVIEW
-- ============================================================================
-- Sprint 148 — Phase 4 correction.
--
-- BACKGROUND: the UUID first supplied for the scheduled-writer technical
-- identity (b5f0bcd3-8398-4a6c-a144-fae4af412fd3) was confirmed by Adam to
-- be a pre-existing ADMIN account (already present in public.admin_profiles
-- since 2026-05-21), pasted by mistake. It was inserted into
-- public.automation_identities in error. The correct, separate technical
-- account is 104b2caa-2443-4d17-90cc-f10cd41da746.
--
-- THIS FILE:
--   1. Removes ONLY the mistaken UUID from public.automation_identities.
--   2. Does NOT touch public.admin_profiles in any way — the mistaken
--      account's admin membership is left completely untouched (Adam still
--      needs it as his admin account).
--   3. Does NOT delete or modify any auth.users row.
--   4. Inserts ONLY the correct technical UUID into
--      public.automation_identities.
--   5. Does NOT add the correct technical UUID to public.admin_profiles.
--   6. Makes no RLS, grant, schema, alerts, source_notice_candidates, or
--      source_checks change of any kind.
--
-- GUARDRAILS: before inserting the correct UUID, this file verifies (a)
-- that UUID actually exists in auth.users, and (b) that UUID does NOT
-- already exist in admin_profiles. If either check fails, the entire
-- transaction is aborted via RAISE EXCEPTION — nothing in this file is
-- allowed to partially apply. No email, password, token, or other
-- credential value is read, displayed, or logged by this script; the
-- checks below select/compare UUIDs only.
-- ============================================================================


begin;

do $$
begin
  if not exists (
    select 1 from auth.users
    where id = '104b2caa-2443-4d17-90cc-f10cd41da746'
  ) then
    raise exception
      'Guardrail failed: correct technical UUID (104b2caa-2443-4d17-90cc-f10cd41da746) not found in auth.users — aborting, no changes applied.';
  end if;

  if exists (
    select 1 from public.admin_profiles
    where user_id = '104b2caa-2443-4d17-90cc-f10cd41da746'
  ) then
    raise exception
      'Guardrail failed: correct technical UUID (104b2caa-2443-4d17-90cc-f10cd41da746) already exists in admin_profiles — aborting, no changes applied.';
  end if;
end $$;

-- Remove ONLY the mistaken admin UUID from automation_identities.
delete from public.automation_identities
where user_id = 'b5f0bcd3-8398-4a6c-a144-fae4af412fd3';

-- Add ONLY the correct, separate technical writer UUID.
insert into public.automation_identities (user_id)
values ('104b2caa-2443-4d17-90cc-f10cd41da746');

commit;


-- ============================================================================
-- POST-APPLY VERIFICATION
-- ============================================================================
-- Run docs/sql/VERIFY_SCHEDULED_WRITER_AUTOMATION_IDENTITY_FIXED_READ_ONLY_V1.sql
-- (SELECT only) immediately after and share the result before Phase 5.
-- ============================================================================
