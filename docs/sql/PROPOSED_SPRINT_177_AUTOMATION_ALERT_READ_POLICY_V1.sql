-- ============================================================================
-- ALREADY EXECUTED ON PRODUCTION — SEE CORRECTIVE HOTFIX, DO NOT RE-RUN
-- ============================================================================
-- Sprint 177F-E POST-INCIDENT NOTE (2026-07-27): the CREATE POLICY
-- statement below was executed on Production exactly once, manually, in
-- Sprint 177F, EXACTLY AS WRITTEN in this file at that time — i.e.
-- WITHOUT a `to authenticated` clause. That omission caused a real,
-- confirmed Production incident: because the policy had no role scope it
-- applied to `public` (every role, including anon), and evaluating its
-- automation_identities EXISTS clause for anon requests requires
-- table-level privilege anon deliberately does not have on
-- automation_identities — so every anonymous read of public.alerts
-- (including the public homepage) began failing with `42501 permission
-- denied for table automation_identities`. This was NOT a hypothetical;
-- it was reproduced live via browser console, a raw anon REST call
-- returning HTTP 401, and a pg_policies audit confirming roles={public}.
--
-- This file has since been edited (see the `to authenticated` clause now
-- present below) so that its text reflects what SHOULD have been run.
-- That edit is retroactive and cosmetic only — it does NOT change
-- anything on Production by itself. This file is not re-run. The actual
-- fix that must be applied to Production is the separate corrective
-- migration:
--   docs/sql/CORRECTIVE_SPRINT_177_SCHEDULED_WRITER_POLICY_ROLE_SCOPE_V1.sql
-- which drops and recreates the live policy scoped `to authenticated`,
-- along with three other structurally identical pre-existing policies
-- found to share the same gap. Do not re-run this file on Production —
-- it would be redundant (the policy already exists) and does not, by
-- itself, correct the role-scope defect; only the corrective hotfix file
-- above does that.
-- ============================================================================


