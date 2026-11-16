-- ============================================================================
-- PROPOSED MIGRATION — DO NOT RUN WITHOUT EXPLICIT OWNER APPROVAL
-- ============================================================================
-- POST-RELEASE-3B — let the scheduled writer persist FAILED source checks.
--
-- This is a PROPOSAL only. It has NOT been executed. To be run on
-- Production only by Adam, manually, in the Supabase SQL Editor, after his
-- own review — same convention as every other file in docs/sql/.
--
-- WHY
-- Incident POST-RELEASE-3A (2026-11-16 06:21 UTC): the Michałowice source
-- timed out twice; the writer (P0-2B, logFailedSourceCheck in
-- src/lib/scheduledWriter.ts) tried to insert a source_checks row with
-- result='failed' + error_code/error_summary and got HTTP 403 — the
-- automation INSERT policy only allows 'no_changes'/'found_notice'.
-- Result: failed scheduled checks are never recorded per source.
--
-- WHAT CHANGES (one policy, WITH CHECK only)
--   "Scheduled writer can insert automated source_checks" (INSERT,
--   to authenticated) additionally accepts result = 'failed', but ONLY
--   when error_code AND error_summary are both set. error_code is already
--   limited to the 6 FetchDiagnosticCode values and error_summary to
--   <= 200 chars by the existing CHECK constraints
--   (source_checks_error_code_check / source_checks_error_summary_check).
--
-- WHAT STAYS EXACTLY THE SAME
--   - Same policy name, same command (INSERT), same role (authenticated).
--   - Still requires membership in public.automation_identities.
--   - Still requires related_alert_id IS NULL and created_by = auth.uid().
--   - 'no_changes'/'found_notice' branch is byte-for-byte the old rule.
--   - 'alert_created'/'needs_followup' stay forbidden for the writer.
--   - No other policy, table, column, grant, function or trigger is
--     touched. RLS is not disabled. No GRANT/REVOKE. No data is read,
--     written or deleted. anon still has no INSERT path (this policy is
--     scoped to authenticated; anon matches no INSERT policy).
--   - Admin policies (admin_profiles-based) are untouched.
--
-- ALTER POLICY (not DROP + CREATE) keeps the policy in place the whole
-- time — there is no window where the writer has no INSERT policy.
--
-- ROLLBACK: docs/sql/ROLLBACK_POST_RELEASE_3B_SCHEDULED_WRITER_FAILED_SOURCE_CHECKS_V1.sql
-- VERIFY (read-only, after running): docs/sql/VERIFY_POST_RELEASE_3B_SCHEDULED_WRITER_FAILED_SOURCE_CHECKS_READ_ONLY_V1.sql
-- ============================================================================

begin;

alter policy "Scheduled writer can insert automated source_checks"
  on public.source_checks
  to authenticated
  with check (
    exists (
      select 1
      from public.automation_identities
      where automation_identities.user_id = auth.uid()
    )
    and related_alert_id is null
    and created_by = auth.uid()
    and (
      result = any (array['no_changes'::text, 'found_notice'::text])
      or (
        result = 'failed'
        and error_code is not null
        and error_summary is not null
      )
    )
  );

commit;
