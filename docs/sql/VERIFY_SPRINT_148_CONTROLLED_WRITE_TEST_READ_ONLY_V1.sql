-- ============================================================================
-- READ ONLY — NO DATABASE MODIFICATION
-- ============================================================================
-- Sprint 148 — verification for the single, manual, controlled write test
-- against Gmina Michałowice — komunikaty only
-- (docs/SPRINT_148_CONTROLLED_WRITE_TEST_RUNBOOK_V1.md, Step 8).
--
-- THIS FILE CONTAINS SELECT STATEMENTS ONLY. No INSERT, UPDATE, DELETE,
-- ALTER, CREATE, DROP, GRANT, or REVOKE. Safe to run at any time, any
-- number of times — it changes nothing.
--
-- Run this AFTER the single manual call to
-- GET /api/cron/write-candidates?sourceKey=michalowice-komunikaty
-- described in the runbook. Compare every result below against its
-- "Expected" comment before considering the test verified.
-- ============================================================================


-- ── 1. Candidates created by this test ──────────────────────────────────────
-- Expected: zero or a small number of rows (matching the endpoint's
-- response `candidatesInserted` count), ALL with:
--   source_key = 'michalowice-komunikaty' (never 'wkd-aktualnosci')
--   status = 'pending'
--   verification_status = 'unverified'
--   confidence_score, risk_level, verification_notes, checked_at,
--     duplicate_of_alert_id, converted_alert_id, ai_draft_json — all NULL
-- Ordered newest-first so the just-created rows (if any) are at the top.

select
  id,
  source_key,
  source_id,
  status,
  verification_status,
  confidence_score,
  risk_level,
  verification_notes,
  checked_at,
  duplicate_of_alert_id,
  converted_alert_id,
  ai_draft_json,
  detected_at,
  created_at
from public.source_notice_candidates
order by created_at desc
limit 20;


-- ── 2. Confirm ZERO candidates were ever created for WKD by this test ──────
-- Expected: 0 rows with a created_at at/after the moment you ran the write
-- test — WKD must be completely untouched by this controlled test. (Older
-- rows from Sprint 133-era manual candidate saves, if any exist, are fine —
-- this checks for anything NEW, not the table's total historical count.)

select id, source_key, source_id, status, created_at
from public.source_notice_candidates
where source_key = 'wkd-aktualnosci'
order by created_at desc
limit 20;


-- ── 3. Source-check history created by this test ────────────────────────────
-- Expected: at most one new row, `result` in ('no_changes', 'found_notice')
-- only, `related_alert_id IS NULL`, `created_by` = the technical writer
-- account's uuid (not the human admin's).

select
  id,
  source_id,
  result,
  related_alert_id,
  created_by,
  checked_at,
  created_at
from public.source_checks
order by created_at desc
limit 20;


-- ── 4. Confirm the technical writer account performed the insert(s), not
-- the admin ──────────────────────────────────────────────────────────────
-- Cross-check §1/§3's rows against automation_identities membership —
-- expected: any new row's implicit writer identity (source_checks.created_by)
-- matches a row here, confirming the write came from the scheduled-writer
-- identity, not a human admin session.

select user_id, created_at
from public.automation_identities
order by created_at desc;


-- ── 5. Confirm alerts is completely unaffected ──────────────────────────────
-- Expected: this count is IDENTICAL to whatever it was immediately before
-- the write test — run this once before Step 7 and once after, and diff
-- the two results by hand. No row's updated_at should have changed either.

select count(*) as total_alerts, max(updated_at) as most_recently_updated
from public.alerts;


-- ── 6. Confirm no alert has status other than what existed before ──────────
-- Expected: identical distribution before/after — this test must never
-- change any alert's status, let alone create or publish one.

select status, count(*) as count
from public.alerts
group by status
order by status;


-- ============================================================================
-- END OF VERIFICATION ARTIFACT
-- ============================================================================
-- If §1/§3 show more rows than the endpoint's own response counts claimed,
-- or §2 shows any WKD row, or §5/§6 show any change to `alerts` — STOP.
-- Do not proceed to Step 9 (disabling write mode) until the discrepancy is
-- understood; do not repeat the write test to "see what happens."
-- ============================================================================
