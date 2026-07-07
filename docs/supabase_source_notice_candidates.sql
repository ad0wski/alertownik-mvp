-- ============================================================================
-- Alertownik — Source Notice Candidates Schema (v1)
-- Sprint 74: proposed. Sprint 78: finalized shape (Persistent Source
-- Candidate Queue). NEVER APPLIED (confirmed live in Sprint 106S).
--
-- ⛔ SUPERSEDED (Sprint 132) — DO NOT RUN THIS FILE.
-- The current proposal is docs/sprint132_candidate_persistence_schema_
-- proposal.sql (v2: automation/verification fields + split status enum).
-- Running this v1 file would create a table whose status check constraint
-- ('pending'/'ignored'/'converted'/'archived') REJECTS the v2 status
-- values the app now writes ('rejected'/'converted_to_draft'/'published').
-- Kept for history only.
-- ============================================================================
-- STATUS: PROPOSAL — NOT APPLIED. Run manually in the Supabase SQL Editor
-- only after explicit confirmation. Do NOT execute automatically or via a
-- script.
--
-- WHY THIS TABLE: `source_checks` (Sprint 49) records that an admin found
-- something worth turning into an alert (`result = 'found_notice'` /
-- `'needs_followup'`), but it has no structured `title`/`excerpt`/`raw_text`
-- separate from the free-text `notes` field, and no persisted status an
-- admin can flip later (e.g. "ignore this one") without corrupting the
-- check's own result history. This table is the dedicated, structured
-- candidate entity Sprint 78's admin queue is built against.
--
-- WHAT CHANGED SINCE THE SPRINT 74 DRAFT: `source_name`/`source_url` are
-- now denormalized onto the candidate row (not just joined via `source_id`)
-- so a candidate stays readable even after its source is edited or deleted
-- — hence `source_id` is nullable with `on delete set null`, not `cascade`.
-- Added `candidate_url` (the specific notice's own link, when known —
-- distinct from the source's homepage `source_url`) and `raw_text` (fuller
-- snapshot than `excerpt`, used to pre-fill AI Helper). Renamed
-- `related_alert_id` → `converted_alert_id` to match the `converted` status
-- value it's set alongside.
--
-- RELATIONSHIP TO source_checks: this table does NOT replace source_checks.
-- A source check is still the manual "I looked at this source today" log
-- entry; a source_notice_candidate is a specific, structured notice/snippet
-- an admin explicitly chose to save for later action. The existing
-- source_checks-derived view in `getSourceCandidates()`
-- (src/lib/supabaseSourceWrites.ts) keeps working unchanged after this
-- table is created — they are two independent, coexisting views, both
-- shown (clearly labeled separately) on /admin/queue.
--
-- BEFORE RUNNING:
--   1. Ensure alert_sources (Sprint 42) and alerts (base schema) already exist.
--   2. Run the full SQL below in the Supabase SQL Editor.
--   3. Reload /admin/queue afterwards — the app detects a missing table
--      gracefully (shows an explanatory banner instead of crashing) and
--      will start working immediately once the table exists, no app
--      redeploy needed.
-- ============================================================================


-- ============================================================================
-- source_notice_candidates
-- ============================================================================
-- A detected candidate notice from a source, explicitly saved by an admin
-- (never auto-saved in bulk — see src/app/admin/sources/page.tsx's "Zapisz
-- jako kandydata" action). Never published directly; always reviewed via
-- the admin queue, then sent to AI Helper or a Builder draft, then manually
-- published by an admin — same rule as every other path into `alerts`.

create table if not exists public.source_notice_candidates (
  id                uuid        primary key default gen_random_uuid(),
  source_id         uuid        null references public.alert_sources(id) on delete set null,
  source_name       text        not null,
  source_url        text,
  candidate_url     text,
  title             text        not null,
  excerpt           text,
  raw_text          text,
  detected_at       timestamptz not null default now(),
  status            text        not null default 'pending',
  ai_draft_json     jsonb,
  converted_alert_id uuid       null references public.alerts(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

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
--   2. Open /admin/sources, run "Sprawdź stronę" on any source, and click
--      "Zapisz jako kandydata" on an extracted snippet to confirm rows are
--      being inserted.
--   3. Open /admin/queue and confirm the new "Kandydaci (trwali)" section
--      now shows that candidate instead of the "tabela nie istnieje" banner.
-- No app code needs to change after running this — the app already detects
-- the table's presence at runtime (src/lib/supabaseCandidateWrites.ts).
-- ============================================================================
