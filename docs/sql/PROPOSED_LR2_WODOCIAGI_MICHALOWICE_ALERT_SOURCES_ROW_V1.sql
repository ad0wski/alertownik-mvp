-- ============================================================================
-- NOT YET APPLIED — REQUIRES ADAM'S EXPLICIT MANUAL EXECUTION
-- ============================================================================
-- LR-2 — Coverage Activation. Optional registry-provenance row for
-- `wodociagi-michalowice`, so a future scheduled-writer insert for this
-- source can carry a real `source_id` and log a `source_checks` row —
-- exactly the same model already live for `michalowice-komunikaty`
-- (see SCHEDULED_WRITER_SOURCE_REGISTRY_IDS / getRegistrySourceId,
-- scheduledWriter.ts).
--
-- NOT REQUIRED to start producing pending candidates — the writer's
-- source_id column is nullable and already degrades safely to NULL
-- (confirmed live, 2026-11-08, by this exact sprint's own fake-writer
-- test: tests/e2e/wodociagiMichalowiceReadiness.spec.ts). This file exists
-- only for provenance PARITY with the existing hardening, as an optional
-- follow-up — never a precondition for the primary activation step
-- (which is the SCHEDULED_WRITER_ALLOWED_SOURCE_IDS env change described
-- in the LR-2 report, §4 — not a database action at all).
--
-- Verified live before writing this file: no alert_sources row currently
-- matches '%wodociagimichalowice%' (confirmed via a read-only SELECT,
-- zero rows) — this is a genuinely new row, not a duplicate.
--
-- Safe to run: INSERT only, one row, into a table already covered by
-- existing RLS admin-only write policies. Does not touch any other
-- table, does not alter schema, does not change any RLS policy.
-- ============================================================================

insert into public.alert_sources (name, url, category, is_active, source_type)
values (
  'Wodociągi Michałowice',
  'https://wodociagimichalowice.pl/category/aktualnosci/',
  'water',
  true,
  'website'
);

-- After running, copy the new row's id into Vercel Production:
--   SCHEDULED_WRITER_SOURCE_REGISTRY_IDS = {"michalowice-komunikaty":"a56cfb33-a443-47aa-8365-89c6303e7fcc","wodociagi-michalowice":"<new id from above>"}
-- (merging with, not replacing, the existing Michałowice entry — never
-- remove an existing mapping while adding a new one).

-- ── Read-only verification after running (do not skip) ──────────────────────
-- select id, name, url, category, is_active from public.alert_sources
--   where url ilike '%wodociagimichalowice%';
-- Expected: exactly 1 row, matching the values above.
