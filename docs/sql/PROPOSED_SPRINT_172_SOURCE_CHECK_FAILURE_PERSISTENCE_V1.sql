-- Sprint 172 — EXECUTED on Production (alertownik-mvp) by Adam via the
-- Supabase SQL Editor, one time, after explicit review of a hash-verified
-- checkpoint. Result: "Success. No rows returned" — clean commit, no
-- error. Read-only VERIFY passed in full afterward — see
-- docs/SPRINT_172_SOURCE_HEALTH_PERSISTENCE_V1.md §12–13 for the record.
-- This file's SQL body below is unchanged from what was actually run —
-- kept verbatim as the historical, exact record of the migration.
--
-- Sprint 172 — forward migration for persisting failed manual
-- source checks. Review, then run
-- manually in the Supabase SQL editor. Pair with
-- VERIFY_SPRINT_172_SOURCE_CHECK_FAILURE_PERSISTENCE_READ_ONLY_V1.sql
-- before and after, and keep
-- ROLLBACK_SPRINT_172_SOURCE_CHECK_FAILURE_PERSISTENCE_V1.sql on hand.
--
-- Why this exists: source_checks.result is a closed vocabulary with no
-- failure value at all (no_changes | found_notice | alert_created |
-- needs_followup). A failed manual check ("Sprawdź teraz przez
-- aplikację") has therefore never been persisted anywhere — visible only
-- for the current browser tab, gone on reload (Sprint 137's own
-- HEALTH_ERROR_FALLBACK_NOTE already discloses this honestly; Sprint 171
-- added a session-only, non-persisted mirror of it on the Source Health
-- dashboard, explicitly as a stopgap pending this migration — see
-- docs/SPRINT_171_SOURCE_HEALTH_OBSERVABILITY_V1.md §2/§7).
--
-- This migration adds exactly what's needed to answer, from real
-- persisted history, every field Sprint 172's brief asked for: last
-- attempt (existing checked_at, now meaningful for failures too), last
-- success (computed in application code as MAX(checked_at) WHERE
-- result <> 'failed' — no new column needed), last result (existing
-- result column, extended vocabulary), consecutive failures (computed in
-- application code by walking check history — no new counter column,
-- avoiding a second, potentially-drifting source of truth), a safe error
-- code, and a safe error summary.

begin;

alter table public.source_checks
  drop constraint if exists source_checks_result_check;

alter table public.source_checks
  add constraint source_checks_result_check
    check (result = any (array[
      'no_changes'::text,
      'found_notice'::text,
      'alert_created'::text,
      'needs_followup'::text,
      'failed'::text
    ]));

alter table public.source_checks
  add column if not exists error_code text
    check (error_code is null or error_code = any (array[
      'http_4xx'::text,
      'http_5xx'::text,
      'non_html_content_type'::text,
      'network_error'::text,
      'timeout_10s'::text,
      'parse_exception'::text
    ])),
  add column if not exists error_summary text
    check (error_summary is null or char_length(error_summary) <= 200);

comment on column public.source_checks.error_code is
  'Sprint 172 (proposed): short machine code for a failed manual check, matching src/lib/scheduledWriterRunSafety.ts FetchDiagnosticCode. Null for every row where result <> ''failed'' and for every row created before this migration. Never a raw exception or stack trace.';
comment on column public.source_checks.error_summary is
  'Sprint 172 (proposed): already-curated, admin-facing Polish message (the same text the check panel showed at the time), capped at 200 chars — same convention as scheduled_writer_runs.error_summary. Never raw HTML, a stack trace, a token, a cookie, or an Authorization header value.';

commit;

-- No RLS policy change. The four existing admin_profiles-gated policies
-- on source_checks (SELECT/INSERT/UPDATE/DELETE) already cover these two
-- new plain columns with zero changes — an admin who could already insert
-- a source_checks row of any existing result value can now also insert
-- one with result = 'failed' plus the two new columns, through the exact
-- same authenticated Supabase client path every other write already
-- uses. The separate, narrower "Scheduled writer can insert automated
-- source_checks" policy is UNCHANGED and UNTOUCHED by this migration: its
-- own with_check clause still only allows result IN ('no_changes',
-- 'found_notice') — the scheduled writer/cron still cannot log a
-- failure, matching this sprint's explicit constraint (zero writer, zero
-- cron changes). If a future sprint wants the scheduled writer to log its
-- own failures, that policy needs its own deliberate, separate migration
-- and review — not a side effect of this one.
--
-- No backfill needed or performed: 'failed' never existed before this
-- migration, so every existing row is, by construction, a real completed
-- check with one of the four original result values — error_code and
-- error_summary are simply NULL for all of them via ALTER TABLE ADD
-- COLUMN's default NULL, with no UPDATE statement anywhere in this file.
