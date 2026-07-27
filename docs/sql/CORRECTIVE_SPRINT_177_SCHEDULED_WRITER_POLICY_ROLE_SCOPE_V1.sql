-- ============================================================================
-- CORRECTIVE HOTFIX MIGRATION — DO NOT RUN WITHOUT EXPLICIT APPROVAL
-- ============================================================================
-- Sprint 177F-E — Scheduled Writer Policy Role Scope Hotfix.
--
-- This is a PROPOSAL only. It has NOT been executed. NOT to be run on
-- Production except by Adam, manually, in the Supabase SQL Editor, after
-- his own explicit review — same convention as every other file in
-- docs/sql/.
--
-- ============================================================================
-- INCIDENT BEING FIXED (confirmed live on Production, 2026-07-27)
-- ============================================================================
-- docs/sql/PROPOSED_SPRINT_177_AUTOMATION_ALERT_READ_POLICY_V1.sql was
-- executed manually on Production exactly once (Sprint 177F). It created:
--
--   create policy "Scheduled writer can select alerts for deduplication"
--     on public.alerts for select
--     using (
--       exists (select 1 from public.automation_identities
--               where automation_identities.user_id = auth.uid())
--     );
--
-- Because this CREATE POLICY has no `to <role>` clause, Postgres scopes it
-- to `public` — i.e. every role, including anon. Row Level Security
-- requires evaluating every applicable permissive policy's USING clause
-- for a query, and doing so requires table-level SELECT privilege on
-- every table the clause references — regardless of what the clause's
-- row-level condition would ultimately evaluate to. anon has SELECT on
-- public.alerts (by design — it's how the homepage reads published
-- alerts) but deliberately has ZERO grant on public.automation_identities
-- (by design — that table lists which identities may act as the
-- automation writer, and no anonymous or ordinary browser session should
-- ever be able to read or infer its contents).
--
-- The result: every anonymous request to public.alerts — including the
-- public homepage's own read of published alerts — now fails with:
--   42501 permission denied for table automation_identities
-- This was confirmed three independent ways: a live browser console error
-- on /alerty, a raw REST call against the Production anon endpoint
-- returning HTTP 401 with that exact code and message, and this sprint's
-- own pg_policies audit (Etap 1 below) showing roles={public} on the new
-- policy. This is why five previously-passing tests in public.spec.ts
-- began failing after the migration — they are a correct symptom of a
-- real, live Production defect, not a test or environment problem.
--
-- Etap 1 of this sprint also found three other, structurally identical,
-- already-live policies with the same roles={public} gap (all created in
-- an earlier sprint, before this one): "Scheduled writer can insert
-- automated source_checks" (INSERT, source_checks), "Scheduled writer can
-- insert pending source_notice_candidates" (INSERT,
-- source_notice_candidates), and "Scheduled writer can select
-- source_notice_candidates" (SELECT, source_notice_candidates). anon
-- currently holds table-level SELECT/INSERT grants on both of those
-- tables too (a pre-existing Supabase default-grant pattern, RLS is the
-- actual gate — confirmed via has_table_privilege() in this sprint's
-- audit), so these are LATENT defects with the same root cause: they do
-- not currently break anything the running application does (the app
-- never issues anon requests against source_checks or
-- source_notice_candidates — those are admin-only surfaces reached only
-- through an authenticated session), but any direct anon REST call
-- against either table would hit the identical 42501 error today. This
-- migration corrects all four in one pass, since all four share the
-- exact same fix and the exact same reasoning.
--
-- ============================================================================
-- WHY "TO authenticated" IS THE CORRECT FIX (and not a GRANT)
-- ============================================================================
-- The scheduled writer only ever queries these tables through its own
-- authenticated Supabase session (see src/lib/scheduledWriter.ts) — it is
-- never, and was never intended to be, reachable via an anon session.
-- Explicitly scoping each of these four policies `to authenticated` means
-- Postgres will only ever evaluate their USING/WITH CHECK clauses (and
-- therefore only ever need automation_identities privilege) for
-- authenticated-role sessions. anon queries against alerts,
-- source_checks, and source_notice_candidates will simply no longer
-- consider these four policies at all — exactly as if they didn't exist,
-- from anon's point of view — which removes the permission-denied path
-- without changing what any authenticated session (admin or automation
-- writer) can do.
--
-- This is DELIBERATELY NOT a fix via `grant select on
-- public.automation_identities to anon` (the fix PostgREST's own error
-- hint suggests). That alternative would let every anonymous site visitor
-- read the automation_identities table directly — a real widening of a
-- table this project has locked down since its creation, exposing which
-- Supabase user IDs are authorized to act as the scheduled writer. This
-- migration is a NARROWING of role scope on four existing policies, not a
-- widening of any grant, table, or column, anywhere.
--
-- ============================================================================
-- WHAT THIS DELIBERATELY DOES NOT TOUCH
-- ============================================================================
--   - automation_identities — no column, grant, or policy on this table is
--     touched. Its own existing SELECT policy (auth.uid() = user_id) and
--     its zero grant to anon are both left exactly as they are.
--   - "Public can read published alerts" (anon, on alerts) — untouched.
--   - The four admin policies on alerts, and the admin_profiles-based
--     policies on source_checks/source_notice_candidates — untouched;
--     they use a different membership check (admin_profiles, not
--     automation_identities) and are out of this hotfix's scope.
--   - No table, column, function, or trigger is created, dropped, or
--     altered. No RLS is disabled. No GRANT or REVOKE statement appears
--     anywhere in this file.
--   - No data is read, written, or deleted — this file only changes the
--     `to <role>` clause each policy is scoped to; the USING/WITH CHECK
--     condition text itself is reproduced identically, unchanged.
--
-- ATOMICITY: the whole file runs as one transaction — no reader ever
-- observes a partially-corrected state.
-- ============================================================================


