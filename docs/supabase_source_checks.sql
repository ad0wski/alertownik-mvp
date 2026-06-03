-- ============================================================================
-- Alertownik — Source Check History Schema
-- Sprint 49: Manual source monitoring history
-- ============================================================================
-- STATUS: DRAFT — run manually in the Supabase SQL Editor.
-- Do NOT execute automatically or via a script.
--
-- BEFORE RUNNING:
--   1. Ensure alert_sources table already exists (Sprint 42 schema).
--   2. Ensure public.alerts table already exists (base schema).
--   3. Run the full SQL below in the Supabase SQL Editor.
-- ============================================================================


-- ============================================================================
-- source_checks
-- ============================================================================
-- Records each manual check of an alert source by an admin.
-- Created when admin clicks "Zapisz wynik sprawdzenia" or
-- "Oznacz jako sprawdzone" on the /admin/sources page.

create table if not exists public.source_checks (
  id               uuid        primary key default gen_random_uuid(),
  source_id        uuid        not null references public.alert_sources(id) on delete cascade,
  checked_at       timestamptz not null default now(),
  result           text        not null,
  notes            text,
  related_alert_id uuid        null references public.alerts(id) on delete set null,
  created_by       uuid        null references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),

  constraint source_checks_result_check
    check (result in ('no_changes', 'found_notice', 'alert_created', 'needs_followup'))
);


-- ============================================================================
-- Indexes
-- ============================================================================

create index if not exists source_checks_source_id_idx
  on public.source_checks(source_id);

create index if not exists source_checks_checked_at_idx
  on public.source_checks(checked_at desc);

create index if not exists source_checks_result_idx
  on public.source_checks(result);


-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.source_checks enable row level security;

-- Drop existing policies before recreating (safe re-run)
drop policy if exists "Authenticated admins can select source_checks" on public.source_checks;
drop policy if exists "Authenticated admins can insert source_checks" on public.source_checks;
drop policy if exists "Authenticated admins can update source_checks" on public.source_checks;
drop policy if exists "Authenticated admins can delete source_checks" on public.source_checks;

-- Authenticated users (admins) get full access.
-- This matches the existing admin approach used for alert_sources:
-- any logged-in user is treated as an admin.
-- Public (anon) users have no access at all.

create policy "Authenticated admins can select source_checks"
  on public.source_checks for select
  using (auth.role() = 'authenticated');

create policy "Authenticated admins can insert source_checks"
  on public.source_checks for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated admins can update source_checks"
  on public.source_checks for update
  using (auth.role() = 'authenticated');

create policy "Authenticated admins can delete source_checks"
  on public.source_checks for delete
  using (auth.role() = 'authenticated');


-- ============================================================================
-- Reload PostgREST schema cache
-- ============================================================================

notify pgrst, 'reload schema';


-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
-- After running this file in the Supabase SQL Editor:
--   1. Verify the source_checks table appears in the Table Editor.
--   2. Open /admin/sources in the app, expand a source's "Historia" panel,
--      and submit a check result to confirm rows are being inserted.
-- ============================================================================
