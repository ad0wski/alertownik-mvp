-- ============================================================================
-- READ ONLY — NO DATABASE MODIFICATION
-- ============================================================================
-- Sprint 150A — duplicate preflight for public.source_notice_candidates,
-- BEFORE the proposed race-condition migration
-- (docs/sql/PROPOSED_SPRINT_150_RACE_CONDITION_MIGRATION_V1.sql) is ever
-- considered for execution.
--
-- THIS FILE CONTAINS SELECT STATEMENTS ONLY. No INSERT, UPDATE, DELETE,
-- ALTER, CREATE, DROP, GRANT, or REVOKE. Safe to run at any time, any
-- number of times — it changes nothing, merges nothing, deletes nothing.
--
-- WHY THIS QUERY CAN'T ACTUALLY BLOCK THE MIGRATION FROM SUCCEEDING
-- (but is still worth running): the proposed migration adds a NEW
-- nullable `content_fingerprint` column and scopes its unique index to
-- `where source_key is not null and content_fingerprint is not null`.
-- Every row that exists BEFORE the migration has content_fingerprint =
-- NULL by construction (the column doesn't exist yet), so no historical
-- row can ever collide with the new index — CREATE UNIQUE INDEX will
-- succeed regardless of what this query finds. This query exists for a
-- different, still-important reason: general data-quality confirmation
-- before turning on SCHEDULED_WRITER_FINGERPRINT_ENABLED, and honest
-- visibility into whether the writer has (against expectation) already
-- produced more than the one verified Sprint 148 candidate.
--
-- NORMALIZATION NOTE: the `regexp_replace`/`translate` expression below
-- is a best-effort, ONE-OFF diagnostic approximation of
-- src/lib/candidateWarnings.ts's normalizeForCompare() — it is NOT the
-- basis for any permanent constraint (that would risk two independently
-- maintained normalization implementations silently drifting apart; see
-- the migration proposal's rejection of a SQL-side generated column for
-- exactly this reason). A row flagged here as "possible duplicate" is a
-- prompt for human review, not an automatic classification.
-- ============================================================================


with candidate_texts as (
  select
    id,
    source_key,
    source_id,
    status,
    detected_at,
    created_at,
    coalesce(nullif(raw_text, ''), nullif(excerpt, ''), title) as basis_text
  from public.source_notice_candidates
  where source_key is not null  -- scope: writer-created rows only, same
                                 -- scope the proposed migration's partial
                                 -- index would cover
),

normalized as (
  select
    id,
    source_key,
    source_id,
    status,
    detected_at,
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
    array_agg(status order by created_at) as statuses,
    min(created_at) as first_created_at,
    max(created_at) as last_created_at
  from normalized
  where normalized_text is not null and normalized_text <> ''
  group by source_key, normalized_text
  having count(*) > 1
)

select
  case when count(*) = 0 then 'SAFE TO MIGRATE' else 'DUPLICATES REQUIRE REVIEW' end as preflight_status,
  count(*) as duplicate_group_count,
  coalesce(sum(row_count), 0) as total_rows_involved,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'source_key', source_key,
        'row_count', row_count,
        'candidate_ids', candidate_ids,
        'statuses', statuses,
        'first_created_at', first_created_at,
        'last_created_at', last_created_at
      )
      order by row_count desc, first_created_at
    ),
    '[]'::jsonb
  ) as duplicate_groups
from duplicate_groups;


-- ============================================================================
-- Companion count — total writer-created rows scanned (sanity check,
-- e.g. expect exactly 1 as of the Sprint 148 verification, until further
-- controlled tests or a real schedule add more).
-- ============================================================================

select count(*) as total_writer_created_candidates
from public.source_notice_candidates
where source_key is not null;


-- ============================================================================
-- END OF PREFLIGHT — read this before any migration decision
-- ============================================================================
-- SAFE TO MIGRATE (duplicate_group_count = 0): proceed to the deployment
-- runbook's next step whenever Adam approves.
-- DUPLICATES REQUIRE REVIEW (duplicate_group_count > 0): STOP. Do not
-- run the migration, do not merge/delete anything automatically — review
-- each group in `duplicate_groups` by hand first. The migration itself
-- would still technically succeed (see note above), but proceeding
-- without understanding WHY duplicates already exist would be treating
-- a symptom, not the cause.
-- ============================================================================
