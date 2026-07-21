-- ============================================================================
-- NOT EXECUTED
-- ============================================================================
-- Sprint 165C, Phase 1 — Isolated Preview: As-Built Schema + RLS Replay v1
--
-- This file has NEVER been run against any database, live or otherwise.
-- It is generated directly from a fresh, read-only introspection of the
-- LIVE PRODUCTION Supabase project performed during this Sprint 165C
-- preflight (list_tables verbose, pg_policies, pg_indexes, pg_trigger,
-- pg_proc/pg_get_functiondef) — not assembled by replaying the historical
-- docs/sql/ file trail, per the explicit recommendation in
-- docs/sql/SPRINT_165B_ISOLATED_PREVIEW_SCHEMA_REPLAY_MANIFEST_V1.md §0.
--
-- Cross-checked against that manifest's provisional "safe order" (§6): this
-- file's shape matches it, with ONE CORRECTION — see "TRIGGER FINDING" below.
--
-- Every statement below must be reviewed by Adam, statement block by
-- statement block, before ever being run against the new Preview project's
-- SQL editor. Nothing in this file has been executed by Claude.
-- ============================================================================


-- ============================================================================
-- TRIGGER FINDING (Sprint 165C correction to Sprint 165A/165B's audit)
-- ============================================================================
-- Sprint 165A §B.3 and Sprint 165B's schema replay manifest both stated:
-- "no triggers found in information_schema.triggers for public" — and
-- concluded that updated_at columns are maintained by application code only,
-- not by the database.
--
-- This Sprint 165C preflight re-ran the introspection directly against
-- pg_trigger (not information_schema.triggers) and found FOUR triggers do
-- exist on public tables, all invoking the pre-existing set_updated_at()
-- function:
--   - alerts.set_alerts_updated_at
--   - alert_sources.alert_sources_set_updated_at
--   - waste_schedule_items.waste_schedule_items_set_updated_at
--   - source_notice_candidates.source_notice_candidates_set_updated_at
--
-- (source_checks and admin_profiles/automation_identities have no such
-- trigger — matching that their updated_at-less shape, confirmed by the
-- column list below.)
--
-- This is a genuine correction, not a schema change: these triggers already
-- exist on Production today and always have (nothing was added by this
-- sprint). The earlier "no triggers" claim was simply wrong — likely because
-- information_schema.triggers can under-report triggers depending on how the
-- query was scoped previously; pg_trigger is authoritative. This file
-- includes the four CREATE TRIGGER statements so an isolated Preview replay
-- reproduces this real behavior instead of silently omitting it.
-- ============================================================================


-- ============================================================================
-- 0. Extensions actually installed (confirmed via list_extensions, unchanged
--    since Sprint 165A): pgcrypto, plpgsql, uuid-ossp, pg_stat_statements,
--    supabase_vault — all standard Supabase project defaults, present on any
--    new Supabase project without action. pg_cron is NOT installed on
--    Production and must not be enabled on Preview either.
-- ============================================================================


-- ============================================================================
-- 1. Functions (create before tables that reference them in triggers)
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

-- rls_auto_enable() is a live event-trigger-backing function
-- (SECURITY DEFINER, auto-enables RLS on any newly created public table).
-- Included for completeness/parity with Production; whether to also create
-- the matching event trigger on Preview is a judgment call for Adam — it is
-- a convenience/safety-net for future ad hoc table creation, not required
-- for any current feature to function. Not wired up by this file.
create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table','partitioned table')
  loop
     if cmd.schema_name is not null and cmd.schema_name in ('public') and cmd.schema_name not in ('pg_catalog','information_schema') and cmd.schema_name not like 'pg_toast%' and cmd.schema_name not like 'pg_temp%' then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
        raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      exception
        when others then
          raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      end;
     else
        raise log 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     end if;
  end loop;
end;
$function$;


-- ============================================================================
-- 2. Base tables, in dependency order
-- ============================================================================

-- alert_categories — no existing committed file creates this in its live
-- uuid/slug shape (Sprint 165B manifest §1's "missing" finding); authored
-- fresh here from live introspection.
create table public.alert_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

-- alert_sources — category is free text with a CHECK constraint, not an FK,
-- confirmed live; matches docs/supabase_sources_schema.sql's intent but
-- restated here verbatim from introspection to guarantee exactness.
create table public.alert_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text,
  created_at timestamptz not null default now(),
  category text not null default 'municipal'
    check (category = any (array['transport','water','power','waste','roads','municipal'])),
  source_type text not null default 'website'
    check (source_type = any (array['website','pdf','rss','other'])),
  is_active boolean not null default true,
  notes text,
  last_checked_at timestamptz,
  updated_at timestamptz default now()
);

create trigger alert_sources_set_updated_at
  before update on public.alert_sources
  for each row execute function public.set_updated_at();

-- admin_profiles — table shape only (no membership rows); no existing file
-- creates this (Sprint 165B manifest §1's "missing" finding).
create table public.admin_profiles (
  user_id uuid primary key references auth.users(id),
  created_at timestamptz not null default now()
);

-- automation_identities — table shape only (no membership rows); see
-- docs/sql/SPRINT_165C_MANUAL_DEPLOYMENT_RUNBOOK_V1.md §7 for how the
-- Preview scheduled-writer's own row gets inserted, manually, later.
create table public.automation_identities (
  user_id uuid primary key references auth.users(id),
  created_at timestamptz not null default now()
);
comment on table public.automation_identities is
  'Membership-only table for approved server-side automation identities (e.g. the future scheduled source-check writer). Deliberately separate from admin_profiles: membership here grants ONLY the narrow scheduled-writer policies below on source_checks/source_notice_candidates — it must never be treated as, or confused with, admin membership. Populated exclusively via direct SQL/dashboard action by a human operator; no application code path can insert, update, or delete a row here (see policies below).';

-- alerts
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  category text not null
    check (category = any (array['transport','water','power','waste','roads','announcement'])),
  severity text not null
    check (severity = any (array['info','warning','urgent'])),
  title text not null,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  place text,
  change text,
  action text,
  source_name text,
  source_url text,
  status text not null default 'draft'
    check (status = any (array['draft','published','archived'])),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  source_id uuid references public.alert_sources(id)
);

create index alerts_source_id_idx on public.alerts (source_id);

create trigger set_alerts_updated_at
  before update on public.alerts
  for each row execute function public.set_updated_at();

-- source_checks
create table public.source_checks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.alert_sources(id),
  checked_at timestamptz not null default now(),
  result text not null
    check (result = any (array['no_changes','found_notice','alert_created','needs_followup'])),
  notes text,
  related_alert_id uuid references public.alerts(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index source_checks_source_id_idx on public.source_checks (source_id);
create index source_checks_checked_at_idx on public.source_checks (checked_at desc);
create index source_checks_result_idx on public.source_checks (result);

-- waste_schedule_items
create table public.waste_schedule_items (
  id uuid primary key default gen_random_uuid(),
  locality text not null,
  area_name text,
  street_group text,
  waste_type text not null
    check (waste_type = any (array['mixed','paper','plastics_metals','glass','bio','bulky','other'])),
  collection_date date not null,
  source_name text,
  source_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index waste_schedule_items_locality_date_idx on public.waste_schedule_items (locality, collection_date);
create index waste_schedule_items_collection_date_idx on public.waste_schedule_items (collection_date);

create trigger waste_schedule_items_set_updated_at
  before update on public.waste_schedule_items
  for each row execute function public.set_updated_at();

-- source_notice_candidates (includes the Sprint 150 content_fingerprint
-- column and its partial unique index directly, rather than as separate
-- ALTER steps, since this file targets a brand-new empty project)
create table public.source_notice_candidates (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.alert_sources(id),
  source_key text,
  source_name text not null,
  source_url text not null,
  official_domain text,
  candidate_url text,
  raw_title text,
  title text not null,
  excerpt text,
  raw_text text,
  raw_payload jsonb,
  category text
    check (category is null or category = any (array['transport','water','power','waste','roads','municipal'])),
  severity text
    check (severity is null or severity = any (array['info','warning','urgent'])),
  locality text,
  place text,
  starts_at timestamptz,
  ends_at timestamptz,
  change text,
  action text,
  confidence_score numeric
    check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)),
  risk_level text
    check (risk_level is null or risk_level = any (array['low','medium','high'])),
  verification_status text not null default 'unverified'
    check (verification_status = any (array['unverified','auto_checked','ai_verified','human_verified','failed'])),
  verification_notes text,
  duplicate_of_alert_id uuid references public.alerts(id),
  checked_at timestamptz,
  detected_at timestamptz not null default now(),
  status text not null default 'pending'
    check (status = any (array['pending','needs_review','approved','rejected','converted_to_draft','published','archived'])),
  ai_draft_json jsonb,
  converted_alert_id uuid references public.alerts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  content_fingerprint text
);

comment on column public.source_notice_candidates.content_fingerprint is
  'Sprint 150A: SHA-256 hex digest of normalizeForCompare(raw_text || excerpt || title), computed in application code (src/lib/scheduledWriter.ts computeContentFingerprint). NULL for every row created before this migration and for every admin-manual row (source_key is null) regardless of when created. Never computed or verified in SQL — single source of truth is the TypeScript normalizeForCompare function.';

create index source_notice_candidates_source_id_idx on public.source_notice_candidates (source_id);
create index source_notice_candidates_source_key_idx on public.source_notice_candidates (source_key);
create index source_notice_candidates_status_detected_idx on public.source_notice_candidates (status, detected_at desc);
create index source_notice_candidates_detected_at_idx on public.source_notice_candidates (detected_at desc);

create unique index source_notice_candidates_writer_fingerprint_uniq
  on public.source_notice_candidates (source_key, content_fingerprint)
  where (source_key is not null and content_fingerprint is not null);
comment on index public.source_notice_candidates_writer_fingerprint_uniq is
  'Sprint 150, Step 2B: prevents the scheduled writer from inserting two candidates with the same (source_key, content_fingerprint) pair — the race-condition closure. Does not apply to admin-manual rows (source_key is null) or pre-fingerprint rows (content_fingerprint is null).';

create trigger source_notice_candidates_set_updated_at
  before update on public.source_notice_candidates
  for each row execute function public.set_updated_at();


-- ============================================================================
-- 3. Row Level Security — enable on every table
-- ============================================================================

alter table public.alert_categories enable row level security;
alter table public.alert_sources enable row level security;
alter table public.alerts enable row level security;
alter table public.admin_profiles enable row level security;
alter table public.source_checks enable row level security;
alter table public.waste_schedule_items enable row level security;
alter table public.source_notice_candidates enable row level security;
alter table public.automation_identities enable row level security;


-- ============================================================================
-- 4. RLS policies — verbatim from live pg_policies, re-confirmed this sprint
--    (zero drift from the Sprint 165A snapshot)
-- ============================================================================

-- admin_profiles
create policy "Admins can read their own admin profile"
  on public.admin_profiles for select
  to authenticated
  using (auth.uid() = user_id);

-- alert_categories
create policy "Public can read alert categories"
  on public.alert_categories for select
  to anon
  using (true);

-- alert_sources
create policy "Public can read alert sources"
  on public.alert_sources for select
  to anon
  using (true);

create policy "Admins can select alert sources"
  on public.alert_sources for select
  using (exists (select 1 from public.admin_profiles where admin_profiles.user_id = auth.uid()));

create policy "Admins can insert alert sources"
  on public.alert_sources for insert
  with check (exists (select 1 from public.admin_profiles where admin_profiles.user_id = auth.uid()));

create policy "Admins can update alert sources"
  on public.alert_sources for update
  using (exists (select 1 from public.admin_profiles where admin_profiles.user_id = auth.uid()));

create policy "Admins can delete alert sources"
  on public.alert_sources for delete
  using (exists (select 1 from public.admin_profiles where admin_profiles.user_id = auth.uid()));

-- alerts
create policy "Public can read published alerts"
  on public.alerts for select
  to anon
  using (status = 'published');

create policy "Admins can read all alerts"
  on public.alerts for select
  to authenticated
  using (exists (select 1 from public.admin_profiles ap where ap.user_id = auth.uid()));

create policy "Admins can insert alerts"
  on public.alerts for insert
  to authenticated
  with check (exists (select 1 from public.admin_profiles ap where ap.user_id = auth.uid()));

create policy "Admins can update alerts"
  on public.alerts for update
  to authenticated
  using (exists (select 1 from public.admin_profiles ap where ap.user_id = auth.uid()))
  with check (exists (select 1 from public.admin_profiles ap where ap.user_id = auth.uid()));

create policy "Admins can delete alerts"
  on public.alerts for delete
  to authenticated
  using (exists (select 1 from public.admin_profiles ap where ap.user_id = auth.uid()));

-- source_checks
create policy "Admins can select source_checks"
  on public.source_checks for select
  using (exists (select 1 from public.admin_profiles where admin_profiles.user_id = auth.uid()));

create policy "Admins can insert source_checks"
  on public.source_checks for insert
  with check (exists (select 1 from public.admin_profiles where admin_profiles.user_id = auth.uid()));

create policy "Admins can update source_checks"
  on public.source_checks for update
  using (exists (select 1 from public.admin_profiles where admin_profiles.user_id = auth.uid()));

create policy "Admins can delete source_checks"
  on public.source_checks for delete
  using (exists (select 1 from public.admin_profiles where admin_profiles.user_id = auth.uid()));

create policy "Scheduled writer can insert automated source_checks"
  on public.source_checks for insert
  with check (
    exists (select 1 from public.automation_identities where automation_identities.user_id = auth.uid())
    and result = any (array['no_changes','found_notice'])
    and related_alert_id is null
    and created_by = auth.uid()
  );

-- source_notice_candidates
create policy "Admins can select source_notice_candidates"
  on public.source_notice_candidates for select
  using (exists (select 1 from public.admin_profiles where admin_profiles.user_id = auth.uid()));

create policy "Admins can insert source_notice_candidates"
  on public.source_notice_candidates for insert
  with check (exists (select 1 from public.admin_profiles where admin_profiles.user_id = auth.uid()));

create policy "Admins can update source_notice_candidates"
  on public.source_notice_candidates for update
  using (exists (select 1 from public.admin_profiles where admin_profiles.user_id = auth.uid()));

create policy "Admins can delete source_notice_candidates"
  on public.source_notice_candidates for delete
  using (exists (select 1 from public.admin_profiles where admin_profiles.user_id = auth.uid()));

create policy "Scheduled writer can insert pending source_notice_candidates"
  on public.source_notice_candidates for insert
  with check (
    exists (select 1 from public.automation_identities where automation_identities.user_id = auth.uid())
    and status = 'pending'
    and verification_status = 'unverified'
    and confidence_score is null
    and risk_level is null
    and verification_notes is null
    and checked_at is null
    and duplicate_of_alert_id is null
    and converted_alert_id is null
    and ai_draft_json is null
  );

create policy "Scheduled writer can select source_notice_candidates"
  on public.source_notice_candidates for select
  using (exists (select 1 from public.automation_identities where automation_identities.user_id = auth.uid()));

-- waste_schedule_items (broader authenticated-role policy, matches live
-- pattern verbatim, unchanged by this sprint)
create policy "Public can select waste_schedule_items"
  on public.waste_schedule_items for select
  using (true);

create policy "Authenticated admins can insert waste_schedule_items"
  on public.waste_schedule_items for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated admins can update waste_schedule_items"
  on public.waste_schedule_items for update
  using (auth.role() = 'authenticated');

create policy "Authenticated admins can delete waste_schedule_items"
  on public.waste_schedule_items for delete
  using (auth.role() = 'authenticated');

-- automation_identities
create policy "Automation identities can read their own membership row"
  on public.automation_identities for select
  using (auth.uid() = user_id);


-- ============================================================================
-- 5. Post-replay verification (read-only — run against the NEW project only,
--    after every statement above has been applied and reviewed by Adam)
-- ============================================================================
-- Re-run this file's own source queries against the new project and diff
-- line-by-line against this session's Production snapshot:
--   select * from information_schema... (list_tables via MCP, verbose)
--   select schemaname, tablename, policyname, roles, cmd, qual, with_check
--     from pg_policies where schemaname='public' order by tablename, policyname;
--   select indexname, indexdef from pg_indexes where schemaname='public'
--     order by tablename, indexname;
--   select tgname, tgrelid::regclass, pg_get_triggerdef(oid)
--     from pg_trigger where not tgisinternal;
-- A mismatch at this step means STOP per
-- docs/SPRINT_165C_MANUAL_DEPLOYMENT_RUNBOOK_V1.md §14 — do not proceed to
-- account creation until resolved.
-- ============================================================================
-- END OF FILE — NOT EXECUTED
-- ============================================================================
