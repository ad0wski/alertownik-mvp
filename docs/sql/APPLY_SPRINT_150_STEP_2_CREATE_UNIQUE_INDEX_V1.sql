-- ============================================================================
-- ⛔⛔⛔ MANUAL DATABASE CHANGE — STEP 2 OF 2 (RUN THIS FILE ALONE) ⛔⛔⛔
-- ============================================================================
-- ⚠️ RUN ONLY AFTER STEP 1 SUCCEEDS ⚠️
-- (docs/sql/APPLY_SPRINT_150_STEP_1_ADD_FINGERPRINT_COLUMN_V1.sql must have
-- completed without error first — this statement depends on the
-- content_fingerprint column already existing. CONFIRMED 2026-07-12: Step 1
-- returned "Success. No rows returned".)
--
-- ⚠️ THIS FILE MUST CONTAIN EXACTLY ONE STATEMENT — DO NOT ADD ANYTHING ⚠️
-- First attempt at Step 2 (a version that also included a trailing
-- COMMENT ON INDEX statement) failed with:
--   ERROR: 25001: CREATE INDEX CONCURRENTLY cannot run inside a
--   transaction block
-- No literal BEGIN was ever present — this is standard Postgres behavior:
-- when a SQL Editor query box contains MORE THAN ONE statement, Postgres
-- receives it as a single multi-command string and implicitly wraps it in
-- one transaction. CREATE INDEX CONCURRENTLY refuses to run in ANY
-- transaction context, explicit or implicit. The index was NOT created by
-- that failed attempt (error occurs before the command completes) — this
-- file is the corrected, single-statement version. The COMMENT ON INDEX
-- statement moved to its own file,
-- docs/sql/APPLY_SPRINT_150_STEP_2B_COMMENT_ON_INDEX_V1.sql, to run after
-- this one succeeds.
-- ============================================================================
-- Sprint 150 — Race Condition Closure Migration.
-- Statement is verbatim (no semantic change) from the approved Step 2 block
-- in docs/sql/PROPOSED_SPRINT_150_RACE_CONDITION_MIGRATION_V1.sql.
--
-- APPROVAL SCOPE (per Adam's "CONTROLLED SPRINT 150 MIGRATION APPROVED",
-- 2026-07-12): creates ONE partial unique index on
-- public.source_notice_candidates (source_key, content_fingerprint) WHERE
-- source_key IS NOT NULL AND content_fingerprint IS NOT NULL. Nothing else.
-- No RLS change, no change to alerts / admin_profiles /
-- automation_identities / any other table, no data cleanup, no duplicate
-- removal, no Vercel change, no SCHEDULED_WRITER_FINGERPRINT_ENABLED flag,
-- no Production/cron/schedule/live write/WKD/autopublish.
--
-- Running it concurrently (rather than a plain CREATE UNIQUE INDEX) avoids
-- taking a write-blocking lock on source_notice_candidates while the index
-- builds — appropriate defensive practice even though this table is small
-- and low-traffic today.
-- ============================================================================

create unique index concurrently if not exists
  source_notice_candidates_writer_fingerprint_uniq
  on public.source_notice_candidates (source_key, content_fingerprint)
  where source_key is not null and content_fingerprint is not null;

-- ============================================================================
-- AFTER RUNNING THIS FILE
-- ============================================================================
-- Confirm no error was returned. Then run, as a SEPARATE execution:
-- docs/sql/APPLY_SPRINT_150_STEP_2B_COMMENT_ON_INDEX_V1.sql
-- ============================================================================
