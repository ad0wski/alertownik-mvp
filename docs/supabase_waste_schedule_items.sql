-- ============================================================================
-- Alertownik — Waste Schedule Items Schema
-- Sprint 80: proposed. Sprint 81: waste_type value list revised. NOT APPLIED.
-- ============================================================================
-- STATUS: PROPOSAL — NOT APPLIED. Run manually in the Supabase SQL Editor
-- only after explicit confirmation. Do NOT execute automatically or via a
-- script.
--
-- WHY THIS TABLE: the existing `alerts` table is shaped for one-off,
-- single-event disruption notices (one row = one alert with one date
-- range). A waste collection schedule is structurally different: many rows
-- per locality, one per upcoming collection date per waste type, refreshed
-- periodically from an official harmonogram. Reusing `alerts` for this
-- would mean either cramming multiple dates into one alert's free text
-- (not filterable/queryable as a schedule) or publishing dozens of
-- near-duplicate "alerts" — neither fits the existing alert model. A
-- dedicated table is the right shape. See Decisions.md (2026-06-21,
-- Sprint 80) for the full feasibility audit.
--
-- KEY DIFFERENCE FROM alert_sources / source_checks / source_notice_candidates:
-- those tables are admin-only (no anon access at all — see
-- docs/supabase_sources_schema.sql, docs/supabase_source_notice_candidates.sql).
-- This table is deliberately PUBLIC-READABLE (anon SELECT allowed), the
-- same anon-read posture as the `alerts` table itself, because it exists to
-- power a public-facing schedule page, not an admin-only monitoring tool.
--
-- PRIVACY: deliberately no personal-address column. `locality`/`area_name`/
-- `street_group` are coarse, shared groupings (e.g. a town, a named
-- district, "ul. Główna – ul. Sportowa") — never a specific resident's
-- address or house number. This matches this sprint's explicit safety rule
-- ("prefer area/street-group based selection, not exact personal address").
--
-- BEFORE RUNNING:
--   1. Confirm this is genuinely wanted. As of Sprint 81, the public
--      `/odpady` page reads from this table defensively (it detects a
--      missing table and shows an explanatory state — see
--      src/lib/supabaseWasteWrites.ts) but no admin write/entry UI exists
--      yet — see Decisions.md (Sprint 81) for why the read path was built
--      ahead of this migration but the write path deliberately was not.
--   2. Run the full SQL below in the Supabase SQL Editor.
--   3. Reload `/odpady` afterwards — no redeploy needed, the app detects
--      the table's presence at runtime the same way Sprint 78's candidate
--      queue does.
-- ============================================================================


-- ============================================================================
-- waste_schedule_items
-- ============================================================================
-- One row = one collection date, for one waste type, in one locality/area.
-- Admin-entered (manually at first, or later via a PDF/manual-source
-- workflow) — never written by AI or any automated process directly. No
-- "draft" or "pending" status exists on this table by design: every row is
-- real schedule data meant to be shown publicly the moment it's saved
-- (unlike `alerts`, which has a draft → published lifecycle) — see
-- Decisions.md for why a publish step wasn't carried over to this table.

create table if not exists public.waste_schedule_items (
  id              uuid        primary key default gen_random_uuid(),
  locality        text        not null,
  area_name       text,
  street_group    text,
  waste_type      text        not null,
  collection_date date        not null,
  source_name     text,
  source_url      text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Sprint 81 revised this list from Sprint 80's draft: renamed
  -- 'plastic_metal' → 'plastics_metals' and added 'other' as a fallback
  -- bucket for anything that doesn't fit the named 5 (no equivalent
  -- existed in Sprint 80's draft) — both per the Sprint 81 brief.
  constraint waste_schedule_items_waste_type_check
    check (waste_type in ('mixed', 'paper', 'plastics_metals', 'glass', 'bio', 'bulky', 'other'))
);


-- ============================================================================
-- Indexes
-- ============================================================================
-- Expected query shape: "upcoming collection dates for a given locality,"
-- ordered by date — both indexes support exactly that, plus a plain
-- date-range scan for an "any locality, next 14 days" view if ever needed.

create index if not exists waste_schedule_items_locality_date_idx
  on public.waste_schedule_items(locality, collection_date);

create index if not exists waste_schedule_items_collection_date_idx
  on public.waste_schedule_items(collection_date);


-- ============================================================================
-- Trigger: keep updated_at current on every row update
-- ============================================================================
-- set_updated_at() already exists (Sprint 42/78) — CREATE OR REPLACE is safe
-- to run even if it already exists; this does not redefine it differently.

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists waste_schedule_items_set_updated_at on public.waste_schedule_items;

create trigger waste_schedule_items_set_updated_at
  before update on public.waste_schedule_items
  for each row
  execute procedure set_updated_at();


-- ============================================================================
-- Row Level Security
-- ============================================================================
-- Deliberately different posture from alert_sources/source_checks/
-- source_notice_candidates (admin-only, no anon access at all): this table
-- is public-readable, matching how `alerts` grants anon SELECT for
-- published rows. There is no draft/published distinction here (see note
-- above), so a single, unconditional public SELECT policy is correct —
-- there is nothing non-public ever stored in this table to filter out.

alter table public.waste_schedule_items enable row level security;

drop policy if exists "Public can select waste_schedule_items" on public.waste_schedule_items;
drop policy if exists "Authenticated admins can insert waste_schedule_items" on public.waste_schedule_items;
drop policy if exists "Authenticated admins can update waste_schedule_items" on public.waste_schedule_items;
drop policy if exists "Authenticated admins can delete waste_schedule_items" on public.waste_schedule_items;

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


-- ============================================================================
-- Reload PostgREST schema cache
-- ============================================================================

notify pgrst, 'reload schema';


-- ============================================================================
-- END OF SCHEMA — NOT APPLIED, proposal only
-- ============================================================================
-- This migration is intentionally NOT run by Claude Code, per CLAUDE.md and
-- this sprint's explicit safety rules. After running it manually in the
-- Supabase SQL Editor:
--   1. Verify waste_schedule_items appears in the Table Editor.
--   2. Open `/odpady` — it should switch automatically from the "not yet
--      enabled" state to a genuine empty-state ("no upcoming dates yet")
--      with no app redeploy needed (src/lib/supabaseWasteWrites.ts already
--      reads from this table defensively, as of Sprint 81).
--   3. Insert a few real rows manually via the Supabase Table Editor (not
--      via this SQL file) to confirm the public page renders them grouped
--      by date, with waste type/locality/source — no admin entry UI exists
--      yet to do this from inside the app; that's documented future work,
--      not built this sprint (see Roadmap.md's Sprint 81 update).
-- ============================================================================
