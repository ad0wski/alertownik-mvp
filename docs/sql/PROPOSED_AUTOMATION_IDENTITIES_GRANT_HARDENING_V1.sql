-- ============================================================================
-- PROPOSED GRANT HARDENING — DO NOT RUN WITHOUT EXPLICIT APPROVAL
-- ============================================================================
-- Sprint 147 — follow-up to the Sprint 145/146 migration
-- (docs/sql/PROPOSED_SCHEDULED_WRITER_RLS_MIGRATION_V1.sql, applied and
-- verified live by Adam in Sprint 146 —
-- docs/SCHEDULED_WRITER_RLS_DEPLOYMENT_RESULT_V1.md). This file has NOT
-- been executed.
--
-- FINDING (from Sprint 146's post-apply live verification): the applied
-- migration explicitly revoked INSERT/UPDATE/DELETE on
-- public.automation_identities from the `authenticated` role, but did
-- not revoke TRUNCATE, TRIGGER, or REFERENCES — Supabase's default
-- project grants included them, and the migration's own REVOKE statement
-- only named the three DML operations. Live grant inspection
-- (information_schema.role_table_grants) confirmed `authenticated`
-- retains exactly these three, in addition to the still-intended SELECT.
--
-- RISK ASSESSMENT (unchanged from the Sprint 146 verification finding —
-- restated here for a self-contained record): LOW, not exploitable
-- through this project's actual application-facing surface. TRUNCATE and
-- CREATE TRIGGER are not operations Supabase's PostgREST/Data API
-- exposes to a client holding only a JWT (supabase-js — the only way
-- this project's code, browser or server, ever talks to the database —
-- can only issue SELECT/INSERT/UPDATE/DELETE and RPC calls). Exercising
-- these residual grants would require a direct Postgres connection
-- authenticated as the `authenticated` role, which no part of this
-- application's architecture ever hands out. Even in the worst case,
-- TRUNCATE'ing this table only erases membership rows (no candidate/
-- alert/check data lives here) — the scheduled writer would simply need
-- to be re-added.
--
-- This is a small, independent hardening step — not required to keep the
-- Sprint 146 migration safe, and not bundled with any other change.
-- Recommended before a real scheduled-writer identity is onboarded
-- (least privilege should be tightened before the table holds a live
-- membership row, not after), but not urgent on its own.
-- ============================================================================


begin;

revoke truncate, trigger, references on public.automation_identities from authenticated;

commit;


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- See the separate, dedicated file:
-- docs/sql/PROPOSED_AUTOMATION_IDENTITIES_GRANT_HARDENING_ROLLBACK_V1.sql
-- Restoring these grants is normally NOT desirable — that file exists
-- only for an unexpected compatibility issue, not as a routine undo.
-- ============================================================================


-- ============================================================================
-- POST-APPLY VERIFICATION
-- ============================================================================
-- Run docs/sql/VERIFY_AUTOMATION_IDENTITIES_GRANTS_READ_ONLY_V1.sql (SELECT
-- only) and compare against its "expected after cleanup" comments.
-- ============================================================================
