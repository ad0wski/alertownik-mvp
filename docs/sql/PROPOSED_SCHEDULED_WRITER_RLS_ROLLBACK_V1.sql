-- ============================================================================
-- EMERGENCY ROLLBACK — DO NOT RUN UNLESS REQUIRED
-- ============================================================================
-- Sprint 145 — companion rollback for
-- docs/sql/PROPOSED_SCHEDULED_WRITER_RLS_MIGRATION_V1.sql.
--
-- This file has NOT been executed. It exists so that, if the proposed
-- migration is ever applied and something goes wrong (most importantly:
-- the admin loses access to source_checks or source_notice_candidates),
-- there is an exact, pre-written, already-reviewed path back to the
-- prior verified state — not an improvisation under pressure.
--
-- WHAT "PRIOR STATE" MEANS HERE: the exact broad
-- `auth.role() = 'authenticated'` policies this migration replaced,
-- restored byte-for-byte from the committed source of truth
-- (docs/supabase_source_checks.sql,
-- docs/sprint132_candidate_persistence_schema_proposal.sql), not a
-- re-derived approximation.
--
-- ⚠️ RUNNING THIS RESTORES THE WIDER, PRE-MIGRATION ACCESS MODEL: any
-- authenticated session (not just admins) would again be able to
-- SELECT/INSERT/UPDATE/DELETE both source_checks and
-- source_notice_candidates — the exact broad condition Sprint 143/144/145
-- exist to move away from. Only run this to recover from a genuine
-- lockout or misconfiguration; do not treat it as a routine or low-cost
-- action, and re-apply the least-privilege migration again as soon as
-- the underlying issue is fixed.
--
-- THIS ROLLBACK DOES NOT DELETE ANY DATA: no candidate row, no check
-- history row, and no automation_identities row (if any were ever added)
-- is removed by this file. It only changes which policies govern access
-- — existing rows in every table are completely unaffected.
-- ============================================================================


begin;


-- ============================================================================
-- SECTION 1 — source_notice_candidates: remove new policies, restore broad
-- ============================================================================

drop policy if exists "Admins can select source_notice_candidates" on public.source_notice_candidates;
drop policy if exists "Admins can insert source_notice_candidates" on public.source_notice_candidates;
drop policy if exists "Admins can update source_notice_candidates" on public.source_notice_candidates;
drop policy if exists "Admins can delete source_notice_candidates" on public.source_notice_candidates;
drop policy if exists "Scheduled writer can select source_notice_candidates" on public.source_notice_candidates;
drop policy if exists "Scheduled writer can insert pending source_notice_candidates" on public.source_notice_candidates;

-- Restored exactly as committed in
-- docs/sprint132_candidate_persistence_schema_proposal.sql — same names,
-- same conditions, not re-derived.

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
-- SECTION 2 — source_checks: remove new policies, restore broad
-- ============================================================================

drop policy if exists "Admins can select source_checks" on public.source_checks;
drop policy if exists "Admins can insert source_checks" on public.source_checks;
drop policy if exists "Admins can update source_checks" on public.source_checks;
drop policy if exists "Admins can delete source_checks" on public.source_checks;
drop policy if exists "Scheduled writer can insert automated source_checks" on public.source_checks;

-- Restored exactly as committed in docs/supabase_source_checks.sql.

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
-- SECTION 3 — automation_identities: remove only if appropriate
-- ============================================================================
-- Safe to drop ONLY if no automation identity was ever actually created
-- (i.e. the table is empty, or its only purpose was this now-rolled-back
-- migration). If a technical account was already created and assigned
-- membership here as part of a LATER, separately-approved sprint, do NOT
-- drop this table blindly — check first (see the guard query below);
-- dropping it while a real automation identity depends on it would be a
-- second, unrelated outage on top of whatever prompted this rollback.

-- Uncomment and run manually only after confirming the table is empty or
-- genuinely no longer needed:
--
-- select count(*) as remaining_automation_identities
-- from public.automation_identities;
-- -- Only proceed if this returns 0, or after deliberately deciding to
-- -- discard existing automation identities as part of a full stand-down.
--
-- drop table if exists public.automation_identities;

-- Left commented out deliberately — this rollback file restores the
-- policy layer unconditionally (safe, non-destructive), but table removal
-- requires the human judgment call above and is not automated here.


commit;


-- ============================================================================
-- POST-ROLLBACK VERIFICATION
-- ============================================================================
-- Run docs/sql/VERIFY_SCHEDULED_WRITER_RLS_READ_ONLY_V1.sql — confirm
-- source_checks and source_notice_candidates once again show exactly the
-- four "Authenticated admins can ..." policies each, and that the admin's
-- application session can once again perform every operation it depends
-- on. Then investigate and fix whatever prompted the rollback before
-- re-attempting the least-privilege migration.
-- ============================================================================
