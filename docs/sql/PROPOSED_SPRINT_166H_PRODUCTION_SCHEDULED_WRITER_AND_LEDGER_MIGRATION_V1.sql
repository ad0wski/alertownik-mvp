-- PROPOSED — Sprint 166H — Production schema migration for the scheduled
-- writer run-history/lock table and the operational notification ledger.
--
-- NOT EXECUTED against any Supabase project as part of this session.
-- Written for review only. Targets alertownik-mvp (Production, project ref
-- puhcjyffosgohbmxrczb) exclusively — never run this against
-- alertownik-preview (nowvcdbtgaigutyxpmdp), which already has this schema
-- live since Sprint 166C/166F/166G.
--
-- ── What this file is, and is not ────────────────────────────────────────
--
-- This is NOT a replay of the three historical Preview migration files in
-- their original incremental order. Preview's actual history was:
--   1. PROPOSED_SPRINT_166C_RUN_HISTORY_MIGRATION_V1.sql — created
--      scheduled_writer_runs with direct writer INSERT/UPDATE RLS policies.
--   2. PROPOSED_SPRINT_166C_ATOMIC_LOCK_MIGRATION_V2.sql — added the atomic
--      RPC functions and the partial unique index, then DROPPED the two
--      direct-write policies from step 1 (superseded by the functions).
--   3. PROPOSED_SPRINT_166F_OPERATIONAL_NOTIFICATION_LEDGER_V1.sql — created
--      operational_notification_events, function-only from day one.
--
-- Replaying steps 1 and 2 verbatim against Production would mean Production
-- briefly has a direct-write RLS policy that is immediately dropped a few
-- statements later in the same transaction — harmless in practice (nothing
-- can observe the intermediate state inside one transaction), but needless
-- churn and a needless read of this file's diff against Preview's own
-- files. Since Production starts from nothing (confirmed by the Sprint 166H
-- preflight audit — neither table nor any of the four RPC functions exist
-- there today), this file goes directly to the FINAL state already
-- verified live on alertownik-preview: the table is created with its full,
-- final CHECK constraints (including 'abandoned' and the error_summary
-- length cap) from the start, and the ONLY write path is ever the four
-- SECURITY DEFINER functions — no direct-write RLS policy is ever created,
-- because none needs to exist even transiently.
--
-- Every structural property below (columns, constraints, indexes, function
-- bodies, argument validation, SECURITY DEFINER + empty search_path,
-- fail-closed unique_violation handling) was read back live from
-- alertownik-preview as part of the Sprint 166H audit and confirmed
-- byte-for-byte equivalent in intent to what is written here — see
-- docs/SPRINT_166H_PRODUCTION_AUTOMATION_READINESS_AUDIT_V1.md §3 for the
-- full comparison table.
--
-- ── Prerequisites confirmed by the Sprint 166H preflight (see
-- PREFLIGHT_SPRINT_166H_PRODUCTION_READONLY_V1.sql) ──────────────────────
--
--   - public.alert_sources exists, id is uuid.
--   - public.automation_identities exists, user_id is uuid, at least one
--     row (a provisioned writer identity) — but the migration itself does
--     not require any row to exist; it only requires the table.
--   - public.admin_profiles exists, user_id is uuid.
--   - gen_random_uuid() is available.
--   - Neither target table nor any of the four function names already
--     exist (zero collision risk).
--
-- ── What this migration explicitly does NOT do ───────────────────────────
--
--   - Does not touch SCHEDULED_CHECKS_ENABLED, SCHEDULED_WRITES_ENABLED,
--     CRON_SECRET, SUPABASE_SCHEDULED_WRITER_EMAIL/PASSWORD,
--     SUPABASE_ENVIRONMENT_TAG, SUPABASE_EXPECTED_PROJECT_REF, or
--     OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED — all Vercel Environment
--     Variable changes are a separate, later, explicitly-approved decision
--     (see the rollout runbook, Phase A entry condition: this migration
--     must be applied with every one of those runtime flags still
--     false/absent in Production).
--   - Does not insert, update, or delete a single row in any existing
--     table.
--   - Does not grant any new privilege to `anon` or `public` — every grant
--     below is to `authenticated` only, matching the exact grants live on
--     alertownik-preview today.
--   - Does not modify alert_sources, automation_identities, admin_profiles,
--     source_notice_candidates, alerts, or any other existing table.

