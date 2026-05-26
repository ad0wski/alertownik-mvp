-- ============================================================================
-- Alertownik — Alert Sources Schema
-- Sprint 42: Source registry for future monitored information sources
-- ============================================================================
-- STATUS: DRAFT — run manually in the Supabase SQL Editor.
-- Do NOT execute automatically or via a script.
--
-- BEFORE RUNNING:
--   1. Check if alert_sources table already exists (it may have been created
--      from schema-draft.sql with an older, simpler schema).
--   2. If alert_sources already exists with the old schema, run the DROP TABLE
--      line below first — WARNING: this deletes all existing source rows.
--   3. If alert_sources does NOT exist yet, skip straight to CREATE TABLE.
--   4. The set_updated_at() function may already exist from schema-draft.sql.
--      The CREATE OR REPLACE below is safe to run either way.
-- ============================================================================


-- ============================================================================
-- Optional: drop old alert_sources table if it exists from schema-draft.sql
-- ============================================================================
-- WARNING: Uncomment only if you want to replace the old table.
-- This deletes all rows already stored in that table.
--
-- DROP TABLE IF EXISTS alert_sources;


-- ============================================================================
-- alert_sources
-- ============================================================================
-- Registry of official pages and sources that Alertownik may monitor in
-- the future. This sprint only creates the registry — no scraping yet.

create table if not exists alert_sources (
  id              uuid        primary key default gen_random_uuid(),
  name            text        not null,
  url             text        not null,
  category        text        not null,
  source_type     text        not null default 'website',
  is_active       boolean     not null default true,
  notes           text,
  last_checked_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint alert_sources_category_check
    check (category in ('transport', 'water', 'power', 'waste', 'roads', 'municipal')),

  constraint alert_sources_source_type_check
    check (source_type in ('website', 'pdf', 'rss', 'other'))
);


-- ============================================================================
-- Trigger: keep updated_at current on every row update
-- ============================================================================
-- set_updated_at() may already exist from schema-draft.sql.
-- CREATE OR REPLACE is safe to run even if the function already exists.

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Drop the trigger first if it already exists (safe re-run)
drop trigger if exists alert_sources_set_updated_at on alert_sources;

create trigger alert_sources_set_updated_at
  before update on alert_sources
  for each row
  execute procedure set_updated_at();


-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table alert_sources enable row level security;

-- Drop existing policies before recreating (safe re-run)
drop policy if exists "Public cannot access sources" on alert_sources;
drop policy if exists "Authenticated admins can select sources" on alert_sources;
drop policy if exists "Authenticated admins can insert sources" on alert_sources;
drop policy if exists "Authenticated admins can update sources" on alert_sources;
drop policy if exists "Authenticated admins can delete sources" on alert_sources;

-- Public users: no access at all (sources are admin-only)
-- (No SELECT policy for anon role means public sees nothing)

-- Authenticated users (admins) get full access
-- This matches the existing admin approach: any logged-in user is an admin.

create policy "Authenticated admins can select sources"
  on alert_sources for select
  using (auth.role() = 'authenticated');

create policy "Authenticated admins can insert sources"
  on alert_sources for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated admins can update sources"
  on alert_sources for update
  using (auth.role() = 'authenticated');

create policy "Authenticated admins can delete sources"
  on alert_sources for delete
  using (auth.role() = 'authenticated');


-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
-- After running this file in Supabase SQL Editor:
--   1. Verify the alert_sources table appears in the Table Editor.
--   2. Visit /admin/sources in the app and try adding a source.
--
-- Example sources to add manually via the UI (do not insert via SQL):
--   - WKD — komunikaty o zakłóceniach       https://www.wkd.com.pl
--   - Gmina Michałowice — aktualności       https://www.michalowice.pl
--   - PGE — planowane wyłączenia prądu      https://www.pge.pl
-- ============================================================================
