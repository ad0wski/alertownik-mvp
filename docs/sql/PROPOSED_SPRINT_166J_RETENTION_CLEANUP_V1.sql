-- PROPOSED — Sprint 166J-B — Retention cleanup for scheduled_writer_runs
-- and operational_notification_events. DRY-RUN BY DEFAULT.
--
-- NOT EXECUTED against any Supabase project as part of any session. This
-- file, pasted and run exactly as written, performs ZERO deletions. Written
-- for review and future activation only, per
-- docs/SPRINT_166J_RETENTION_POLICY_AND_RUNBOOK_V1.md.
--
-- ── Revision 2 (Sprint 166K-C hardening) ──────────────────────────────────
--
-- Revision 1 (Sprint 166J-B) protected the operational_notification_events
-- synthetic Preview test row with a placeholder UUID
-- (v_preview_synthetic_test_id, defaulted to the all-zero UUID) that the
-- operator was expected to hand-edit to the real id before real activation.
-- Two real gaps in that design, found during Sprint 166K-C review, before
-- this file was ever executed:
--
--   1. A hand-typed real id is exactly the kind of value a typo silently
--      corrupts — a wrong UUID still "matches no real row" (the same
--      symptom as the placeholder itself), so the mistake is invisible
--      until the protected row is actually deleted.
--   2. scheduled_writer_runs had NO protection at all for the real,
--      documented Sprint 166G-3 controlled-test row (see
--      docs/SPRINT_166G_PREVIEW_RUNTIME_VALIDATION_CHECKPOINT_V1.md §5.1 —
--      id f16fb737-c836-411a-a509-d3b0aea4d5cc, environment_tag=preview,
--      trigger=manual, outcome=success) and
--      docs/SPRINT_166J_PRODUCTION_ACL_AND_RETENTION_AUDIT_V1.md line
--      285-289, which names this exact row as requiring indefinite
--      retention. That row is too young to be time-eligible today, but
--      the script had zero future-proofing against it once it ages past
--      90 days.
--
-- Revision 2 fixes both, and adds the hardening below. Nothing here has
-- been executed; v_dry_run still defaults to true.
--
--   - The operational_notification_events protected row is now found
--     DYNAMICALLY at run time, by its durable, already-documented business
--     key (environment_tag + fingerprint — see
--     docs/SPRINT_166F_PREVIEW_LEDGER_VALIDATION_CHECKPOINT_V1.md §12) —
--     never a hand-typed UUID. Exactly one matching row is required; zero,
--     more than one, or a row whose other properties (channel, status)
--     don't match the documented record raises an exception before any
--     count or DELETE runs.
--   - scheduled_writer_runs has no equivalent text business-key column, so
--     per the safer fallback this file now REQUIRES an explicit
--     v_preview_synthetic_run_id parameter, defaulted to NULL (never an
--     invented UUID), with an unconditional RAISE EXCEPTION before any
--     scheduled_writer_runs counting or deletion until the operator sets
--     it — and once set, it is independently verified to match exactly one
--     row with the expected environment_tag/trigger/outcome before being
--     trusted. The real, known id is documented only in
--     docs/SPRINT_166G_PREVIEW_RUNTIME_VALIDATION_CHECKPOINT_V1.md §5.1 —
--     deliberately not copied into this file as a working default.
--   - v_expected_environment_tag makes explicit that this file, as
--     written, is scoped to Preview only — it refuses to run (RAISE
--     EXCEPTION) if changed to anything else. Production activation is
--     explicitly out of scope here (see the policy doc §8) and would need
--     its own, separately-reviewed file once Production's own retention
--     needs are actually designed.
--   - A second, independent confirmation string (v_execute_confirmation)
--     is required, in addition to v_dry_run = false, before the real-run
--     branch is reachable — a single accidental boolean flip is no longer
--     sufficient to perform a real deletion.
--   - v_batch_limit is now validated (must be a positive integer, capped
--     at 500) rather than trusted as-is.
--   - Both target tables' existence is checked with to_regclass() before
--     any query runs against them.
--   - Dry-run and real-run reporting is now broken out by status bucket
--     per table (previously one combined count per table), matching the
--     "exact counts by table and status before DELETE" requirement.
--   - Both protected records are re-confirmed present, by the same
--     business-key lookup, immediately after the delete statements (still
--     inside the same uncommitted transaction) as a self-check.
--
-- ── Before this file is ever activated for real ──────────────────────────
--
--   1. Run PREFLIGHT_SPRINT_166J_RETENTION_READONLY_V1.sql first and read
--      its output — know the numbers before you run this, even in
--      dry-run mode.
--   2. Set v_preview_synthetic_run_id below to the real, documented id
--      from docs/SPRINT_166G_PREVIEW_RUNTIME_VALIDATION_CHECKPOINT_V1.md
--      §5.1. The file as written (NULL) refuses to touch
--      scheduled_writer_runs at all — this is a safe, if unhelpful,
--      default, not a working exclusion.
--   3. Run this file once with v_dry_run left at `true` and read the
--      RAISE NOTICE output. Only after reviewing that output, and only
--      with Adam's own separate, explicit approval, edit v_dry_run to
--      `false` AND set v_execute_confirmation to the exact phrase
--      documented below, then re-paste/re-run for a real deletion.
--
-- ── Why dry-run-first is not optional here ───────────────────────────────
--
-- This file performs DELETE, which has no SQL-level rollback once
-- committed (see the policy doc §7 — the only real recovery path is a
-- Supabase PITR restore). Every prior irreversible action taken in this
-- project (the Sprint 166H migration, the Sprint 166J-A hardening) went
-- through byte-exact-paste + explicit human Run click; a DELETE with a
-- default dry-run flag, now backed by a second confirmation phrase, is
-- this same discipline applied to data instead of schema.
--
-- ── Safety properties ─────────────────────────────────────────────────────
--
--   - v_batch_limit caps every single execution to at most 500 rows
--     deleted per table, regardless of how many rows are actually
--     eligible, and is itself validated before use — bounds the blast
--     radius and the PITR window needed if a real run ever turns out to
--     be wrong.
--   - Foreign-key-safe order: operational_notification_events (children)
--     deleted before scheduled_writer_runs (parents), and a parent is only
--     ever deleted if zero referencing child rows remain (checked via
--     NOT EXISTS at delete time, not assumed from the same transaction's
--     own prior DELETE alone).
--   - Both Preview synthetic test records are excluded unconditionally,
--     one by dynamic business-key lookup, one by a mandatory explicit
--     parameter — both fail-closed if ambiguous, absent, or mismatched.
--   - 'claimed' rows are never deleted by this script, at any age — see
--     the policy doc §2's anomaly-flag rationale.
--   - No CASCADE, TRUNCATE, or DROP anywhere in this file, and none is
--     needed — every DELETE targets exactly one named table by an
--     unqualified-nowhere, fully-schema-qualified name, using a
--     statically-written WHERE clause only (no dynamic/EXECUTE SQL, no
--     string-built identifiers).
--   - No Cron, no route, no function wraps this file — it is a plain SQL
--     script, pasted and run by a human, exactly like every other
--     write-performing file in this project's history. This file cannot
--     invoke the scheduled writer, any RPC, Cron, Resend, or email — it
--     performs exactly two kinds of statement (SELECT and DELETE) against
--     exactly two tables.

