-- PREFLIGHT — Sprint 166J-B — Retention read-only reporting, READ-ONLY.
--
-- NOT EXECUTED. Every statement is a SELECT — nothing here deletes.
-- Run this in either alertownik-mvp or alertownik-preview to see how many
-- rows currently qualify for the retention policy described in
-- docs/SPRINT_166J_RETENTION_POLICY_AND_RUNBOOK_V1.md, before any cleanup
-- script is ever considered for activation.
--
-- ── Revision 2 (Sprint 166K-C hardening) ──────────────────────────────────
--
-- Revision 1 left both the operational_notification_events check (§6) and
-- any equivalent check for scheduled_writer_runs unfilled — the ledger
-- check was a commented-out block referencing an unfilled placeholder id,
-- and there was no check at all for the scheduled_writer_runs synthetic
-- test row (see docs/SPRINT_166G_PREVIEW_RUNTIME_VALIDATION_CHECKPOINT_V1.md
-- §5.1 and docs/SPRINT_166J_PRODUCTION_ACL_AND_RETENTION_AUDIT_V1.md
-- lines 285-289, which names this row as requiring indefinite retention).
--
-- Revision 2 fills both in for real — safely, because every statement in
-- this file is a plain SELECT with no side effects, unlike the cleanup
-- script:
--   - §6 now queries by the durable, already-documented business key
--     (environment_tag + fingerprint — see
--     docs/SPRINT_166F_PREVIEW_LEDGER_VALIDATION_CHECKPOINT_V1.md §12),
--     never a hand-typed UUID.
--   - §7 (new) reports scheduled_writer_runs rows matching the documented
--     Preview synthetic test run's properties (environment_tag=preview,
--     trigger=manual, outcome=success) — a read-only report is safe to key
--     on these properties even though the cleanup script itself requires
--     an explicit id parameter for the same row (see that file's Revision
--     2 header for why the two files use different strategies).
--   - Both §6 and §7 assert exactly one row is expected — a result of 0 or
--     more than 1 here means investigate before ever considering
--     activating the cleanup script, not a retention decision.

-- 1. scheduled_writer_runs — eligible-for-deletion counts by outcome
--    bucket (see policy doc §2), counting only closed runs
--    (finished_at is not null).
select
  outcome,
  count(*) filter (
    where outcome in ('success', 'skipped_kill_switch', 'skipped_lock_held')
      and finished_at < now() - interval '90 days'
  ) as eligible_90_day_bucket,
  count(*) filter (
    where outcome in ('partial_failure', 'total_failure', 'abandoned')
      and finished_at < now() - interval '180 days'
  ) as eligible_180_day_bucket,
  count(*) as total_rows_this_outcome
from public.scheduled_writer_runs
where finished_at is not null
group by outcome
order by outcome;

-- 2. scheduled_writer_runs — open runs (finished_at is null). These are
--    NEVER retention-eligible by time alone; a non-zero count here that
--    persists across multiple checks, hours apart, indicates a stuck run
--    or a bug in the close-run path, not a retention decision.
select count(*) as open_runs_finished_at_null
from public.scheduled_writer_runs
where finished_at is null;

-- 3. scheduled_writer_runs — outcome-eligible rows that are BLOCKED from
--    deletion by a still-referencing operational_notification_events row
--    (the foreign-key safety guard from the policy doc §4). This makes the
--    block visible instead of silently skipping these rows.
select count(*) as outcome_eligible_but_fk_blocked
from public.scheduled_writer_runs r
where r.finished_at is not null
  and (
    (r.outcome in ('success', 'skipped_kill_switch', 'skipped_lock_held') and r.finished_at < now() - interval '90 days')
    or (r.outcome in ('partial_failure', 'total_failure', 'abandoned') and r.finished_at < now() - interval '180 days')
  )
  and exists (
    select 1 from public.operational_notification_events e
    where e.scheduled_writer_run_id = r.id
  );

-- 4. operational_notification_events — eligible-for-deletion counts by
--    status bucket (see policy doc §2).
select
  status,
  count(*) filter (
    where status = 'sent' and sent_at < now() - interval '90 days'
  ) as eligible_90_day_bucket,
  count(*) filter (
    where status = 'failed' and finished_at < now() - interval '180 days'
  ) as eligible_180_day_bucket,
  count(*) filter (
    where status = 'abandoned' and finished_at < now() - interval '30 days'
  ) as eligible_30_day_bucket,
  count(*) as total_rows_this_status
from public.operational_notification_events
group by status
order by status;

-- 5. operational_notification_events — anomaly flag: 'claimed' rows older
--    than 1 day. Never auto-deleted by the prepared cleanup script — a
--    non-zero count here means the stale-claim auto-abandon logic inside
--    claim_operational_notification_event did not run as designed and
--    needs manual investigation, not a retention decision.
select count(*) as stale_claimed_rows_older_than_1_day
from public.operational_notification_events
where status = 'claimed'
  and claimed_at < now() - interval '1 day';

-- 6. Confirm the operational_notification_events Preview synthetic test
--    record is still present, found by its durable business key — expect
--    exactly one row. Zero or more than one means stop and investigate
--    before ever considering the cleanup script.
select id, fingerprint, status, channel, event_type, created_at
from public.operational_notification_events
where environment_tag = 'preview'
  and fingerprint = 'sprint-166f-2b-controlled-preview-ledger-test-1'
  and channel = 'email'
  and status = 'abandoned';

-- 7. Confirm the scheduled_writer_runs Preview synthetic test record
--    (Sprint 166G-3 controlled test) is still present, found by its
--    documented properties — expect exactly one row. Zero or more than one
--    means stop and investigate before ever considering the cleanup
--    script. The cleanup script itself does NOT rely on this query's
--    result — it requires the operator to separately paste in the exact
--    id from the one row this returns (see that file's Revision 2 header
--    for why).
select id, environment_tag, trigger, outcome, started_at, finished_at
from public.scheduled_writer_runs
where environment_tag = 'preview'
  and trigger = 'manual'
  and outcome = 'success';
