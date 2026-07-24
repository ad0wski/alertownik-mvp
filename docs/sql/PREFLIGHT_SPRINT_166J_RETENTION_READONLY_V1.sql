-- PREFLIGHT — Sprint 166J-B — Retention read-only reporting, READ-ONLY.
--
-- NOT EXECUTED. Every statement is a SELECT — nothing here deletes.
-- Run this in either alertownik-mvp or alertownik-preview to see how many
-- rows currently qualify for the retention policy described in
-- docs/SPRINT_166J_RETENTION_POLICY_AND_RUNBOOK_V1.md, before any cleanup
-- script is ever considered for activation.
--
-- IMPORTANT — before running this against alertownik-preview: fill in the
-- known Preview synthetic-test record's id below (see
-- docs/SPRINT_166J_RETENTION_POLICY_AND_RUNBOOK_V1.md §2, "The Preview
-- synthetic test record") — left as a placeholder here since this file was
-- prepared without re-reading that specific id from the live table. Do not
-- invent or guess a value; look it up from the live row (its `fingerprint`
-- or `id`) before this file is ever run for real, and update the
-- `v_preview_synthetic_test_id` reference below and in
-- PROPOSED_SPRINT_166J_RETENTION_CLEANUP_V1.sql accordingly.

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

-- 6. Confirm the Preview synthetic test record is still present (only
--    meaningful once the placeholder id above has been filled in with the
--    real value — see the note at the top of this file).
-- select id, fingerprint, status, created_at
-- from public.operational_notification_events
-- where id = '00000000-0000-0000-0000-000000000000'; -- REPLACE with the real id before use
