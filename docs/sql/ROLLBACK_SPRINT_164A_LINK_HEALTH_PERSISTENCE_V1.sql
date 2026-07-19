-- Sprint 164A — Rollback for PROPOSED_SPRINT_164A_LINK_HEALTH_PERSISTENCE_V1.sql.
-- NOT EXECUTED. Only relevant if the forward migration was applied first.
-- Drops exactly the four columns that migration adds — nothing else on
-- alert_sources, nothing on any other table, no RLS policy touched.

begin;

alter table public.alert_sources
  drop column if exists last_health_check_at,
  drop column if exists last_health_outcome,
  drop column if exists last_health_http_status,
  drop column if exists last_health_reason_code;

commit;
