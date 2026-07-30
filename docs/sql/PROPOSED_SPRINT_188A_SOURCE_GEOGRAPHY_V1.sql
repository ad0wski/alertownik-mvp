-- Sprint 188A — PROPOSED, NOT EXECUTED. Written for a future, separately
-- approved sprint (Etap E/F of docs/MASTER_ROADMAP_V2.md). Do not run
-- this in the current sprint — CLAUDE.md and this sprint's brief both
-- require any schema change to stay proposed-only until Adam explicitly
-- asks for it in a future session.
--
-- Pair with docs/sql/VERIFY_SPRINT_188A_SOURCE_GEOGRAPHY_READ_ONLY_V1.sql
-- (run before AND after, same convention as every other PROPOSED/VERIFY
-- pair in this repo, e.g. Sprint 172's pair).
--
-- Why this exists: docs/NATIONAL_SOURCE_SCALE_PLAN_V1.md §2.5 identifies
-- that `alerts.place` / candidate `place` are free text, and
-- `alert_sources` has no structured geography or lifecycle status at all
-- — both block a real Poland-wide coverage panel (§3.5) from ever being
-- backed by live data instead of a hardcoded 6-locality list
-- (PILOT_LOCALITIES in officialSourceChecklist.ts). This migration adds
-- exactly the columns src/lib/sourceScale/coverageCalculator.ts's
-- CoverageSourceRecord type already expects, so the application code
-- written in Sprint 188A needs zero changes if/when this migration is
-- eventually applied — only the data-loading layer needs to start
-- populating the new columns.
--
-- Deliberately additive only: every new column is nullable, no NOT NULL,
-- no default value that would require guessing a value for the 6
-- pilot-locality sources that already exist. Existing rows get NULL in
-- every new column — the application code (coverageCalculator.ts) already
-- treats null geography as "not counted in any geography bucket, but
-- still counted in the lifecycle/category breakdown", so this is a safe,
-- fully backward-compatible starting state, not a partial migration that
-- needs an immediate follow-up backfill.

begin;

alter table public.alert_sources
  add column if not exists wojewodztwo text,
  add column if not exists powiat text,
  add column if not exists gmina text,
  add column if not exists miejscowosc text,
  add column if not exists lifecycle_status text
    check (lifecycle_status is null or lifecycle_status = any (array[
      'discovered'::text,
      'classified'::text,
      'awaiting_review'::text,
      'testable'::text,
      'canary'::text,
      'active'::text,
      'degraded'::text,
      'disabled'::text
    ]));

alter table public.alerts
  add column if not exists wojewodztwo text,
  add column if not exists powiat text,
  add column if not exists gmina text,
  add column if not exists miejscowosc text;

comment on column public.alert_sources.wojewodztwo is
  'Sprint 188A (proposed): structured voivodeship name, nullable. Null for every row until a future sprint explicitly backfills the 6 pilot-locality sources and/or a batch-onboarding flow populates it for new sources. Matches src/lib/sourceScale/coverageCalculator.ts CoverageSourceRecord.wojewodztwo.';
comment on column public.alert_sources.powiat is
  'Sprint 188A (proposed): structured county (powiat) name, nullable. Same backfill note as wojewodztwo.';
comment on column public.alert_sources.gmina is
  'Sprint 188A (proposed): structured municipality (gmina) name, nullable. Same backfill note as wojewodztwo.';
comment on column public.alert_sources.miejscowosc is
  'Sprint 188A (proposed): structured locality name, nullable. Distinct from alert_sources.name (the source''s own display name) — this is the place the source covers, not what the source is called.';
comment on column public.alert_sources.lifecycle_status is
  'Sprint 188A (proposed): matches src/lib/sourceScale/sourceLifecycle.ts SourceLifecycleStatus. Null for every row created before this migration (including all current pilot sources) — a future sprint must explicitly decide and backfill a starting status for them (most plausibly ''active'' for the 5 already-automated sources), never assumed here.';
comment on column public.alerts.wojewodztwo is
  'Sprint 188A (proposed): structured voivodeship name, nullable, alongside the existing free-text alerts.place. Not a replacement for alerts.place — that column stays the human-facing "Gdzie" field unchanged.';
comment on column public.alerts.powiat is
  'Sprint 188A (proposed): structured county (powiat) name, nullable. See alerts.wojewodztwo comment.';
comment on column public.alerts.gmina is
  'Sprint 188A (proposed): structured municipality (gmina) name, nullable. See alerts.wojewodztwo comment.';
comment on column public.alerts.miejscowosc is
  'Sprint 188A (proposed): structured locality name, nullable. See alerts.wojewodztwo comment.';

commit;

-- No RLS policy change. These are plain nullable columns on tables whose
-- existing RLS policies (public SELECT on alerts where status =
-- 'published'; admin_profiles-gated full access on both tables) already
-- cover every column by table, not by column allowlist — adding a nullable
-- column widens no existing policy's effective access. No backfill, no
-- data migration, no rollback of existing data — this file only adds
-- columns, never touches an existing row's existing values.
