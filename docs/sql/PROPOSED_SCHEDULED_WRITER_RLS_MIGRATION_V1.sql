-- ============================================================================
-- PROPOSED MIGRATION — DO NOT RUN WITHOUT EXPLICIT APPROVAL
-- ============================================================================
-- Sprint 145 — Least-Privilege RLS Migration Package v1.
--
-- This is a PROPOSAL only. It has NOT been executed. It is NOT placed in
-- any auto-applied Supabase migrations directory (this repo has none —
-- every schema/RLS change lives in docs/*.sql as a reviewed artifact,
-- run manually by Adam in the Supabase SQL Editor, per project
-- convention). Do not run this until Adam has explicitly approved every
-- item in the approval gate documented in
-- docs/SCHEDULED_WRITER_RLS_DEPLOYMENT_RUNBOOK_V1.md.
--
-- WHAT THIS DOES, IN ONE SENTENCE: replaces the broad
-- "any authenticated session" write policies on source_checks and
-- source_notice_candidates with explicit, role-aware policies — one set
-- for admins (reusing the exact, already-proven-live admin_profiles
-- membership check that already gates `alerts`), and one narrow set for
-- a future scheduled writer (via a brand-new, separate membership table,
-- automation_identities) that can never reach `alerts`, `alert_sources`,
-- or any candidate field a human/verifier owns.
--
-- WHAT THIS DELIBERATELY DOES NOT TOUCH:
--   - `alerts` — its policies (admin_profiles-based) are untouched.
--   - `admin_profiles` — untouched. The scheduled writer is never added
--     to it, and never could be added to it by this migration (it
--     contains no INSERT policy for anyone but the table owner).
--   - `alert_sources` — its admin policies are untouched. Its separate,
--     undocumented live public anon SELECT policy is a SEPARATE finding
--     with its own, separate, not-bundled proposal:
--     docs/sql/PROPOSED_ALERT_SOURCES_PUBLIC_READ_CLEANUP_V1.sql.
--
-- EVIDENCE BASIS — every policy name below is the EXACT, verified live
-- policy name from the Sprint 144 live-audit inspection (pasted pg_policies
-- output, cross-checked against docs/supabase_source_checks.sql and
-- docs/sprint132_candidate_persistence_schema_proposal.sql — all three
-- sources agree character-for-character). No policy name here is guessed.
--
-- WHY REPLACE RATHER THAN ADD BESIDE (see
-- docs/SCHEDULED_WRITER_RLS_MIGRATION_PLAN_V1.md §1 for the full
-- explanation): PostgreSQL PERMISSIVE policies combine with OR. Adding a
-- narrow policy next to the existing broad
-- `auth.role() = 'authenticated'` policy would add a second way in, not
-- remove the first. The only way to actually restrict access is to
-- replace the broad policy itself (this file) or add a genuinely
-- RESTRICTIVE policy (evaluated and not chosen — see "F. Policy mode"
-- below).
--
-- ATOMICITY: the whole file runs as ONE transaction. Postgres DDL is
-- transactional — no other session can observe a partially-migrated
-- state (a policy dropped but its replacement not yet created); every
-- reader sees either the complete pre-migration state or the complete
-- post-migration state, never something in between. This is what makes
-- the DROP-then-CREATE ordering below safe rather than a lockout risk.
--
-- ADMIN LOCKOUT RISK: LOW, BY DESIGN. This migration does not introduce
-- any new identity check for the admin — it extends the EXACT,
-- already-proven-live `admin_profiles` membership check (today gating
-- `alerts`) to two more tables. The current admin's row in
-- `admin_profiles` already exists (proven by `alerts` already working)
-- and is untouched by this file. There is no `app_metadata`/JWT claim
-- involved anywhere in this design, so there is no session-refresh or
-- claim-staleness concern for the admin — `auth.uid()` is already
-- present in the admin's current, already-logged-in session token.
-- ============================================================================


begin;


-- ============================================================================
-- SECTION 1 — automation_identities: new, minimal membership table
-- ============================================================================
-- Modeled directly on admin_profiles' own proven-safe shape and bootstrap
-- pattern (docs/SCHEDULED_WRITER_RLS_MIGRATION_PLAN_V1.md, live-audit
-- follow-up): a bare membership table, no role column, populated ONLY by
-- direct SQL/dashboard action (never through the app's Data API — there
-- is deliberately no INSERT/UPDATE/DELETE policy below, mirroring
-- admin_profiles exactly). Being a SEPARATE table from admin_profiles is
-- the entire point: membership here means "may run the scheduled
-- source-check writer," nothing more — it is structurally impossible for
-- a row here to satisfy any `alerts` or `admin_profiles` policy, since
-- none of those policies reference this table.
--
-- Smallest viable schema, per the Sprint 145 brief's explicit preference
-- and matching admin_profiles' own two-column shape.
-- ON DELETE CASCADE (evaluated): if the underlying auth.users row for a
-- technical account is ever deleted (e.g. Adam fully removes a retired
-- automation identity from Supabase Auth), the membership row here
-- should not survive as an orphaned reference to a nonexistent user —
-- CASCADE is the correct, safe choice, not a data-loss risk (this table
-- carries no application data of its own, only a membership fact).

create table if not exists public.automation_identities (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.automation_identities is
  'Membership-only table for approved server-side automation identities '
  '(e.g. the future scheduled source-check writer). Deliberately separate '
  'from admin_profiles: membership here grants ONLY the narrow '
  'scheduled-writer policies below on source_checks/source_notice_candidates '
  '— it must never be treated as, or confused with, admin membership. '
  'Populated exclusively via direct SQL/dashboard action by a human '
  'operator; no application code path can insert, update, or delete a row '
  'here (see policies below).';


-- ============================================================================
-- SECTION 2 — automation_identities: RLS + explicit grants
-- ============================================================================
-- RLS alone is not assumed sufficient (per the Sprint 145 brief) — grants
-- are also explicitly narrowed, as defense in depth beyond what the other
-- four tables in this project currently do (which rely on Supabase's
-- default broad table-level grants plus RLS as the only gate). Since this
-- is a brand-new table with no existing behavior to preserve, the safer
-- baseline is set from the start rather than retrofitted later.

alter table public.automation_identities enable row level security;

drop policy if exists "Automation identities can read their own membership row" on public.automation_identities;

create policy "Automation identities can read their own membership row"
  on public.automation_identities for select
  using (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policy exists, and none is added — this table
-- can only ever be populated by a Postgres role that bypasses RLS
-- (the table owner, via the SQL Editor), never through the anon/
-- authenticated Data API roles, regardless of any future policy mistake
-- elsewhere, because of the explicit REVOKEs below.

revoke all on public.automation_identities from anon;
revoke insert, update, delete on public.automation_identities from authenticated;
grant select on public.automation_identities to authenticated;

-- Net effect: `anon` has zero grant of any kind (no SELECT, no write) —
-- stronger than every existing table in this project, none of which has
-- an explicit REVOKE from anon (they rely solely on the absence of an
-- anon-targeting policy). `authenticated` can only ever SELECT, and RLS
-- further restricts that SELECT to exactly one row (their own), if any.
-- No public listing of automation identities is possible under any
-- circumstance — not via a permissive policy (none exists for listing
-- all rows), and not via a grant (INSERT/UPDATE/DELETE are revoked
-- outright, independent of policies).


-- ============================================================================
-- SECTION 3 — source_notice_candidates: replace broad policy, add admin +
-- scheduled-writer policies
-- ============================================================================
-- Exact live/committed policy names being replaced (verified — see file
-- header): "Authenticated admins can select/insert/update/delete
-- source_notice_candidates". These currently read
-- `auth.role() = 'authenticated'` — true for ANY signed-in session, admin
-- or not, human or automated. Replaced below with an explicit
-- admin_profiles membership check (same shape as the live `alerts`
-- policies) plus a new, narrow, additive scheduled-writer policy.

drop policy if exists "Authenticated admins can select source_notice_candidates" on public.source_notice_candidates;
drop policy if exists "Authenticated admins can insert source_notice_candidates" on public.source_notice_candidates;
drop policy if exists "Authenticated admins can update source_notice_candidates" on public.source_notice_candidates;
drop policy if exists "Authenticated admins can delete source_notice_candidates" on public.source_notice_candidates;

-- ── Admin policies (full CRUD, unchanged capability, new mechanism) ──────────
-- Same admin_profiles EXISTS check already live and proven for `alerts` —
-- no new identity concept for the admin, only reused verbatim.

create policy "Admins can select source_notice_candidates"
  on public.source_notice_candidates for select
  using (
    exists (
      select 1 from public.admin_profiles
      where admin_profiles.user_id = auth.uid()
    )
  );

create policy "Admins can insert source_notice_candidates"
  on public.source_notice_candidates for insert
  with check (
    exists (
      select 1 from public.admin_profiles
      where admin_profiles.user_id = auth.uid()
    )
  );

create policy "Admins can update source_notice_candidates"
  on public.source_notice_candidates for update
  using (
    exists (
      select 1 from public.admin_profiles
      where admin_profiles.user_id = auth.uid()
    )
  );

create policy "Admins can delete source_notice_candidates"
  on public.source_notice_candidates for delete
  using (
    exists (
      select 1 from public.admin_profiles
      where admin_profiles.user_id = auth.uid()
    )
  );

-- ── Scheduled-writer policies (SELECT for dedup + narrowly-shaped INSERT
-- only — no UPDATE, no DELETE) ────────────────────────────────────────────
--
-- SELECT is included because a future writer replicating the existing
-- dedup heuristic (src/lib/candidateWarnings.ts's findSimilarText, the
-- same check the admin's browser already performs) needs its own read
-- access — the writer has no browser-loaded data to compare against.
-- This is forward-looking: no writer code exists yet in this repo (this
-- sprint adds no application code at all), but the policy is designed
-- now so the eventual writer module has what it needs without a second
-- migration.
--
-- INSERT's WITH CHECK is the core safety mechanism for this table. Every
-- column a human reviewer, the verifier, or the Builder-conversion flow
-- owns is forced to its safe/default value — not merely "unspecified,"
-- but explicitly required, so an INSERT statement cannot smuggle a
-- different value through for any of them. Columns constrained, and why
-- (exact column list verified against the live schema dump, Sprint 144):
--   status                = 'pending'   — the one allowed lifecycle state
--                                          for a writer-created row; every
--                                          later transition is human/
--                                          verifier-triggered exclusively.
--   verification_status   = 'unverified' — writer must never claim a
--                                          verification outcome for its
--                                          own candidate.
--   confidence_score       is null       — verifier-owned.
--   risk_level             is null       — verifier-owned.
--   verification_notes     is null       — verifier-owned commentary.
--   checked_at              is null      — verifier-owned timestamp.
--   duplicate_of_alert_id   is null      — human/verifier decision.
--   converted_alert_id      is null      — set only by Builder's draft-save
--                                          flow (markCandidateConverted),
--                                          never at creation time.
--   ai_draft_json           is null      — set only by the AI Helper/
--                                          Builder flow, never by this
--                                          writer.
-- Because the writer has NO update policy at all, these constraints are
-- not just a creation-time check — they are the *entire* lifetime
-- guarantee for these columns on any writer-created row: a row this
-- policy allowed to be inserted can never later be changed by this same
-- identity, only by an admin (via the admin policies above).

create policy "Scheduled writer can select source_notice_candidates"
  on public.source_notice_candidates for select
  using (
    exists (
      select 1 from public.automation_identities
      where automation_identities.user_id = auth.uid()
    )
  );

create policy "Scheduled writer can insert pending source_notice_candidates"
  on public.source_notice_candidates for insert
  with check (
    exists (
      select 1 from public.automation_identities
      where automation_identities.user_id = auth.uid()
    )
    and status = 'pending'
    and verification_status = 'unverified'
    and confidence_score is null
    and risk_level is null
    and verification_notes is null
    and checked_at is null
    and duplicate_of_alert_id is null
    and converted_alert_id is null
    and ai_draft_json is null
  );

-- No UPDATE, no DELETE policy for automation_identities members on this
-- table — deliberately absent, not merely unused. A future need to allow
-- the writer to, say, mark its own inserted row in some limited way
-- would require a new, explicitly-reviewed policy, not a broadening of
-- this one.


-- ============================================================================
-- SECTION 4 — source_checks: replace broad policy, add admin +
-- scheduled-writer policies
-- ============================================================================
-- Exact live/committed policy names being replaced (verified): "Authenticated
-- admins can select/insert/update/delete source_checks".

drop policy if exists "Authenticated admins can select source_checks" on public.source_checks;
drop policy if exists "Authenticated admins can insert source_checks" on public.source_checks;
drop policy if exists "Authenticated admins can update source_checks" on public.source_checks;
drop policy if exists "Authenticated admins can delete source_checks" on public.source_checks;

-- ── Admin policies (full CRUD, unchanged capability, new mechanism) ──────────

create policy "Admins can select source_checks"
  on public.source_checks for select
  using (
    exists (
      select 1 from public.admin_profiles
      where admin_profiles.user_id = auth.uid()
    )
  );

create policy "Admins can insert source_checks"
  on public.source_checks for insert
  with check (
    exists (
      select 1 from public.admin_profiles
      where admin_profiles.user_id = auth.uid()
    )
  );

create policy "Admins can update source_checks"
  on public.source_checks for update
  using (
    exists (
      select 1 from public.admin_profiles
      where admin_profiles.user_id = auth.uid()
    )
  );

create policy "Admins can delete source_checks"
  on public.source_checks for delete
  using (
    exists (
      select 1 from public.admin_profiles
      where admin_profiles.user_id = auth.uid()
    )
  );

-- ── Scheduled-writer policy (INSERT only — no SELECT, no UPDATE, no
-- DELETE) ─────────────────────────────────────────────────────────────────
--
-- SELECT deliberately OMITTED: unlike source_notice_candidates, no
-- current or planned writer logic needs to read check history to decide
-- its own behavior — the writer can always append a new check row
-- regardless of what came before (§5/§9 of
-- docs/SCHEDULED_WRITER_RLS_MIGRATION_PLAN_V1.md already reached this
-- conclusion; this migration keeps to it rather than granting an unused
-- permission "just in case").
--
-- WITH CHECK constraints (exact columns verified against the live schema
-- dump, Sprint 144):
--   result           in ('no_changes', 'found_notice') — the only two
--                     outcomes an automated check can honestly claim
--                     (matches suggestCheckResult() in
--                     src/lib/sourceCheck.ts, which never returns
--                     'alert_created' or 'needs_followup' — both are
--                     inherently human-judgment outcomes: "I turned this
--                     into an alert" / "this needs a human to look again
--                     later" are not decisions a fetch-and-parse routine
--                     can make).
--   related_alert_id is null — this writer never creates or knows about
--                     an alert relationship; only a human logging a check
--                     that led to a real alert would set this.
--   created_by       = auth.uid() — self-attribution. The check-history
--                     row is honestly attributed to the automation
--                     identity that created it, the same way a human
--                     admin's checks are implicitly attributable to their
--                     own auth.uid() today (the column already exists and
--                     already references auth.users(id); this simply
--                     requires it be truthfully set rather than left
--                     null for writer-created rows).

create policy "Scheduled writer can insert automated source_checks"
  on public.source_checks for insert
  with check (
    exists (
      select 1 from public.automation_identities
      where automation_identities.user_id = auth.uid()
    )
    and result in ('no_changes', 'found_notice')
    and related_alert_id is null
    and created_by = auth.uid()
  );


-- ============================================================================
-- SECTION 5 — explicit statement: alerts and alert_sources are untouched
-- ============================================================================
-- No statement in this file references `public.alerts` or
-- `public.alert_sources` at all. This is not an oversight — it is the
-- point. The scheduled writer receives ZERO access to `alerts` under this
-- migration: no policy anywhere in this file grants it, and no existing
-- `alerts` policy references `automation_identities`, so there is no path
-- — direct or indirect — by which membership in `automation_identities`
-- could ever satisfy an `alerts` policy. `alert_sources`'s own,
-- unrelated live-public-read finding is handled separately in
-- docs/sql/PROPOSED_ALERT_SOURCES_PUBLIC_READ_CLEANUP_V1.sql — not this
-- file, and not this transaction.


commit;


-- ============================================================================
-- POST-APPLY VERIFICATION (do this before considering the migration done)
-- ============================================================================
-- Run docs/sql/VERIFY_SCHEDULED_WRITER_RLS_READ_ONLY_V1.sql and compare its
-- output against docs/SCHEDULED_WRITER_RLS_DEPLOYMENT_RUNBOOK_V1.md's
-- expected-state checklist. Then execute every admin allowed-operation
-- test in that runbook, in the same sitting, before ending the session.
-- ============================================================================
