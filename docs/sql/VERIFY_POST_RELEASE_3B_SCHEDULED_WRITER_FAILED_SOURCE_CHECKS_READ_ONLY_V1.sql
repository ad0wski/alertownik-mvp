-- ============================================================================
-- READ-ONLY VERIFICATION — safe to run any time (SELECT only, no writes)
-- ============================================================================
-- POST-RELEASE-3B — run after
-- PROPOSED_POST_RELEASE_3B_SCHEDULED_WRITER_FAILED_SOURCE_CHECKS_V1.sql.
-- ============================================================================

-- 1. Exactly one automation INSERT policy, still scoped to authenticated,
--    and its WITH CHECK now mentions 'failed' + error_code + error_summary.
--    Expected: 1 row, roles = {authenticated}, permissive = PERMISSIVE,
--    allows_failed = true, requires_error_code = true,
--    requires_error_summary = true, requires_automation_identity = true.
select
  policyname,
  cmd,
  roles,
  permissive,
  with_check like '%''failed''%'            as allows_failed,
  with_check like '%error_code IS NOT NULL%'    as requires_error_code,
  with_check like '%error_summary IS NOT NULL%' as requires_error_summary,
  with_check like '%automation_identities%'     as requires_automation_identity,
  with_check like '%created_by = auth.uid()%'   as requires_self_attribution,
  with_check like '%related_alert_id IS NULL%'  as requires_no_related_alert
from pg_policies
where schemaname = 'public'
  and tablename = 'source_checks'
  and policyname = 'Scheduled writer can insert automated source_checks';

-- 2. Every INSERT policy on source_checks. Expected exactly 2 rows:
--    "Admins can insert source_checks" (admin_profiles) and the scheduled
--    writer policy above. No policy for anon.
select policyname, roles, with_check
from pg_policies
where schemaname = 'public' and tablename = 'source_checks' and cmd = 'INSERT'
order by policyname;

-- 3. RLS still enabled on source_checks. Expected: true.
select relrowsecurity
from pg_class
where oid = 'public.source_checks'::regclass;

-- 4. After the next scheduled run that hits a fetch failure (none expected
--    on a healthy day): failed rows written by the writer.
select checked_at, result, error_code, error_summary
from public.source_checks
where result = 'failed'
order by checked_at desc
limit 5;
