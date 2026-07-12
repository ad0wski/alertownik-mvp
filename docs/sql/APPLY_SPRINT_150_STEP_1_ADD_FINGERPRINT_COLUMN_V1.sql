-- ============================================================================
-- ⛔⛔⛔ MANUAL DATABASE CHANGE — STEP 1 OF 2 ⛔⛔⛔
-- ============================================================================
-- Sprint 150 — Race Condition Closure Migration.
-- Extracted verbatim (no semantic change) from the approved Step 1 block in
-- docs/sql/PROPOSED_SPRINT_150_RACE_CONDITION_MIGRATION_V1.sql, so this can
-- be run as its own, unambiguous execution — no manual selection of a
-- fragment from a larger file required.
--
-- APPROVAL SCOPE (per Adam's "CONTROLLED SPRINT 150 MIGRATION APPROVED",
-- 2026-07-12): adds ONE nullable column, content_fingerprint, to
-- public.source_notice_candidates. Nothing else. No RLS change, no change
-- to alerts / admin_profiles / automation_identities / any other table, no
-- data cleanup, no duplicate removal, no Vercel change, no
-- SCHEDULED_WRITER_FINGERPRINT_ENABLED flag, no Production/cron/schedule/
-- live write/WKD/autopublish.
--
-- Wrapped in an explicit transaction: a plain ALTER TABLE ADD COLUMN on a
-- nullable column is a fast, non-blocking metadata-only change in modern
-- Postgres (no table rewrite, no long lock) — safe to wrap in a
-- transaction, unlike Step 2 (CREATE INDEX CONCURRENTLY), which is in a
-- separate file and must NOT be run together with this one.
-- ============================================================================

begin;

alter table public.source_notice_candidates
  add column if not exists content_fingerprint text;

comment on column public.source_notice_candidates.content_fingerprint is
  'Sprint 150A: SHA-256 hex digest of normalizeForCompare(raw_text || excerpt || title), '
  'computed in application code (src/lib/scheduledWriter.ts computeContentFingerprint). '
  'NULL for every row created before this migration and for every admin-manual row '
  '(source_key is null) regardless of when created. Never computed or verified in SQL — '
  'single source of truth is the TypeScript normalizeForCompare function.';

commit;

-- ============================================================================
-- AFTER RUNNING THIS FILE
-- ============================================================================
-- Confirm no error was returned. Then report the result back to Claude Code.
-- Do NOT run docs/sql/APPLY_SPRINT_150_STEP_2_CREATE_UNIQUE_INDEX_V1.sql
-- until this step is confirmed successful.
-- ============================================================================
