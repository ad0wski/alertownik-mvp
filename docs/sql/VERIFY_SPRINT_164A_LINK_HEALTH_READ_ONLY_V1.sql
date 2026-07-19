-- Sprint 164A — read-only verification for the proposed link-health
-- persistence columns. Safe to run before AND after
-- PROPOSED_SPRINT_164A_LINK_HEALTH_PERSISTENCE_V1.sql — contains no writes.
-- Run before: confirms the columns do not exist yet (expected today).
-- Run after (only if the forward migration is applied): confirms exactly
-- the four expected columns exist with the expected types/constraints.

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'alert_sources'
  and column_name in (
    'last_health_check_at',
    'last_health_outcome',
    'last_health_http_status',
    'last_health_reason_code'
  )
order by column_name;

-- Confirms RLS is still enabled and the four existing admin_profiles
-- policies on alert_sources are unchanged by this proposal.
select polname, polcmd
from pg_policy
where polrelid = 'public.alert_sources'::regclass
order by polname;
