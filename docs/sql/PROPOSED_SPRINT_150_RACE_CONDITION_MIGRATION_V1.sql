-- ============================================================================
-- ⛔⛔⛔ MANUAL DATABASE CHANGE — DO NOT RUN WITHOUT EXPLICIT APPROVAL ⛔⛔⛔
-- ============================================================================
-- Sprint 150A — Race Condition Closure Migration (PROPOSAL, NOT APPLIED).
-- Closes the gap documented in
-- docs/SPRINT_149_RACE_CONDITION_MIGRATION_PROPOSAL_V1.md: two
-- concurrent invocations of the scheduled writer could each insert a
-- duplicate row for the same notice, because no database-level
-- uniqueness constraint exists on public.source_notice_candidates.
--
-- STATUS: PROPOSAL ONLY. Claude Code has not run this file, will not run
-- it automatically, and it must only be run manually by Adam in the
-- Supabase SQL Editor, after:
--   1. Reading docs/SPRINT_150_RACE_CONDITION_DEPLOYMENT_RUNBOOK_V1.md
--      in full.
--   2. Running docs/sql/VERIFY_SOURCE_NOTICE_CANDIDATE_DUPLICATES_
--      READ_ONLY_V1.sql and confirming SAFE TO MIGRATE (or reviewing any
--      DUPLICATES REQUIRE REVIEW result by hand first).
--   3. Explicit, separate approval of this exact file's contents.
--
-- WHAT THIS DOES:
--   - Adds ONE new nullable column: source_notice_candidates.content_fingerprint
--   - Adds ONE partial unique index scoped to rows that have BOTH a
--     source_key (writer-created only — admin-manual rows never set
--     this) AND a content_fingerprint (only populated once the
--     application code's SCHEDULED_WRITER_FINGERPRINT_ENABLED flag is
--     turned on, separately, after this migration is verified live).
--
-- WHAT THIS DOES NOT DO (confirmed, not assumed):
--   - Does NOT touch public.alerts.
--   - Does NOT touch public.admin_profiles.
--   - Does NOT touch public.automation_identities (no new members, no
--     schema change to that table).
--   - Does NOT use service_role — this file is intended to be run as
--     the Postgres role the Supabase SQL Editor already uses (the table
--     owner), the same way every other migration in this repo's docs/
--     folder has been run.
--   - Does NOT change any RLS POLICY text on source_notice_candidates.
--     Confirmed by inspection, not assumed: the scheduled-writer INSERT
--     policy's WITH CHECK clause (docs/sql/PROPOSED_SCHEDULED_WRITER_
--     RLS_MIGRATION_V1.sql §3) only constrains 8 SPECIFIC sensitive
--     columns (status, verification_status, confidence_score,
--     risk_level, verification_notes, checked_at, duplicate_of_alert_id,
--     converted_alert_id) — it does not enumerate every column, so a
--     new, non-sensitive column the writer itself populates (a content
--     hash of its own insert) is automatically permitted without any
--     policy text change. The SELECT policy is row-scoped, not
--     column-scoped, so it likewise needs no change. If this reasoning
--     ever turns out to be wrong once tested live, that is itself an
--     explicit STOP condition — see the verification file.
--   - Does NOT delete, merge, or modify any existing row's data.
--   - Does NOT enable write mode, does NOT touch Vercel env, does NOT
--     activate any cron.
--   - Does NOT extend the writer's allowlist beyond Michałowice, does
--     NOT add WKD, does NOT enable autopublish.
--
-- FAIL-CLOSED BEHAVIOR (built into Postgres itself, not extra logic
-- here): every row that exists before this migration runs has
-- content_fingerprint = NULL (the column doesn't exist yet), and the
-- unique index only covers rows where content_fingerprint IS NOT NULL —
-- so this migration cannot fail due to any pre-existing data, regardless
-- of what the duplicate preflight finds. The constraint only ever
-- applies going forward, to new rows the (updated, flag-enabled) writer
-- itself inserts.
--
-- TRANSACTION NOTE — IMPORTANT, READ BEFORE RUNNING:
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block. This
-- file is split into TWO STEPS that must be run as TWO SEPARATE
-- executions in the Supabase SQL Editor (paste and run Step 1, wait for
-- it to finish, then paste and run Step 2 — do not paste both at once,
-- and do not wrap Step 2 in a manual BEGIN/COMMIT).
-- ============================================================================


-- ============================================================================
-- STEP 1 of 2 — run this block first, as its own execution.
-- Wrapped in an explicit transaction: a plain ALTER TABLE ADD COLUMN on
-- a nullable column is a fast, non-blocking metadata-only change in
-- modern Postgres (no table rewrite, no long lock) — safe to wrap in a
-- transaction, unlike Step 2.
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
-- STEP 2 of 2 — run this block SEPARATELY, after Step 1 has completed.
-- NOT wrapped in begin/commit — CREATE INDEX CONCURRENTLY refuses to run
-- inside a transaction block and will error if you try. Running it
-- concurrently (rather than a plain CREATE UNIQUE INDEX) avoids taking a
-- write-blocking lock on source_notice_candidates while the index
-- builds — appropriate defensive practice even though this table is
-- small and low-traffic today.
-- ============================================================================

create unique index concurrently if not exists
  source_notice_candidates_writer_fingerprint_uniq
  on public.source_notice_candidates (source_key, content_fingerprint)
  where source_key is not null and content_fingerprint is not null;

comment on index public.source_notice_candidates_writer_fingerprint_uniq is
  'Sprint 150A: closes the documented concurrent-invocation race for the scheduled writer. '
  'Partial — only ever applies to writer-created rows (source_key not null) that also '
  'carry a content_fingerprint (only true once SCHEDULED_WRITER_FINGERPRINT_ENABLED=true). '
  'Admin-manual candidates (source_key always null) are structurally excluded and '
  'completely unaffected by this constraint.';


-- ============================================================================
-- AFTER RUNNING BOTH STEPS
-- ============================================================================
-- Run docs/sql/VERIFY_SPRINT_150_RACE_CONDITION_MIGRATION_READ_ONLY_V1.sql
-- to confirm the column and index exist exactly as described above, and
-- that no unrelated table/policy was touched. Do NOT set
-- SCHEDULED_WRITER_FINGERPRINT_ENABLED=true until that verification
-- passes — see the deployment runbook for the full, ordered checklist.
-- ============================================================================
