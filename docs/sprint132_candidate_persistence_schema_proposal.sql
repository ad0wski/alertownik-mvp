-- ============================================================================
-- Alertownik — Candidate Persistence Schema Proposal (v2)
-- Sprint 132 (2026-07-07). Supersedes docs/supabase_source_notice_candidates
-- .sql (the Sprint 74/78 v1 proposal, which was NEVER applied — confirmed
-- live in Sprint 106S). Because the table has never existed in production,
-- this is a clean CREATE TABLE, not an ALTER migration.
-- ============================================================================
-- ⛔ STATUS: PROPOSAL — RUN ONLY AFTER ADAM APPROVES.
-- Run manually in the Supabase SQL Editor. Do NOT execute automatically,
-- via a script, or via MCP. Nothing in the app requires this table to
-- exist — /admin/queue detects its absence gracefully.
--
-- ── STEP 0 (READ ONLY — SAFE TO RUN FIRST) ─────────────────────────────────
-- Confirm the current state before creating anything. Expected result as of
-- Sprint 132: source_checks exists; sources does NOT exist (and never
-- should — code uses alert_sources; see Sprint 106S); source_notice_
-- candidates does NOT exist. If source_notice_candidates DOES exist,
-- STOP — it means the old v1 file was run at some point; in that case the
-- v1→v2 change needs a separate reviewed ALTER, not this file.
--
-- select
--   table_name
-- from information_schema.tables
-- where table_schema = 'public'
--   and table_name in ('sources', 'source_checks', 'source_notice_candidates')
-- order by table_name;
--
-- select
--   table_name,
--   column_name,
--   data_type,
--   is_nullable,
--   column_default
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name in ('sources', 'source_checks', 'source_notice_candidates')
-- order by table_name, ordinal_position;
--
-- ── WHAT CHANGED vs the v1 proposal (Sprint 78) ────────────────────────────
-- New fields for the automation/verification pipeline (Obsidian: Candidate
-- Queue Data Model Proposal, Sprint 130; Candidate Persistence Schema
-- Proposal, Sprint 132): source_key, official_domain, raw_title, category,
-- severity, locality, place, starts_at/ends_at, change, action,
-- confidence_score, risk_level, verification_status, verification_notes,
-- duplicate_of_alert_id, raw_payload, checked_at.
--
-- Status enum split (v1: pending/ignored/converted/archived):
--   pending → needs_review → approved → converted_to_draft → published
--           ↘ rejected                  (archived — cleanup)
-- The app code (Sprint 132) ALREADY writes the v2 values (rejected,
-- converted_to_draft, published) — safe because no table/data exists yet.
--
-- Column-name note vs the Sprint 132 brief: the brief suggested
-- `candidate_status` and `extracted_title`; this proposal keeps `status`
-- and `title` (v1 names) because all existing app code reads/writes those
-- names and the semantic is identical. `raw_title` covers the
-- pre-cleaning title the brief wanted alongside `extracted_title`.
--
-- `published` policy: the ONLY path that sets status='published' is the
-- manual publish click in Builder (markCandidateConverted(..., 'published')
-- — src/lib/supabaseCandidateWrites.ts). No automated path exists and no
-- autopublish is enabled by this table. Enforced by application flow, not
-- a DB trigger (single write path; a trigger would add complexity without
-- adding a second writer to guard against).
--
-- RELATIONSHIP TO EXISTING TABLES (all unchanged by this file):
--   * source_checks — stays as the "I checked this source at this time
--     with this result" log; a candidate is content, a check is an event.
--   * alert_sources — source registry; source_id is a soft link
--     (on delete set null) so candidates outlive deleted sources.
--   * alerts — never written directly from a candidate; conversion creates
--     a DRAFT through the existing Builder path (slug-collision guard).
--
-- BEFORE RUNNING:
--   1. Run the STEP 0 read-only checks above.
--   2. Run everything below in one go in the Supabase SQL Editor.
--   3. Reload /admin/queue — the "tabela wymaga zatwierdzenia" banner
--      disappears by itself (runtime detection, no redeploy needed).
-- ============================================================================


-- ============================================================================
-- source_notice_candidates (v2)
-- ============================================================================

