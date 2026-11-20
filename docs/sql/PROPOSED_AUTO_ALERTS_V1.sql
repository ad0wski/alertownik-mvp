-- =============================================================================
-- PROPOSED — AUTO ALERTS V1 (auto-archive + decision log + monitoring)
-- =============================================================================
-- Status: NOT APPLIED. Run manually in the Supabase SQL editor, after review.
-- Purely additive: no DROP TABLE/COLUMN, no data change, no DELETE grant,
-- no anon/public access added, no service_role. Every new write path is
-- for automation_identities members only and is narrower than the existing
-- admin policies.
--
-- What it adds:
--   1. alerts.auto_archived_at — marks an archive as automatic.
--   2. UPDATE policy on alerts for the scheduled writer: ONLY published rows
--      whose ends_at is >= 30 min in the past, ONLY to status 'archived'.
--   3. Guard trigger: an automation identity (that is not also an admin) can
--      change nothing on alerts except status (published → archived),
--      auto_archived_at and updated_at.
--   4. automation_decisions — append-only log of every auto-publish /
--      auto-archive decision (dry run and live). Writer: INSERT only.
--      Admins: SELECT only.
--   5. Writer SELECT on scheduled_writer_runs (stale-writer detection).
--   6. Four new operational notification event types (check constraint +
--      claim function allow-list; function body otherwise byte-identical
--      to the live definition read on 2026-11-20).
--
-- Rollback (run in reverse order if ever needed):
--   drop trigger if exists alerts_automation_update_guard on public.alerts;
--   drop function if exists public.guard_automation_alert_update();
--   drop policy if exists "Scheduled writer can auto-archive ended published alert" on public.alerts;
--   drop policy if exists "Scheduled writer can read run history" on public.scheduled_writer_runs;
--   (automation_decisions / auto_archived_at can stay — inert without the code)
-- Kill switch without SQL: unset SCHEDULED_AUTO_ARCHIVE_ENABLED / _PUBLISH_ENABLED.
-- =============================================================================

begin;

-- 1. Automatic-archive marker -------------------------------------------------
alter table public.alerts add column if not exists auto_archived_at timestamptz null;

-- 2. Narrow UPDATE policy for auto-archive ------------------------------------
drop policy if exists "Scheduled writer can auto-archive ended published alert" on public.alerts;
create policy "Scheduled writer can auto-archive ended published alert"
  on public.alerts
  for update
  to authenticated
  using (
    exists (select 1 from public.automation_identities ai where ai.user_id = auth.uid())
    and status = 'published'
    and ends_at is not null
    and ends_at < now() - interval '30 minutes'
  )
  with check (
    exists (select 1 from public.automation_identities ai where ai.user_id = auth.uid())
    and status = 'archived'
    and auto_archived_at is not null
  );

-- 3. Column guard for automation identities -----------------------------------
-- RLS WITH CHECK cannot compare OLD and NEW, so without this trigger the
-- policy above would let the writer rewrite title/place/etc. while archiving.
create or replace function public.guard_automation_alert_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ignored text[] := array['status', 'auto_archived_at', 'updated_at'];
begin
  if exists (select 1 from public.automation_identities where user_id = auth.uid())
     and not exists (select 1 from public.admin_profiles where user_id = auth.uid())
  then
    if old.status <> 'published' or new.status <> 'archived' then
      raise exception 'automation may only archive published alerts';
    end if;
    if new.auto_archived_at is null then
      raise exception 'automation archive must set auto_archived_at';
    end if;
    if (to_jsonb(new) - v_ignored) is distinct from (to_jsonb(old) - v_ignored) then
      raise exception 'automation may not change alert content';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists alerts_automation_update_guard on public.alerts;
create trigger alerts_automation_update_guard
  before update on public.alerts
  for each row execute function public.guard_automation_alert_update();

-- 4. Decision log --------------------------------------------------------------
create table if not exists public.automation_decisions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  run_id uuid null references public.scheduled_writer_runs(id) on delete set null,
  kind text not null check (kind in ('auto_publish', 'auto_archive')),
  mode text not null check (mode in ('dry_run', 'live')),
  subject_id uuid not null,
  decision text not null check (decision in
    ('would_publish', 'published', 'deferred', 'skipped', 'failed', 'would_archive', 'archived')),
  reason text null check (reason is null or char_length(reason) <= 100),
  alert_id uuid null
);
create index if not exists automation_decisions_created_at_idx on public.automation_decisions (created_at desc);
create index if not exists automation_decisions_subject_idx on public.automation_decisions (subject_id);

alter table public.automation_decisions enable row level security;

drop policy if exists "Scheduled writer can insert automation decisions" on public.automation_decisions;
create policy "Scheduled writer can insert automation decisions"
  on public.automation_decisions
  for insert
  to authenticated
  with check (exists (select 1 from public.automation_identities ai where ai.user_id = auth.uid()));

drop policy if exists "Admins can read automation decisions" on public.automation_decisions;
create policy "Admins can read automation decisions"
  on public.automation_decisions
  for select
  to authenticated
  using (exists (select 1 from public.admin_profiles ap where ap.user_id = auth.uid()));

-- 5. Writer may read run history (stale-writer detection) ----------------------
drop policy if exists "Scheduled writer can read run history" on public.scheduled_writer_runs;
create policy "Scheduled writer can read run history"
  on public.scheduled_writer_runs
  for select
  to authenticated
  using (exists (select 1 from public.automation_identities ai where ai.user_id = auth.uid()));

-- 6. New operational notification event types ----------------------------------
alter table public.operational_notification_events
  drop constraint operational_notification_events_event_type_check;
alter table public.operational_notification_events
  add constraint operational_notification_events_event_type_check
  check (event_type = any (array[
    'run_success', 'abandoned_run', 'lock_held', 'transient_fetch',
    'permanent_fetch', 'write_error', 'credentials_not_configured',
    'environment_guard_blocked', 'kill_switch_disabled', 'unexpected_error',
    'auto_alert_needs_review', 'auto_publish_failed', 'auto_archive_failed', 'writer_stale'
  ]::text[]));

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
)
returns table(claimed boolean, event_id uuid, suppressed_reason text)
language plpgsql
security definer
set search_path to ''
as $function$
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
    'environment_guard_blocked', 'kill_switch_disabled', 'unexpected_error',
    'auto_alert_needs_review', 'auto_publish_failed', 'auto_archive_failed', 'writer_stale'
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
$function$;

commit;

-- =============================================================================
-- Post-apply verification (read-only):
--   select policyname, cmd from pg_policies
--    where tablename in ('alerts','automation_decisions','scheduled_writer_runs') order by 1;
--   select tgname from pg_trigger where tgrelid = 'public.alerts'::regclass and not tgisinternal;
--   select column_name from information_schema.columns
--    where table_name = 'alerts' and column_name = 'auto_archived_at';
--   select proacl from pg_proc where proname = 'claim_operational_notification_event';
--     -- expected unchanged: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- =============================================================================