begin;

-- ── 1. scheduled_writer_runs — final schema, function-only write path from
--       the start (no transient direct-write RLS policy is ever created) ──
create table if not exists public.scheduled_writer_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null,
  finished_at timestamptz,
  trigger text not null check (trigger in ('cron', 'manual')),
  environment_tag text not null,
  sources_checked integer not null default 0,
  sources_failed integer not null default 0,
  candidates_inserted integer not null default 0,
  duplicates_skipped integer not null default 0,
  ambiguous_candidates integer not null default 0,
  capped_skipped integer not null default 0,
  duplicates_prevented_by_database integer not null default 0,
  outcome text check (
    outcome is null or outcome = any (array[
      'success', 'partial_failure', 'total_failure',
      'skipped_kill_switch', 'skipped_lock_held', 'abandoned'
    ]::text[])
  ),
  error_summary text check (error_summary is null or char_length(error_summary) <= 200),
  created_at timestamptz not null default now()
);

alter table public.scheduled_writer_runs enable row level security;

-- Admin-only SELECT — the only RLS policy this table ever has. All writes
-- go exclusively through the two SECURITY DEFINER functions below, which
-- bypass RLS entirely and re-implement the authorization check themselves.
create policy scheduled_writer_runs_admin_select
  on public.scheduled_writer_runs
  for select
  to authenticated
  using (
    exists (
      select 1 from public.admin_profiles
      where admin_profiles.user_id = auth.uid()
    )
  );

-- The atomic concurrency guarantee: at most one open (finished_at is null)
-- run per (environment_tag, trigger) scope at any time.
create unique index if not exists scheduled_writer_runs_one_open_per_scope
  on public.scheduled_writer_runs (environment_tag, trigger)
  where finished_at is null;

-- ── 2. operational_notification_events — final schema ───────────────────
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
  fingerprint text not null,
  scheduled_writer_run_id uuid references public.scheduled_writer_runs(id),
  source_id uuid references public.alert_sources(id) on delete set null,
  status text not null check (status in ('claimed', 'sent', 'failed', 'suppressed', 'abandoned')),
  attempt_count integer not null default 1 check (attempt_count >= 0 and attempt_count <= 1000),
  claimed_at timestamptz,
  finished_at timestamptz,
  sent_at timestamptz,
  suppressed_reason text check (
    suppressed_reason is null or suppressed_reason = any (array[
      'suppress_retry_pending', 'suppress_lock_held', 'suppress_duplicate',
      'suppress_cooldown', 'suppress_success', 'suppress_not_actionable'
    ]::text[])
  ),
  provider_status text check (
    provider_status is null or provider_status = any (array[
      'sent', 'validation_error', 'auth_error', 'rate_limited',
      'transient_error', 'unknown_error'
    ]::text[])
  ),
  safe_summary text check (safe_summary is null or char_length(safe_summary) <= 200),
  cooldown_until timestamptz
);

alter table public.operational_notification_events enable row level security;

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

create unique index if not exists operational_notification_events_one_claim_per_scope
  on public.operational_notification_events (environment_tag, fingerprint)
  where status = 'claimed';

create index if not exists operational_notification_events_scope_recency
  on public.operational_notification_events (environment_tag, fingerprint, created_at desc);

