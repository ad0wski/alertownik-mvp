-- PROPOSED — Sprint 166J-A — Production ACL least-privilege hardening for
-- the Sprint 166H scheduled-writer/ledger objects.
--
-- NOT EXECUTED against any Supabase project as part of this session.
-- Written for review only. Targets alertownik-mvp (Production, project ref
-- puhcjyffosgohbmxrczb) exclusively.
--
-- ── Why this file exists ──────────────────────────────────────────────────
--
-- The Sprint 166H migration's own comments stated the intent "every grant
-- below is to authenticated only". Sprint 166I's post-migration verification
-- (and a matching read-only audit against alertownik-preview) found this
-- intent was not actually achieved: Supabase's project-wide
-- ALTER DEFAULT PRIVILEGES configuration (confirmed via pg_default_acl —
-- entries owned by both `postgres` and `supabase_admin` for schema `public`,
-- object types tables/functions/sequences) automatically grants EXECUTE/
-- INSERT/UPDATE/DELETE to `anon` and `authenticated` (and `service_role`) on
-- every new object in the public schema, regardless of the migration's own
-- explicit `revoke all ... from public` statements. This is identical,
-- pre-existing behavior on both alertownik-preview and alertownik-mvp — not
-- something the Sprint 166H migration introduced or could have avoided
-- without an explicit REVOKE after creation, which is what this file does.
--
-- ── Why this is safe (not merely "probably fine") ────────────────────────
--
-- 1. All four functions are `security definer` — they execute with the
--    privileges of their OWNER (`postgres`), never the calling role's own
--    table privileges. Revoking table-level INSERT/UPDATE/DELETE from
--    `anon`/`authenticated` cannot break any of the four functions' own
--    internal writes, because those writes never depend on the caller's
--    grants in the first place.
-- 2. No application code anywhere in this repository calls
--    `.from('scheduled_writer_runs')` or
--    `.from('operational_notification_events')` directly — both tables are
--    written to exclusively via `.rpc()` (see
--    src/lib/scheduledWriterHistory.ts and
--    src/lib/operationalNotificationLedgerSupabase.ts, both documented as
--    ".rpc() only, never .from(table).insert()/.update()/.select()
--    directly"). Revoking direct table DML from anon/authenticated changes
--    nothing this codebase actually relies on.
-- 3. The real, live writer session authenticates as a normal Supabase Auth
--    user and therefore holds the Postgres `authenticated` role for its
--    RPC calls — `authenticated` EXECUTE on the four functions must be kept
--    (this file does not touch it). The actual authorization boundary is,
--    and remains, each function's own internal check
--    (`select exists (... from automation_identities where user_id =
--    auth.uid())`) — Postgres's coarse three-role model (anon/authenticated/
--    service_role) has no finer-grained "this specific writer identity"
--    role to grant instead.
-- 4. `service_role` and `postgres` are never touched by this file. Both are
--    required for Supabase platform internals (dashboard, migrations,
--    PostgREST introspection) and must retain full privileges.
-- 5. The single existing RLS policy per table (admin-only SELECT, granted to
--    `authenticated`) is unaffected by this file — this file changes GRANTs,
--    never RLS policies.
--
-- ── What this file explicitly does NOT do ────────────────────────────────
--
--   - Does not run any RPC, open/close a run, or claim/finish a
--     notification event.
--   - Does not insert, update, or delete a single row in any table.
--   - Does not change any RLS policy, any Environment Variable, or any
--     Vercel/Cron configuration.
--   - Does not touch `service_role`, `postgres`, or any other table/
--     function in this project.
--   - Does not use dynamic SQL (no EXECUTE/format()) anywhere.
--   - Does not revoke or grant EXECUTE for `authenticated` on any of the
--     four functions — that grant is required and is left exactly as-is.
--
-- Order: functions first, then tables — matches no particular dependency
-- (REVOKE order is immaterial here), grouped for readability only.

begin;

-- ── 1. Functions — revoke EXECUTE from anon only. authenticated keeps
--       EXECUTE (required — see rationale above). service_role/postgres
--       untouched. ────────────────────────────────────────────────────────
revoke execute on function public.open_scheduled_writer_run(
  uuid, text, text, integer
) from anon;

revoke execute on function public.close_scheduled_writer_run(
  uuid, text, integer, integer, integer, integer, integer, integer, integer, text
) from anon;

revoke execute on function public.claim_operational_notification_event(
  text, text, text, text, text, uuid, uuid, text, integer
) from anon;

revoke execute on function public.finish_operational_notification_event(
  uuid, text, text, timestamptz
) from anon;

-- ── 2. scheduled_writer_runs — revoke direct table DML from anon
--       entirely, and revoke INSERT/UPDATE/DELETE from authenticated (the
--       only legitimate write path is the two functions above, which run
--       as the table owner and are unaffected by this). authenticated
--       keeps SELECT (required for the existing admin-only RLS SELECT
--       policy to have something to authorize). ─────────────────────────
revoke select, insert, update, delete on public.scheduled_writer_runs from anon;
revoke insert, update, delete on public.scheduled_writer_runs from authenticated;

-- ── 3. operational_notification_events — identical treatment. ──────────
revoke select, insert, update, delete on public.operational_notification_events from anon;
revoke insert, update, delete on public.operational_notification_events from authenticated;

commit;

-- After this migration, use
-- VERIFY_SPRINT_166J_PRODUCTION_ACL_HARDENING_READONLY_V1.sql to confirm
-- the result — do not consider this hardening complete until every check
-- in that file matches its expected value.