create table if not exists public.source_notice_candidates (
  id                    uuid        primary key default gen_random_uuid(),

  -- Source linkage (soft) + denormalized source identity (v1 decision kept:
  -- a candidate stays readable after its source is edited/deleted).
  source_id             uuid        null references public.alert_sources(id) on delete set null,
  source_key            text,                 -- stable id from officialSourceChecklist.ts (e.g. 'wkd-aktualnosci')
  source_name           text        not null,
  source_url            text        not null, -- hard project rule: no source link = no candidate
  official_domain       text,                 -- allowlisted domain, result of the domain check
  candidate_url         text,                 -- the specific notice's own link, when known

  -- Content
  raw_title             text,                 -- title as scraped/pasted, pre-cleaning
  title                 text        not null, -- cleaned/extracted title (brief: extracted_title)
  excerpt               text,
  raw_text              text,
  raw_payload           jsonb,                -- full fetch/parse result (headers, hashes, raw fields) — auditability

  -- Structured suggestions (NULL = unknown; never guessed)
  category              text        null,
  severity              text        null,
  locality              text        null,
  place                 text        null,
  starts_at             timestamptz null,     -- validity period FROM THE NOTICE (not publication date)
  ends_at               timestamptz null,
  change                text        null,     -- what changes (draft suggestion)
  action                text        null,     -- what a resident should do (draft suggestion)

  -- Verification (filled by A3 AI verifier / deterministic checks — later)
  confidence_score      numeric(3,2) null,    -- 0.00–1.00; NULL = not verified
  risk_level            text        null,
  verification_status   text        not null default 'unverified',
  verification_notes    text,                 -- verifier report, with evidence quotes
  duplicate_of_alert_id uuid        null references public.alerts(id) on delete set null,
  checked_at            timestamptz null,     -- last check/verification of this candidate

  -- Lifecycle
  detected_at           timestamptz not null default now(),
  status                text        not null default 'pending',
  ai_draft_json         jsonb,                -- Flow B draft, if one was generated
  converted_alert_id    uuid        null references public.alerts(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- Constraints
  constraint source_notice_candidates_status_check
    check (status in ('pending', 'needs_review', 'approved', 'rejected',
                      'converted_to_draft', 'published', 'archived')),

  constraint source_notice_candidates_risk_level_check
    check (risk_level is null or risk_level in ('low', 'medium', 'high')),

  constraint source_notice_candidates_verification_status_check
    check (verification_status in ('unverified', 'auto_checked', 'ai_verified',
                                   'human_verified', 'failed')),

  constraint source_notice_candidates_confidence_check
    check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)),

  constraint source_notice_candidates_category_check
    check (category is null or category in ('transport', 'water', 'power',
                                            'waste', 'roads', 'municipal')),

  constraint source_notice_candidates_severity_check
    check (severity is null or severity in ('info', 'warning', 'urgent'))
);


-- ============================================================================
-- Indexes
-- ============================================================================

create index if not exists source_notice_candidates_source_id_idx
  on public.source_notice_candidates(source_id);

-- Queue view: filter by status, newest first.
create index if not exists source_notice_candidates_status_detected_idx
  on public.source_notice_candidates(status, detected_at desc);

create index if not exists source_notice_candidates_detected_at_idx
  on public.source_notice_candidates(detected_at desc);

create index if not exists source_notice_candidates_source_key_idx
  on public.source_notice_candidates(source_key);


-- ============================================================================
-- Trigger: keep updated_at current on every row update
-- ============================================================================
-- set_updated_at() already exists (Sprint 42, alert_sources) — CREATE OR
-- REPLACE is safe to run even if it already exists (project convention).

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
-- Row Level Security — admin-only, same pattern as alert_sources/source_checks
-- ============================================================================
-- Any authenticated user is treated as an admin; public (anon) has ZERO
-- access — candidates are never public. No service_role is used anywhere
-- in the app; writes go through the logged-in admin's session (this is
-- also how the future manual-trigger source check A2 will write — no new
-- secrets, no RLS changes needed until the cron sprint A5).

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
-- ROLLBACK (manual, Adam only — never Claude/MCP; project rule)
-- ============================================================================
-- The table is additive and isolated: no existing feature depends on it and
-- the app has a built-in fallback for its absence, so rollback needs no
-- deploy. Candidate data is reproducible from the sources — dropping the
-- queue destroys no alerts and no checks.
--
-- drop trigger if exists source_notice_candidates_set_updated_at on public.source_notice_candidates;
-- drop table if exists public.source_notice_candidates;
-- notify pgrst, 'reload schema';


-- ============================================================================
-- AFTER RUNNING — verification steps
-- ============================================================================
--   1. Table appears in the Supabase Table Editor with the v2 columns.
--   2. /admin/queue stops showing the "tabela wymaga zatwierdzenia" banner
--      (no redeploy needed — runtime detection).
--   3. In /admin/sources, run "Sprawdź stronę" on a source and click
--      "Zapisz jako kandydata" — the candidate appears under "Kandydaci
--      (trwali)" on /admin/queue with status "Oczekujące".
--   4. Odrzuć → the candidate moves to the "Odrzucone" tab; Przywróć →
--      back to "Oczekujące" (exercises the v2 status check constraint).
--   5. Utwórz szkic w Kreatorze → save draft → candidate shows
--      "przekształcony w draft"; manual publish → "opublikowany".
-- ============================================================================
