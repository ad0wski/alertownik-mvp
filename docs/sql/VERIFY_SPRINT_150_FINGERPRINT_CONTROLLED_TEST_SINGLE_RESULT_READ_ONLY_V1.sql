-- ============================================================================
-- READ ONLY -- NO DATABASE MODIFICATION
-- ============================================================================
-- Sprint 150D -- single-result verification for the ONE controlled
-- fingerprint-preview test against Michalowice
-- (docs/SPRINT_150_FINGERPRINT_PREVIEW_ACTIVATION_RUNBOOK_V1.md, Phase C).
--
-- THIS FILE CONTAINS SELECT STATEMENTS ONLY. No INSERT, UPDATE, DELETE,
-- ALTER, CREATE, DROP, GRANT, or REVOKE. Safe to run at any time, any
-- number of times -- it changes nothing.
--
-- Scope: identifies "the controlled run's candidate(s)" as writer-created
-- Michalowice rows that carry a non-null content_fingerprint -- this is a
-- reliable signal because content_fingerprint is only ever populated once
-- SCHEDULED_WRITER_FINGERPRINT_ENABLED=true (Sprint 150 code, see
-- src/lib/scheduledWriter.ts isContentFingerprintEnabled /
-- buildPendingCandidateInsert), so ANY row with a populated fingerprint is,
-- by construction, one this activation's controlled test could have
-- produced -- no time-window guessing needed.
--
-- Does NOT display full candidate text (raw_text/excerpt/title), emails,
-- secrets, env values, or login data -- only minimal identifiers (ids,
-- counts, status, fingerprint format/length, timestamps).
--
-- HONEST LIMITATION (see runbook Sec.7): if the controlled call inserted
-- ZERO new candidates (e.g. no genuinely new content, or the DB's own
-- unique index / the in-memory fuzzy classifier correctly rejected a
-- duplicate), that is a VALID outcome, not a failure -- checks below are
-- written so a 0-count does not produce a false FAIL.
-- ============================================================================

with fingerprinted_michalowice as (
  select id, status, content_fingerprint, source_id, detected_at, created_at, converted_alert_id
  from public.source_notice_candidates
  where source_key = 'michalowice-komunikaty'
    and content_fingerprint is not null
),

fingerprinted_wkd as (
  select count(*) as cnt
  from public.source_notice_candidates
  where source_key = 'wkd-aktualnosci'
    and content_fingerprint is not null
),

latest_candidate as (
  select *
  from fingerprinted_michalowice
  order by created_at desc
  limit 1
),

column_check as (
  select count(*) as cnt
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'source_notice_candidates'
    and column_name = 'content_fingerprint'
),

index_check as (
  select
    ix.indisunique as is_unique,
    ix.indisvalid as is_valid,
    pg_get_expr(ix.indpred, ix.indrelid) as partial_predicate
  from pg_index ix
  join pg_class ic on ic.oid = ix.indexrelid
  where ic.relname = 'source_notice_candidates_writer_fingerprint_uniq'
),

alerts_count as (
  select count(*) as cnt from public.alerts
),

source_checks_for_candidate as (
  select count(*) as cnt
  from public.source_checks sc
  join fingerprinted_michalowice fm on fm.source_id = sc.source_id
  where sc.result in ('no_changes', 'found_notice')
)

