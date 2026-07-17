# Current Limitations

This document describes what Alertownik does not yet do. It is intended to be read alongside the demo guide and project status, and to support honest communication with reviewers, collaborators, and pilot testers.

These are not design failures — they are intentional deferrals. Each limitation reflects a deliberate choice to keep the MVP scope small while validating the core idea.

**Updated June 2026 (Sprint 70)** — the sections below previously described a pre-Supabase, localStorage-only version of the app (no backend, no auth, sample data on the homepage). That version no longer exists; this rewrite reflects what's actually deployed today.

---

## No Automatic Source Monitoring

There is no mechanism to watch, scrape, or subscribe to official announcement sources. New alerts cannot be discovered automatically — an admin opens `/admin/sources`, clicks "Sprawdź stronę" on a source, and decides by hand whether anything is worth turning into an alert.

**Consequence:** Finding relevant announcements and deciding they're worth publishing is entirely manual. Coverage is only as good as how often the admin checks.

---

## AI Drafts Are Never Published Automatically

The AI Helper and source-card "Generuj draft AI" can call the Claude API (when `ANTHROPIC_API_KEY` is configured server-side) to turn a pasted notice into a structured draft. This draft is never written to the database automatically — it only prefills the Builder form, and an admin must review it and explicitly click "Zapisz jako draft w Supabase" or "Opublikuj w Supabase".

**Consequence:** Every published alert has had a human look at it. The AI can get dates, places, or category wrong — the Builder does not currently force every field to be filled in before saving as a draft (Sprint 70 added a confirmation prompt before *publishing* if location, "what's changing," "what to do," or source are still empty, but it doesn't block the action).

---

## Single Admin Role

Supabase Auth gates `/admin`, `/admin/sources`, `/ai-helper`, and `/builder`, but there is no role system — any authenticated user has full admin access (create, edit, publish, archive, delete sources and alerts). There's no separate "editor" vs "approver" role, and no audit trail of who changed what.

**Consequence:** Fine for a single-admin pilot. Would need a real role system before handing edit access to more than one trusted person.

---

## No Real-Time or Push Notifications

Residents have to open the app to see new alerts. There's no email, SMS, or push notification when something new is published.

**Consequence:** A resident only learns about a new alert by checking the homepage themselves, or via "Moja okolica" filtering down what they see once they do check.

---

## "Moja okolica" Preferences Are Local-Only

Category and location-keyword preferences set in "Moja okolica" are saved in the browser's `localStorage`, not in an account.

**Consequence:** Preferences don't sync across devices and are lost if the user clears browser data or switches browsers/phones. There's no account system to fix this — by design, for now (no login required for residents).

---

## No Search Beyond Keyword Matching

The homepage search box matches title, place, "co się zmienia," "co zrobić," and category label as plain substrings. There's no fuzzy matching, no date-range filter beyond the category buttons, and no geographic/map-based search.

---

## Pilot Coverage Detection Is a Heuristic, Not Geocoding

Sprint 158A added a check that flags when a typed "Moja okolica" value looks like it's outside the pilot area (`src/lib/pilotCoverage.ts`), so a resident typing e.g. "Warszawa" sees "Nie obsługujemy jeszcze tej okolicy" instead of a generic empty result. This is plain string matching against `PILOT_LOCALITIES`, not real geocoding — a typed street/estate group that doesn't resemble a known locality name gets a cautious "we're not sure" message rather than a confident yes/no, since the app has no way to know which streets fall inside which locality.

**Consequence:** A real street inside the pilot area but far from any recognizable locality name in its spelling could get the cautious message even though it's actually covered. This is intentional — a wrong "unsupported" claim is worse than an occasional over-cautious one.

---

## PWA Offline Mode Never Shows Alert Content (By Design)

Sprint 158B made Alertownik installable (manifest, icons, service worker) and gave it a safe offline fallback. When there's no connection, the app shows a standalone "Brak połączenia z internetem" screen — it deliberately never serves a cached copy of the alert list, an alert detail page, `/admin`, or any API/Supabase response. The service worker's cache holds only the offline screen and the icon it needs.

**Consequence:** Alertownik cannot be browsed offline at all — no "recently viewed alerts while offline" feature exists or is planned as currently scoped. This is intentional: a stale cached alert presented as current could send someone to a road closure or water outage that's already over. Freshness beats offline availability for this app.

---

## No English Language Support Yet (Backlog)

The public UI is Polish-only. Two professional Userbrain testers (Franklin, Elizabeth, English-speaking, using Chrome's automatic translation) hit a real language barrier, and Chrome's translation distorted Polish locality names in the process. This is tracked as backlog, not fixed in Sprint 158A — the pilot itself is Polish-language-first, and full i18n needs a dedicated audit of every page's copy, routes, metadata, and alert data (which is entered in Polish by the admin), not a partial toggle. A half-translated UI would likely confuse residents more than the current all-Polish version.

---

## This Is Early-Stage Software

Alertownik is a pilot-stage MVP, not a mature product. It has had QA passes (see [[Sprint Log]] Sprint 68 in Obsidian) and is now being prepared for its first real testers, but it has not yet been validated under real, sustained usage. See `docs/NEXT_MILESTONES.md` for the planned path (richer source monitoring, notifications, multi-role admin).

---

**Sprint 159 (MVP 100% closure) note:** every limitation above is a deliberate scope boundary of the current MVP, not an unfinished piece of it — see `docs/SPRINT_159_MVP_100_PERCENT_CLOSURE_V1.md` for the closure audit that confirmed this. Push notifications, app-store distribution, analytics, PL/EN, and geographic expansion are explicitly future, separately-scoped work, not gaps in what's live today.