begin;

do $$
declare
  -- ── THE control switch. Must be true (dry-run) the first time this
  --    file is ever run for real, and every time thereafter unless a
  --    separate, explicit approval says otherwise. ─────────────────────
  v_dry_run boolean := true;

  -- Second, independent confirmation required (in addition to
  -- v_dry_run = false) before the real-run branch is reachable at all.
  -- Must equal this exact phrase, verbatim — anything else, including
  -- NULL or an empty string, is treated as "not confirmed."
  v_execute_confirmation text := null;
  v_required_confirmation constant text := 'I_HAVE_READ_THE_DRY_RUN_OUTPUT_AND_APPROVE_REAL_DELETION';

  -- Caps the number of rows deleted per table, per execution, once
  -- v_dry_run is false. Never raise this without a separate approval.
  -- Validated below (must be a positive integer, at most 500).
  v_batch_limit integer := 500;

  -- This file, as written, supports Preview only — see the Revision 2
  -- header note. Changing this value is not itself sufficient to make the
  -- file safe for another environment; it exists so an accidental paste
  -- into the wrong project's SQL Editor fails loudly instead of silently
  -- running policy logic that was never designed for that environment.
  v_expected_environment_tag constant text := 'preview';

  -- Durable, already-documented business key for the
  -- operational_notification_events synthetic Preview test row — see
  -- docs/SPRINT_166F_PREVIEW_LEDGER_VALIDATION_CHECKPOINT_V1.md §12.
  -- Never a UUID literal; the actual id is resolved dynamically below.
  v_preview_ledger_test_fingerprint constant text := 'sprint-166f-2b-controlled-preview-ledger-test-1';
  v_preview_synthetic_test_id uuid;
  v_ledger_match_count integer;

  -- scheduled_writer_runs has no equivalent text business-key column.
  -- REQUIRED: the operator must set this to the real, documented id from
  -- docs/SPRINT_166G_PREVIEW_RUNTIME_VALIDATION_CHECKPOINT_V1.md §5.1
  -- before this script can touch scheduled_writer_runs at all. Left NULL
  -- here deliberately — never an invented or copied-in UUID default.
  v_preview_synthetic_run_id uuid := null;
  v_run_match_count integer;

  v_events_sent integer;
  v_events_failed integer;
  v_events_abandoned integer;
  v_events_would_delete integer;
  v_events_deleted integer;

  v_runs_success_bucket integer;
  v_runs_error_bucket integer;
  v_runs_would_delete integer;
  v_runs_deleted integer;
