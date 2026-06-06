# Next Milestones — Alertownik

This document describes the next meaningful product milestones, not individual sprints.
Each milestone is a coherent capability the product gains. Milestones can be broken into
sprints during active development.

Last updated: June 2026 — Sprint 57: API route + mock generator added, Milestone B active

---

## Current state (as of Milestone 0 complete)

- Public alert list with search, filters, Moje alerty preferences
- Admin login via Supabase Auth
- Admin dashboard with stats and source monitoring overview
- Alert Builder: create, edit, publish, archive, restore
- AI Helper: manual prompt workflow → ChatGPT/Claude → JSON → Builder
- Source registry: add, edit, toggle, delete sources
- Manual source monitoring: monitoring status, check history, notice text capture
- Source check → AI Helper shortcut (notice text flows to AI Helper prefilled)
- PWA manifest + mobile-friendly header

---

## Milestone A — Pilot MVP Cleanup

**Goal:** Polish the product to the level needed for a real pilot with 3–5 users.

**Key work:**
- Fix any bugs found during manual testing
- Polish the public alert list UX (card design, empty states, loading skeletons)
- Ensure every admin workflow is fast and error-free
- Write a simple onboarding guide for pilot admin users
- Verify Vercel deployment is stable and fast
- Double-check all Polish text for grammar and natural phrasing
- Archive the old QA checklist and replace with `docs/QA_MANUAL_CHECKLIST.md`

**Done when:** An admin can find a source notice, run it through AI Helper, publish an alert, and a resident can read it on their phone — all without any coaching.

---

## Milestone B — AI Draft Generator ← aktywne

**Goal:** Replace the copy-paste ChatGPT/Claude workflow with a direct AI API call from within the app.

**Key work:**
- Integrate Claude API (Anthropic SDK) server-side — via a Next.js API route, never client-side
- API key stored as a Vercel environment variable, never in source code
- "Generuj draft alertu" button in AI Helper → calls API → returns pre-filled JSON
- Admin still reviews and edits the draft before publishing
- Rate limiting: limit calls per session to avoid abuse
- Error handling: graceful fallback if API is unavailable

**Done when:** Admin can click one button after pasting a notice, get a draft alert, review it, and publish — without opening ChatGPT or Claude.

**Prerequisite:** Anthropic API key available. Cost per call evaluated.

---

## Milestone C — Source Monitor v0.1

**Goal:** Surface new notices automatically without full scraping.

**Key work:**
- For each source with an RSS feed: fetch the feed on a schedule (Vercel cron or external)
- For each new feed item not yet seen: create a "pending notice" entry in the database
- Admin sees pending notices in the dashboard: title, source, link
- One-click "Przygotuj alert" from a pending notice → AI Helper (or direct draft if Milestone B is done)
- No full HTML scraping yet — RSS only in this milestone

**Done when:** A source with an RSS feed surfaces new notices to the admin dashboard automatically, within 1 hour of publication.

**Prerequisite:** At least one active source has a working RSS feed.

---

## Milestone D — User Pilot

**Goal:** Run a real 30-day pilot with at least one Polish municipality or local operator.

**Key work:**
- Onboard a partner (e.g. WKD, Gmina Michałowice, or local water utility)
- Ensure the partner can add official content and review alerts before publishing
- Track: How many alerts published per week? How many residents reached?
- Simple feedback collection (a Google Form or email is fine)
- No new code required for this milestone — it's operational

**Done when:** At least 10 real alerts published, at least 20 unique public visitors per week.

---

## Milestone E — Notifications

**Goal:** Proactively reach residents instead of requiring them to check the app.

**Key work:**
- Residents can subscribe to alerts by category or location keyword (email or browser push)
- Subscription stored server-side (Supabase, no accounts required — just an email or push token)
- On alert publish: send notification to relevant subscribers
- Unsubscribe mechanism (one-click)
- Daily digest option (not per-alert spam)
- Polish privacy disclosure

**Done when:** A resident can subscribe on the homepage and receive a notification within 10 minutes of an alert being published.

**Prerequisite:** Milestone D data shows resident demand. Compliance with Polish RODO (GDPR) reviewed.

---

## Milestone F — PWA / Mobile App Direction

**Goal:** Make Alertownik feel like a native mobile app for daily use.

**Key work:**
- Service worker with offline alert cache (last 20 published alerts available offline)
- Push notification integration for PWA (Web Push API)
- "Add to Home Screen" prompt flow — automatic, non-intrusive
- Explore native app (React Native or Capacitor) if pilot shows strong mobile usage
- App icon, splash screen, correct status bar colour

**Done when:** A resident can install Alertownik on their iPhone or Android phone from the browser and receive push notifications without a native app store.

**Prerequisite:** Milestone E push infrastructure. PWA push tested on iOS 16.4+ (which added PWA push support).

---

## Out of Scope (Permanent)

- Crowdsourced alerts or user-submitted reports — Alertownik surfaces official sources only
- Comments, reactions, or social features
- National news, weather, or non-local content
- Real-time scraping of websites without RSS feeds (legal and technical complexity)
