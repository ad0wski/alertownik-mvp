-- Sprint 164A — Proposed forward migration for persisting link health
-- check results on alert_sources. NOT EXECUTED as part of Sprint 164A.
--
-- Why this exists: the live Link Health Panel (src/lib/linkHealthCheck.ts,
-- src/components/LinkHealthPanel.tsx, /api/admin/link-health) currently
-- computes reachability on demand, entirely in memory, and shows the
-- result only for the current browser session — nothing is written to
-- Supabase. That was a deliberate choice for this sprint (CLAUDE.md rule:
-- never change the schema without Adam explicitly requesting it), not a
-- limitation Claude tried to hide — see
-- docs/SPRINT_164A_AUTOMATION_LINK_HEALTH_SAFE_FOUNDATION_V1.md.
--
-- If Adam later wants a persisted health history (so "last checked" and
-- "last known status" survive a page reload, and so a future scheduled
-- job could run health checks unattended), this is the proposed shape.
-- Review, then run manually in the Supabase SQL editor. Pair with
-- VERIFY_SPRINT_164A_LINK_HEALTH_READ_ONLY_V1.sql before and after, and
-- keep ROLLBACK_SPRINT_164A_LINK_HEALTH_PERSISTENCE_V1.sql on hand.

begin;

alter table public.alert_sources
  add column if not exists last_health_check_at timestamptz,
  add column if not exists last_health_outcome text
    check (last_health_outcome in ('healthy', 'needs_attention', 'blocked')),
  add column if not exists last_health_http_status integer,
  add column if not exists last_health_reason_code text;

comment on column public.alert_sources.last_health_check_at is
  'Sprint 164A (proposed): timestamp of the most recent live link-reachability check. Distinct from last_checked_at, which tracks manual content review, not HTTP reachability.';
comment on column public.alert_sources.last_health_outcome is
  'Sprint 164A (proposed): healthy | needs_attention | blocked — see src/lib/linkHealthCheck.ts LinkHealthOutcome.';
comment on column public.alert_sources.last_health_http_status is
  'Sprint 164A (proposed): raw HTTP status from the last health check, or null if the request never completed (timeout/blocked).';
comment on column public.alert_sources.last_health_reason_code is
  'Sprint 164A (proposed): short machine code (e.g. http_404, timeout, private_ip) — never a raw error message or stack trace.';

commit;

-- No RLS policy change needed: these are plain columns on alert_sources,
-- already covered by the existing four admin_profiles-gated policies
-- (SELECT/INSERT/UPDATE/DELETE), verified live on Production per
-- docs/SPRINT_161_CRITICAL_SECURITY_HARDENING_V1.md §10a. Writing these
-- columns would go through the same admin-authenticated Supabase client
-- the browser already uses for every other alert_sources update — this
-- migration does not grant the scheduled writer (automation_identities)
-- anything, matching Sprint 146's decision that it has zero access to
-- alert_sources at all.
