-- ============================================================================
-- Sprint 121 — DRAFT-ONLY insert proposal: Pruszków hot water / heating
-- interruption notice (fresh alert candidate #3)
-- (fallback path — use ONLY if the /admin/new-alert save-draft flow fails;
--  the recommended path is Flow B: /admin/new-alert → save draft → Builder)
--
-- ⚠️  RUN ONLY AFTER ADAM APPROVES AND FILLS THE REAL SOURCE URL.
-- ⚠️  This inserts a DRAFT (status = 'draft') — NOT visible publicly.
-- ⚠️  Publish happens manually in the Builder after source verification.
-- ⚠️  Claude Code must never execute this file — Adam pastes it into the
--     Supabase SQL Editor himself.
--
-- Source facts (nothing invented beyond the official notice):
--   Source:    Miasto Pruszków
--   Notice:    "Przerwa w dostawie energii cieplnej i ciepłej wody"
--   Published: 2026-06-29
--   Period:    2026-07-04 14:00 → 2026-07-09 06:00
--   Cause:     planned renovation works in Elektrociepłownia Pruszków
--              and the heating network
--   Effect:    interruption in heating energy supply, including domestic
--              hot water
-- ============================================================================

INSERT INTO alerts (
  slug,
  category,
  severity,
  title,
  place,
  starts_at,
  ends_at,
  change,
  action,
  source_name,
  source_url,
  status
) VALUES (
  'przerwa-cieplo-cwu-pruszkow-2026-07-04',
  'water',      -- closest existing category (domestic hot water); no new "heating" category — no schema change for one alert
  'warning',
  'Przerwa w dostawie ciepła i ciepłej wody w Pruszkowie (4–9 lipca)',
  'Pruszków — obszar zasilany z Elektrociepłowni Pruszków (sieć ciepłownicza)',
  '2026-07-04T14:00',
  '2026-07-09T06:00',
  'Od 4 lipca (godz. 14:00) do 9 lipca (godz. 6:00) planowana jest przerwa w dostawie energii cieplnej, w tym ciepłej wody użytkowej. Powód: planowane prace remontowe w Elektrociepłowni Pruszków i na sieci ciepłowniczej.',
  'Przygotuj się na brak ciepłej wody w tym okresie. Szczegóły i ewentualne zmiany terminu sprawdź w oficjalnym komunikacie Miasta Pruszków.',
  'Miasto Pruszków',
  'https://www.pruszkow.pl/TODO-UZUPELNIJ-DOKLADNY-LINK-DO-KOMUNIKATU',  -- ⚠️ REPLACE with the exact notice URL before running
  'draft'                                                                -- ⚠️ stays 'draft' — do NOT change to 'published' here
)
RETURNING id, slug, status, title;

-- Rollback (if needed): removes ONLY this draft, matched by its unique slug.
-- DELETE FROM alerts
--   WHERE slug = 'przerwa-cieplo-cwu-pruszkow-2026-07-04' AND status = 'draft';
