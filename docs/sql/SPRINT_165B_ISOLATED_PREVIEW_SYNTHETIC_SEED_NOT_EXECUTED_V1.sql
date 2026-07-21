-- ============================================================================
-- NOT EXECUTED
-- SYNTHETIC PREVIEW DATA ONLY
-- ============================================================================
-- Sprint 165B — Isolated Preview Code Safety Package v1.
--
-- This file has NEVER been run against any database, live or otherwise.
-- It exists purely as a prepared, reviewable package for a future sprint
-- (165C or later) to run against a NEW, isolated Preview-only Supabase
-- project — after that project exists, after its schema/RLS has been
-- replayed and verified (see
-- SPRINT_165B_ISOLATED_PREVIEW_SCHEMA_REPLAY_MANIFEST_V1.md), and never
-- against Production.
--
-- EVERY value below is invented. No row here was copied from, derived
-- from, or resembles a real Production row. Names, dates, streets, and
-- notice text are deliberately generic/placeholder so nobody could
-- mistake this content for a real municipal announcement.
--
-- WHAT THIS FILE DOES NOT DO:
--   - Does not create any Supabase Auth account (test admin, test
--     scheduled-writer) — those are created directly in the Supabase
--     dashboard by a human operator, per the Sprint 165C runbook, never
--     by SQL, and never by this file.
--   - Does not insert into admin_profiles or automation_identities —
--     those rows require a real auth.users id from the accounts above,
--     which do not exist until a human creates them first.
--   - Contains no email address, password, API key, token, or any other
--     credential value.
--   - Contains no UUID copied from any real Production row — every id
--     below is either omitted (letting the database default generate one)
--     or is an obviously-fake placeholder UUID for cross-referencing
--     within this file only.
-- ============================================================================
--
-- SPRINT 165C PRE-RUN AUDIT CORRECTION: the alerts insert below originally
-- used category = 'municipal' for the draft row. The live `alerts` table's
-- CHECK constraint allows only
-- ['transport','water','power','waste','roads','announcement'] — a
-- different enum than `alert_sources`/`source_notice_candidates`, which do
-- allow 'municipal'. This was a genuine data bug (would have aborted the
-- entire alerts INSERT with a CHECK violation) caught during Sprint 165C's
-- pre-run audit against the live, introspection-derived schema
-- (docs/sql/SPRINT_165C_AS_BUILT_SCHEMA_NOT_EXECUTED_V1.sql). Fixed to
-- 'announcement' — a synthetic-data-only correction, no change in intent.
--
-- SPRINT 165C NOTE ON RE-RUN SAFETY: `alert_categories` (unique slug),
-- `alert_sources` (fixed placeholder id), and `alerts` (unique slug) all
-- guard their inserts with `on conflict ... do nothing`, so re-running
-- this file is harmless for those three tables. `source_checks`,
-- `source_notice_candidates`, and `waste_schedule_items` have no natural
-- business-key uniqueness to conflict on (their id is server-generated),
-- so re-running this file WOULD duplicate rows in those three tables.
-- This file is intended for exactly one run against a freshly-replayed,
-- empty Preview project — which matches the isolated `alertownik-preview`
-- project's confirmed state (every table at 0 rows) as of this audit.
--
-- SPRINT 165C: the entire executable body below is wrapped in a single
-- begin;/commit; transaction so this file's seven INSERT statements either
-- all succeed together or all roll back together — no partial seed state
-- is possible even if one statement fails partway through.
-- ============================================================================

begin;

-- ── alert_categories ─────────────────────────────────────────────────────
-- Mirrors the live category set. Safe to insert verbatim — categories are
-- reference data, not resident-facing content, identical in meaning on
-- every environment.

insert into alert_categories (slug, name) values
  ('transport', 'Transport'),
  ('water',     'Woda'),
  ('power',     'Prąd'),
  ('waste',     'Odpady'),
  ('roads',     'Drogi'),
  ('municipal', 'Komunikaty')
on conflict (slug) do nothing;


-- ── alert_sources ────────────────────────────────────────────────────────
-- Three synthetic sources: one active (standing in for the real
-- Michałowice canary source, so the future write-path rehearsal has
-- something plausible to target), one inactive (exercises the "inactive
-- source" UI states), one with a null url (exercises the nullable-url
-- code path). None of the URLs below are the real official Michałowice
-- URL or any other real institution's URL.