begin
  -- ── Guard 0a: this file only supports the one environment it was
  --    designed and reviewed for. ───────────────────────────────────────
  if v_expected_environment_tag <> 'preview' then
    raise exception 'This file is scoped to Preview only (see Revision 2 header). Production activation requires a new, separately-reviewed file — refusing to proceed with v_expected_environment_tag = %.', v_expected_environment_tag;
  end if;

  -- ── Guard 0b: required tables must exist. ────────────────────────────
  if to_regclass('public.scheduled_writer_runs') is null then
    raise exception 'public.scheduled_writer_runs does not exist in this database — refusing to proceed.';
  end if;
  if to_regclass('public.operational_notification_events') is null then
    raise exception 'public.operational_notification_events does not exist in this database — refusing to proceed.';
  end if;

  -- ── Guard 0c: batch limit must be a sane, positive, bounded integer. ──
  if v_batch_limit is null or v_batch_limit <= 0 or v_batch_limit > 500 then
    raise exception 'v_batch_limit must be a positive integer no greater than 500 (got %).', v_batch_limit;
  end if;

  -- ── Guard 0d: real execution requires BOTH v_dry_run = false AND the
  --    exact second confirmation phrase — a single flipped boolean is no
  --    longer sufficient. ────────────────────────────────────────────────
  if not v_dry_run and coalesce(v_execute_confirmation, '') <> v_required_confirmation then
    raise exception 'v_dry_run is false but v_execute_confirmation does not match the required phrase — refusing to proceed. Set v_execute_confirmation to exactly: %', v_required_confirmation;
  end if;

  -- ── Guard 1: dynamically resolve the operational_notification_events
  --    protected row by its durable business key. Exactly one match,
  --    with the full expected property set, or this script stops here. ──
  select count(*), min(id)
  into v_ledger_match_count, v_preview_synthetic_test_id
  from public.operational_notification_events
  where environment_tag = v_expected_environment_tag
    and fingerprint = v_preview_ledger_test_fingerprint
    and channel = 'email'
    and status = 'abandoned';

  if v_ledger_match_count <> 1 then
    raise exception 'Preview synthetic ledger test record did not resolve to exactly one row (found %) for fingerprint=%, environment_tag=%, channel=email, status=abandoned — refusing to proceed. See docs/SPRINT_166F_PREVIEW_LEDGER_VALIDATION_CHECKPOINT_V1.md §12.', v_ledger_match_count, v_preview_ledger_test_fingerprint, v_expected_environment_tag;
  end if;

  -- ── Guard 2: scheduled_writer_runs protected row — mandatory explicit
  --    parameter, independently verified. ──────────────────────────────
  if v_preview_synthetic_run_id is null then
    raise exception 'v_preview_synthetic_run_id is not set. This script refuses to touch scheduled_writer_runs until the operator explicitly sets it to the known Preview synthetic test run id — see docs/SPRINT_166G_PREVIEW_RUNTIME_VALIDATION_CHECKPOINT_V1.md §5.1. Never guessed, never defaulted.';
  end if;

  select count(*) into v_run_match_count
  from public.scheduled_writer_runs
  where id = v_preview_synthetic_run_id
    and environment_tag = v_expected_environment_tag
    and trigger = 'manual'
    and outcome = 'success';

  if v_run_match_count <> 1 then
    raise exception 'v_preview_synthetic_run_id (%) does not match exactly one scheduled_writer_runs row with environment_tag=%, trigger=manual, outcome=success — refusing to proceed.', v_preview_synthetic_run_id, v_expected_environment_tag;
  end if;

  -- ── Step 1: operational_notification_events (children) ────────────────
  select
    count(*) filter (where status = 'sent' and sent_at < now() - interval '90 days'),
    count(*) filter (where status = 'failed' and finished_at < now() - interval '180 days'),
    count(*) filter (where status = 'abandoned' and finished_at < now() - interval '30 days')
  into v_events_sent, v_events_failed, v_events_abandoned
  from public.operational_notification_events
  where id <> v_preview_synthetic_test_id;

  v_events_would_delete := v_events_sent + v_events_failed + v_events_abandoned;

  if v_dry_run then
    raise notice 'DRY RUN — operational_notification_events candidates: sent(90d)=%, failed(180d)=%, abandoned(30d)=%, total=%',
      v_events_sent, v_events_failed, v_events_abandoned, v_events_would_delete;
  else
    raise notice 'REAL RUN — operational_notification_events candidates before delete: sent(90d)=%, failed(180d)=%, abandoned(30d)=%, total=%',
      v_events_sent, v_events_failed, v_events_abandoned, v_events_would_delete;

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
  select
    count(*) filter (
      where r.outcome in ('success', 'skipped_kill_switch', 'skipped_lock_held')
        and r.finished_at < now() - interval '90 days'
    ),
    count(*) filter (
      where r.outcome in ('partial_failure', 'total_failure', 'abandoned')
        and r.finished_at < now() - interval '180 days'
    )
  into v_runs_success_bucket, v_runs_error_bucket
  from public.scheduled_writer_runs r
  where r.id <> v_preview_synthetic_run_id
    and r.finished_at is not null
    and not exists (
      select 1 from public.operational_notification_events e
      where e.scheduled_writer_run_id = r.id
    );

  v_runs_would_delete := v_runs_success_bucket + v_runs_error_bucket;

  if v_dry_run then
    raise notice 'DRY RUN — scheduled_writer_runs candidates: success/skipped(90d)=%, failure/abandoned(180d)=%, total=%',
      v_runs_success_bucket, v_runs_error_bucket, v_runs_would_delete;
  else
    raise notice 'REAL RUN — scheduled_writer_runs candidates before delete: success/skipped(90d)=%, failure/abandoned(180d)=%, total=%',
      v_runs_success_bucket, v_runs_error_bucket, v_runs_would_delete;

    with candidates as (
      select r.id
      from public.scheduled_writer_runs r
      where r.id <> v_preview_synthetic_run_id
        and r.finished_at is not null
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

  -- ── Self-check: both protected records must still be present, inside
  --    this same uncommitted transaction, regardless of dry-run/real. ───
  if not exists (select 1 from public.operational_notification_events where id = v_preview_synthetic_test_id) then
    raise exception 'INVARIANT VIOLATION — the protected operational_notification_events row (id %) is missing after this script ran. Refusing to let this transaction commit.', v_preview_synthetic_test_id;
  end if;
  if not exists (select 1 from public.scheduled_writer_runs where id = v_preview_synthetic_run_id) then
    raise exception 'INVARIANT VIOLATION — the protected scheduled_writer_runs row (id %) is missing after this script ran. Refusing to let this transaction commit.', v_preview_synthetic_run_id;
  end if;
  raise notice 'Self-check passed — both protected Preview synthetic records (ledger id %, run id %) are still present.', v_preview_synthetic_test_id, v_preview_synthetic_run_id;
end $$;

commit;

-- After a REAL (v_dry_run = false) run, re-run
-- PREFLIGHT_SPRINT_166J_RETENTION_READONLY_V1.sql to confirm the eligible
-- counts dropped by exactly the number reported above, and that both
-- protected Preview synthetic records (§6/§7 of that file) are still
-- present.
