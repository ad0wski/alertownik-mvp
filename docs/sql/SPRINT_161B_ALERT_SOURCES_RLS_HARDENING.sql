-- ============================================================================
-- PROPOSED MIGRATION — DO NOT RUN WITHOUT EXPLICIT APPROVAL
-- ============================================================================
-- Sprint 161B — Admin Authorization and alert_sources RLS Closure.
--
-- This is a PROPOSAL only. It has NOT been executed against the live
-- Supabase project. It is NOT placed in any auto-applied migrations
-- directory (this repo has none — every schema/RLS change lives in
-- docs/sql/*.sql as a reviewed artifact, run manually by Adam in the
-- Supabase SQL Editor, per project convention). Claude did not, and will
-- not, run this file.
--
-- WHAT THIS DOES, IN ONE SENTENCE: replaces `alert_sources`'s four admin
-- policies — which today only check `auth.role() = 'authenticated'`, true
-- for ANY signed-in Supabase Auth account, admin or not — with the exact
-- same `admin_profiles` membership check already live and proven for
-- `alerts`, `source_checks`, and `source_notice_candidates`.
--
-- FINDING THIS CLOSES: manual read-only verification (per
-- docs/SUPABASE_RLS_SECURITY_VERIFICATION_V1.md) confirmed `alerts`,
-- `source_checks`, and `source_notice_candidates` all correctly gate admin
-- writes via `EXISTS (... admin_profiles ...)`, but `alert_sources` was
-- never migrated to that mechanism — it still carries its original Sprint
-- 42 policies (`docs/supabase_sources_schema.sql`), which only check
-- `auth.role() = 'authenticated'`. Since this project has more than one
-- Supabase Auth account, "authenticated" is not the same claim as
-- "administrator" — any signed-in account, not only the intended admin,
-- can currently read and write the entire source registry.
--
-- WHAT THIS DELIBERATELY DOES NOT TOUCH:
--   - `alerts`, `source_checks`, `source_notice_candidates` — untouched.
--     Sprint 161B's brief was explicit: this file does not go near them.
--   - `admin_profiles` — untouched. No new admin is added, none removed.
--   - `alert_sources`'s separate, previously-flagged live anon SELECT
--     policy ("Public can read alert sources") — that is a SEPARATE,
--     already-proposed, not-bundled finding with its own file:
--     docs/sql/PROPOSED_ALERT_SOURCES_PUBLIC_READ_CLEANUP_V1.sql. This
--     migration does not create, drop, or reference any anon-targeting
--     policy on `alert_sources` at all — whether that live policy still
--     exists or was already removed is orthogonal to this file and is not
--     re-verified here. If it's still live, apply the cleanup file
--     separately; if you're unsure, run
--     docs/sql/VERIFY_SPRINT_161B_RLS_READ_ONLY.sql (below) first, which
--     lists every policy on `alert_sources`, anon-targeting or not.
--
-- SCHEDULED WRITER IMPACT: NONE. `src/lib/scheduledWriter.ts:332-346`
-- states, in the application code itself, that the scheduled writer has
-- "ZERO access to alert_sources ... not even SELECT" by deliberate design
-- (Sprint 146) — it resolves a source's registry id from a human-maintained
-- environment variable (`SCHEDULED_WRITER_SOURCE_REGISTRY_IDS`) instead of
-- querying the table. This migration grants `automation_identities`
-- members nothing at all on `alert_sources` — no SELECT, no INSERT, no
-- UPDATE, no DELETE — matching that existing, already-shipped design
-- exactly. No new policy for `automation_identities` appears anywhere in
-- this file.
--
-- EVIDENCE BASIS — the four policy names dropped below are the exact,
-- verified names from the original schema file
-- (docs/supabase_sources_schema.sql:96-110), which is also the only
-- committed source that ever created them. No policy name here is guessed.
--
-- WHY REPLACE RATHER THAN ADD BESIDE: PostgreSQL PERMISSIVE policies
-- combine with OR. Adding a narrow `admin_profiles`-based policy next to
-- the existing broad `auth.role() = 'authenticated'` policy would add a
-- second way in, not remove the first — any signed-in account would still
-- pass via the old policy. The only way to actually restrict access is to
-- replace the broad policy itself (this file).
--
-- ATOMICITY: the whole file runs as ONE transaction. Postgres DDL is
-- transactional — no other session can observe a partially-migrated state
-- (a policy dropped but its replacement not yet created); every reader
-- sees either the complete pre-migration state or the complete
-- post-migration state, never something in between.
--
-- ADMIN LOCKOUT RISK: LOW, BY DESIGN. This migration does not introduce
-- any new identity check for the admin — it extends the EXACT,
-- already-proven-live `admin_profiles` membership check (today gating
-- `alerts`, `source_checks`, `source_notice_candidates`) to
-- `alert_sources` too. The current admin's row in `admin_profiles` already
-- exists (proven by those three tables already working) and is untouched
-- by this file.
-- ============================================================================


begin;


-- ============================================================================
-- alert_sources — replace the four "any authenticated session" policies
-- ============================================================================
-- Exact live/committed policy names being replaced (verified against
-- docs/supabase_sources_schema.sql:96-110 — the only file that ever
-- created them):
--   "Authenticated admins can select sources"
--   "Authenticated admins can insert sources"
--   "Authenticated admins can update sources"
--   "Authenticated admins can delete sources"
-- These currently read `auth.role() = 'authenticated'` — true for ANY
-- signed-in session, admin or not. Replaced below with the same
-- admin_profiles EXISTS check already live and proven for `alerts`.

drop policy if exists "Authenticated admins can select sources" on public.alert_sources;
drop policy if exists "Authenticated admins can insert sources" on public.alert_sources;
drop policy if exists "Authenticated admins can update sources" on public.alert_sources;
drop policy if exists "Authenticated admins can delete sources" on public.alert_sources;

-- ── Admin policies (full CRUD, unchanged capability, new mechanism) ──────────
-- Same admin_profiles EXISTS check already live and proven for `alerts`,
-- `source_checks`, and `source_notice_candidates` — no new identity
-- concept for the admin, only reused verbatim.

create policy "Admins can select alert sources"
  on public.alert_sources for select
  using (
    exists (
      select 1 from public.admin_profiles
      where admin_profiles.user_id = auth.uid()
    )
  );

create policy "Admins can insert alert sources"
  on public.alert_sources for insert
  with check (
    exists (
      select 1 from public.admin_profiles
      where admin_profiles.user_id = auth.uid()
    )
  );

create policy "Admins can update alert sources"
  on public.alert_sources for update
  using (
    exists (
      select 1 from public.admin_profiles
      where admin_profiles.user_id = auth.uid()
    )
  );

create policy "Admins can delete alert sources"
  on public.alert_sources for delete
  using (
    exists (
      select 1 from public.admin_profiles
      where admin_profiles.user_id = auth.uid()
    )
  );

-- No policy for `automation_identities` is created here — intentional, see
-- "SCHEDULED WRITER IMPACT" above. No policy for `anon` is created,
-- dropped, or modified here — see "WHAT THIS DELIBERATELY DOES NOT TOUCH"
-- above regarding the separate, already-proposed anon-read cleanup file.


commit;


-- ============================================================================
-- ROLLBACK (restores the exact four removed policies, byte-for-byte)
-- ============================================================================
-- Run this separately, manually, only if the admin_profiles-based policies
-- above turn out to lock out the admin (e.g. the admin's own
-- admin_profiles row is missing or was never created — verify this FIRST
-- with docs/sql/VERIFY_SPRINT_161B_RLS_READ_ONLY.sql before rolling back,
-- since the same admin_profiles row already gates alerts/source_checks/
-- source_notice_candidates and is proven to exist if those work today).
--
-- begin;
--
-- drop policy if exists "Admins can select alert sources" on public.alert_sources;
-- drop policy if exists "Admins can insert alert sources" on public.alert_sources;
-- drop policy if exists "Admins can update alert sources" on public.alert_sources;
-- drop policy if exists "Admins can delete alert sources" on public.alert_sources;
--
-- create policy "Authenticated admins can select sources"
--   on public.alert_sources for select
--   using (auth.role() = 'authenticated');
--
-- create policy "Authenticated admins can insert sources"
--   on public.alert_sources for insert
--   with check (auth.role() = 'authenticated');
--
-- create policy "Authenticated admins can update sources"
--   on public.alert_sources for update
--   using (auth.role() = 'authenticated');
--
-- create policy "Authenticated admins can delete sources"
--   on public.alert_sources for delete
--   using (auth.role() = 'authenticated');
--
-- commit;
-- ============================================================================


-- ============================================================================
-- POST-APPLY VERIFICATION (do this before considering the migration done)
-- ============================================================================
-- Run docs/sql/VERIFY_SPRINT_161B_RLS_READ_ONLY.sql and confirm:
--   1. `alert_sources` shows exactly four policies with the new names
--      above ("Admins can select/insert/update/delete alert sources"),
--      each with an admin_profiles-referencing using/with_check
--      expression — the old "Authenticated admins can ..." names are
--      absent.
--   2. relrowsecurity is true for alert_sources (unchanged by this file,
--      but worth reconfirming).
--   3. Log in to /admin/sources as the actual admin and confirm the page
--      still loads, lists sources, and that create/edit/delete still work
--      exactly as before (the admin's admin_profiles row already exists,
--      proven by alerts/source_checks already depending on it — this
--      migration reuses that same row, it does not require a new one).
--   4. If a second, non-admin Supabase Auth account exists, confirm it can
--      no longer read or write alert_sources via the Data API (this is
--      the actual finding this migration closes).
-- ============================================================================
