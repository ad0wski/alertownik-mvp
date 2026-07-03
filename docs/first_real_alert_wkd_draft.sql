-- ============================================================================
-- Alertownik — FIRST REAL ALERT DRAFT (Option B) — WKD speed restrictions
-- Sprint 107 (2026-07-03). A filled copy of docs/draft_alert_insert_template.sql
-- for the first real alert candidate. Content comes ONLY from the official
-- WKD notice "Ograniczenia prędkości pociągów na linii WKD" (published
-- 2026-06-29) as provided by Adam — nothing invented.
-- Contract: Obsidian "First Real Alert Draft Pack" + "First Real Alert
-- Candidate — WKD Speed Restrictions".
-- ============================================================================
-- STATUS: DRAFT-ONLY. DO NOT RUN UNTIL ADAM REVIEWS SOURCE AND FIELDS.
-- DO NOT SET STATUS TO PUBLISHED IN SQL.
-- ONE placeholder remains and MUST be filled by Adam before running:
--   <SOURCE_URL> — the DIRECT link to the WKD notice (not the homepage,
--   not the /aktualnosci listing). Adam finds it at
--   https://wkd.com.pl/aktualnosci — the notice titled
--   "Ograniczenia prędkości pociągów na linii WKD". Claude Code did not
--   invent a deep link on purpose — an unverified URL must never ship.
-- Publishing stays a manual admin click in the Builder ("Opublikuj w
-- Supabase") — that is what sets published_at. Draft rows are invisible
-- to the public (anon RLS shows status = 'published' only).
--
-- FIELD NOTES (schema verified live 2026-07-03, Sprint 106S):
--   starts_at — 2026-06-29 is the notice's PUBLICATION date; the notice
--   says the restrictions "have been introduced", so they were in effect
--   by that date. If the notice text names a different effective date,
--   Adam corrects this before running.
--   ends_at — null: the source does not give an end date. Do not guess.
--   severity 'info' — the source says "several-minute delays", not a
--   service suspension; escalate to 'warning' only if Adam judges so.
-- ============================================================================

insert into public.alerts
  (slug, category, severity, title, place, change, action,
   starts_at, ends_at, source_name, source_url, status)
values
  (
    'wkd-ograniczenia-predkosci-2026-06-29',  -- unique; insert fails on duplicate (feature, not bug)
    'transport',                              -- DB enum value (UI label: Transport)
    'info',                                   -- several-minute delays = info
    'Możliwe kilkuminutowe opóźnienia na linii WKD',
    'Linia WKD — Komorów, Pruszków WKD i okolice',
    'WKD poinformowała, że z powodu wysokich temperatur wprowadzono ograniczenia prędkości pociągów na linii WKD. Może to powodować kilkuminutowe opóźnienia pociągów.',
    'Przed podróżą sprawdź aktualny rozkład jazdy i komunikaty WKD.',  -- Sprint 108: action text per Adam's brief
    '2026-06-29 00:00:00+02',                 -- see FIELD NOTES: publication date; confirm effective date in the notice
    null,                                     -- source gives no end date — stays null
    'Warszawska Kolej Dojazdowa',
    '<SOURCE_URL>',                           -- ← ADAM: direct notice link, REQUIRED before running
    'draft'                                   -- NEVER change this to 'published' here
  )
returning id, slug, status;

-- ============================================================================
-- AFTER RUNNING (manual, in the app):
--   1. /builder → "Alerty w Supabase" → the draft appears → "Edytuj" →
--      compare every field against the open WKD notice.
--   2. Publish ONLY via "Opublikuj w Supabase" after the Publish / Don't
--      Publish gate passes (Real Alert Execution Checklist). Then check
--      the public page + mobile and log the result in Manual Publishing Log.
--
-- ROLLBACK (if the draft was a mistake — safe, it never went public):
--   delete from public.alerts
--     where slug = 'wkd-ograniczenia-predkosci-2026-06-29' and status = 'draft';
-- ============================================================================
