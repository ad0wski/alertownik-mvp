-- PROPOSED — Sprint 166C — Scheduled Writer run-history + lock table.
-- Revision 2 (post-audit correction, see Sprint 166C chat record): the
-- original v1 draft made finished_at NOT NULL and granted the writer
-- INSERT only. Both were real bugs against this table's own stated
-- purpose (it doubles as the run-lock — see
-- src/lib/scheduledWriterRunSafety.ts isRunLockHeld): a lock must be
-- insertable BEFORE the run finishes (finished_at unknown yet) and must
-- be closeable afterwards (an UPDATE setting finished_at) — v1 could do
-- neither. This revision fixes both, and nothing else.
--
-- NOT EXECUTED against any Supabase project (Preview or Production) as
-- part of Sprint 166C's design phase. Written for review only. See
-- docs/SPRINT_166C_AUTOMATIC_SOURCE_MONITORING_AUDIT_AND_DESIGN_V1.md §C
-- Stage 1/2 for the full design rationale.
--
-- Purpose: one row per invocation of the scheduled-writer pipeline
-- (GET /api/cron/write-candidates or its future cron-triggered sibling)
-- — inserted at the START of a run (finished_at/outcome both null, this
-- IS the lock row), then updated exactly once at the END of that same
-- run (finished_at + outcome + final counters set). A human then sees
-- run HISTORY, not just current candidate state; a concurrent invocation
-- sees an unfinished row and treats it as an active lock
-- (isRunLockHeld — application-level, this table has no DB-level
-- exclusion constraint of its own).
--
-- RLS — matches the existing pattern (see
-- docs/sql/PROPOSED_SCHEDULED_WRITER_RLS_MIGRATION_V1.sql /
-- SPRINT_165C_AS_BUILT_SCHEMA_NOT_EXECUTED_V1.sql) with one narrow
-- addition:
--   - The scheduled-writer identity (public.automation_identities) gets
--     INSERT (to open a run) and UPDATE (to close ONLY an unfinished run
--     of its own — the USING clause requires finished_at is null, so an
--     already-closed row can never be reopened or edited) — never
--     SELECT/DELETE.
--   - Admins (public.admin_profiles) get SELECT only — never a write
--     path for admins into this table.
--   - No other role has any access.

begin;

create table if not exists public.scheduled_writer_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null,
  -- Null while the run is in progress — this IS the lock signal
  -- (see isRunLockHeld). Set exactly once, by the UPDATE below, when the
  -- run completes.
  finished_at timestamptz,
  trigger text not null check (trigger in ('cron', 'manual')),
  environment_tag text not null,
  sources_checked integer not null default 0,
  sources_failed integer not null default 0,
  candidates_inserted integer not null default 0,
  duplicates_skipped integer not null default 0,
  ambiguous_candidates integer not null default 0,
  capped_skipped integer not null default 0,
  duplicates_prevented_by_database integer not null default 0,
  -- Null while the run is in progress, matching finished_at. A CHECK
  -- constraint with IN() is automatically satisfied by NULL in Postgres,
  -- so this still rejects any non-null value outside the five outcomes.
  outcome text check (
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

-- Closes exactly one run: USING restricts this to rows that are still
-- open (finished_at is null) — an already-finished row can never be
-- targeted by this policy, so history is append-only in practice even
-- though UPDATE exists structurally. WITH CHECK re-confirms writer
-- membership on the resulting row (defense in depth, matching the
-- INSERT policy's own check).
create policy scheduled_writer_runs_writer_close
  on public.scheduled_writer_runs
  for update
  to authenticated
  using (
    finished_at is null
    and exists (
      select 1 from public.automation_identities
      where automation_identities.user_id = auth.uid()
    )
  )
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

-- No delete policy for any role, and no update path once finished_at is
-- set (see scheduled_writer_runs_writer_close's USING clause) — a
-- completed run row can never be edited or removed by any role.

commit;

-- Verification (read-only, run separately after applying, matching the
-- existing VERIFY_*_READ_ONLY.sql convention):
--   select count(*) from public.scheduled_writer_runs; -- expect 0 immediately after migration
--   select policyname, cmd from pg_policies where tablename = 'scheduled_writer_runs'; -- expect 3 rows: insert, update, select
--   select relrowsecurity from pg_class where relname = 'scheduled_writer_runs'; -- expect true
