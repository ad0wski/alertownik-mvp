-- PROPOSED — Sprint 166C, Stage 2b — Atomic concurrency lock for
-- public.scheduled_writer_runs.
--
-- NOT EXECUTED against any Supabase project (Preview or Production) as
-- part of this session. Written for review only. Targets
-- alertownik-preview exclusively. Production (alertownik-mvp) is never
-- referenced or touched by this file.
--
-- This is a SEPARATE, additive migration on top of the already-executed
-- docs/sql/PROPOSED_SPRINT_166C_RUN_HISTORY_MIGRATION_V1.sql (rev. 2,
-- live on alertownik-preview) — that file is NOT edited or reinterpreted
-- here; every statement below is a new, visible change against the
-- table as it exists today.
--
-- ── Why the previous SELECT → check → INSERT approach was rejected ──────────
--
-- The Etap D wiring (this branch's prior commit) used:
--   1. findActiveLock() — a SELECT for any row with finished_at is null
--   2. isRunLockHeld() — pure JS decides whether that row still blocks
--   3. openRun() — a plain INSERT of a new row
--
-- This has a genuine TOCTOU (time-of-check-to-time-of-use) race: two
-- concurrent invocations can both execute step 1 and see NO active lock
-- (because neither has inserted yet), both conclude "safe to proceed" in
-- step 2, and both INSERT in step 3 — nothing in that sequence is atomic
-- across two separate database round-trips. (In practice this session's
-- live wiring was ALSO a structural no-op for a different, compounding
-- reason — the writer identity's RLS grant had no SELECT at all, so step
-- 1 always returned empty — but even fixing that gap by adding a SELECT
-- policy would still leave the race above; the fix has to be atomic
-- inside a single database operation, not merely "made readable".)
--
-- ── The fix: one atomic operation, enforced by Postgres itself ───────────────
--
-- 1. A partial UNIQUE INDEX guarantees, at the storage layer, that at
--    most one row per (environment_tag, trigger) can ever have
--    finished_at IS NULL at the same time. This is enforced by Postgres
--    during INSERT — a second concurrent INSERT attempting to violate it
--    blocks against the first transaction's row lock and then fails with
--    a 23505 unique_violation once the first commits. There is no window
--    where both can believe they succeeded.
-- 2. Two SECURITY DEFINER functions (open_scheduled_writer_run,
--    close_scheduled_writer_run) are the ONLY way to write to this table
--    from here on — the old direct-INSERT/direct-UPDATE writer policies
--    are dropped below. Each function re-implements the exact
--    automation_identities-membership check the old RLS policies used
--    to provide (SECURITY DEFINER bypasses table RLS entirely, so the
--    function body itself is now the authorization boundary — this is
--    the standard, safe pattern for logic RLS alone cannot atomically
--    express). Neither function is granted to anon or the default
--    `authenticated` template — EXECUTE is granted narrowly to
--    `authenticated`, and every call still re-checks automation_identities
--    membership before touching a row, exactly like before.
-- 3. open_scheduled_writer_run() first closes any STALE open row for the
--    same (environment_tag, trigger) scope — "stale" meaning still open
--    but older than p_stale_after_seconds (the caller always passes
--    RUN_LOCK_STALE_AFTER_MS / 1000 = 300, from
--    src/lib/scheduledWriterRunSafety.ts, so there is exactly one
--    source of truth for that threshold) — marking it outcome='abandoned'
--    or a diagnostic reason, then attempts the INSERT. A unique_violation
--    means "still genuinely locked" and the function returns false — the
--    caller (the route) treats false identically whether it came from a
--    real conflict or an unexpected error: fail closed, no source fetch,
--    no candidate write, ever.
--
-- No SELECT grant is added to the writer identity anywhere in this file
-- — the functions read/write internally under their own elevated
-- (definer) privilege and return only a boolean to the caller, never a
-- full row. This satisfies "don't widen SELECT if a narrower function
-- can return only what's needed."

begin;

-- ── 1. Allow a new outcome value for auto-closed stale locks ────────────────
-- Same constraint, one more allowed value. Named explicitly (confirmed
-- live via pg_constraint before writing this file) so this ALTER targets
-- exactly the existing constraint, not a guessed name.
alter table public.scheduled_writer_runs
  drop constraint scheduled_writer_runs_outcome_check;

alter table public.scheduled_writer_runs
  add constraint scheduled_writer_runs_outcome_check
  check (
    outcome is null or outcome = any (array[
      'success', 'partial_failure', 'total_failure',
      'skipped_kill_switch', 'skipped_lock_held', 'abandoned'
    ]::text[])
  );

-- ── 2. The atomic guarantee itself ───────────────────────────────────────────
-- A partial unique index: at most one row per (environment_tag, trigger)
-- may have finished_at IS NULL at any time. This is the actual mechanism
-- — everything else in this file exists to use it correctly.
create unique index if not exists scheduled_writer_runs_one_open_per_scope
  on public.scheduled_writer_runs (environment_tag, trigger)
  where finished_at is null;

-- ── 3. Atomic open — the only way a new run row is ever created ─────────────
create or replace function public.open_scheduled_writer_run(
  p_id uuid,
  p_trigger text,
  p_environment_tag text,
  p_stale_after_seconds integer default 300
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_is_writer boolean;
begin
  select exists (
    select 1 from public.automation_identities where user_id = auth.uid()
  ) into v_is_writer;

  if not v_is_writer then
    raise exception 'not authorized';
  end if;

  -- Housekeeping: close a stale (abandoned) open run for this exact
  -- scope first. Always safe — only ever touches a row that is already
  -- open AND past the stale threshold; a genuinely still-running row
  -- (younger than the threshold) is left untouched, so it continues to
  -- correctly block the INSERT below via the unique index.
  update public.scheduled_writer_runs
  set finished_at = v_now,
      outcome = 'abandoned',
      error_summary = 'stale_lock_auto_closed'
  where environment_tag = p_environment_tag
    and trigger = p_trigger
    and finished_at is null
    and started_at < v_now - make_interval(secs => p_stale_after_seconds);

  begin
    insert into public.scheduled_writer_runs (id, started_at, trigger, environment_tag)
    values (p_id, v_now, p_trigger, p_environment_tag);
    return true;
  exception when unique_violation then
    -- A genuinely still-open, non-stale row exists for this scope — the
    -- database itself caught this, not application logic. No source
    -- fetch, no candidate write should ever follow a false return.
    return false;
  end;
end;
$$;

revoke all on function public.open_scheduled_writer_run(uuid, text, text, integer) from public;
grant execute on function public.open_scheduled_writer_run(uuid, text, text, integer) to authenticated;

-- ── 4. Atomic close — the only way a run row's outcome is ever recorded ─────
create or replace function public.close_scheduled_writer_run(
  p_id uuid,
  p_outcome text,
  p_sources_checked integer,
  p_sources_failed integer,
  p_candidates_inserted integer,
  p_duplicates_skipped integer,
  p_ambiguous_candidates integer,
  p_capped_skipped integer,
  p_duplicates_prevented_by_database integer,
  p_error_summary text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_writer boolean;
begin
  select exists (
    select 1 from public.automation_identities where user_id = auth.uid()
  ) into v_is_writer;

  if not v_is_writer then
    raise exception 'not authorized';
  end if;

  -- Only ever closes a row that is still open (finished_at is null) —
  -- an already-closed row (by a normal close OR by the stale-abandon
  -- housekeeping above) is never reopened or edited; this mirrors the
  -- exact invariant the original V1 migration's writer_close RLS policy
  -- already enforced.
  update public.scheduled_writer_runs
  set finished_at = now(),
      outcome = p_outcome,
      sources_checked = p_sources_checked,
      sources_failed = p_sources_failed,
      candidates_inserted = p_candidates_inserted,
      duplicates_skipped = p_duplicates_skipped,
      ambiguous_candidates = p_ambiguous_candidates,
      capped_skipped = p_capped_skipped,
      duplicates_prevented_by_database = p_duplicates_prevented_by_database,
      error_summary = p_error_summary
  where id = p_id
    and finished_at is null;

  return found;
end;
$$;

revoke all on function public.close_scheduled_writer_run(uuid, text, integer, integer, integer, integer, integer, integer, integer, text) from public;
grant execute on function public.close_scheduled_writer_run(uuid, text, integer, integer, integer, integer, integer, integer, integer, text) to authenticated;

-- ── 5. Retire the direct-table write policies the functions supersede ───────
-- From here on, the ONLY way to write scheduled_writer_runs is through
-- the two functions above — a future regression (someone calling
-- .from('scheduled_writer_runs').insert(...) directly again) is now
-- structurally blocked, not merely discouraged by convention. The
-- admin-only SELECT policy is untouched — admins can still view run
-- history for observability; that path was never part of the race.
drop policy if exists scheduled_writer_runs_writer_insert on public.scheduled_writer_runs;
drop policy if exists scheduled_writer_runs_writer_close on public.scheduled_writer_runs;

commit;

-- Verification (read-only, run separately after applying):
--   select indexname, indexdef from pg_indexes where tablename = 'scheduled_writer_runs';
--     -- expect scheduled_writer_runs_one_open_per_scope present, plus the existing pkey index
--   select proname, prosecdef from pg_proc where proname in ('open_scheduled_writer_run', 'close_scheduled_writer_run');
--     -- expect prosecdef = true (SECURITY DEFINER) for both
--   select policyname, cmd from pg_policies where tablename = 'scheduled_writer_runs';
--     -- expect exactly 1 row: scheduled_writer_runs_admin_select (SELECT)
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.scheduled_writer_runs'::regclass and conname = 'scheduled_writer_runs_outcome_check';
--     -- expect 'abandoned' present in the allowed list
--   select count(*) from public.scheduled_writer_runs; -- expect unchanged from before this migration (0, as of this writing)
