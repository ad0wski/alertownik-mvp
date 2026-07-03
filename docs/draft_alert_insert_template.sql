-- ============================================================================
-- Alertownik — Draft-Only Alert Insert Template
-- Sprint 106S (2026-07-03): the "Option B — Draft-only SQL flow" of the
-- Low Manual Real Alert Workflow (see Obsidian: Low Manual Real Alert
-- Workflow). Lets Adam create a real alert DRAFT with one paste in the
-- Supabase SQL Editor instead of filling the Builder form field by field.
-- ============================================================================
-- STATUS: TEMPLATE — DO NOT RUN UNTIL FILLED WITH REAL VERIFIED SOURCE DATA.
-- REQUIRES ADAM APPROVAL BEFORE RUNNING. Never run automatically, never via
-- script, never by Claude Code (its MCP access is read-only by design).
--
-- WHAT THIS DOES: inserts exactly ONE row into public.alerts with
-- status = 'draft'. Draft rows are NOT visible publicly — the anon RLS
-- policy only exposes status = 'published'. Publishing stays a manual
-- admin click in the Builder ("Opublikuj w Supabase"), which is also what
-- sets published_at. This template must never be edited to insert
-- status = 'published' directly.
--
-- WHAT THIS DOES NOT DO (on purpose): none of the Builder's client-side
-- quality checks run here — no placeholder-wording detection, no
-- pre-publish warning list, no automatic slug generation. That is the
-- trade-off of skipping the form. Compensate by following the
-- "Real Alert Execution Checklist" (Obsidian) sections A + B before
-- pasting, and NEVER writing anything into a value that is not literally
-- in the official source.
--
-- FIELD RULES (live schema verified 2026-07-03 via read-only MCP):
--   category  — one of: 'transport','water','power','waste','roads',
--               'announcement'   (DB uses 'announcement' where the app UI
--               says "municipal/komunikaty" — do NOT write 'municipal')
--   severity  — one of: 'info','warning','urgent'
--   status    — MUST stay 'draft' (allowed: draft/published/archived;
--               this template only ever creates drafts)
--   slug      — unique, lowercase-with-hyphens, e.g. 'wkd-utrudnienia-2026-07-04'
--               (a duplicate slug makes the insert fail — that is a
--               feature, it prevents silently overwriting an alert)
--   starts_at / ends_at — when the DISRUPTION starts/ends (timestamptz,
--               e.g. '2026-07-04 06:00:00+02'), NOT when the source
--               published the notice; ends_at may be NULL if unknown
--
-- TWO CHECKLIST FIELDS THAT HAVE NO COLUMN HERE (record them in Obsidian,
-- in "First Alert Candidate Template" / "Manual Publishing Log", not in SQL):
--   <SOURCE_PUBLISHED_AT> — when the official source published the notice
--   <VERIFIED_AT>         — when Adam verified it; the public "Ostatnia
--                           weryfikacja przez admina" label reads
--                           updated_at, which this insert sets to now()
--                           automatically, so today's insert = today's
--                           verification date
-- ============================================================================

insert into public.alerts
  (slug, category, severity, title, place, change, action,
   starts_at, ends_at, source_name, source_url, status)
values
  (
    '<SLUG>',                    -- unique, e.g. 'zrodlo-temat-2026-07-04'
    '<CATEGORY>',                -- transport|water|power|waste|roads|announcement
    '<SEVERITY>',                -- info|warning|urgent
    '<TITLE>',                   -- resident-readable, no official jargon 1:1
    '<AREA>',                    -- e.g. 'Komorów', 'Pruszków — ul. ...' (no exact addresses)
    '<SUMMARY>',                 -- "Co się zmienia" — only facts present in the source
    '<ACTION>',                  -- "Co zrobić" — only if the source actually advises it
    '<STARTS_AT>',               -- disruption start, timestamptz, e.g. '2026-07-04 06:00:00+02'
    null,                        -- <ENDS_AT> if the source gives one, else null
    '<SOURCE_NAME>',             -- e.g. 'Gmina Michałowice — komunikaty'
    '<SOURCE_URL>',              -- the specific notice URL, not the homepage
    'draft'                      -- NEVER change this to 'published' here
  )
returning id, slug, status;

-- ============================================================================
-- AFTER RUNNING (manual, in the app):
--   1. /builder → "Alerty w Supabase" → the new row appears with status
--      draft → "Edytuj" to review every field against the source.
--   2. Publish ONLY via the Builder's "Opublikuj w Supabase" button, after
--      the Publish / Don't Publish gate (Real Alert Execution Checklist)
--      passes. Then do the public + mobile check and log the result.
--
-- ROLLBACK (if the draft was a mistake — safe, it never went public):
--   delete from public.alerts where slug = '<SLUG>' and status = 'draft';
-- ============================================================================
