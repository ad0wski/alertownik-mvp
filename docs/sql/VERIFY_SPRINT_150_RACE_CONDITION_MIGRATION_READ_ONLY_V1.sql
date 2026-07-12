-- ============================================================================
-- READ ONLY — NO DATABASE MODIFICATION
-- ============================================================================
-- Sprint 150A — verification for
-- docs/sql/PROPOSED_SPRINT_150_RACE_CONDITION_MIGRATION_V1.sql, to be
-- run AFTER Adam has applied that migration (both steps).
--
-- THIS FILE CONTAINS SELECT STATEMENTS ONLY. No INSERT, UPDATE, DELETE,
-- ALTER, CREATE, DROP, GRANT, or REVOKE. Safe to run at any time, any
-- number of times.
--
-- One combined result table, same convention as
-- docs/sql/VERIFY_SPRINT_148_CONTROLLED_WRITE_TEST_SINGLE_RESULT_READ_ONLY_V1.sql
-- (Sprint 148) — read top to bottom, PASS/FAIL/INFO per row.
-- ============================================================================

with column_check as (
  select count(*) as cnt
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'source_notice_candidates'
    and column_name = 'content_fingerprint'
    and data_type = 'text'
),

index_check as (
  select count(*) as cnt
  from pg_indexes
  where schemaname = 'public'
    and tablename = 'source_notice_candidates'
    and indexname = 'source_notice_candidates_writer_fingerprint_uniq'
),

index_definition as (
  select indexdef
  from pg_indexes
  where schemaname = 'public'
    and tablename = 'source_notice_candidates'
    and indexname = 'source_notice_candidates_writer_fingerprint_uniq'
),

-- Confirms the index is genuinely UNIQUE and genuinely PARTIAL (has a
-- WHERE clause) — not just present under the expected name.
index_is_unique_and_partial as (
  select
    indexdef ilike '%unique%' as is_unique,
    indexdef ilike '%where%'  as is_partial
  from index_definition
),

-- Untouched-tables confirmation: alerts, admin_profiles,
-- automation_identities row/column counts should be identical to
-- whatever they were before this migration — this migration's own SQL
-- never references any of them, but confirm nothing else touched them
-- either.
alerts_check as (
  select count(*) as total_alerts from public.alerts
),

admin_profiles_check as (
  select count(*) as total_admin_profiles from public.admin_profiles
),

automation_identities_check as (
  select count(*) as total_automation_identities from public.automation_identities
),

-- RLS policy count on source_notice_candidates — expect the SAME count
-- as before this migration (this migration adds no policy, drops no
-- policy). Compare this number by eye against the Sprint 145/146
-- verification's own policy count (SIX: 4 admin, one per command, + 2
-- scheduled-writer — see docs/sql/VERIFY_SCHEDULED_WRITER_RLS_READ_ONLY_V1.sql
-- §5 for the authoritative baseline count. NOTE, Sprint 150D: this comment
-- previously said "8", a self-contradicting arithmetic error — 4+2=6, not
-- 8 — caught when the live Sprint 150 verify run legitimately returned 6
-- and was cross-checked against the cited baseline file, which itself
-- says "SIX policies". Corrected here; no RLS was ever actually wrong).
policy_count as (
  select count(*) as cnt
  from pg_policies
  where schemaname = 'public'
    and tablename = 'source_notice_candidates'
)

select * from (

  select
    1 as ord,
    'content_fingerprint column exists with type text' as check_name,
    case when (select cnt from column_check) = 1 then 'PASS' else 'FAIL' end as status,
    (select cnt from column_check)::text as details

  union all

  select
    2,
    'source_notice_candidates_writer_fingerprint_uniq index exists',
    case when (select cnt from index_check) = 1 then 'PASS' else 'FAIL' end,
    (select cnt from index_check)::text

  union all

  select
    3,
    'index is genuinely UNIQUE and genuinely PARTIAL (has a WHERE clause)',
    case
      when (select cnt from index_check) = 0 then 'FAIL — index missing, see check #2'
      when (select is_unique from index_is_unique_and_partial) and (select is_partial from index_is_unique_and_partial)
        then 'PASS'
      else 'FAIL'
    end,
    coalesce((select indexdef from index_definition), '(index not found)')

  union all

  select
    4,
    'RLS policy count on source_notice_candidates unchanged by this migration',
    'INFO — compare by eye against the Sprint 145/146 baseline',
    (select cnt from policy_count)::text || ' polic' || (case when (select cnt from policy_count) = 1 then 'y' else 'ies' end)

  union all

  select
    5,
    'alerts table untouched (row count — compare by eye against your own pre-migration note)',
    'INFO',
    (select total_alerts from alerts_check)::text

  union all

  select
    6,
    'admin_profiles table untouched (row count)',
    'INFO',
    (select total_admin_profiles from admin_profiles_check)::text

  union all

  select
    7,
    'automation_identities table untouched (row count — expect exactly 1, the technical writer account)',
    case when (select total_automation_identities from automation_identities_check) = 1 then 'PASS' else 'INFO' end,
    (select total_automation_identities from automation_identities_check)::text

) as checks
order by ord;

-- ============================================================================
-- END OF VERIFICATION ARTIFACT
-- ============================================================================
-- All of #1–#3 must show PASS before setting
-- SCHEDULED_WRITER_FINGERPRINT_ENABLED=true anywhere. #4–#7 are
-- INFO/sanity checks — compare the numbers against what you noted
-- immediately before running the migration; any unexpected CHANGE in
-- alerts/admin_profiles/automation_identities row counts is a stop-and-
-- investigate condition, since this migration's own SQL never touches
-- any of those three tables.
-- ============================================================================
