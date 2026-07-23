# Sprint 166F Preview Migration Runbook — operational_notification_events

Applies to: `docs/sql/PROPOSED_SPRINT_166F_OPERATIONAL_NOTIFICATION_LEDGER_V1.sql`
(Revision 2, hardened in Sprint 166F-2A).

**This migration has not been executed as of this document's writing.**
Running it is a separate, explicit decision by Adam — this runbook exists
so that decision can be made with a full picture, not so Claude can act on
it autonomously. No step in this runbook is performed automatically by
Claude; every SQL-executing step requires Adam's own click in the Supabase
SQL Editor.

---

## Etap 8 — Migration dependencies (documented from the repository, not verified live this session)

This migration's `create table` statement references two existing tables
via foreign key:

- `scheduled_writer_run_id uuid references public.scheduled_writer_runs(id)`
  — requires `public.scheduled_writer_runs` to already exist. That table
  was created by `docs/sql/PROPOSED_SPRINT_166C_RUN_HISTORY_MIGRATION_V1.sql`,
  which project history records as already executed against
  **alertownik-preview** (Sprint 166C, Stage 1 — see
  `docs/PROJECT_STATUS.md`/prior sprint checkpoints; not re-verified via a
  live query in this session, per this sprint's read-only rules).
- `source_id uuid references public.alert_sources(id) on delete set null`
  — requires `public.alert_sources`, which has existed since the
  project's original schema (`docs/supabase_sources_schema.sql`) and is
  read/written by many already-shipped features (the source registry
  itself). Present in both Preview and Production.

**Production consequence:** `alertownik-mvp` (Production) may not have
`scheduled_writer_runs` — Sprint 166C's atomic-lock and run-history
migrations were scoped to Preview only, and Production's own operational
status has never included that table. **This migration must never be run
against Production before Sprint 166C's own migrations (run-history +
atomic-lock) have first been applied there** — attempting the `references
public.scheduled_writer_runs(id)` FK against a database lacking that table
would fail outright (a safe failure, not a silent one, but still worth
stating explicitly rather than discovering it mid-runbook). This session
does not check Production's actual schema state via SQL — the rule above
is stated from repository/project history alone, per this sprint's
explicit "don't verify via SQL this session" instruction.

Also required (both already exist, referenced but not modified):

- `public.automation_identities` — both RPC functions check membership
  via `auth.uid()`.
- `public.admin_profiles` — the admin `SELECT` policy checks membership.

---

## A. Preflight — before touching the SQL Editor

Perform these checks **before** clicking anything that runs SQL:

1. In the Supabase dashboard, click directly into the **alertownik-preview**
   project from the project list — never navigate by a typed/guessed URL.
