-- ============================================================================
-- ⛔ MANUAL DATABASE CHANGE — DO NOT RUN WITHOUT EXPLICIT APPROVAL ⛔
-- ============================================================================
-- Rollback for docs/sql/PROPOSED_SPRINT_150_RACE_CONDITION_MIGRATION_V1.sql.
-- Only relevant AFTER that migration has actually been applied — not
-- needed today, since the migration itself has not been run.
--
-- SAFE AND FULLY REVERSIBLE: content_fingerprint is a purely additive,
-- derived column — nothing else in the application reads it except the
-- writer's own insert path and the unique index below. Dropping both
-- restores the exact pre-migration state. No data loss: no other column
-- or row is touched, and no candidate's title/excerpt/raw_text/status/
-- etc. is affected.
--
-- If you need to roll back WITHOUT immediately dropping the column
-- (e.g. to stop enforcing uniqueness while keeping the historical
-- fingerprint values for later re-analysis), run ONLY Step 1 below and
-- skip Step 2. Most of the time, running both is the cleaner choice.
-- ============================================================================


-- ============================================================================
-- STEP 1 — drop the unique index (also disables enforcement immediately;
-- do this FIRST if you need an emergency, immediate stop to the
-- constraint rejecting inserts, before even deciding on the column).
-- ============================================================================

drop index concurrently if exists public.source_notice_candidates_writer_fingerprint_uniq;

-- Note: DROP INDEX CONCURRENTLY also cannot run inside a transaction
-- block — same restriction as CREATE INDEX CONCURRENTLY. Run this as
-- its own execution, separate from Step 2 below.


-- ============================================================================
-- STEP 2 — drop the column itself (optional; only if you want the
-- fingerprint data gone entirely, not just unenforced).
-- ============================================================================

begin;

alter table public.source_notice_candidates
  drop column if exists content_fingerprint;

commit;


-- ============================================================================
-- ALSO REQUIRED: turn off the application-side flag
-- ============================================================================
-- Regardless of whether you run Step 1, Step 2, both, or neither of the
-- SQL above, also set (or remove) in Vercel:
--
--   SCHEDULED_WRITER_FINGERPRINT_ENABLED = false (or delete the variable)
--
-- If the column/index are dropped but the flag is left "true", every
-- future insert attempt would fail (the app would try to send a
-- content_fingerprint value to a column that no longer exists) — the
-- flag must come back off as part of any rollback, not as an afterthought.
-- ============================================================================


-- ============================================================================
-- AFTER ROLLBACK — verification
-- ============================================================================
-- Re-run docs/sql/VERIFY_SPRINT_150_RACE_CONDITION_MIGRATION_READ_ONLY_V1.sql
-- and confirm it now reports the column/index as ABSENT, matching the
-- pre-migration state exactly.
-- ============================================================================
