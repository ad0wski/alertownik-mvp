-- ============================================================================
-- EMERGENCY ROLLBACK — DO NOT RUN UNLESS REQUIRED
-- ============================================================================
-- Companion rollback for
-- docs/sql/PROPOSED_AUTOMATION_IDENTITIES_GRANT_HARDENING_V1.sql. This
-- file has NOT been executed, and — unlike most rollback artifacts in
-- this repository — restoring what it restores is normally NOT
-- desirable.
--
-- Re-granting TRUNCATE/TRIGGER/REFERENCES on public.automation_identities
-- to `authenticated` re-widens the table's privilege surface beyond what
-- least privilege calls for. This file exists only in case the grant
-- cleanup ever causes an unexpected compatibility issue that isn't
-- understood yet (e.g. some future Supabase-side tooling that turns out
-- to depend on one of these grants in a way this sprint's audit did not
-- anticipate) — it is a safety net for an unforeseen problem, not a
-- routine undo path. If this is ever run, treat it as a temporary
-- stop-gap and investigate why the narrower grant set was insufficient
-- before leaving the wider grants in place long-term.
--
-- No data is affected by either the hardening file or this rollback —
-- both only change table-level grants, never touching any row in any
-- table.
-- ============================================================================


begin;

grant truncate, trigger, references on public.automation_identities to authenticated;

commit;


-- ============================================================================
-- POST-ROLLBACK VERIFICATION
-- ============================================================================
-- Run docs/sql/VERIFY_AUTOMATION_IDENTITIES_GRANTS_READ_ONLY_V1.sql and
-- confirm `authenticated` once again shows SELECT + TRUNCATE + TRIGGER +
-- REFERENCES — the exact pre-hardening state.
-- ============================================================================