insert into alert_sources (id, name, url, category, source_type, is_active, notes) values
  ('11111111-1111-4111-8111-111111111111', 'Testowy Urząd Przykładowa (SYNTHETIC)',
    'https://example-preview-only.test/komunikaty', 'municipal', 'website', true,
    'SYNTHETIC PREVIEW DATA — stand-in for the real Michałowice canary source. Not a real institution.'),
  ('22222222-2222-4222-8222-222222222222', 'Testowa Kolej Przykładowa (SYNTHETIC, inactive)',
    'https://example-preview-only.test/kolej', 'transport', 'website', false,
    'SYNTHETIC PREVIEW DATA — inactive on purpose, to exercise inactive-source UI states.'),
  ('33333333-3333-4333-8333-333333333333', 'Testowe Wodociągi Przykładowa (SYNTHETIC, no URL)',
    null, 'water', 'other', true,
    'SYNTHETIC PREVIEW DATA — deliberately has no URL, to exercise the nullable-url code path.')
on conflict (id) do nothing;


-- ── alerts ────────────────────────────────────────────────────────────────
-- Spans draft/published/archived, every severity, an already-expired
-- entry, and an upcoming entry — see Sprint 165A §B.8.

insert into alerts (slug, category, severity, title, place, starts_at, ends_at, change, action, source_name, source_url, status, source_id, published_at) values
  ('synthetic-preview-published-active-info',
   'transport', 'info', '[SYNTHETIC PREVIEW] Zmiana rozkładu testowej linii',
   'Przykładowa, ul. Testowa', now() - interval '1 day', now() + interval '2 day',
   'To jest testowy, syntetyczny wpis wyłącznie dla środowiska Preview.',
   'Brak działania wymaganego — dane testowe.',
   'Testowy Urząd Przykładowa (SYNTHETIC)', 'https://example-preview-only.test/komunikaty',
   'published', '11111111-1111-4111-8111-111111111111', now() - interval '1 day'),

  ('synthetic-preview-published-active-warning',
   'water', 'warning', '[SYNTHETIC PREVIEW] Planowana przerwa w dostawie wody (test)',
   'Przykładowa, os. Testowe', now() - interval '2 hour', now() + interval '6 hour',
   'Testowy syntetyczny opis awarii.', 'Zgromadź testowy zapas wody (dane testowe).',
   'Testowe Wodociągi Przykładowa (SYNTHETIC, no URL)', null,
   'published', '33333333-3333-4333-8333-333333333333', now() - interval '2 hour'),

  ('synthetic-preview-published-active-urgent',
   'roads', 'urgent', '[SYNTHETIC PREVIEW] Zamknięcie testowej drogi',
   'Przykładowa, ul. Objazdowa', now() - interval '1 hour', now() + interval '1 day',
   'Testowy syntetyczny opis zamknięcia drogi.', 'Skorzystaj z testowego objazdu.',
   'Testowy Urząd Przykładowa (SYNTHETIC)', 'https://example-preview-only.test/komunikaty',
   'published', '11111111-1111-4111-8111-111111111111', now() - interval '1 hour'),

  ('synthetic-preview-published-expired',
   'power', 'info', '[SYNTHETIC PREVIEW] Zakończona testowa przerwa w dostawie prądu',
   'Przykładowa, ul. Zakończona', now() - interval '5 day', now() - interval '4 day',
   'Testowy syntetyczny opis zakończonej awarii.', 'Brak działania — już zakończone (dane testowe).',
   'Testowy Urząd Przykładowa (SYNTHETIC)', 'https://example-preview-only.test/komunikaty',
   'published', '11111111-1111-4111-8111-111111111111', now() - interval '5 day'),

  ('synthetic-preview-published-upcoming',
   'roads', 'warning', '[SYNTHETIC PREVIEW] Nadchodzące testowe roboty drogowe',
   'Przykładowa, ul. Przyszła', now() + interval '3 day', now() + interval '10 day',
   'Testowy syntetyczny opis nadchodzących robót.', 'Zaplanuj testowy objazd z wyprzedzeniem.',
   'Testowy Urząd Przykładowa (SYNTHETIC)', 'https://example-preview-only.test/komunikaty',
   'published', '11111111-1111-4111-8111-111111111111', now() + interval '3 day'),

  ('synthetic-preview-draft',
   'announcement', 'info', '[SYNTHETIC PREVIEW] Roboczy testowy komunikat (draft)',
   'Przykładowa', null, null,
   'Testowy szkic — nigdy nieopublikowany.', null,
   'Testowy Urząd Przykładowa (SYNTHETIC)', 'https://example-preview-only.test/komunikaty',
   'draft', '11111111-1111-4111-8111-111111111111', null),

  ('synthetic-preview-archived',
   'waste', 'info', '[SYNTHETIC PREVIEW] Zarchiwizowany testowy komunikat',
   'Przykładowa', now() - interval '30 day', now() - interval '25 day',
   'Testowy zarchiwizowany opis.', null,
   'Testowy Urząd Przykładowa (SYNTHETIC)', 'https://example-preview-only.test/komunikaty',
   'archived', '11111111-1111-4111-8111-111111111111', now() - interval '30 day')