select * from (

  select 1 as ord, 'migration_column_exists' as check_name,
    (select cnt from column_check)::text as result,
    '1' as expected,
    case when (select cnt from column_check) = 1 then 'PASS' else 'FAIL' end as status,
    'content_fingerprint column present on source_notice_candidates' as details

  union all

  select 2, 'unique_index_exists',
    case when exists (select 1 from index_check) then 'true' else 'false' end,
    'true',
    case when exists (select 1 from index_check) then 'PASS' else 'FAIL' end,
    'source_notice_candidates_writer_fingerprint_uniq present in pg_index'

  union all

  select 3, 'index_is_valid',
    coalesce((select is_valid from index_check)::text, 'n/a'),
    'true',
    case
      when not exists (select 1 from index_check) then 'FAIL -- index missing, see check #2'
      when (select is_valid from index_check) then 'PASS'
      else 'FAIL'
    end,
    'pg_index.indisvalid -- false would mean a failed CONCURRENTLY build left an unusable index'

  union all

  select 4, 'index_is_unique',
    coalesce((select is_unique from index_check)::text, 'n/a'),
    'true',
    case
      when not exists (select 1 from index_check) then 'FAIL -- index missing, see check #2'
      when (select is_unique from index_check) then 'PASS'
      else 'FAIL'
    end,
    'pg_index.indisunique'

  union all

  select 5, 'partial_predicate_correct',
    coalesce((select partial_predicate from index_check), 'n/a'),
    '(source_key IS NOT NULL) AND (content_fingerprint IS NOT NULL)',
    case
      when not exists (select 1 from index_check) then 'FAIL -- index missing, see check #2'
      when (select partial_predicate from index_check) ilike '%source_key%is not null%'
        and (select partial_predicate from index_check) ilike '%content_fingerprint%is not null%'
        then 'PASS'
      else 'WARN -- predicate text differs from expected, review manually'
    end,
    'Exact WHERE clause on the index, read from pg_index/pg_get_expr'

  union all

  select 6, 'controlled_candidates_found_count',
    (select count(*) from fingerprinted_michalowice)::text,
    '0 or 1',
    case
      when (select count(*) from fingerprinted_michalowice) in (0, 1) then 'PASS'
      else 'WARN -- more than 1 fingerprinted candidate exists for michalowice-komunikaty, review by hand'
    end,
    'Count of writer-created Michalowice candidates carrying a non-null content_fingerprint (see file header for why this is the identifying signal)'

  union all

  select 7, 'controlled_candidate_status_pending',
    coalesce((select status from latest_candidate), '(none)'),
    'pending, or (none) if count above is 0',
    case
      when (select count(*) from fingerprinted_michalowice) = 0 then 'INFO -- no candidate to check; a 0-count controlled run is a valid outcome, not a failure (see runbook Sec.7)'
      when (select status from latest_candidate) = 'pending' then 'PASS'
      else 'FAIL'
    end,
    'Newest fingerprinted Michalowice candidate must remain status=pending -- never auto-approved/converted'

  union all

  select 8, 'controlled_candidate_fingerprint_format',
    case
      when (select count(*) from fingerprinted_michalowice) = 0 then '(none)'
      when (select content_fingerprint from latest_candidate) ~ '^[0-9a-f]{64}$' then 'valid 64-char lowercase hex'
      else 'UNEXPECTED FORMAT'
    end,
    '64-character lowercase hexadecimal (SHA-256 digest)',
    case
      when (select count(*) from fingerprinted_michalowice) = 0 then 'INFO -- no candidate to check; valid 0-count outcome, see runbook Sec.7'
      when (select content_fingerprint from latest_candidate) ~ '^[0-9a-f]{64}$' then 'PASS'
      else 'FAIL'
    end,
    'Confirms the app-computed value is genuinely a SHA-256 hex digest, not a placeholder or truncated value'

  union all

  select 9, 'controlled_candidate_not_converted',
    case when (select count(*) from fingerprinted_michalowice) = 0 then '(none)'
      else coalesce((select converted_alert_id from latest_candidate)::text, 'null') end,
    'null',
    case
      when (select count(*) from fingerprinted_michalowice) = 0 then 'INFO -- no candidate to check'
      when (select converted_alert_id from latest_candidate) is null then 'PASS'
      else 'FAIL -- candidate was converted to an alert, which this controlled test must never do'
    end,
    'Confirms no draft/publish path touched this candidate'

  union all

  select 10, 'wkd_untouched',
    (select cnt from fingerprinted_wkd)::text,
    '0',
    case when (select cnt from fingerprinted_wkd) = 0 then 'PASS' else 'FAIL -- WKD must be out of scope for this write test' end,
    'Count of fingerprinted wkd-aktualnosci candidates -- must stay 0'

  union all

  select 11, 'alerts_untouched_row_count',
    (select cnt from alerts_count)::text,
    'compare by eye against your own pre-test note',
    'INFO',
    'Row count of public.alerts -- this migration/test never writes here; any unexpected change is a stop-and-investigate condition'

  union all

  select 12, 'no_publication_flag_anywhere',
    'n/a (this table has no publish flag)',
    'n/a',
    'INFO',
    'source_notice_candidates has no publish/published column by design -- publication only ever happens via a separate, manual admin action on public.alerts, never from this table or this route'

  union all

  select 13, 'source_check_logged_for_controlled_run',
    (select cnt from source_checks_for_candidate)::text,
    '>= 1 if a candidate was found above; may be 0 if no candidate exists (see check #6)',
    case
      when (select count(*) from fingerprinted_michalowice) = 0 then 'INFO -- no fingerprinted candidate to join against; check source_checks manually if needed'
      when (select cnt from source_checks_for_candidate) >= 1 then 'PASS'
      else 'WARN -- candidate exists but no matching source_checks row found; review manually'
    end,
    'source_checks rows (no_changes/found_notice) sharing source_id with the controlled candidate above'

) as checks
order by ord;

-- ============================================================================
-- END OF VERIFICATION ARTIFACT
-- ============================================================================
-- Checks #1-#5 must PASS before trusting the schema/index at all.
-- Check #6 = 0 is a VALID, HONEST outcome (see runbook Sec.7) -- in that
-- case checks #7-#9 and #13 correctly report INFO, not FAIL, since there
-- is no fresh candidate to inspect. Checks #10-#12 must always PASS/INFO
-- as shown regardless of check #6's outcome -- any deviation there is a
-- stop-and-investigate condition.
-- ============================================================================
