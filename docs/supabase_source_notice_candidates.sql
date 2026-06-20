-- ============================================================================
-- Alertownik — Source Notice Candidates Schema
-- Sprint 74: Semi-Automated Source Queue Mega Pack
-- ============================================================================
-- STATUS: PROPOSAL — NOT APPLIED. Run manually in the Supabase SQL Editor
-- only after explicit confirmation. Do NOT execute automatically or via a
-- script.
--
-- WHY THIS TABLE: `source_checks` (Sprint 49) already records that an admin
-- found something worth turning into an alert (`result = 'found_notice'` /
-- `'needs_followup'`), but it has no structured `title`/`url`/`excerpt`
-- separate from the free-text `notes` field, and no persisted status an
-- admin can flip later (e.g. "ignore this one"). Sprint 74 ships a working
-- V0 queue against the EXISTING `source_checks` table (see
-- `src/lib/supabaseSourceWrites.ts`'s `getSourceCandidates()`) — this table
-- is the proposed upgrade once/if that V0 proves useful, not a prerequisite
-- for it.
--
-- BEFORE RUNNING:
--   1. Ensure alert_sources (Sprint 42) and alerts (base schema) already exist.
--   2. Run the full SQL below in the Supabase SQL Editor.
--   3. This does NOT replace source_checks — both can coexist. A future
--      sprint would decide whether fetch-preview candidates get inserted
--      here automatically (still requiring admin review before anything
--      reaches AI Helper/Builder) or whether this stays a manual log.
-- ============================================================================


-- ============================================================================
-- source_notice_candidates
-- ============================================================================
-- A detected candidate notice from a source — either logged manually by an
-- admin or (future sprint) inserted automatically by a source-check/RSS job.
-- Never published directly; always reviewed via the admin queue first.

create table if not exists public.source_notice_candidates (
  id               uuid        primary key default gen_random_uuid(),
  source_id        uuid        not null references public.alert_sources(id) on delete cascade,
  title            text        not null,
  url              text,
  excerpt          text,
  detected_at      timestamptz not null default now(),
  status           text        not null default 'pending',
  ai_draft_json    jsonb,
  related_alert_id uuid        null references public.alerts(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint source_notice_candidates_status_check
    check (status in ('pending', 'ignored', 'converted', 'archived'))
);


-- ============================================================================
-- Indexes
-- ============================================================================

create index if not exists source_notice_candidates_source_id_idx
  on public.source_notice_candidates(source_id);

create index if not exists source_notice_candidates_status_idx
  on public.source_notice_candidates(status);

create index if not exists source_notice_candidates_detected_at_idx
  on public.source_notice_candidates(detected_at desc);


-- ============================================================================
-- Trigger: keep updated_at current on every row update
-- ============================================================================
-- set_updated_at() already exists (Sprint 42, alert_sources) — CREATE OR
-- REPLACE is safe to run even if it already exists.

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists source_notice_candidates_set_updated_at on public.source_notice_candidates;

create trigger source_notice_candidates_set_updated_at
  before update on public.source_notice_candidates
  for each row
  execute procedure set_updated_at();


-- ============================================================================
-- Row Level Security
-- ============================================================================
-- Same admin-only pattern as alert_sources / source_checks: any authenticated
-- user is treated as an admin; public (anon) has no access at all.

alter table public.source_notice_candidates enable row level security;

drop policy if exists "Authenticated admins can select source_notice_candidates" on public.source_notice_candidates;
drop policy if exists "Authenticated admins can insert source_notice_candidates" on public.source_notice_candidates;
drop policy if exists "Authenticated admins can update source_notice_candidates" on public.source_notice_candidates;
drop policy if exists "Authenticated admins can delete source_notice_candidates" on public.source_notice_candidates;

create policy "Authenticated admins can select source_notice_candidates"
  on public.source_notice_candidates for select
  using (auth.role() = 'authenticated');

create policy "Authenticated admins can insert source_notice_candidates"
  on public.source_notice_candidates for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated admins can update source_notice_candidates"
  on public.source_notice_candidates for update
  using (auth.role() = 'authenticated');

create policy "Authenticated admins can delete source_notice_candidates"
  on public.source_notice_candidates for delete
  using (auth.role() = 'authenticated');


-- ============================================================================
-- Reload PostgREST schema cache
-- ============================================================================

notify pgrst, 'reload schema';


-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
-- After running this file in the Supabase SQL Editor:
--   1. Verify source_notice_candidates appears in the Table Editor.
--   2. No app code reads/writes this table yet as of Sprint 74 — the admin
--      queue at /admin/queue runs against source_checks instead. Wiring the
--      queue UI to this table (and adding an "Ignoruj" action that actually
--      persists) is follow-up work, not included in this file.
-- ============================================================================
