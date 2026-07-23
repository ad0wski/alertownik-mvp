-- PROPOSED — Sprint 166F-1 — Persistent Operational Alert Ledger and
-- Storm-Protection.
--
-- NOT EXECUTED against any Supabase project (Preview or Production) as
-- part of this session. Written for review only. Targets
-- alertownik-preview exclusively, once approved. Production
-- (alertownik-mvp) is never referenced or touched by this file.
--
-- Purpose: give the operational-email-alerting foundation (Sprint
-- 166D-166E) a persisted "has this exact problem already alerted
-- recently" store, so cooldown and duplicate-suppression are real across
-- separate invocations, not only unit-tested in isolation (Sprint 166D-1
-- §I.2 explicitly deferred this). See
-- docs/SPRINT_166F_OPERATIONAL_ALERT_LEDGER_AUDIT_AND_DESIGN_V1.md for
-- the full design rationale this file implements.
--
-- Mirrors docs/sql/PROPOSED_SPRINT_166C_ATOMIC_LOCK_MIGRATION_V2.sql's
-- exact pattern: a partial unique index is the actual atomic guarantee;
-- two SECURITY DEFINER functions are the ONLY way to write to this table;
-- every closed-vocabulary argument is validated BEFORE any row is
-- touched; `set search_path = ''` with fully qualified references
-- throughout; no SELECT/INSERT/UPDATE grant on the table itself for the
-- writer identity — the functions return only a small result, never a
-- full row.
--
-- ── Why a partial unique index, not an app-level SELECT-then-INSERT ─────────
--
-- Identical reasoning to the 166C atomic-lock migration: two concurrent
-- claim attempts for the same (environment_tag, fingerprint) scope must
-- never both believe they may send. A SELECT-then-INSERT check from
-- application code has a genuine TOCTOU race across two separate
-- database round-trips; a partial unique index enforced by Postgres
-- itself during a single INSERT has no such window.
--
-- ── Cooldown vs. duplicate-claim: two different suppressions ────────────────
--
-- suppress_duplicate: a second claim attempt for the SAME
-- (environment_tag, fingerprint) arrives WHILE an earlier claim is still
-- open (status = 'claimed') — caught by the partial unique index itself.
-- suppress_cooldown: no open claim exists, but the MOST RECENT row for
-- this (environment_tag, fingerprint) recorded a cooldown_until still in
-- the future — checked by a plain SELECT inside the same atomic function
-- call (never a separate round-trip from application code), so there is
-- no window between checking cooldown and claiming.
--
-- ── Open design decision, flagged rather than silently assumed ──────────────
--
-- p_cooldown_seconds is a caller-supplied PARAMETER (bounds-checked
-- [60, 2592000] seconds), not a hard-coded server-side constant — a
-- future kill_switch_disabled-class event might reasonably want a
-- different cooldown than a permanent_fetch alert. This mirrors how
-- open_scheduled_writer_run's p_stale_after_seconds is already a
-- parameter even though today's one caller always passes the same
-- constant. See design doc §D for the full callout.

begin;

-- ── 1. The ledger table ──────────────────────────────────────────────────────
create table if not exists public.operational_notification_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  environment_tag text not null,
  channel text not null check (channel = 'email'),
  event_type text not null check (
    event_type = any (array[
      'run_success', 'abandoned_run', 'lock_held', 'transient_fetch',
      'permanent_fetch', 'write_error', 'credentials_not_configured',
      'environment_guard_blocked', 'kill_switch_disabled', 'unexpected_error'
    ]::text[])
  ),
  severity text not null check (severity in ('info', 'warning', 'critical')),
  -- Compared for equality only, never a security token — see
  -- buildOperationalNotificationFingerprint (src/lib/operationalNotificationPolicy.ts).
  fingerprint text not null,
  scheduled_writer_run_id uuid references public.scheduled_writer_runs(id),
  -- Nullable: run-level events (abandoned_run, lock_held,
  -- credentials_not_configured, environment_guard_blocked,
  -- kill_switch_disabled) have no single source to key on.
  source_id text,
  status text not null check (status in ('claimed', 'sent', 'failed', 'suppressed', 'abandoned')),
  attempt_count integer not null default 1 check (attempt_count >= 0),
  claimed_at timestamptz,
  finished_at timestamptz,
  sent_at timestamptz,
  suppressed_reason text check (
    suppressed_reason is null or suppressed_reason = any (array[
      'suppress_retry_pending', 'suppress_lock_held', 'suppress_duplicate',
      'suppress_cooldown', 'suppress_success', 'suppress_not_actionable'
    ]::text[])
  ),
  -- Reuses ResendErrorCategory's exact vocabulary plus 'sent' — never a
  -- raw provider error message or response body.
  provider_status text check (
    provider_status is null or provider_status = any (array[
      'sent', 'validation_error', 'auth_error', 'rate_limited',
      'transient_error', 'unknown_error'
    ]::text[])
  ),
  -- Never a raw error_summary. Built only from closed-vocabulary labels
  -- and counts (see design doc §G) — length-capped to match
  -- scheduled_writer_runs.error_summary's existing 200-char convention.
  safe_summary text check (safe_summary is null or char_length(safe_summary) <= 200),
  cooldown_until timestamptz
);

