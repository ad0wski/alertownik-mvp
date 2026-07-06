-- ============================================================================
-- Sprint 122 — Komorów waste schedule seed TEMPLATE (single-family housing)
--
-- ⚠️  RUN ONLY AFTER DATES ARE VERIFIED AGAINST OFFICIAL PDF.
-- ⚠️  Every collection_date below is a PLACEHOLDER ('RRRR-MM-DD') — this
--     file contains ZERO real dates on purpose. Replace each placeholder
--     with a date read 1:1 from the official Gmina Michałowice PDF:
--     https://www.michalowice.pl/files/307953978/file/harmonogram_jednorodzinna_final3.pdf
--     (schedule valid 2026-01-01 → 2026-12-31).
-- ⚠️  Claude Code must never execute this file — Adam pastes it into the
--     Supabase SQL Editor himself, after filling real dates.
-- ⚠️  The RECOMMENDED import path is /admin/waste → "Import z JSON"
--     (preview + duplicate/past-date warnings). This SQL template is the
--     fallback for a SQL-comfortable session. Do not use both paths for
--     the same rows (duplicates).
--
-- Batch marker: every row's `notes` starts with 'sprint-122-komorow-b1'
-- so the whole batch can be reviewed and, if needed, rolled back together
-- (waste_schedule_items has no batch/verified columns — notes is the
-- documented convention, see docs/waste-schedule-import-template.md).
-- Keep the marker if you edit the notes text.
-- ============================================================================

insert into public.waste_schedule_items
  (locality, area_name, street_group, waste_type, collection_date, source_name, source_url, notes)
values
  -- One row per waste type per collection date. Duplicate a line for each
  -- extra date of the same type. Delete lines for types the PDF does not
  -- list for Komorów. area_name/street_group: fill ONLY if the official
  -- PDF splits Komorów into zones/street ranges; otherwise leave NULL.
  ('Komorów', null, null, 'mixed', 'RRRR-MM-DD',
   'Harmonogram odbioru odpadów 2026 — Gmina Michałowice (zabudowa jednorodzinna)',
   'https://www.michalowice.pl/files/307953978/file/harmonogram_jednorodzinna_final3.pdf',
   'sprint-122-komorow-b1 — zweryfikowano RRRR-MM-DD z harmonogram_jednorodzinna_final3.pdf'),

  ('Komorów', null, null, 'paper', 'RRRR-MM-DD',
   'Harmonogram odbioru odpadów 2026 — Gmina Michałowice (zabudowa jednorodzinna)',
   'https://www.michalowice.pl/files/307953978/file/harmonogram_jednorodzinna_final3.pdf',
   'sprint-122-komorow-b1 — zweryfikowano RRRR-MM-DD z harmonogram_jednorodzinna_final3.pdf'),

  ('Komorów', null, null, 'plastics_metals', 'RRRR-MM-DD',
   'Harmonogram odbioru odpadów 2026 — Gmina Michałowice (zabudowa jednorodzinna)',
   'https://www.michalowice.pl/files/307953978/file/harmonogram_jednorodzinna_final3.pdf',
   'sprint-122-komorow-b1 — zweryfikowano RRRR-MM-DD z harmonogram_jednorodzinna_final3.pdf'),

  ('Komorów', null, null, 'glass', 'RRRR-MM-DD',
   'Harmonogram odbioru odpadów 2026 — Gmina Michałowice (zabudowa jednorodzinna)',
   'https://www.michalowice.pl/files/307953978/file/harmonogram_jednorodzinna_final3.pdf',
   'sprint-122-komorow-b1 — zweryfikowano RRRR-MM-DD z harmonogram_jednorodzinna_final3.pdf'),

  ('Komorów', null, null, 'bio', 'RRRR-MM-DD',
   'Harmonogram odbioru odpadów 2026 — Gmina Michałowice (zabudowa jednorodzinna)',
   'https://www.michalowice.pl/files/307953978/file/harmonogram_jednorodzinna_final3.pdf',
   'sprint-122-komorow-b1 — zweryfikowano RRRR-MM-DD z harmonogram_jednorodzinna_final3.pdf')

returning id, locality, waste_type, collection_date, source_name;

-- ============================================================================
-- Verification after running (read-only):
--   see docs/sprint122_waste_schedule_readonly_check.sql (blocks 2–4), or:
-- select waste_type, collection_date from public.waste_schedule_items
--   where locality = 'Komorów' order by collection_date;
--
-- Rollback (if this batch needs to be removed): deletes ONLY rows carrying
-- this batch marker — never touches other localities/batches.
-- delete from public.waste_schedule_items
--   where locality = 'Komorów' and notes like 'sprint-122-komorow-b1%';
-- ============================================================================
