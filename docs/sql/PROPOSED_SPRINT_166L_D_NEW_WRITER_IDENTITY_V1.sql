-- PROPOSED — Sprint 166L-D — Add the new, dedicated scheduled-writer
-- identity to public.automation_identities (Production).
--
-- NOT EXECUTED. This file, pasted and run exactly as written, fails with
-- a type-cast error rather than inserting anything — see §1 below.
--
-- ── Before this file is ever run for real ────────────────────────────────
--
--   1. Create the new Supabase Auth account first, via the dashboard
--      (Authentication → Users → Add user → Create new user), following
--      docs/SPRINT_166L_D_WRITER_IDENTITY_CREATION_PROCEDURE_V1.md §2
--      exactly — including checking "Auto Confirm User". This file does
--      not create the auth.users row; it only links an ALREADY-CREATED
--      account's id into automation_identities.
--   2. Copy that new user's `user_id` (a UUID, non-secret) from the
--      dashboard.
--   3. Replace the placeholder in §2 below with that real UUID.
--   4. Confirm you are looking at the alertownik-mvp project, confirmed
--      by project ref puhcjyffosgohbmxrczb, not alertownik-preview.
--   5. Adam pastes the edited file and clicks Run — never Claude, per
--      this project's unbroken convention for every write-performing SQL
--      statement.
--
-- ── Why this does not, and must not, touch the existing row ──────────────
--
-- The pre-existing automation_identities row (user_id ending ...da746,
-- added 2026-07-11 — see SPRINT_166L_C_WRITER_IDENTITY_AUDIT_V1.md) is
-- left completely untouched by this file. This is a pure INSERT of a new,
-- additional row — RLS membership checks are additive (see
-- databaseEnvironmentGuard.ts's own convention of never widening what's
-- already blocked), so having two rows here is structurally harmless; a
-- separate, later, explicitly-approved decision handles the old row's
-- fate, not this file.

-- ── §1. Placeholder guard — this file cannot silently insert a wrong row ──
--
-- 'PASTE_NEW_WRITER_USER_ID_HERE' is not a well-formed UUID. Running this
-- statement unedited raises a Postgres type-cast error
-- (22P02: invalid input syntax for type uuid) before any row is touched —
-- a deliberate fail-loud placeholder, never a fabricated default UUID
-- that could silently "work" against the wrong identity.

insert into public.automation_identities (user_id)
values ('PASTE_NEW_WRITER_USER_ID_HERE'::uuid);

-- ── §2. Read-only verification — run after the insert above succeeds ─────
--
-- Expect exactly one row. Never prints the linked auth.users email or any
-- credential — id and timestamp only, matching every other verification
-- query in this project's history.

select user_id, created_at
from public.automation_identities
where user_id = 'PASTE_NEW_WRITER_USER_ID_HERE'::uuid;

-- Sanity check: confirm the total row count is now exactly one more than
-- it was before (Sprint 166L-C's audit recorded exactly 1 row at the time
-- of this file's preparation — expect 2 here, never more).
select count(*) as automation_identities_total_count
from public.automation_identities;

-- ── §3. Rollback — scoped to exactly this one new row, fails closed ──────
--
-- Guarded: raises an exception (touching nothing) if the target id
-- resolves to zero or more than one row, rather than ever risking a
-- broader unintended delete. Only run this if the new identity needs to
-- be revoked — never as a routine step.

do $$
declare
  v_target_user_id uuid := 'PASTE_NEW_WRITER_USER_ID_HERE'::uuid;
  v_match_count integer;
begin
  select count(*) into v_match_count
  from public.automation_identities
  where user_id = v_target_user_id;

  if v_match_count <> 1 then
    raise exception 'Expected exactly one automation_identities row for user_id %, found % — refusing to delete anything.', v_target_user_id, v_match_count;
  end if;

  delete from public.automation_identities
  where user_id = v_target_user_id;

  raise notice 'Removed exactly one automation_identities row for user_id %.', v_target_user_id;
end $$;
