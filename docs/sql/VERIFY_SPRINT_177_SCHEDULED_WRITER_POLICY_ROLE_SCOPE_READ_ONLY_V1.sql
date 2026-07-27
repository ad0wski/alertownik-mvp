-- ============================================================================
-- READ ONLY — NO DATABASE MODIFICATION
-- ============================================================================
-- Sprint 177F-E — verification companion for
-- docs/sql/CORRECTIVE_SPRINT_177_SCHEDULED_WRITER_POLICY_ROLE_SCOPE_V1.sql.
--
-- THIS FILE CONTAINS SELECT STATEMENTS ONLY. No INSERT, UPDATE, DELETE,
-- ALTER, CREATE, DROP, GRANT, or REVOKE. Safe to run at any time, any
-- number of times, before or after the corrective migration — it changes
-- nothing.
-- ============================================================================


-- ── 1. RLS remains enabled on all three affected tables ─────────────────────
-- Expected: rls_enabled = true for alerts, source_checks,
-- source_notice_candidates, automation_identities — unchanged before/after.

select relname as table_name, relrowsecurity as rls_enabled, relforcerowsecurity as rls_forced
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('alerts', 'source_checks', 'source_notice_candidates', 'automation_identities')
order by relname;


-- ── 2. Each corrected scheduled-writer policy exists exactly once ──────────
-- Expected AFTER hotfix: exactly 4 rows —
--   alerts / Scheduled writer can select alerts for deduplication / SELECT
--   source_checks / Scheduled writer can insert automated source_checks / INSERT
--   source_notice_candidates / Scheduled writer can insert pending source_notice_candidates / INSERT
--   source_notice_candidates / Scheduled writer can select source_notice_candidates / SELECT
-- Each roles column must read exactly {authenticated} — not {public}, not
-- {anon}, not any other combination.

select tablename, policyname, cmd, roles, permissive
from pg_policies
where schemaname = 'public'
  and policyname in (
    'Scheduled writer can select alerts for deduplication',
    'Scheduled writer can insert automated source_checks',
    'Scheduled writer can insert pending source_notice_candidates',
    'Scheduled writer can select source_notice_candidates'
  )
order by tablename, policyname;


-- ── 3. No policy anywhere in the schema still has this gap ─────────────────
-- Expected: ZERO rows. If this returns any row, some automation_identities
-- -based policy still lacks an explicit authenticated-only role scope and
-- was missed by the hotfix.

select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and (qual ilike '%automation_identities%' or with_check ilike '%automation_identities%')
  and roles::text <> '{authenticated}';


-- ── 4. qual/with_check text is unchanged — only role scope changed ─────────
-- Expected: each row's qual/with_check text is identical in substance to
-- the pre-hotfix version (same automation_identities EXISTS shape, same
-- extra WITH CHECK conditions on source_checks/source_notice_candidates
-- INSERT policies) — compare manually against the pre-hotfix pg_policies
-- snapshot taken during this sprint's Etap 1 audit.

select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and policyname in (
    'Scheduled writer can select alerts for deduplication',
    'Scheduled writer can insert automated source_checks',
    'Scheduled writer can insert pending source_notice_candidates',
    'Scheduled writer can select source_notice_candidates'
  )
order by tablename, policyname;


-- ── 5. The public anon read policy on alerts is untouched ──────────────────
-- Expected: exactly 1 row, roles={anon}, qual references status='published'.

select policyname, roles, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'alerts' and policyname = 'Public can read published alerts';


-- ── 6. The four admin policies on alerts are untouched ──────────────────────
-- Expected: exactly 4 rows, roles={authenticated}, each qual referencing
-- admin_profiles — identical to every prior sprint's audit of this table.

select policyname, roles, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'alerts'
  and policyname like 'Admins can%'
order by policyname;


-- ── 7. No new INSERT/UPDATE/DELETE policy exists on alerts ─────────────────
-- Expected: the only non-admin, non-anon policy on alerts is the single
-- corrected SELECT policy from section 2 above — no new mutation policy
-- was introduced for the scheduled writer.

select policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'alerts'
order by policyname;


-- ── 8. Table-level grants on alerts/source_checks/source_notice_candidates
-- are unchanged — this hotfix touches policies only, never GRANT/REVOKE ──
-- Expected: identical to the pre-hotfix snapshot recorded during Sprint
-- 177F-E's Etap 1 audit (anon: SELECT+INSERT on all three; authenticated:
-- SELECT+INSERT on all three).

select c.relname as table_name,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
  has_table_privilege('anon', c.oid, 'INSERT') as anon_insert,
  has_table_privilege('authenticated', c.oid, 'SELECT') as auth_select,
  has_table_privilege('authenticated', c.oid, 'INSERT') as auth_insert
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('alerts', 'source_checks', 'source_notice_candidates')
order by c.relname;


-- ── 9. automation_identities grants remain untouched — anon still has zero
-- access to this table, by design ──────────────────────────────────────────
-- Expected: anon_select = false, anon_insert = false. If either is true,
-- something (not this hotfix, which contains no GRANT statement) has
-- widened access to this table and must be investigated immediately.

select c.relname as table_name,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
  has_table_privilege('anon', c.oid, 'INSERT') as anon_insert,
  has_table_privilege('anon', c.oid, 'UPDATE') as anon_update,
  has_table_privilege('anon', c.oid, 'DELETE') as anon_delete
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'automation_identities';


-- ── 10. automation_identities row count is unchanged ────────────────────────
-- Expected: identical to the value recorded immediately before this
-- hotfix in the same sitting (2 rows, per this sprint's own audit) — this
-- hotfix is policy-role-scope-only and must never change this number.

select count(*) as automation_identities_row_count from public.automation_identities;


-- ── 11. automation_identities column shape is unchanged ─────────────────────
-- Expected: exactly two columns, user_id and created_at.

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'automation_identities'
order by ordinal_position;


-- ── 12. No new function or trigger was introduced ──────────────────────────
-- Expected: this query returns the same trigger set as before the hotfix
-- (this migration defines no functions or triggers at all, so any change
-- here would indicate something outside this hotfix's own scope ran).

select event_object_table, trigger_name, event_manipulation
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table in ('alerts', 'source_checks', 'source_notice_candidates', 'automation_identities')
order by event_object_table, trigger_name;


-- ── 13. Application data row counts are unchanged ───────────────────────────
-- Expected: identical to the values recorded immediately before this
-- hotfix in the same sitting — this migration changes zero data.

select
  (select count(*) from public.alerts) as alerts_row_count,
  (select count(*) from public.source_checks) as source_checks_row_count,
  (select count(*) from public.source_notice_candidates) as source_notice_candidates_row_count;
