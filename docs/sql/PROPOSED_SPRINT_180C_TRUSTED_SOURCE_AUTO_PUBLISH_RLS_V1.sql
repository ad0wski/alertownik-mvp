-- ============================================================================
-- NOT YET APPLIED — REQUIRES ADAM'S EXPLICIT MANUAL EXECUTION
-- ============================================================================
-- Sprint 180C — Trusted Source Auto-Publish RLS v1.
--
-- WHAT THIS DOES, IN ONE SENTENCE: grants the scheduled-writer identity
-- (public.automation_identities membership — the exact same signal already
-- proven live for source_notice_candidates/source_checks reads/writes and
-- alerts reads, see docs/sql/PROPOSED_SCHEDULED_WRITER_RLS_MIGRATION_V1.sql
-- and docs/sql/PROPOSED_SPRINT_177_AUTOMATION_ALERT_READ_POLICY_V1.sql)
-- exactly two new, narrowly-scoped write policies: INSERT on public.alerts
-- (published rows only, WITH CHECK-enforced) and UPDATE on
-- public.source_notice_candidates (pending → published transition only),
-- so the Sprint 180C trusted-source auto-publish code path
-- (src/lib/trustedSourceAutoPublish.ts) can actually write, instead of
-- failing every attempt with 42501.
--
-- WHY THIS IS NEEDED (verified live against Production, 2026-07-29, via
-- `select policyname, roles, cmd, with_check from pg_policies where
-- tablename in ('alerts','source_notice_candidates')`): the writer
-- identity has a SELECT-only policy on `alerts` (Sprint 177E) and
-- INSERT+SELECT-only policies on `source_notice_candidates` (Sprint 146).
-- There is NO INSERT/UPDATE grant on `alerts` and NO UPDATE grant on
-- `source_notice_candidates` for automation_identities members anywhere —
-- confirmed by a full pg_policies read, not assumed. Without this
-- migration, every attempted auto-publish write fails closed at the
-- database with `42501 permission denied`, regardless of any application
-- code or environment flag — this is the actual, structural gate, not
-- merely an application-level kill switch.
--
-- WHAT THIS DELIBERATELY DOES NOT TOUCH:
--   - `anon`/`public` roles — untouched. Neither policy below is ever
--     scoped to anything but `to authenticated`, and both additionally
--     require automation_identities membership, which anon can never
--     satisfy (no anon SELECT grant on automation_identities exists or is
--     added here). Public read access to alerts (`status = 'published'`
--     only) is completely unchanged.
--   - The four existing admin policies on `alerts` and the four existing
--     admin policies on `source_notice_candidates` — untouched, not
--     dropped, not replaced. Ordinary admin behavior (Kreator,
--     /admin/queue) is unaffected.
--   - The existing "Scheduled writer can select alerts for deduplication"
--     policy (SELECT) and the existing "Scheduled writer can insert
--     pending source_notice_candidates" / "...can select
--     source_notice_candidates" policies — untouched.
--   - DELETE on either table — not granted to the writer identity by this
--     or any prior migration.
--   - `automation_identities`, `alert_sources`, `source_checks` — not
--     referenced or modified by this file.
--
-- SAFETY MODEL — WITH CHECK is the actual enforcement, not application
-- code alone (defense in depth, matching this project's existing
-- convention for the candidates INSERT policy):
--   Policy 1 (alerts, INSERT) forces every writer-inserted row to already
--   be in its final, complete, published state — status='published',
--   published_at set, and every field a real public alert needs
--   (title/place/change/action/source_url) non-null and non-empty. There
--   is no way to insert a draft, an incomplete row, or a row missing its
--   source link through this policy — it is impossible in the same way
--   the existing candidates INSERT policy makes it impossible to insert a
--   candidate with a non-default status or a pre-filled verification
--   field.
--
--   Policy 2 (source_notice_candidates, UPDATE) only allows a transition
--   FROM a still-pending, still-unconverted row (USING clause) TO a
--   published, now-linked row (WITH CHECK clause) — it structurally
--   cannot be used to edit an already-converted candidate a second time,
--   to revert a published candidate back to pending, or to touch any
--   candidate an admin or a different flow has already claimed.
--
-- COLUMN-LEVEL CAVEAT (documented, not hidden): Postgres RLS policies
-- constrain which ROWS and which resulting VALUES are allowed, not which
-- COLUMNS a statement may reference — WITH CHECK cannot by itself prevent
-- the application code from also setting some other column in the same
-- UPDATE/INSERT, as long as the row's final state still satisfies the
-- clause. The actual "only status/converted_alert_id ever change on
-- update" guarantee comes from the application code
-- (src/lib/trustedSourceAutoPublish.ts, which is the only caller that
-- ever constructs this specific UPDATE and is itself covered by this
-- sprint's own test suite) — this migration is the database-level
-- backstop confirming the row ends up in a valid state, not a
-- column-level lock Postgres RLS cannot express here.
--
-- ADMIN LOCKOUT RISK: NONE. Both policies are purely additive — neither
-- touches, replaces, or drops any existing policy on either table. Every
-- admin-facing behavior is governed entirely by the untouched admin
-- policies and is unaffected by this file.
--
-- ROLLBACK: the application-level kill switch (SCHEDULED_AUTO_PUBLISH_
-- ENABLED=false) is the fast, code-free rollback for auto-publish
-- BEHAVIOR and requires no SQL. If the GRANTS themselves ever need to be
-- revoked (not merely disabled), the two `drop policy` statements at the
-- bottom of this file (commented out, for reference) reverse this
-- migration precisely, with zero impact on any other policy.
--
-- ATOMICITY: the whole file runs as one transaction (Postgres DDL is
-- transactional) — no reader ever observes a partially-applied state.
-- ============================================================================


begin;


-- ============================================================================
-- SECTION 1 — alerts: ADD ONE new INSERT policy for the scheduled writer.
-- ============================================================================

create policy "Scheduled writer can insert trusted-source auto-published alerts"
  on public.alerts for insert
  to authenticated
  with check (
    exists (
      select 1 from public.automation_identities
      where automation_identities.user_id = auth.uid()
    )
    and status = 'published'
    and published_at is not null
    and title is not null and length(trim(title)) > 0
    and place is not null and length(trim(place)) > 0
    and change is not null and length(trim(change)) > 0
    and action is not null and length(trim(action)) > 0
    and source_url is not null and length(trim(source_url)) > 0
    and source_name is not null and length(trim(source_name)) > 0
  );

-- No UPDATE or DELETE policy on `alerts` is added here, or anywhere in
-- this file, for automation_identities members — deliberately absent, not
-- merely unused. The writer can create exactly one new kind of row
-- (a complete, already-published alert) and can never edit or delete any
-- alert afterward, including the one it just created.


-- ============================================================================
-- SECTION 2 — source_notice_candidates: ADD ONE new UPDATE policy, scoped
-- to exactly the pending → published conversion.
-- ============================================================================

create policy "Scheduled writer can mark own pending candidate as auto-published"
  on public.source_notice_candidates for update
  to authenticated
  using (
    exists (
      select 1 from public.automation_identities
      where automation_identities.user_id = auth.uid()
    )
    and status = 'pending'
    and converted_alert_id is null
  )
  with check (
    exists (
      select 1 from public.automation_identities
      where automation_identities.user_id = auth.uid()
    )
    and status = 'published'
    and converted_alert_id is not null
  );


-- ============================================================================
-- SECTION 3 — explicit statement: no other table or policy is touched.
-- ============================================================================
-- This file references exactly two tables (`public.alerts` and
-- `public.source_notice_candidates`) and creates exactly two policies.
-- `automation_identities`, `alert_sources`, `source_checks`, and
-- `admin_profiles` are read (via the EXISTS subquery, an ordinary SELECT
-- the writer's own automation_identities policy already permits) but none
-- of their own policies is created, dropped, or modified by this
-- transaction.


commit;


-- ============================================================================
-- REVERSAL (reference only — NOT run as part of applying this migration)
-- ============================================================================
-- drop policy if exists "Scheduled writer can insert trusted-source auto-published alerts" on public.alerts;
-- drop policy if exists "Scheduled writer can mark own pending candidate as auto-published" on public.source_notice_candidates;


-- ============================================================================
-- POST-APPLY VERIFICATION (do this before considering the migration done)
-- ============================================================================
-- 1. `select policyname, roles, cmd, with_check from pg_policies where
--    tablename = 'alerts' and policyname like 'Scheduled writer%'` — confirm
--    exactly the two writer policies (this one's new INSERT + the existing
--    SELECT) exist, both `roles={authenticated}`.
-- 2. `select policyname, roles, cmd, qual, with_check from pg_policies
--    where tablename = 'source_notice_candidates' and policyname like
--    'Scheduled writer%'` — confirm exactly three writer policies (the two
--    existing ones + this new UPDATE), all `roles={authenticated}`.
-- 3. Confirm an ordinary admin session still has full alerts and
--    source_notice_candidates access exactly as before (Kreator,
--    /admin/queue — no visible change).
-- 4. Confirm the public site's alert list and REST API are unchanged
--    (anon still sees only `status = 'published'` rows, same as before).
-- 5. Only after all four are confirmed, proceed to enabling
--    SCHEDULED_AUTO_PUBLISH_ENABLED on Production per
--    docs/SPRINT_180_TRUSTED_SOURCE_AUTO_PUBLISH_CANARY_V1.md.
-- ============================================================================