alter table public.operational_notification_events enable row level security;

-- Only one open (status = 'claimed') claim per (environment_tag,
-- fingerprint) scope at any time — the actual atomic guarantee.
create unique index if not exists operational_notification_events_one_claim_per_scope
  on public.operational_notification_events (environment_tag, fingerprint)
  where status = 'claimed';

-- Index supporting the claim function's own "most recent row for this
-- scope" lookup (cooldown check) — read-only, no uniqueness implied.
create index if not exists operational_notification_events_scope_recency
  on public.operational_notification_events (environment_tag, fingerprint, created_at desc);

-- ── 2. RLS — admin read-only, no direct writer grant at all ─────────────────
-- Unlike scheduled_writer_runs's original v1 (which needed a later
-- hardening migration to remove direct writer INSERT/UPDATE), this table
-- starts function-only from day one — no policy below grants the writer
-- identity any direct access; the two SECURITY DEFINER functions in
-- section 3 are the only write path, and they bypass RLS entirely by
-- design (that is what SECURITY DEFINER means), re-checking
-- automation_identities membership themselves instead.
create policy operational_notification_events_admin_select
  on public.operational_notification_events
  for select
  to authenticated
  using (
    exists (
      select 1 from public.admin_profiles
      where admin_profiles.user_id = auth.uid()
    )
  );

