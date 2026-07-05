-- ============================================================================
-- Sprint 118 — DRAFT-ONLY insert proposal: Pruszków roadworks notice
-- (fallback path C — use ONLY if the /admin/new-alert save-draft flow fails)
--
-- ⚠️  RUN ONLY AFTER ADAM APPROVES AND FILLS THE REAL SOURCE URL.
-- ⚠️  This inserts a DRAFT (status = 'draft') — NOT visible publicly.
-- ⚠️  Publish happens manually in the Builder after source verification.
-- ⚠️  Claude Code must never execute this file — Adam pastes it into the
--     Supabase SQL Editor himself.
--
-- Source facts (nothing invented beyond the official notice):
--   Source:    Miasto Pruszków
--   Notice:    "Utrudnienia w ruchu na ul. Komorowskiej i ul. Bolesława Prusa"
--   Published: 2026-07-03
--   Works:     2026-07-06 → 2026-07-07, frezowanie nawierzchni
--   Area:      ul. Komorowska (od ul. Żwirowej do ul. Brzozowej),
--              Komorów i Pruszków; ul. Bolesława Prusa w Pruszkowie
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
  'utrudnienia-komorowska-prusa-2026-07-06',
  'roads',
  'warning',
  'Utrudnienia w ruchu na ul. Komorowskiej i Bolesława Prusa',
  'ul. Komorowska (od ul. Żwirowej do ul. Brzozowej) i ul. Bolesława Prusa — Komorów / Pruszków',
  '2026-07-06',
  '2026-07-07',
  'W dniach 6–7 lipca 2026 r. prowadzone będą prace drogowe polegające na frezowaniu nawierzchni. Prace obejmą m.in. ul. Komorowską na odcinku od ul. Żwirowej do ul. Brzozowej w Komorowie i Pruszkowie oraz ul. Bolesława Prusa w Pruszkowie.',
  'W czasie prac uwzględnij możliwe czasowe utrudnienia i ograniczenia w przejeździe.',
  'Miasto Pruszków',
  'https://www.pruszkow.pl/TODO-UZUPELNIJ-DOKLADNY-LINK-DO-KOMUNIKATU',  -- ⚠️ REPLACE with the exact notice URL before running
  'draft'                                                                -- ⚠️ stays 'draft' — do NOT change to 'published' here
)
RETURNING id, slug, status, title;

-- Rollback (if needed): removes ONLY this draft, matched by its unique slug.
-- DELETE FROM alerts
--   WHERE slug = 'utrudnienia-komorowska-prusa-2026-07-06' AND status = 'draft';
