-- ============================================================================
-- READ ONLY — NO DATABASE MODIFICATION
-- ============================================================================
-- Sprint 144 — Live RLS Verification & Least-Privilege Migration Plan v1.
--
-- Purpose: resolve the one unknown Sprint 143's audit could not confirm
-- from committed files alone — the exact live RLS policy state for
-- `alerts`, plus a full, authoritative cross-check of the three tables
-- whose policies ARE committed (alert_sources, source_checks,
-- source_notice_candidates), so the migration plan in
-- docs/SCHEDULED_WRITER_RLS_MIGRATION_PLAN_V1.md can be designed against
-- CONFIRMED live state rather than repository assumption alone.
--
-- THIS FILE CONTAINS SELECT STATEMENTS ONLY.
-- It does not, and must never be edited to, contain INSERT, UPDATE,
-- DELETE, ALTER, CREATE, DROP, GRANT, or REVOKE.
-- It was NOT executed as part of Sprint 144 — no read-only Supabase
-- tool/MCP/CLI connection was available in this session (confirmed: no
-- .mcp.json-backed Supabase tool appeared, no `supabase` CLI on PATH).
-- Run this manually in the Supabase SQL Editor (or any read-only
-- connection) whenever convenient — every query below only reads
-- Postgres/PostgREST catalog metadata, never application data, and
-- changes nothing regardless of when or how many times it's run.
-- ============================================================================


-- ── 1. RLS policies on the four tables this migration plan covers ──────────
-- Reveals: policy name, which command it applies to, which Postgres
-- role(s) it targets, whether it's PERMISSIVE or RESTRICTIVE, and its
-- USING / WITH CHECK expressions — the exact detail needed to confirm
-- (a) that alert_sources/source_checks/source_notice_candidates really
-- do use only the single broad `auth.role() = 'authenticated'` policy
-- per operation that the committed SQL implies, with nothing else
-- layered on top live, and (b) what the live-only `alerts` write
-- policy/policies actually say — the central unknown from Sprint 143.

select
  schemaname,
  tablename,
  policyname,
  permissive,   -- 'PERMISSIVE' or 'RESTRICTIVE' — see the plan doc's
                -- warning about how multiple PERMISSIVE policies combine
                -- with OR, which is the exact behavior this migration
                -- must design around rather than assume away.
  roles,
  cmd,          -- SELECT / INSERT / UPDATE / DELETE / ALL
  qual        as using_expression,
  with_check  as with_check_expression
from pg_policies
where schemaname = 'public'
  and tablename in ('alerts', 'alert_sources', 'source_checks', 'source_notice_candidates')
order by tablename, cmd, policyname;


-- ── 2. Table-level GRANTs ────────────────────────────────────────────────────
-- RLS policies only restrict what an already-GRANTed role can do — they
-- never grant access on their own. Supabase's default project setup
-- grants broadly to `anon`/`authenticated` at the table level and relies
-- on RLS as the real restriction layer, but this confirms that
-- assumption explicitly rather than leaving it implicit, per the
-- "assess both RLS and Postgres grants" requirement.

select
  table_name,
  grantee,
  privilege_type,
  is_grantable
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('alerts', 'alert_sources', 'source_checks', 'source_notice_candidates')
order by table_name, grantee, privilege_type;


-- ── 3. RLS enabled/forced status ─────────────────────────────────────────────
-- Confirms row level security is actually ON for all four tables (not
-- just that policies exist — a table can have policies defined while
-- RLS itself is disabled, which would make every policy below a no-op).

select
  relname       as table_name,
  relrowsecurity  as rls_enabled,
  relforcerowsecurity as rls_forced
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('alerts', 'alert_sources', 'source_checks', 'source_notice_candidates');


-- ── 4. Column shape + constraints for the two writer-target tables ─────────
-- Confirms the exact column set and CHECK constraints the migration plan
-- assumes (e.g. source_notice_candidates.status's allowed values,
-- source_checks.result's allowed values) match what's actually live —
-- useful cross-check since the v1 source_notice_candidates proposal was
-- superseded by v2 and this confirms v2 is really what's live.

select
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('source_notice_candidates', 'source_checks')
order by table_name, ordinal_position;

select
  conname       as constraint_name,
  conrelid::regclass as table_name,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in (
  'public.source_notice_candidates'::regclass,
  'public.source_checks'::regclass
)
order by table_name, conname;


-- ── 5. Existing Auth users and their app_metadata (identity check only) ────
-- Read-only visibility into whether any account already carries
-- app_metadata role claims (expected: none yet, confirming Sprint 143's
-- finding that no role/metadata system exists today) and to identify
-- the current admin's user id ahead of the "verify current admin
-- identity" step in the migration plan's admin-preservation sequence.
-- Selects id/email/app_metadata only — never any credential/password
-- material (Supabase never stores raw passwords queryable this way).

select
  id,
  email,
  raw_app_meta_data,
  created_at,
  last_sign_in_at
from auth.users
order by created_at asc;


-- ============================================================================
-- END OF READ-ONLY INSPECTION ARTIFACT
-- ============================================================================
-- After running the above (all of it, or section by section):
--   1. Compare §1's results against
--      docs/SCHEDULED_WRITER_RLS_MIGRATION_PLAN_V1.md's "verified
--      repository state" table — confirm alert_sources/source_checks/
--      source_notice_candidates match exactly, and record what §1
--      reveals for `alerts` (the one previously-unconfirmed table).
--   2. Confirm §3 shows rls_enabled = true for all four tables.
--   3. Confirm §5 shows zero existing app_metadata role claims (expected
--      baseline) and note the current admin's `id` for later use when
--      (in a future, separately-approved sprint) that account is
--      assigned trusted admin authorization metadata.
--   4. No further action is required by this file — it does not modify
--      anything and produces no side effects no matter how many times
--      it is run.
-- ============================================================================
