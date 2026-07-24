-- ROLLBACK — Sprint 166J-A — Production ACL hardening rollback.
--
-- NOT EXECUTED. A rollback is a SEPARATE, EXPLICITLY-APPROVED action — never
-- run automatically, and never run in the same session as an unexpected
-- verification result without a fresh review of what actually happened
-- first (matching the exact discipline already used for the Sprint 166F/
-- 166H ledger and migration rollback files).
--
-- ── What this restores ────────────────────────────────────────────────────
--
-- This file re-grants exactly what PROPOSED_SPRINT_166J_PRODUCTION_ACL_
-- HARDENING_V1.sql revoked, restoring the ACL to the state confirmed live
-- immediately after the Sprint 166H migration (Sprint 166I checkpoint) and
-- matching the pattern still live and unmodified on alertownik-preview:
--   - anon: EXECUTE on all 4 functions; SELECT/INSERT/UPDATE/DELETE on both
--     tables.
--   - authenticated: INSERT/UPDATE/DELETE on both tables, in addition to
--     the EXECUTE and SELECT grants the hardening never touched.
--
-- ── When this rollback is safe to consider ───────────────────────────────
--
-- Always safe from a data-loss perspective — this file only changes GRANTs,
-- never table contents, RLS policies, or function bodies. Restoring the
-- wider ACL does not by itself expose any data or allow any write beyond
-- what Sprint 166I's own audit already found to be functionally inert
-- (RLS + each function's own automation_identities check both remain fully
-- in force regardless of this file). Consider this rollback only if the
-- hardening is found to have broken something unexpected in application
-- behavior (e.g. an unforeseen PostgREST direct-table code path) — re-run
-- the Sprint 166J verification script and the writer/ledger e2e suite
-- after rollback to confirm restoration.
--
-- ── What this rollback does NOT undo, and why ────────────────────────────
--
--   - It does not touch RLS, policies, function bodies, or any other table
--     — the hardening never touched those either.
--   - It does not restore any data — no data was ever changed by the
--     hardening.
--
-- Order: tables first, then functions — reverse of the hardening file,
-- for clarity only (order is not functionally significant here).

begin;

-- ── 1. operational_notification_events — restore anon SELECT/INSERT/
--       UPDATE/DELETE and authenticated INSERT/UPDATE/DELETE. ───────────
grant select, insert, update, delete on public.operational_notification_events to anon;
grant insert, update, delete on public.operational_notification_events to authenticated;

-- ── 2. scheduled_writer_runs — identical treatment. ─────────────────────
grant select, insert, update, delete on public.scheduled_writer_runs to anon;
grant insert, update, delete on public.scheduled_writer_runs to authenticated;

-- ── 3. Functions — restore anon EXECUTE on all four. ────────────────────
grant execute on function public.finish_operational_notification_event(
  uuid, text, text, timestamptz
) to anon;

grant execute on function public.claim_operational_notification_event(
  text, text, text, text, text, uuid, uuid, text, integer
) to anon;

grant execute on function public.close_scheduled_writer_run(
  uuid, text, integer, integer, integer, integer, integer, integer, integer, text
) to anon;

grant execute on function public.open_scheduled_writer_run(
  uuid, text, text, integer
) to anon;

commit;

-- After running this rollback, re-run
-- VERIFY_SPRINT_166J_PRODUCTION_ACL_HARDENING_READONLY_V1.sql's queries and
-- confirm anon_can_execute / anon_select / anon_insert / anon_update /
-- anon_delete / authenticated_insert / authenticated_update /
-- authenticated_delete all read true again, matching the pre-hardening
-- state. Requires Adam's own explicit approval before execution — identical
-- bar to the forward hardening file itself.