begin;


-- ============================================================================
-- SECTION 1 — public.alerts: re-scope the SELECT policy to authenticated.
-- This is the ACTIVE Production defect: anon's own read of published
-- alerts currently fails because of this policy's missing role scope.
-- ============================================================================

drop policy if exists "Scheduled writer can select alerts for deduplication" on public.alerts;

create policy "Scheduled writer can select alerts for deduplication"
  on public.alerts for select
  to authenticated
  using (
    exists (
      select 1 from public.automation_identities
      where automation_identities.user_id = auth.uid()
    )
  );


-- ============================================================================
-- SECTION 2 — public.source_checks: re-scope the INSERT policy to
-- authenticated. Latent (not currently reachable by the running app), but
-- structurally identical — corrected in the same pass.
-- ============================================================================

drop policy if exists "Scheduled writer can insert automated source_checks" on public.source_checks;

create policy "Scheduled writer can insert automated source_checks"
  on public.source_checks for insert
  to authenticated
  with check (
    (exists (
      select 1 from public.automation_identities
      where automation_identities.user_id = auth.uid()
    ))
    and (result = any (array['no_changes'::text, 'found_notice'::text]))
    and (related_alert_id is null)
    and (created_by = auth.uid())
  );


-- ============================================================================
-- SECTION 3 — public.source_notice_candidates: re-scope both scheduled
-- writer policies (INSERT and SELECT) to authenticated. Latent, same
-- reasoning as Section 2.
-- ============================================================================

drop policy if exists "Scheduled writer can insert pending source_notice_candidates" on public.source_notice_candidates;

create policy "Scheduled writer can insert pending source_notice_candidates"
  on public.source_notice_candidates for insert
  to authenticated
  with check (
    (exists (
      select 1 from public.automation_identities
      where automation_identities.user_id = auth.uid()
    ))
    and (status = 'pending'::text)
    and (verification_status = 'unverified'::text)
    and (confidence_score is null)
    and (risk_level is null)
    and (verification_notes is null)
    and (checked_at is null)
    and (duplicate_of_alert_id is null)
    and (converted_alert_id is null)
    and (ai_draft_json is null)
  );

drop policy if exists "Scheduled writer can select source_notice_candidates" on public.source_notice_candidates;

create policy "Scheduled writer can select source_notice_candidates"
  on public.source_notice_candidates for select
  to authenticated
  using (
    exists (
      select 1 from public.automation_identities
      where automation_identities.user_id = auth.uid()
    )
  );


-- ============================================================================
-- SECTION 4 — explicit statement: no other policy, table, grant, or
-- automation_identities row is touched by this transaction.
-- ============================================================================
-- Four policies are dropped and immediately recreated, identical in every
-- respect except the added `to authenticated` clause. No GRANT or REVOKE
-- statement appears in this file. automation_identities' own two columns,
-- its own SELECT policy, and its zero grant to anon are all unchanged.


commit;


-- ============================================================================
-- POST-APPLY VERIFICATION (do this before considering the hotfix done)
-- ============================================================================
-- Run docs/sql/VERIFY_SPRINT_177_SCHEDULED_WRITER_POLICY_ROLE_SCOPE_READ_ONLY_V1.sql
-- and compare its output against the expected-state checklist in that
-- file's own header. Then, in the same sitting:
--   1. Re-run the same raw anon REST call used to diagnose the incident
--      (GET .../rest/v1/alerts?select=id,status&status=eq.published) and
--      confirm it now returns HTTP 200, not 401.
--   2. Confirm the public homepage and /alerty render real alert data
--      again (not the "Nie udało się połączyć z serwerem" error state).
--   3. Confirm an ordinary admin session still has full alerts access
--      exactly as before (Kreator, /admin/queue — no visible change).
--   4. Only after all three are confirmed, consider Sprint 177's public
--      alerts read incident closed.
-- ============================================================================
