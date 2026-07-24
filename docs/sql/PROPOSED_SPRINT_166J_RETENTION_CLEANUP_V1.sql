-- PROPOSED — Sprint 166J-B — Retention cleanup for scheduled_writer_runs
-- and operational_notification_events. DRY-RUN BY DEFAULT.
--
-- NOT EXECUTED against any Supabase project as part of any session. This
-- file, pasted and run exactly as written, performs ZERO deletions — see
-- v_dry_run below. Written for review and future activation only, per
-- docs/SPRINT_166J_RETENTION_POLICY_AND_RUNBOOK_V1.md.
--
-- ── Before this file is ever activated for real ──────────────────────────
--
--   1. Fill in the real Preview synthetic-test record id in
--      v_preview_synthetic_test_id below (see the policy doc §2) — do not
--      run this file for real against alertownik-preview while that
--      placeholder is still the zero-UUID; it will not match any real row,
--      which is a safe (if unhelpful) default but should be corrected
--      before real activation.
--   2. Run PREFLIGHT_SPRINT_166J_RETENTION_READONLY_V1.sql first and read
--      its output — know the numbers before you run this, even in
--      dry-run mode.
--   3. Run this file once with v_dry_run left at `true` and read the
--      RAISE NOTICE output. Only after reviewing that output, and only
--      with Adam's own separate, explicit approval, edit v_dry_run to
--      `false` and re-paste/re-run for a real deletion.
--
-- ── Why dry-run-first is not optional here ───────────────────────────────
--
-- This file performs DELETE, which has no SQL-level rollback once
-- committed (see the policy doc §7 — the only real recovery path is a
-- Supabase PITR restore). Every prior irreversible action taken in this
-- project (the Sprint 166H migration, the Sprint 166J-A hardening) went
-- through byte-exact-paste + explicit human Run click; a DELETE with a
-- default dry-run flag is this same discipline applied to data instead of
-- schema.
--
-- ── Safety properties ─────────────────────────────────────────────────────
--
--   - v_batch_limit caps every single execution to at most 500 rows
--     deleted per table, regardless of how many rows are actually
--     eligible — bounds the blast radius and the PITR window needed if a
--     real run ever turns out to be wrong.
--   - Foreign-key-safe order: operational_notification_events (children)
--     deleted before scheduled_writer_runs (parents), and a parent is only
--     ever deleted if zero referencing child rows remain (checked via
--     NOT EXISTS at delete time, not assumed from the same transaction's
--     own prior DELETE alone).
--   - The Preview synthetic test record is excluded unconditionally.
--   - 'claimed' rows are never deleted by this script, at any age — see
--     the policy doc §2's anomaly-flag rationale.
--   - No Cron, no route, no function wraps this file — it is a plain SQL
--     script, pasted and run by a human, exactly like every other
--     write-performing file in this project's history.

do $$
declare
  -- ── THE control switch. Must be true (dry-run) the first time this
  --    file is ever run for real, and every time thereafter unless a
  --    separate, explicit approval says otherwise. ─────────────────────
  v_dry_run boolean := true;

  -- Caps the number of rows deleted per table, per execution, once
  -- v_dry_run is false. Never raise this without a separate approval.
  v_batch_limit integer := 500;

  -- REPLACE with the real, known Preview synthetic-test record id before
  -- any real activation (see the note at the top of this file). Left as
  -- the zero-UUID here deliberately — it matches no real row, which is
  -- the safe default, not a working exclusion.
  v_preview_synthetic_test_id uuid := '00000000-0000-0000-0000-000000000000';

  v_events_would_delete integer;
  v_events_deleted integer;
  v_runs_would_delete integer;
  v_runs_deleted integer;
begin
  -- ── Step 1: operational_notification_events (children) ────────────────
  select count(*) into v_events_would_delete
  from public.operational_notification_events
  where id <> v_preview_synthetic_test_id
    and (
      (status = 'sent' and sent_at < now() - interval '90 days')
      or (status = 'failed' and finished_at < now() - interval '180 days')
      or (status = 'abandoned' and finished_at < now() - interval '30 days')
    );

  if v_dry_run then
    raise notice 'DRY RUN — operational_notification_events rows that WOULD be deleted: %', v_events_would_delete;
  else
    with candidates as (
      select id
      from public.operational_notification_events
      where id <> v_preview_synthetic_test_id
        and (
          (status = 'sent' and sent_at < now() - interval '90 days')
          or (status = 'failed' and finished_at < now() - interval '180 days')
          or (status = 'abandoned' and finished_at < now() - interval '30 days')
        )
      order by id
      limit v_batch_limit
    )
    delete from public.operational_notification_events e
    using candidates c
    where e.id = c.id;
    get diagnostics v_events_deleted = row_count;
    raise notice 'REAL RUN — operational_notification_events rows deleted (capped at %): %', v_batch_limit, v_events_deleted;
  end if;

  -- ── Step 2: scheduled_writer_runs (parents) — only rows with zero
  --    remaining referencing operational_notification_events rows. ──────
  select count(*) into v_runs_would_delete
  from public.scheduled_writer_runs r
  where r.finished_at is not null
    and (
      (r.outcome in ('success', 'skipped_kill_switch', 'skipped_lock_held') and r.finished_at < now() - interval '90 days')
      or (r.outcome in ('partial_failure', 'total_failure', 'abandoned') and r.finished_at < now() - interval '180 days')
    )
    and not exists (
      select 1 from public.operational_notification_events e
      where e.scheduled_writer_run_id = r.id
    );

  if v_dry_run then
    raise notice 'DRY RUN — scheduled_writer_runs rows that WOULD be deleted: %', v_runs_would_delete;
  else
    with candidates as (
      select r.id
      from public.scheduled_writer_runs r
      where r.finished_at is not null
        and (
          (r.outcome in ('success', 'skipped_kill_switch', 'skipped_lock_held') and r.finished_at < now() - interval '90 days')
          or (r.outcome in ('partial_failure', 'total_failure', 'abandoned') and r.finished_at < now() - interval '180 days')
        )
        and not exists (
          select 1 from public.operational_notification_events e
          where e.scheduled_writer_run_id = r.id
        )
      order by r.id
      limit v_batch_limit
    )
    delete from public.scheduled_writer_runs r
    using candidates c
    where r.id = c.id;
    get diagnostics v_runs_deleted = row_count;
    raise notice 'REAL RUN — scheduled_writer_runs rows deleted (capped at %): %', v_batch_limit, v_runs_deleted;
  end if;
end $$;

-- After a REAL (v_dry_run = false) run, re-run
-- PREFLIGHT_SPRINT_166J_RETENTION_READONLY_V1.sql to confirm the eligible
-- counts dropped by exactly the number reported above, and that the
-- Preview synthetic test record (§6 of that file) is still present.
