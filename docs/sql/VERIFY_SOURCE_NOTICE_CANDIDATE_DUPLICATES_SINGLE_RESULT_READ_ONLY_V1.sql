-- ============================================================================
-- READ ONLY — NO DATABASE MODIFICATION
-- ============================================================================
-- Sprint 150B — single-result-set version of
-- docs/sql/VERIFY_SOURCE_NOTICE_CANDIDATE_DUPLICATES_READ_ONLY_V1.sql.
--
-- WHY THIS FILE EXISTS: the original preflight file contains TWO separate
-- SELECT statements (the aggregated duplicate-group result, then a
-- companion sanity count). Supabase SQL Editor only displays the LAST
-- statement's result when running a multi-statement paste — so pasting
-- the original file whole would show the companion count, not the
-- actual verdict. This file collapses everything into ONE result set,
-- ONE table, so there is nothing to misread.
--
-- THIS FILE CONTAINS SELECT STATEMENTS ONLY. No INSERT, UPDATE, DELETE,
-- ALTER, CREATE, DROP, GRANT, or REVOKE. Safe to run at any time, any
-- number of times — it changes nothing, merges nothing, deletes nothing.
--
-- Uses the same normalization approximation and scope as the original
-- file (writer-created rows only, source_key is not null) — see that
-- file's header comment for why this is a diagnostic approximation of
-- src/lib/candidateWarnings.ts's normalizeForCompare(), not a permanent
-- constraint basis.
--
-- Does NOT display full candidate text (raw_text/excerpt/title). Shows
-- only minimal identifiers (candidate ids, row counts, source_key) —
-- enough for human review, nothing that needs to be treated as sensitive.
-- ============================================================================

with candidate_texts as (
  select
    id,
    source_key,
    status,
    created_at,
    coalesce(nullif(raw_text, ''), nullif(excerpt, ''), title) as basis_text
  from public.source_notice_candidates
  where source_key is not null
),

normalized as (
  select
    id,
    source_key,
    status,
    created_at,
    trim(
      regexp_replace(
        regexp_replace(
          translate(lower(basis_text), 'ąćęłńóśźż', 'acelnoszz'),
          '[^a-z0-9\s]', ' ', 'g'
        ),
        '\s+', ' ', 'g'
      )
    ) as normalized_text
  from candidate_texts
),

duplicate_groups as (
  select
    source_key,
    normalized_text,
    count(*) as row_count,
    array_agg(id order by created_at) as candidate_ids,
    min(created_at) as first_created_at,
    max(created_at) as last_created_at
  from normalized
  where normalized_text is not null and normalized_text <> ''
  group by source_key, normalized_text
  having count(*) > 1
),

totals as (
  select
    (select count(*) from duplicate_groups) as duplicate_group_count,
    (select coalesce(sum(row_count), 0) from duplicate_groups) as total_rows_involved,
    (select count(*) from public.source_notice_candidates where source_key is not null) as total_writer_created_candidates,
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'source_key', source_key,
            'row_count', row_count,
            'candidate_ids', candidate_ids,
            'first_created_at', first_created_at,
            'last_created_at', last_created_at
          )
          order by row_count desc, first_created_at
        ),
        '[]'::jsonb
      )
      from duplicate_groups
    ) as duplicate_groups_json
)

select * from (

  select
    1 as ord,
    'writer_created_candidates_scanned' as check_name,
    (select total_writer_created_candidates from totals)::text as result,
    'sanity check — compare against your own running count' as expected,
    'INFO' as status,
    'Total rows with source_key not null, scanned by this preflight.' as details

  union all

  select
    2,
    'duplicate_group_count',
    (select duplicate_group_count from totals)::text,
    '0',
    case when (select duplicate_group_count from totals) = 0 then 'PASS' else 'WARN' end,
    'Groups of writer-created candidates sharing the same (source_key, normalized_text). '
      || (select total_rows_involved from totals)::text || ' total row(s) involved across all groups.'

  union all

  select
    3,
    'duplicate_group_detail',
    coalesce((select duplicate_groups_json from totals)::text, '[]'),
    '[] (empty array)',
    case when (select duplicate_group_count from totals) = 0 then 'PASS' else 'WARN' end,
    'Minimal identifiers only (source_key, row_count, candidate_ids, timestamps) — no raw_text/excerpt/title shown. Empty if no duplicates.'

  union all

  select
    4,
    'PREFLIGHT VERDICT',
    case when (select duplicate_group_count from totals) = 0 then 'SAFE TO MIGRATE' else 'DUPLICATES REQUIRE REVIEW' end,
    'SAFE TO MIGRATE',
    case when (select duplicate_group_count from totals) = 0 then 'PASS' else 'WARN' end,
    case
      when (select duplicate_group_count from totals) = 0
        then 'No duplicate groups found. Note: the proposed migration would succeed either way (new nullable column, all pre-existing rows have content_fingerprint = NULL), but this verdict is the data-quality gate the runbook asks for before enabling the writer fingerprint flag.'
      else 'STOP — do not migrate yet. Review each group in check #3 by hand before proceeding. Do not merge, delete, or auto-resolve anything.'
    end

) as checks
order by ord;

-- ============================================================================
-- END OF PREFLIGHT — read this before any migration decision
-- ============================================================================
-- Row 4 (PREFLIGHT VERDICT) is the single number that matters:
--   SAFE TO MIGRATE            -> proceed to the deployment runbook's next
--                                  step whenever Adam approves.
--   DUPLICATES REQUIRE REVIEW  -> STOP. Review row 3's candidate_ids by
--                                  hand first. Do not run the migration.
-- ============================================================================
