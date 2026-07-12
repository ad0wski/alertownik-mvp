-- ============================================================================
-- ⛔ MANUAL DATABASE CHANGE — STEP 2B (RUN AFTER STEP 2 SUCCEEDS) ⛔
-- ============================================================================
-- Adds a documentation comment to the index created by
-- docs/sql/APPLY_SPRINT_150_STEP_2_CREATE_UNIQUE_INDEX_V1.sql. Split into
-- its own file/execution because a SQL Editor query box containing BOTH the
-- CREATE INDEX CONCURRENTLY statement AND this COMMENT statement together
-- is treated by Postgres as one multi-statement, implicitly-transactional
-- query — which CREATE INDEX CONCURRENTLY rejects. Running this comment
-- alone, in its own plain statement, has no such restriction.
--
-- APPROVAL SCOPE (per Adam's "CONTROLLED SPRINT 150 MIGRATION APPROVED",
-- 2026-07-12): a COMMENT ON INDEX is metadata only — it does not alter any
-- data, any table, any RLS policy, or any row. No other table touched.
-- ============================================================================

comment on index public.source_notice_candidates_writer_fingerprint_uniq is
  'Sprint 150A: closes the documented concurrent-invocation race for the scheduled writer. '
  'Partial — only ever applies to writer-created rows (source_key not null) that also '
  'carry a content_fingerprint (only true once SCHEDULED_WRITER_FINGERPRINT_ENABLED=true). '
  'Admin-manual candidates (source_key always null) are structurally excluded and '
  'completely unaffected by this constraint.';

-- ============================================================================
-- AFTER RUNNING BOTH STEP 2 AND STEP 2B
-- ============================================================================
-- Run docs/sql/VERIFY_SPRINT_150_RACE_CONDITION_MIGRATION_READ_ONLY_V1.sql
-- to confirm the column and index exist exactly as described above, and
-- that no unrelated table/policy was touched. Do NOT set
-- SCHEDULED_WRITER_FINGERPRINT_ENABLED=true until that verification passes
-- — that flag change is explicitly OUT OF SCOPE for this approval.
-- ============================================================================
