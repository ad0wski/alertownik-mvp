-- ROLLBACK — Sprint 166H — Production migration rollback.
--
-- NOT EXECUTED. A rollback is a SEPARATE, EXPLICITLY-APPROVED action —
-- never run automatically, and never run in the same session as an
-- unexpected verification result without a fresh review of what actually
-- happened first (matching the exact discipline already used for the
-- Sprint 166F ledger migration's own rollback file).
--
-- ── When this rollback is safe to consider ───────────────────────────────
--
-- Safe (no data-loss risk beyond the migration's own new, empty tables):
--   - Immediately after applying the migration, BEFORE any runtime flag is
--     ever turned on for Production and BEFORE any request has ever
--     reached the writer in Production. Both tables are guaranteed empty
--     at that point (see VERIFY_SPRINT_166H_PRODUCTION_POST_MIGRATION_READONLY_V1.sql
--     §2) — dropping them loses nothing.
--
-- NOT safe without a separate, explicit, and fully-informed decision:
--   - At any point AFTER a real writer run or a real claimed/finished
--     notification event has been recorded in Production. Running this
--     file at that point permanently deletes real run history and/or
--     real notification audit trail — see the WARNING at the bottom of
--     this file, identical in spirit to the one in
--     ROLLBACK_SPRINT_166F... (there is no Production-specific ledger
--     rollback file yet because Production has never had this table
--     until this sprint's migration).
--
-- ── What this rollback does NOT undo, and why ────────────────────────────
--
--   - It does not touch alert_sources, automation_identities,
--     admin_profiles, source_notice_candidates, or alerts — this
--     migration never created, altered, or wrote to any of those tables,
--     so there is nothing to roll back on them.
--   - It does not touch any Vercel Environment Variable — this migration
--     never changed one. If a rollback of this schema migration is being
--     considered, no runtime flag should have been turned on for
--     Production in the first place (see the rollout runbook's Phase A
--     entry condition); if one WAS turned on, turning it back off is a
--     separate, already-covered procedure (identical to every Sprint 166G
--     Preview rollback performed this project), not part of this file.
--
-- Order matters — drop in the reverse order of creation.

begin;

-- 1. Functions first (nothing references them).
drop function if exists public.claim_operational_notification_event(
  text, text, text, text, text, uuid, uuid, text, integer
);
drop function if exists public.finish_operational_notification_event(
  uuid, text, text, timestamptz
);
drop function if exists public.close_scheduled_writer_run(
  uuid, text, integer, integer, integer, integer, integer, integer, integer, text
);
drop function if exists public.open_scheduled_writer_run(
  uuid, text, text, integer
);

-- 2. Policies (would cascade with the table drop below — explicit for
--    clarity and so this file works even if run against a partially
--    completed migration).
drop policy if exists operational_notification_events_admin_select
  on public.operational_notification_events;
drop policy if exists scheduled_writer_runs_admin_select
  on public.scheduled_writer_runs;

-- 3. Indexes (also cascade with the table drops — explicit for clarity).
drop index if exists public.operational_notification_events_one_claim_per_scope;
drop index if exists public.operational_notification_events_scope_recency;
drop index if exists public.scheduled_writer_runs_one_open_per_scope;

-- 4. operational_notification_events before scheduled_writer_runs — it
--    holds the foreign key, not the other way around.
drop table if exists public.operational_notification_events;
drop table if exists public.scheduled_writer_runs;

commit;

-- **WARNING**: step 4 permanently deletes any rows already recorded in
-- either table. Do not run this file if either table contains data anyone
-- still needs — confirm both row counts are 0 first (see
-- VERIFY_SPRINT_166H_PRODUCTION_POST_MIGRATION_READONLY_V1.sql §2) or, if
-- non-zero, get a separate, explicit, fully-informed approval that
-- acknowledges the specific data being lost before proceeding. Requires
-- Adam's own explicit approval before execution — identical bar to the
-- forward migration itself.