-- ============================================================================
-- HISTORICAL PROPOSAL TEXT (Sprint 177E) — ALREADY EXECUTED, SEE NOTE ABOVE
-- ============================================================================
-- Sprint 177E — Automation Alert Read Policy v1.
--
-- NOTE: despite the wording below (written before this file was executed
-- on Production, in Sprint 177F), this proposal HAS since been run —
-- see the post-incident note at the top of this file. It is left largely
-- intact for historical accuracy: this is what was reviewed and approved
-- at the time, aside from the retroactive `to authenticated` addition to
-- the CREATE POLICY statement itself and this note. It is NOT placed in
-- any auto-applied Supabase migrations directory (this repo has none —
-- every schema/RLS change lives in docs/sql/*.sql as a reviewed artifact,
-- run manually by Adam in the Supabase SQL Editor, per project
-- convention). NOT to be run on Production without Adam's explicit
-- approval in a future, separate sprint.
--
-- WHAT THIS DOES, IN ONE SENTENCE: grants the scheduled-writer identity
-- (any auth.uid() present in public.automation_identities — the exact
-- same membership check already proven live for source_notice_candidates
-- and source_checks, see docs/sql/PROPOSED_SCHEDULED_WRITER_RLS_
-- MIGRATION_V1.sql §3) a single, additive, SELECT-only policy on
-- public.alerts, so the writer's own authenticated session can read
-- draft/published/archived alerts for candidate-deduplication purposes
-- — closing the gap Sprint 177D's anon-client workaround only partly
-- closed (published-only).
--
-- WHY THIS WAS NEEDED (evidence, verified live against Production in
-- Sprint 177D via `select policyname, roles, cmd, qual from pg_policies
-- where tablename = 'alerts'`): exactly five policies exist today —
-- "Admins can select/insert/update/delete alerts" (role authenticated,
-- gated by admin_profiles membership) and "Public can read published
-- alerts" (role anon only, status='published'). None reference
-- automation_identities. The scheduled writer's own authenticated
-- session satisfies neither: it is not an admin_profiles member (by
-- design — Sprint 146 deliberately never adds it there), and "Public can
-- read published alerts" is scoped `TO anon` specifically, which an
-- authenticated PostgREST session never satisfies regardless of content.
-- Sprint 177D's workaround (a second, unauthenticated anon-key client)
-- proved the writer could safely read PUBLISHED alerts without any
-- migration — but draft and archived alerts remain genuinely unreachable
-- that way, since both require admin_profiles membership under the
-- existing policies. This migration closes that remaining gap directly,
-- narrowly, for the writer's own session only.
--
-- WHAT THIS DELIBERATELY DOES NOT TOUCH:
--   - The four existing admin policies on `alerts` — untouched, not
--     dropped, not replaced. Ordinary admins keep exactly the access
--     they have today, no more, no less.
--   - "Public can read published alerts" (anon) — untouched. Anonymous
--     site visitors still see nothing beyond published alerts; this
--     migration does not touch, widen, or duplicate that policy.
--   - `automation_identities` itself — untouched. No new column (no
--     "role"/"purpose"/"active" field is added or required — see NOTE
--     below on why).
--   - `alert_sources`, `source_notice_candidates`, `source_checks` —
--     untouched by this file.
--   - INSERT, UPDATE, DELETE on `alerts` — this migration adds a SELECT
--     policy only. No new way to create, edit, or delete an alert is
--     introduced for any identity, automation or otherwise.
--
-- NOTE ON "active"/"role"/"purpose" (Sprint 177E audit finding):
-- public.automation_identities currently has exactly two columns,
-- `user_id` and `created_at` — no role/purpose/active flag exists today,
-- and this migration does not add one. Membership in the table IS the
-- entire signal: a row present means "this uid is an approved automation
-- identity", a row absent (or deleted) means it is not — there is
-- currently only one kind of automation identity in this schema (the
-- scheduled writer), so no role/purpose distinction is needed to
-- disambiguate. If a second, differently-scoped automation identity is
-- ever introduced, that would be a separate, later migration adding a
-- real column this policy could then also check — not something to
-- guess at or invent here.
--
-- ADMIN LOCKOUT RISK: NONE. This migration is purely additive — it does
-- not touch, replace, or drop any existing policy on `alerts`. Every
-- admin-facing behavior (Kreator, /admin/queue, publish/archive/edit) is
-- governed entirely by the four untouched admin policies and is
-- unaffected by this file in every respect.
--
-- ATOMICITY: the whole file runs as one transaction (Postgres DDL is
-- transactional) — no reader ever observes a partially-applied state.
-- ============================================================================


begin;


-- ============================================================================
-- SECTION 1 — alerts: ADD ONE new SELECT policy for the scheduled writer.
-- Every existing policy on this table (four admin policies + the public
-- anon "published only" policy) is listed here for context ONLY — none
-- of them is dropped, replaced, or altered by this file.
-- ============================================================================

-- CORRECTED (Sprint 177F-E, retroactive): the version actually executed
-- on Production in Sprint 177F had no `to authenticated` clause here —
-- that omission is the confirmed cause of the anon-read incident
-- described in the note at the top of this file. `to authenticated` is
-- added below to reflect what should have been run; this file itself is
-- not re-run — docs/sql/CORRECTIVE_SPRINT_177_SCHEDULED_WRITER_POLICY_
-- ROLE_SCOPE_V1.sql is the actual fix applied to Production.

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

-- No INSERT, UPDATE, or DELETE policy is added here, or anywhere in this
-- file, for automation_identities members on `alerts` — deliberately
-- absent, not merely unused. The scheduled writer remains structurally
-- unable to create, edit, publish, archive, or delete an alert; this
-- migration's entire effect is "the writer's own session may now read
-- alerts rows", nothing more.


-- ============================================================================
-- SECTION 2 — explicit statement: no other table or policy is touched.
-- ============================================================================
-- This file references exactly one table (`public.alerts`) and creates
-- exactly one policy. `automation_identities`, `alert_sources`,
-- `source_notice_candidates`, `source_checks`, and `admin_profiles` are
-- read (via the EXISTS subquery, an ordinary SELECT the writer's own
-- automation_identities policy already permits — see docs/sql/PROPOSED_
-- SCHEDULED_WRITER_RLS_MIGRATION_V1.sql §2) but none of their own
-- policies is created, dropped, or modified by this transaction. There
-- is no recursion risk: automation_identities' own SELECT policy checks
-- only `auth.uid() = user_id` — it never references `alerts` — so the
-- EXISTS subquery above cannot form a policy evaluation cycle.


commit;


-- ============================================================================
-- POST-APPLY VERIFICATION (do this before considering the migration done)
-- ============================================================================
-- Run docs/sql/VERIFY_SPRINT_177_AUTOMATION_ALERT_READ_POLICY_READ_ONLY_V1.sql
-- and compare its output against the expected-state checklist in that
-- file's own header. Then, in the same sitting:
--   1. Confirm an ordinary admin session still has full alerts access
--      exactly as before (Kreator, /admin/queue — no visible change).
--   2. Confirm the public site's alert list is unchanged (still only
--      published alerts, exactly as before).
--   3. Only after both are confirmed, proceed to updating the scheduled
--      writer's own code to use its authenticated session for this read
--      instead of the Sprint 177D anon-client workaround — a separate,
--      already-prepared code change (see src/lib/scheduledWriter.ts),
--      not part of this SQL file.
-- ============================================================================