-- ── 3. Atomic claim — the only way a new row is ever created ────────────────
create or replace function public.claim_operational_notification_event(
  p_environment_tag text,
  p_channel text,
  p_event_type text,
  p_severity text,
  p_fingerprint text,
  p_scheduled_writer_run_id uuid,
  p_source_id text,
  p_safe_summary text,
  p_cooldown_seconds integer,
  p_stale_claim_after_seconds integer default 300
) returns table (claimed boolean, event_id uuid, suppressed_reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_is_writer boolean;
  v_new_id uuid;
  v_cooldown_until timestamptz;
begin
  select exists (
    select 1 from public.automation_identities where user_id = auth.uid()
  ) into v_is_writer;

  if not v_is_writer then
    raise exception 'not authorized';
  end if;

  if p_channel <> 'email' then
    raise exception 'p_channel is not one of the allowed channels';
  end if;

  if p_event_type is null or p_event_type <> all (array[
    'run_success', 'abandoned_run', 'lock_held', 'transient_fetch',
    'permanent_fetch', 'write_error', 'credentials_not_configured',
    'environment_guard_blocked', 'kill_switch_disabled', 'unexpected_error'
  ]::text[])
  then
    raise exception 'p_event_type is not one of the allowed event types';
  end if;

  if p_severity is null or p_severity <> all (array['info', 'warning', 'critical']::text[]) then
    raise exception 'p_severity is not one of the allowed severities';
  end if;

  if p_environment_tag is null or pg_catalog.length(p_environment_tag) = 0 then
    raise exception 'p_environment_tag is required';
  end if;

  if p_fingerprint is null or pg_catalog.length(p_fingerprint) = 0 then
    raise exception 'p_fingerprint is required';
  end if;

  if p_safe_summary is not null and pg_catalog.char_length(p_safe_summary) > 200 then
    raise exception 'p_safe_summary exceeds the maximum allowed length';
  end if;

  if p_cooldown_seconds is null or p_cooldown_seconds < 60 or p_cooldown_seconds > 2592000 then
    raise exception 'p_cooldown_seconds out of allowed range';
  end if;

  if p_stale_claim_after_seconds is null
    or p_stale_claim_after_seconds < 300
    or p_stale_claim_after_seconds > 86400
  then
    raise exception 'p_stale_claim_after_seconds out of allowed range';
  end if;

  -- Housekeeping: auto-abandon a stale open claim for this exact scope
  -- first — mirrors open_scheduled_writer_run's own stale-lock closing.
  -- Only ever touches a row that is already claimed AND past the stale
  -- threshold; a genuinely still-in-flight claim (younger than the
  -- threshold) is left untouched, so it continues to correctly block the
  -- INSERT below via the unique index.
  update public.operational_notification_events
  set status = 'abandoned',
      finished_at = v_now,
      updated_at = v_now
  where environment_tag = p_environment_tag
    and fingerprint = p_fingerprint
    and status = 'claimed'
    and claimed_at < v_now - pg_catalog.make_interval(secs => p_stale_claim_after_seconds);

  -- Cooldown check: the most recent row for this exact scope, regardless
  -- of its status, carries the authoritative cooldown_until. No separate
  -- round-trip from application code — this SELECT and the INSERT below
  -- happen inside the same atomic function call.
  select o.cooldown_until into v_cooldown_until
  from public.operational_notification_events o
  where o.environment_tag = p_environment_tag
    and o.fingerprint = p_fingerprint
  order by o.created_at desc
  limit 1;

  if v_cooldown_until is not null and v_cooldown_until > v_now then
    return query select false, null::uuid, 'suppress_cooldown'::text;
    return;
  end if;

  begin
    v_new_id := gen_random_uuid();
    insert into public.operational_notification_events (
      id, environment_tag, channel, event_type, severity, fingerprint,
      scheduled_writer_run_id, source_id, status, attempt_count,
      claimed_at, safe_summary, cooldown_until
    ) values (
      v_new_id, p_environment_tag, p_channel, p_event_type, p_severity, p_fingerprint,
      p_scheduled_writer_run_id, p_source_id, 'claimed', 1,
      v_now, p_safe_summary, v_now + pg_catalog.make_interval(secs => p_cooldown_seconds)
    );
    return query select true, v_new_id, null::text;
    return;
  exception when unique_violation then
    -- A genuinely still-open, non-stale claim exists for this scope —
    -- the database itself caught this, not application logic. Any OTHER
    -- exception (not unique_violation) is deliberately left uncaught
    -- here and propagates to the caller as a real error — it is never
    -- reinterpreted as suppress_duplicate.
    return query select false, null::uuid, 'suppress_duplicate'::text;
    return;
  end;
end;
$$;

revoke all on function public.claim_operational_notification_event(
  text, text, text, text, text, uuid, text, text, integer, integer
) from public;
grant execute on function public.claim_operational_notification_event(
  text, text, text, text, text, uuid, text, text, integer, integer
) to authenticated;

-- ── 4. Atomic finish — the only way a claim is ever finalized ───────────────
create or replace function public.finish_operational_notification_event(
  p_id uuid,
  p_status text,
  p_provider_status text,
  p_sent_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path = ''
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

  if p_status is null or p_status <> all (array['sent', 'failed', 'abandoned']::text[]) then
    raise exception 'p_status is not one of the allowed finish statuses';
  end if;

  if p_provider_status is not null and p_provider_status <> all (array[
    'sent', 'validation_error', 'auth_error', 'rate_limited',
    'transient_error', 'unknown_error'
  ]::text[])
  then
    raise exception 'p_provider_status is not one of the allowed provider statuses';
  end if;

  if p_status = 'sent' and p_sent_at is null then
    raise exception 'p_sent_at is required when p_status is sent';
  end if;

  -- Only ever finalizes a row that is still claimed — an already-finished
  -- row (by a normal finish OR by the stale-abandon housekeeping above)
  -- is never reopened or edited, mirroring close_scheduled_writer_run's
  -- own "finished_at is null" guard.
  update public.operational_notification_events
  set status = p_status,
      provider_status = p_provider_status,
      sent_at = p_sent_at,
      finished_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where id = p_id
    and status = 'claimed';

  return found;
end;
$$;

revoke all on function public.finish_operational_notification_event(
  uuid, text, text, timestamptz
) from public;
grant execute on function public.finish_operational_notification_event(
  uuid, text, text, timestamptz
) to authenticated;

commit;

-- Verification (read-only, run separately after applying):
--   select indexname, indexdef from pg_indexes where tablename = 'operational_notification_events';
--     -- expect operational_notification_events_one_claim_per_scope and
--     -- operational_notification_events_scope_recency present, plus the pkey index
--   select proname, prosecdef, proconfig from pg_proc where proname in ('claim_operational_notification_event', 'finish_operational_notification_event');
--     -- expect prosecdef = true for both, and proconfig containing 'search_path=' (empty)
--   select policyname, cmd from pg_policies where tablename = 'operational_notification_events';
--     -- expect exactly 1 row: operational_notification_events_admin_select (SELECT)
--   select relrowsecurity from pg_class where relname = 'operational_notification_events'; -- expect true
--   select count(*) from public.operational_notification_events; -- expect 0 immediately after migration