on conflict (slug) do nothing;


-- ── source_checks ────────────────────────────────────────────────────────
-- A small mix of manual check-history rows. `created_by` is left NULL
-- here deliberately — a real value requires a real admin/writer
-- auth.users id, which only exists once the Sprint 165C runbook's account
-- -creation step has run; a future session may update these rows'
-- created_by once that id is known, or simply leave them NULL (the column
-- is nullable).

insert into source_checks (source_id, result, notes) values
  ('11111111-1111-4111-8111-111111111111', 'no_changes', 'SYNTHETIC PREVIEW DATA — testowe sprawdzenie, brak zmian.'),
  ('11111111-1111-4111-8111-111111111111', 'found_notice', 'SYNTHETIC PREVIEW DATA — testowe sprawdzenie, znaleziono komunikat.'),
  ('22222222-2222-4222-8222-222222222222', 'needs_followup', 'SYNTHETIC PREVIEW DATA — testowe sprawdzenie, wymaga dalszej weryfikacji.');


-- ── source_notice_candidates ─────────────────────────────────────────────
-- A mix of statuses to exercise the review-queue UI. All admin-style rows
-- (source_key left NULL, matching the real app's "Zapisz jako kandydata"
-- convention documented in src/lib/supabaseCandidateWrites.ts) — this
-- seed file never simulates a scheduled-writer-created row, since that
-- would require the future automation activation, out of scope here.

insert into source_notice_candidates (source_id, source_name, source_url, title, excerpt, raw_text, category, severity, status, verification_status) values
  ('11111111-1111-4111-8111-111111111111', 'Testowy Urząd Przykładowa (SYNTHETIC)',
   'https://example-preview-only.test/komunikaty', '[SYNTHETIC PREVIEW] Kandydat oczekujący',
   'Testowy fragment oczekującego kandydata.', 'Pełny testowy tekst oczekującego kandydata (dane syntetyczne).',
   'municipal', 'info', 'pending', 'unverified'),

  ('11111111-1111-4111-8111-111111111111', 'Testowy Urząd Przykładowa (SYNTHETIC)',
   'https://example-preview-only.test/komunikaty', '[SYNTHETIC PREVIEW] Kandydat zatwierdzony',
   'Testowy fragment zatwierdzonego kandydata.', 'Pełny testowy tekst zatwierdzonego kandydata (dane syntetyczne).',
   'roads', 'warning', 'approved', 'human_verified'),

  ('22222222-2222-4222-8222-222222222222', 'Testowa Kolej Przykładowa (SYNTHETIC, inactive)',
   'https://example-preview-only.test/kolej', '[SYNTHETIC PREVIEW] Kandydat odrzucony',
   'Testowy fragment odrzuconego kandydata.', 'Pełny testowy tekst odrzuconego kandydata (dane syntetyczne).',
   'transport', 'info', 'rejected', 'human_verified');


-- ── waste_schedule_items ─────────────────────────────────────────────────
-- Two synthetic localities, two waste types each, spanning past and
-- future collection dates.

insert into waste_schedule_items (locality, area_name, street_group, waste_type, collection_date, source_name, source_url, notes) values
  ('Testowa Miejscowość A (SYNTHETIC)', 'Osiedle Testowe', 'ul. Testowa 1-20', 'mixed',
   current_date + 3, 'Testowy Urząd Przykładowa (SYNTHETIC)', 'https://example-preview-only.test/komunikaty',
   'SYNTHETIC PREVIEW DATA'),
  ('Testowa Miejscowość A (SYNTHETIC)', 'Osiedle Testowe', 'ul. Testowa 1-20', 'plastics_metals',
   current_date + 10, 'Testowy Urząd Przykładowa (SYNTHETIC)', 'https://example-preview-only.test/komunikaty',
   'SYNTHETIC PREVIEW DATA'),
  ('Testowa Miejscowość B (SYNTHETIC)', 'Osiedle Przykładowe', 'ul. Przykładowa 1-15', 'bio',
   current_date - 2, 'Testowy Urząd Przykładowa (SYNTHETIC)', 'https://example-preview-only.test/komunikaty',
   'SYNTHETIC PREVIEW DATA'),
  ('Testowa Miejscowość B (SYNTHETIC)', 'Osiedle Przykładowe', 'ul. Przykładowa 1-15', 'glass',
   current_date + 14, 'Testowy Urząd Przykładowa (SYNTHETIC)', 'https://example-preview-only.test/komunikaty',
   'SYNTHETIC PREVIEW DATA');

commit;

-- ============================================================================
-- END OF FILE — NOT EXECUTED, SYNTHETIC PREVIEW DATA ONLY
-- ============================================================================
