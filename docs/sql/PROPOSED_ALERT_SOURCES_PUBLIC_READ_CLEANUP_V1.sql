-- ============================================================================
-- PROPOSED CLEANUP — SEPARATE FROM SCHEDULED-WRITER MIGRATION — DO NOT RUN
-- WITHOUT EXPLICIT, SEPARATE APPROVAL
-- ============================================================================
-- Sprint 145 — standalone finding, deliberately NOT bundled into
-- docs/sql/PROPOSED_SCHEDULED_WRITER_RLS_MIGRATION_V1.sql. This proposal
-- is unrelated to the scheduled-writer authorization project — it
-- addresses a separate, pre-existing live policy discovered during the
-- Sprint 144 live-RLS audit.
--
-- FINDING: `alert_sources` carries a live policy not present in any
-- committed repository file:
--
--   policyname: "Public can read alert sources"
--   permissive: PERMISSIVE
--   roles:      {anon}
--   cmd:        SELECT
--   qual:       true
--   with_check: null
--
-- This grants ANY unauthenticated caller full SELECT access to the
-- entire `alert_sources` table via Supabase's Data API (using only the
-- public anon key — no login required). CLAUDE.md documents
-- `alert_sources` as admin-only ("Admin: full access · Public: none"),
-- and `docs/supabase_sources_schema.sql`'s own comment states "Public
-- users: no access at all (sources are admin-only)" — this live policy
-- contradicts both.
--
-- ── DEPENDENCY AUDIT (performed this sprint, repository-wide) ───────────────
--
-- Every application code path that reads `alert_sources` was located by
-- static search (`grep -rn 'from("alert_sources")' src`):
--   src/lib/supabaseSourceWrites.ts   — the only module querying this table
--
-- Every importer of that module was then located
-- (`grep -rln "supabaseSourceWrites|getAlertSources" src`):
--   src/app/admin/page.tsx            — admin dashboard, AuthGate-wrapped
--   src/app/admin/queue/page.tsx      — candidate queue, AuthGate-wrapped
--   src/app/admin/sources/page.tsx    — source registry admin UI, AuthGate-wrapped
--   src/components/SourceApiCheckPanel.tsx — rendered only inside the above
--
-- No public page (`src/app/page.tsx`, `src/app/alerts/[slug]/page.tsx`,
-- `src/app/odpady/page.tsx`, `src/app/about/page.tsx`,
-- `src/app/zasady/page.tsx`, `src/app/partnerzy/page.tsx`), no shared
-- public component (`AlertList.tsx`, `AlertCard.tsx`,
-- `AlertDetailClient.tsx`), and no test in `tests/e2e/` references
-- `alert_sources` at all.
--
-- CONCLUSION: no dependency exists. The public application never reads
-- `alert_sources` through Supabase's Data API — every read happens from
-- an already-authenticated admin session, which the admin-scoped
-- policies (unaffected by this proposal) already cover independently of
-- the anon policy below. Removing the anon policy changes zero observed
-- application behavior.
--
-- ── WHY NOT BUNDLED WITH THE SCHEDULED-WRITER MIGRATION ─────────────────────
-- This is a pre-existing, unrelated security finding — it predates the
-- automation work by an unknown amount of time and has nothing to do
-- with `source_checks`/`source_notice_candidates`/`automation_identities`.
-- Bundling unrelated changes into one migration makes both harder to
-- review and harder to roll back independently; per the Sprint 145
-- brief, this stays a fully separate, separately-approved package.
-- ============================================================================


begin;


-- Exact live policy name, verified — not guessed. Removing this policy
-- removes ONLY the anon/public SELECT grant; the four existing
-- "Authenticated admins can select/insert/update/delete sources" policies
-- (unaffected by this file) continue to give the admin full access,
-- exactly as today.

drop policy if exists "Public can read alert sources" on public.alert_sources;


commit;


-- ============================================================================
-- ROLLBACK (restores the exact removed policy, byte-for-byte)
-- ============================================================================
-- Run this separately, manually, only if removing the policy above turns
-- out to break something this audit's static search missed (e.g. a
-- future feature, or an external integration not visible in this
-- repository).
--
-- begin;
--
-- create policy "Public can read alert sources"
--   on public.alert_sources for select
--   to anon
--   using (true);
--
-- commit;
-- ============================================================================


-- ============================================================================
-- POST-APPLY VERIFICATION
-- ============================================================================
-- select policyname, permissive, roles, cmd, qual, with_check
-- from pg_policies
-- where schemaname = 'public' and tablename = 'alert_sources'
-- order by cmd, policyname;
--
-- Expected after applying: exactly four policies remain, all
-- "Authenticated admins can ..." (select/insert/update/delete). The
-- "Public can read alert sources" row should be absent.
--
-- Then reload /admin/sources as the admin and confirm the page still
-- loads and functions normally (it does not depend on the removed
-- policy — its own session already satisfies the admin policies).
-- ============================================================================
