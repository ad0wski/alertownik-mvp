-- ============================================================================
-- Alertownik — Waste Schedule EXAMPLE Seed (Sprint 85)
-- ============================================================================
-- STATUS: EXAMPLE ONLY — DO NOT RUN AGAINST PRODUCTION AS REAL DATA.
-- Claude Code did not run this file and will not run it automatically.
--
-- This is the SQL-Editor equivalent of the JSON payload in
-- docs/WASTE_SCHEDULE_SAMPLE_DATA.md (same 7 rows, same sources, same
-- "PRZYKŁAD" markers) — for an admin who prefers the Supabase SQL Editor
-- over `/admin/waste`'s "Import z JSON →" panel. Both are example-only;
-- neither is verified official data.
--
-- No real official collection dates were available to transcribe at the
-- time this file was written (see Research.md's "Waste Schedule Source
-- Strategy" in Obsidian — manual transcription from the official
-- Eco-Harmonogram / MZO Pruszków sources hasn't happened yet). Inventing
-- a "realistic-looking" date and presenting it as real would violate this
-- project's explicit rule against fabricating official data — so every
-- date below is a placeholder, not a guess at the real calendar.
--
-- SAFE WAYS TO USE THIS FILE:
--   1. Run it in a SQL Editor against this project to see the import
--      mechanic work end-to-end, then DELETE these rows before pointing
--      real testers at `/odpady`.
--   2. Copy the *shape* only, replace every collection_date/source_name/
--      source_url with what the real official source actually says for
--      a real locality, then run your edited version.
--   3. Prefer `/admin/waste`'s "Import z JSON →" for real data entry —
--      it shares the exact same validation as the single-row form and
--      now also warns about duplicates within a pasted batch (Sprint 85).
--      This file exists for SQL-comfortable admins/scripted use, not as
--      the primary import path.
-- ============================================================================

insert into public.waste_schedule_items
  (locality, area_name, street_group, waste_type, collection_date, source_name, source_url, notes)
values
  ('Komorów', 'Strefa A', 'ul. Główna – ul. Sportowa', 'mixed', '2026-07-03',
   'Eco-Harmonogram', 'https://www.pruszkow.pl/aplikacja-eco-harmonogram/',
   'PRZYKŁAD — zweryfikuj datę przed pozostawieniem na żywo.'),

  ('Komorów', 'Strefa A', 'ul. Główna – ul. Sportowa', 'bio', '2026-07-03',
   'Eco-Harmonogram', 'https://www.pruszkow.pl/aplikacja-eco-harmonogram/',
   'PRZYKŁAD'),

  ('Komorów', 'Strefa A', 'ul. Główna – ul. Sportowa', 'paper', '2026-07-10',
   'Eco-Harmonogram', 'https://www.pruszkow.pl/aplikacja-eco-harmonogram/',
   'PRZYKŁAD'),

  ('Komorów', 'Strefa A', 'ul. Główna – ul. Sportowa', 'plastics_metals', '2026-07-10',
   'Eco-Harmonogram', 'https://www.pruszkow.pl/aplikacja-eco-harmonogram/',
   'PRZYKŁAD'),

  ('Komorów', 'Strefa B', 'ul. Kolejowa – ul. Polna', 'mixed', '2026-07-04',
   'Eco-Harmonogram', 'https://www.pruszkow.pl/aplikacja-eco-harmonogram/',
   'PRZYKŁAD'),

  ('Pruszków', null, null, 'glass', '2026-07-15',
   'MZO Pruszków — terminy odbioru odpadów', 'https://www.pruszkow.pl/mieszkancy/terminy-odbioru-odpadow/',
   'PRZYKŁAD'),

  ('Pruszków', null, null, 'bulky', '2026-08-01',
   'MZO Pruszków — terminy odbioru odpadów', 'https://www.pruszkow.pl/mieszkancy/terminy-odbioru-odpadow/',
   'PRZYKŁAD — odbiór gabarytów bywa rzadszy, zweryfikuj częstotliwość.');

-- ============================================================================
-- Cleanup — run this once you're done testing the mechanic, before any
-- real tester sees the page:
-- ============================================================================
-- delete from public.waste_schedule_items where notes like 'PRZYKŁAD%';
-- ============================================================================
