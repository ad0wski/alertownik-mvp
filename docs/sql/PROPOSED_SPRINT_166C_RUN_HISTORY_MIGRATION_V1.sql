-- PROPOSED — Sprint 166C — Scheduled Writer run-history table.
-- NOT EXECUTED against any Supabase project (Preview or Production) as
-- part of Sprint 166C. Written for review only. See
-- docs/SPRINT_166C_AUTOMATIC_SOURCE_MONITORING_AUDIT_AND_DESIGN_V1.md §C
-- Stage 1 for the full design rationale.
--
-- Purpose: one row per invocation of the scheduled-writer pipeline
-- (GET /api/cron/write-candidates or its future cron-triggered sibling),
-- so a human can see run HISTORY, not just current candidate state.
--
-- Matches the existing RLS pattern exactly (see
-- docs/sql/PROPOSED_SCHEDULED_WRITER_RLS_MIGRATION_V1.sql /
-- SPRINT_165C_AS_BUILT_SCHEMA_NOT_EXECUTED_V1.sql):
--   - The scheduled-writer identity (public.automation_identities) gets
--     INSERT only — never SELECT/UPDATE/DELETE on its own run rows.
--   - Admins (public.admin_profiles) get SELECT only — never a write path
--     for admins into this table either; a run row is always written by
--     the automation itself, never edited or backfilled by a human.
--   - No other role has any access.

begin;

create table if not exists public.scheduled_writer_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null,
  finished_at timestamptz not null,
  trigger text not null check (trigger in ('cron', 'manual')),
  environment_tag text not null,
  sources_checked integer not null default 0,
  sources_failed integer not null default 0,
  candidates_inserted integer not null default 0,
  duplicates_skipped integer not null default 0,
  ambiguous_candidates integer not null default 0,
  capped_skipped integer not null default 0,
  duplicates_prevented_by_database integer not null default 0,
  outcome text not null check (
    outcome in ('success', 'partial_failure', 'total_failure', 'skipped_kill_switch', 'skipped_lock_held')
  ),
  -- Short, non-sensitive text only — application code (see
  -- src/lib/scheduledWriterRunSafety.ts buildRunHistoryInsert) never
  -- passes a raw exception message or stack trace here, matching the
  -- existing diagnostic-code convention used throughout this codebase.
  error_summary text,
  created_at timestamptz not null default now()
);

alter table public.scheduled_writer_runs enable row level security;

create policy scheduled_writer_runs_writer_insert
  on public.scheduled_writer_runs
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.automation_identities
      where automation_identities.user_id = auth.uid()
    )
  );

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

-- No update/delete policy for any role: a run-history row is append-only,
-- by design — matching source_checks' own existing immutability.

commit;

-- Verification (read-only, run separately after applying, matching the
-- existing VERIFY_*_READ_ONLY.sql convention):
--   select count(*) from public.scheduled_writer_runs; -- expect 0 immediately after migration
--   select * from pg_policies where tablename = 'scheduled_writer_runs';
--   select relrowsecurity from pg_class where relname = 'scheduled_writer_runs'; -- expect true
