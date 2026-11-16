-- ============================================================================
-- ROLLBACK — DO NOT RUN WITHOUT EXPLICIT OWNER APPROVAL
-- ============================================================================
-- POST-RELEASE-3B rollback. Restores the scheduled writer's source_checks
-- INSERT policy to exactly the rule live on Production before
-- PROPOSED_POST_RELEASE_3B_SCHEDULED_WRITER_FAILED_SOURCE_CHECKS_V1.sql
-- (verified via pg_policies on 2026-11-16). Rows already inserted with
-- result='failed' are NOT deleted — they stay as history.
-- After rollback the writer's failed-check inserts return 403 again
-- (harmless: logFailedSourceCheck never throws; run outcome unaffected).
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
    and result = any (array['no_changes'::text, 'found_notice'::text])
    and related_alert_id is null
    and created_by = auth.uid()
  );

commit;