-- ── 3. open_scheduled_writer_run — identical body to the live Preview
--       function (see PROPOSED_SPRINT_166C_ATOMIC_LOCK_MIGRATION_V2.sql
--       Revision 2) ──────────────────────────────────────────────────────
create or replace function public.open_scheduled_writer_run(
  p_id uuid,
  p_trigger text,
  p_environment_tag text,
  p_stale_after_seconds integer default 300
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_is_writer boolean;
begin
  select exists (
    select 1 from public.automation_identities where user_id = auth.uid()
  ) into v_is_writer;

  if not v_is_writer then
    raise exception 'not authorized';
  end if;

  if p_stale_after_seconds is null
    or p_stale_after_seconds < 300
    or p_stale_after_seconds > 86400
  then
    raise exception 'p_stale_after_seconds out of allowed range';
  end if;

  update public.scheduled_writer_runs
  set finished_at = v_now,
      outcome = 'abandoned',
      error_summary = 'stale_lock_auto_closed'
  where environment_tag = p_environment_tag
    and trigger = p_trigger
    and finished_at is null
    and started_at < v_now - pg_catalog.make_interval(secs => p_stale_after_seconds);

  begin
    insert into public.scheduled_writer_runs (id, started_at, trigger, environment_tag)
    values (p_id, v_now, p_trigger, p_environment_tag);
    return true;
  exception when unique_violation then
    return false;
  end;
end;
$$;

revoke all on function public.open_scheduled_writer_run(uuid, text, text, integer) from public;
grant execute on function public.open_scheduled_writer_run(uuid, text, text, integer) to authenticated;

-- ── 4. close_scheduled_writer_run — identical body to the live Preview
--       function ─────────────────────────────────────────────────────────
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

  if p_outcome is null or p_outcome <> all (array[
    'success', 'partial_failure', 'total_failure',
    'skipped_kill_switch', 'skipped_lock_held', 'abandoned'
  ]::text[])
  then
    raise exception 'p_outcome is not one of the allowed run outcomes';
  end if;

  if p_sources_checked is null or p_sources_checked < 0
    or p_sources_failed is null or p_sources_failed < 0
    or p_candidates_inserted is null or p_candidates_inserted < 0
    or p_duplicates_skipped is null or p_duplicates_skipped < 0
    or p_ambiguous_candidates is null or p_ambiguous_candidates < 0
    or p_capped_skipped is null or p_capped_skipped < 0
    or p_duplicates_prevented_by_database is null or p_duplicates_prevented_by_database < 0
  then
    raise exception 'run counters must be non-null and >= 0';
  end if;

  if p_error_summary is not null and pg_catalog.char_length(p_error_summary) > 200 then
    raise exception 'p_error_summary exceeds the maximum allowed length';
  end if;

  update public.scheduled_writer_runs
  set finished_at = pg_catalog.now(),
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

-- ── 5. claim_operational_notification_event — identical body to the live
--       Preview function (fixed 6-hour cooldown, non-parameterized) ──────
create or replace function public.claim_operational_notification_event(
  p_environment_tag text,
  p_channel text,
  p_event_type text,
  p_severity text,
  p_fingerprint text,
  p_scheduled_writer_run_id uuid,
  p_source_id uuid,
  p_safe_summary text,
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
  v_cooldown_seconds constant integer := 21600;
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

  if p_stale_claim_after_seconds is null
    or p_stale_claim_after_seconds < 300
    or p_stale_claim_after_seconds > 86400
  then
    raise exception 'p_stale_claim_after_seconds out of allowed range';
  end if;

  update public.operational_notification_events
  set status = 'abandoned',
      finished_at = v_now,
      updated_at = v_now
  where environment_tag = p_environment_tag
    and fingerprint = p_fingerprint
    and status = 'claimed'
    and claimed_at < v_now - pg_catalog.make_interval(secs => p_stale_claim_after_seconds);

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
      v_now, p_safe_summary, v_now + pg_catalog.make_interval(secs => v_cooldown_seconds)
    );
    return query select true, v_new_id, null::text;
    return;
  exception when unique_violation then
    return query select false, null::uuid, 'suppress_duplicate'::text;
    return;
  end;
end;
$$;

revoke all on function public.claim_operational_notification_event(
  text, text, text, text, text, uuid, uuid, text, integer
) from public;
grant execute on function public.claim_operational_notification_event(
  text, text, text, text, text, uuid, uuid, text, integer
) to authenticated;

-- ── 6. finish_operational_notification_event — identical body to the live
--       Preview function ────────────────────────────────────────────────
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

-- After this migration, use
-- VERIFY_SPRINT_166H_PRODUCTION_POST_MIGRATION_READONLY_V1.sql to confirm
-- the result — do not consider this migration complete until every check
-- in that file matches its expected value.