2. Confirm the project name shown in the dashboard header reads
   `alertownik-preview` and note its **project ref** (visible in the URL,
   e.g. `nowvcdbtgaigutyxpmdp` per this repo's own working notes) — confirm
   it, don't assume it from memory.
3. Confirm any environment badge/indicator in the Supabase UI (or the
   project's own settings page) identifies this as the Preview project,
   not Production.
4. Open the SQL Editor **from within this confirmed Preview project** —
   never a SQL Editor tab that may have been left open against a
   different project.
5. Before running the migration, run these **read-only** control queries
   and record their output:
   ```sql
   -- Confirm the table does not already exist
   select count(*) from information_schema.tables
   where table_schema = 'public' and table_name = 'operational_notification_events';
   -- expect 0

   -- Confirm the two dependency tables exist
   select count(*) from information_schema.tables
   where table_schema = 'public' and table_name = 'scheduled_writer_runs';
   -- expect 1
   select count(*) from information_schema.tables
   where table_schema = 'public' and table_name = 'alert_sources';
   -- expect 1

   -- Confirm the two new function names are not already taken
   select proname from pg_proc
   where proname in ('claim_operational_notification_event', 'finish_operational_notification_event');
   -- expect 0 rows
   ```
   If any of these controls come back unexpected (table already exists,
   a dependency missing, a function name collision), **stop and report
   back** rather than proceeding.

## B. The exact migration file to use

`docs/sql/PROPOSED_SPRINT_166F_OPERATIONAL_NOTIFICATION_LEDGER_V1.sql`
(Revision 2 — the version reviewed and hardened in Sprint 166F-2A: fixed
6-hour cooldown constant, no `p_cooldown_seconds` parameter, `source_id`
typed as `uuid references public.alert_sources(id) on delete set null`).
Copy this file's contents into the SQL Editor exactly as written — do not
edit it inline in the editor.

## C. The explicit approval gate

**Before clicking Run**, Adam must explicitly confirm, in the chat, all of
the following (Claude must not click Run itself, and must not proceed past
this point without that confirmation):

- "I am looking at the alertownik-preview project, confirmed by \[project
  ref / name\], not Production."
- "The preflight control queries above returned the expected results."
- "I have read the migration file and understand it creates one new
  table, one new index pair, one new RLS policy, and two new
  `SECURITY DEFINER` functions — no existing table, policy, or function is
  altered or dropped."
- "I approve running this migration now."

## D. Post-migration read-only verification

Run these **read-only** queries after applying, and record the actual
output:

```sql
-- Table exists with RLS enabled
select relrowsecurity from pg_class where relname = 'operational_notification_events';
-- expect true

-- Columns (spot-check the key ones)
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'operational_notification_events'
order by ordinal_position;

-- Constraints (CHECK constraints, in particular)
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.operational_notification_events'::regclass;

-- Indexes
select indexname, indexdef from pg_indexes
where tablename = 'operational_notification_events';
-- expect operational_notification_events_one_claim_per_scope (partial
-- unique) and operational_notification_events_scope_recency present,
-- plus the primary key index

-- RLS policies — expect exactly one row (admin SELECT only)
select policyname, cmd, roles from pg_policies
where tablename = 'operational_notification_events';

-- Function security properties
select proname, prosecdef, proconfig from pg_proc
where proname in ('claim_operational_notification_event', 'finish_operational_notification_event');
-- expect prosecdef = true for both; proconfig containing 'search_path='
-- (empty)

-- Grants on the two functions — expect authenticated only, no PUBLIC,
-- no anon
select grantee, privilege_type, routine_name
from information_schema.routine_privileges
where routine_name in ('claim_operational_notification_event', 'finish_operational_notification_event');

-- No direct table grant for any writer-shaped role — expect zero rows
-- for INSERT/UPDATE/DELETE, and no unexpected SELECT beyond the
-- admin_profiles-gated policy already confirmed above
select grantee, privilege_type
from information_schema.role_table_grants
where table_name = 'operational_notification_events';

-- Table is empty
select count(*) from public.operational_notification_events;
-- expect 0

-- Existing tables/data untouched — spot check row counts unchanged
select count(*) from public.scheduled_writer_runs;
select count(*) from public.alert_sources;
```

Confirm every result matches its stated expectation before considering
the migration verified. If anything is unexpected, stop and report back
— do not attempt a repair migration in the same session without a fresh
review.

## E. Plan for a future controlled test (NOT performed this session)

Once the migration is verified above, a **separate, later, explicitly
approved** session would perform:

1. Two parallel `claim_operational_notification_event(...)` calls for the
   identical `(environment_tag, fingerprint)` scope (e.g. via two
   near-simultaneous SQL Editor tabs or a small script) — expect exactly
   one `claimed = true`, the other `claimed = false, suppressed_reason =
   'suppress_duplicate'`.
2. `finish_operational_notification_event(...)` on the winning claim,
   with a synthetic `provider_status` (never a real Resend call) —
   confirm the row transitions to `status = 'sent'` (or `'failed'`) and
   `finished_at`/`sent_at` populate correctly.
3. A third claim attempt for the same scope immediately after — expect
   `claimed = false, suppressed_reason = 'suppress_cooldown'` (the fixed
   6-hour window from the just-finished claim).
4. Confirm zero emails were sent and zero connections to Resend were made
   at any point (this test only exercises the ledger's own RPCs — it
   never calls the notification adapter or Resend at all).

**This test is not performed as part of Sprint 166F-2A.** It requires its
own separate approval, matching the same discipline used for Sprint
166E-2B's first controlled email test.

## F. Rollback

A rollback is a **separate, explicitly-approved** action — never run
automatically, and never run in the same session as an unexpected
verification result without a fresh review of what actually happened
first.

Order matters — drop in the reverse order of creation, so nothing is left
referencing an already-dropped object:

```sql
begin;

-- 1. Functions first (they reference the table but nothing references them)
drop function if exists public.claim_operational_notification_event(
  text, text, text, text, text, uuid, uuid, text, integer
);
drop function if exists public.finish_operational_notification_event(
  uuid, text, text, timestamptz
);

-- 2. Policy (would be dropped automatically with the table, but explicit
--    is safer than relying on cascade behavior)
drop policy if exists operational_notification_events_admin_select
  on public.operational_notification_events;

-- 3. Indexes (would also cascade with the table drop — explicit for clarity)
drop index if exists public.operational_notification_events_one_claim_per_scope;
drop index if exists public.operational_notification_events_scope_recency;

-- 4. Table last
drop table if exists public.operational_notification_events;

commit;
```

**Warning:** this permanently deletes any rows already claimed/sent/failed
in the ledger. Do not run this if the table contains data anyone still
needs. Requires Adam's own explicit, separate approval before execution —
identical bar to the forward migration itself.
