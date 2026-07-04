-- ============================================================================
-- Alertownik — Sprint 113: Archive Stale Public Alerts (PROPOSAL)
-- Companion Obsidian page: "Public Data Cleanup Recommendation".
-- ============================================================================
-- STATUS: PROPOSAL — RUN ONLY AFTER ADAM APPROVES.
-- Never run automatically, never via script, never by Claude Code
-- (its MCP access is read-only by design). Adam pastes each step
-- manually into the Supabase SQL Editor.
--
-- WHAT THIS DOES: sets status = 'archived' on up to TWO old alerts that
-- are (per the freshness review) resolved and clutter the public list:
--   1. "Brak wody — Granica, Nowa Wieś"  — water outage, ends_at 2026-06-26
--   2. "Remont ul. Głównej w Granicy"    — roadworks,   ends_at 2026-07-02
--
-- STATUS SEMANTICS (verified in code, Sprint 114): the app knows exactly
-- three statuses — draft / published / archived (supabaseAlertWrites.ts;
-- there is NO 'resolved' status anywhere in src/). Public list + detail
-- both filter status='published' (getSupabaseAlerts.ts), so 'archived'
-- hides a row from ALL public views immediately. See Obsidian:
-- "Status Semantics Audit".
--
-- WHAT THIS DOES NOT TOUCH (on purpose):
--   - "Rozkład jazdy WKD od 29 czerwca"  — stays published (relevant
--     until ~2026-08-30 per the timetable's own validity)
--   - "Możliwe kilkuminutowe opóźnienia na linii WKD"
--     (slug wkd-ograniczenia-predkosci-2026-06-29) — the fresh alert,
--     stays published
--
-- WHY 'archived' AND NOT DELETE: 'archived' is an allowed status
-- (draft/published/archived), it removes the row from public view (anon
-- RLS only exposes status = 'published') but keeps history, and the
-- Builder has a "Przywróć" path if archiving was a mistake. No DELETE
-- anywhere in this file.
-- ============================================================================

-- ── STEP 0 — Identify the rows first (READ-ONLY, safe to run) ──────────────
-- Confirms the exact slugs before updating anything. Expect the two stale
-- alerts to show status = 'published'. If a slug differs from what Step 1/2
-- assumes, fix the slug there before running.

select id, slug, title, status, starts_at, ends_at, published_at
from public.alerts
where title ilike '%brak wody%'
   or title ilike '%remont ul. Głównej%'
   or title ilike '%rozkład jazdy WKD%'
   or slug = 'wkd-ograniczenia-predkosci-2026-06-29'
order by created_at;

-- ── STEP 1 — Archive "Brak wody — Granica, Nowa Wieś" ──────────────────────
-- RUN ONLY AFTER ADAM APPROVES. Replace <SLUG_BRAK_WODY> with the slug
-- from Step 0. The title guard makes a wrong slug a no-op (0 rows updated)
-- instead of archiving the wrong alert.

update public.alerts
set status = 'archived',
    updated_at = now()
where slug = '<SLUG_BRAK_WODY>'
  and title ilike '%brak wody%'
  and status = 'published'
returning id, slug, title, status, updated_at;

-- Expected result: exactly 1 row, status = 'archived'.
-- 0 rows = wrong slug or already archived — stop and re-check Step 0.

-- ── STEP 2 — Archive "Remont ul. Głównej w Granicy" ────────────────────────
-- RUN ONLY AFTER ADAM APPROVES. Replace <SLUG_REMONT_GLOWNEJ> with the
-- slug from Step 0.

update public.alerts
set status = 'archived',
    updated_at = now()
where slug = '<SLUG_REMONT_GLOWNEJ>'
  and title ilike '%remont%'
  and status = 'published'
returning id, slug, title, status, updated_at;

-- Expected result: exactly 1 row, status = 'archived'.

-- ── STEP 3 — Verify the public list (READ-ONLY, safe to run) ───────────────
-- After Steps 1–2 the public app should show exactly these published rows:
-- the fresh WKD speed-restriction alert + the WKD timetable alert.

select slug, title, status, published_at
from public.alerts
where status = 'published'
order by published_at desc;

-- ── ROLLBACK (if archiving was a mistake) ───────────────────────────────────
-- Either use the Builder's "Przywróć" button, or per alert:
--
-- update public.alerts
-- set status = 'published', updated_at = now()
-- where slug = '<SLUG>' and status = 'archived'
-- returning id, slug, title, status;
-- ============================================================================
