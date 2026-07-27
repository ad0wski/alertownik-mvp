-- ============================================================================
-- READ ONLY — NO DATABASE MODIFICATION
-- ============================================================================
-- Sprint 177E — verification companion for
-- docs/sql/PROPOSED_SPRINT_177_AUTOMATION_ALERT_READ_POLICY_V1.sql.
--
-- THIS FILE CONTAINS SELECT STATEMENTS ONLY. No INSERT, UPDATE, DELETE,
-- ALTER, CREATE, DROP, GRANT, or REVOKE. Safe to run at any time, any
-- number of times, before or after the proposed migration — it changes
-- nothing.
-- ============================================================================


-- ── 1. alerts: full policy listing ───────────────────────────────────────────
-- Expected BEFORE migration: exactly 5 rows — "Admins can delete alerts",
-- "Admins can insert alerts", "Admins can read all alerts", "Admins can
-- update alerts" (all roles={authenticated}), "Public can read published
-- alerts" (roles={anon}).
-- Expected AFTER migration: the same 5 rows, PLUS exactly one new row:
-- "Scheduled writer can select alerts for deduplication"
-- (cmd=SELECT, roles={public} — a `using` clause with no `to <role>`
-- clause applies to every role, matching the automation_identities EXISTS
-- check's own row-level scoping — see query 3 below for why this is safe
-- for both anon and ordinary authenticated sessions in practice).

select policyname, roles, cmd, qual
from pg_policies
where tablename = 'alerts' and schemaname = 'public'
order by policyname;


-- ── 2. alerts: RLS still enabled ─────────────────────────────────────────────
-- Expected: rls_enabled = true, unchanged before/after.

select relname as table_name, relrowsecurity as rls_enabled, relforcerowsecurity as rls_forced
from pg_class
where relnamespace = 'public'::regnamespace
  and relname = 'alerts';


-- ── 3. Confirm the new policy's qual matches automation_identities exactly ──
-- Expected AFTER migration: the qual text contains
-- "automation_identities" and "auth.uid()" — the identical EXISTS shape
-- already live on source_notice_candidates/source_checks, not a
-- different or looser condition.

select policyname, pg_get_expr(polqual, polrelid) as using_expr
from pg_policy
where polrelid = 'public.alerts'::regclass
  and polname = 'Scheduled writer can select alerts for deduplication';


-- ── 4. Confirm no other alerts policy was touched ───────────────────────────
-- Expected: identical row count and identical qual text for these four
-- policy names as recorded before the migration (compare manually against
-- a pre-migration run of this same file, or against the live snapshot
-- taken during Sprint 177D's audit).

select policyname, roles, cmd, qual
from pg_policies
where tablename = 'alerts' and schemaname = 'public'
  and policyname in (
    'Admins can select alerts',
    'Admins can insert alerts',
    'Admins can update alerts',
    'Admins can delete alerts',
    'Public can read published alerts'
  )
order by policyname;


-- ── 5. Confirm alerts_status_check is unchanged (no status added/removed) ──
-- Expected: unchanged from pre-migration — 'draft', 'published', 'archived'.

select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.alerts'::regclass and contype = 'c' and conname = 'alerts_status_check';


-- ── 6. Confirm automation_identities itself is untouched by this migration ──
-- Expected: identical to Sprint 177D's own audit — exactly two columns,
-- user_id and created_at, no new column added.

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'automation_identities'
order by ordinal_position;


-- ── 7. Row count sanity check — this migration changes zero data ───────────
-- Expected: identical to the value recorded immediately before applying
-- the migration in the same sitting — this migration is RLS-only and
-- must never change this number.

select count(*) as alerts_row_count from public.alerts;
