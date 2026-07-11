-- ============================================================================
-- READ ONLY — NO DATABASE MODIFICATION
-- ============================================================================
-- Sprint 148 — Phase 5 prerequisite: find the exact public.alert_sources.id
-- (UUID) for "Gmina Michałowice — komunikaty", to be used as the ONLY value
-- in the SCHEDULED_WRITER_SOURCE_REGISTRY_IDS Vercel Preview env var:
--   {"michalowice-komunikaty":"<the id returned below>"}
--
-- Matched against the canonical app-side entry
-- (src/lib/officialSourceChecklist.ts, id "michalowice-komunikaty"):
--   name:       "Gmina Michałowice — komunikaty"
--   officialUrl: "https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty"
--
-- THIS FILE CONTAINS SELECT STATEMENTS ONLY. No INSERT, UPDATE, DELETE,
-- ALTER, CREATE, DROP, GRANT, or REVOKE. Safe to run at any time, any
-- number of times — it changes nothing. No secret/credential value is
-- selected anywhere in this file.
-- ============================================================================


-- ── 1. Match by exact official URL (primary, most specific check) ──────────
-- Expected: exactly 1 row. This is the row whose id you copy into
-- SCHEDULED_WRITER_SOURCE_REGISTRY_IDS.

select id, name, url, category, is_active
from public.alert_sources
where url = 'https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty';


-- ── 2. Match by exact name (independent cross-check) ────────────────────────
-- Expected: exactly 1 row, and its `id` must be IDENTICAL to §1's result —
-- if §1 and §2 disagree, or either returns more than one row, STOP and
-- investigate before using any id in Vercel.

select id, name, url, category, is_active
from public.alert_sources
where name = 'Gmina Michałowice — komunikaty';


-- ── 3. Confirm no other row could be mistaken for this source ──────────────
-- Expected: the exact same single row as §1/§2 (0 or 1 rows total) — this
-- guards against a near-duplicate name/URL (e.g. a differently-cased or
-- trailing-slash variant) silently existing alongside the intended one.

select id, name, url, category, is_active
from public.alert_sources
where name ilike '%michałowice%' or url ilike '%michalowice.pl%';


-- ============================================================================
-- END OF READ-ONLY VERIFICATION ARTIFACT
-- ============================================================================
-- Expected state:
--   §1 → exactly 1 row
--   §2 → exactly 1 row, same `id` as §1
--   §3 → exactly 1 row (the same one) — if more than 1 row appears here,
--        do not guess which one is correct; share the full result before
--        using any id in Vercel.
-- ============================================================================
