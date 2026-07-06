-- ============================================================================
-- Sprint 123 — Komorów waste schedule import (batch 1: sprint-123-komorow-b1)
--
-- ⚠️  RUN ONLY AFTER ADAM APPROVES AND PDF DATES ARE VERIFIED.
--     Claude Code verified all dates visually against the official PDF on
--     2026-07-06 (45/45 match, protocol: Obsidian "Komorów Waste Dates
--     Verification") — but the project rule stands: a HUMAN re-checks the
--     KOMORÓW row in the PDF before running this.
-- ⚠️  Claude Code must never execute this file — Adam pastes it into the
--     Supabase SQL Editor himself.
-- ⚠️  RECOMMENDED alternative: /admin/waste → "Import z JSON" with
--     data/waste/komorow-2026-batch1-import.json (same 40 rows, plus a
--     preview table and duplicate/past-date warnings). Use ONE path only —
--     not both — or the dedup below will simply skip the duplicates.
--
-- Source (official):
--   https://www.michalowice.pl/files/307953978/file/harmonogram_jednorodzinna_final3.pdf
--   "Harmonogram odbioru odpadów komunalnych z nieruchomości jednorodzinnych
--    z terenu gminy Michałowice obowiązujący od 1.01 do 31.12.2026",
--   region row: KOMORÓW. July–December 2026 (past months skipped on purpose).
--
-- Contents: 40 rows — mixed (13), paper (6), plastics_metals (6), glass (3),
-- bio (12). Popiół (3) and Odzież i tekstylia (2) are deliberately NOT here:
-- no matching waste_type enum value exists (DB CHECK constraint) — batch 2,
-- pending Adam's decision (see Obsidian "Komorów Waste Dates Verification").
--
-- Dedup: WHERE NOT EXISTS on (locality, waste_type, collection_date) —
-- re-running this file, or running it after the JSON import, inserts nothing.
-- Batch marker 'sprint-123-komorow-b1' in notes enables the targeted rollback below.
-- ============================================================================

insert into public.waste_schedule_items
  (locality, waste_type, collection_date, source_name, source_url, notes)
select
  v.locality,
  v.waste_type,
  v.collection_date,
  'Gmina Michałowice — harmonogram 2026 (zabudowa jednorodzinna)',
  'https://www.michalowice.pl/files/307953978/file/harmonogram_jednorodzinna_final3.pdf',
  'sprint-123-komorow-b1 — zweryfikowano 2026-07-06 z harmonogram_jednorodzinna_final3.pdf (wiersz KOMORÓW)'
from (
  values
    ('Komorów', 'mixed', date '2026-07-13'),
    ('Komorów', 'mixed', date '2026-07-27'),
    ('Komorów', 'mixed', date '2026-08-10'),
    ('Komorów', 'mixed', date '2026-08-24'),
    ('Komorów', 'mixed', date '2026-09-07'),
    ('Komorów', 'mixed', date '2026-09-21'),
    ('Komorów', 'mixed', date '2026-10-05'),
    ('Komorów', 'mixed', date '2026-10-19'),
    ('Komorów', 'mixed', date '2026-11-02'),
    ('Komorów', 'mixed', date '2026-11-16'),
    ('Komorów', 'mixed', date '2026-11-30'),
    ('Komorów', 'mixed', date '2026-12-14'),
    ('Komorów', 'mixed', date '2026-12-28'),
    ('Komorów', 'paper', date '2026-07-20'),
    ('Komorów', 'paper', date '2026-08-17'),
    ('Komorów', 'paper', date '2026-09-14'),
    ('Komorów', 'paper', date '2026-10-12'),
    ('Komorów', 'paper', date '2026-11-09'),
    ('Komorów', 'paper', date '2026-12-07'),
    ('Komorów', 'plastics_metals', date '2026-07-20'),
    ('Komorów', 'plastics_metals', date '2026-08-17'),
    ('Komorów', 'plastics_metals', date '2026-09-14'),
    ('Komorów', 'plastics_metals', date '2026-10-12'),
    ('Komorów', 'plastics_metals', date '2026-11-09'),
    ('Komorów', 'plastics_metals', date '2026-12-07'),
    ('Komorów', 'glass', date '2026-08-03'),
    ('Komorów', 'glass', date '2026-10-12'),
    ('Komorów', 'glass', date '2026-12-21'),
    ('Komorów', 'bio', date '2026-07-13'),
    ('Komorów', 'bio', date '2026-07-27'),
    ('Komorów', 'bio', date '2026-08-10'),
    ('Komorów', 'bio', date '2026-08-24'),
    ('Komorów', 'bio', date '2026-09-07'),
    ('Komorów', 'bio', date '2026-09-21'),
    ('Komorów', 'bio', date '2026-10-05'),
    ('Komorów', 'bio', date '2026-10-19'),
    ('Komorów', 'bio', date '2026-11-02'),
    ('Komorów', 'bio', date '2026-11-16'),
    ('Komorów', 'bio', date '2026-11-30'),
    ('Komorów', 'bio', date '2026-12-14')
) as v(locality, waste_type, collection_date)
where not exists (
  select 1
  from public.waste_schedule_items w
  where w.locality        = v.locality
    and w.waste_type      = v.waste_type
    and w.collection_date = v.collection_date
)
returning id, waste_type, collection_date;

-- Expected result: 40 rows returned on a first run against an empty table
-- (fewer if some rows already exist — that's the dedup working, not an error).
--
-- Post-import verification (read-only):
--   docs/sprint122_waste_schedule_readonly_check.sql (blocks 2–4)
--
-- Rollback (removes ONLY this batch, matched by its notes marker):
-- delete from public.waste_schedule_items
--   where locality = 'Komorów' and notes like 'sprint-123-komorow-b1%';
