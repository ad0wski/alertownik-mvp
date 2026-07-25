-- READY TO RUN — Sprint 166L-D — Link the new dedicated scheduled-writer
-- Supabase Auth account into public.automation_identities (Production).
--
-- Pre-flight (read-only, verified via Supabase MCP before this file was
-- prepared):
--   - auth.users row for this user_id exists, email_confirmed_at is set
--     (Auto Confirm User was checked), not banned, not deleted.
--   - public.automation_identities currently has 0 rows for this user_id
--     (no duplicate risk).
--   - public.automation_identities schema confirmed: (user_id uuid primary
--     key references auth.users(id), created_at timestamptz default now()).
--
-- This is the only account this file touches. It does not modify the
-- pre-existing automation_identities row (user_id ending ...da746).
--
-- Run order: §1 insert, then §2 verification. §3 is rollback only — do
-- not run unless reverting.
--
-- Adam pastes and clicks Run himself — Claude never executes write SQL.

-- ── §1. Insert the new identity ───────────────────────────────────────────

insert into public.automation_identities (user_id)
values ('9cd0ec05-cff4-480e-a37a-0c0cffc368b3'::uuid);

-- ── §2. Read-only verification ────────────────────────────────────────────
-- Expect exactly one row back, and a total count of 2 (1 pre-existing +
-- this new one).

select user_id, created_at
from public.automation_identities
where user_id = '9cd0ec05-cff4-480e-a37a-0c0cffc368b3'::uuid;

select count(*) as automation_identities_total_count
from public.automation_identities;

-- ── §3. Rollback — scoped to exactly this one row, fails closed ──────────
-- Only run this if the new identity needs to be revoked — never as a
-- routine step. Raises an exception (touching nothing) unless exactly one
-- matching row exists.

do $$
declare
  v_target_user_id uuid := '9cd0ec05-cff4-480e-a37a-0c0cffc368b3'::uuid;
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
