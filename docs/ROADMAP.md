# Roadmap

This document outlines planned stages for Alertownik beyond the current MVP.

Stages are intentionally separate — each one can be evaluated and validated before moving to the next.

**Sprint 159 closure note:** the current MVP scope (infrastructure, Core MVP, controlled public beta, user-facing pilot readiness, PWA installability) was audited and confirmed 100% complete for its defined boundaries — see `docs/SPRINT_159_MVP_100_PERCENT_CLOSURE_V1.md`. Everything below this point in the roadmap is separately-scoped future work, not unfinished MVP work.

---

## Stage 1 — Local MVP ✅ (current)

- Static Next.js app, no backend
- Hardcoded sample alerts
- Alert Builder with manual entry and JSON import
- AI Helper for prompt generation (no API)
- Local draft saving and publishing via localStorage
- Detail pages per alert
- Category filters
- Responsive, mobile-friendly design

**Goal:** Validate the alert format and user flow with a working prototype.

---

## Stage 2 — Online Demo

- Deploy to Vercel (or equivalent)
- Public URL accessible without running locally
- Keep localStorage-only architecture for now
- Add a clear "demo" banner so visitors understand the app shows sample data
- Polish sample alerts to reflect realistic, well-formatted cases

**Goal:** Share the app with others for feedback without requiring technical setup.

---

## Stage 3 — Backend and Persistent Storage

- Add a lightweight backend (e.g., Next.js API routes + a hosted database such as Supabase or PlanetScale)
- Alerts stored server-side and visible across devices
- Simple admin interface for creating and publishing alerts
- Slug uniqueness enforcement
- Optional: soft delete / archive for expired alerts

**Goal:** Make alerts persistent, shareable, and not dependent on the user's browser.

---

## Stage 4 — Real AI Integration

- Connect the AI Helper to an actual LLM API (e.g., Anthropic Claude or OpenAI)
- User pastes a raw announcement; the app returns a structured JSON alert automatically
- One-click import of the AI result into the builder
- Rate limiting and API key management

**Goal:** Dramatically reduce the time needed to turn a raw official announcement into a clean alert.

---

## Stage 5 — Source Monitoring

- Register known official sources (URLs, RSS feeds, social media accounts)
- Periodically check sources for new content
- Surface unprocessed announcements to alert editors for review
- Optionally: auto-draft an alert using AI, awaiting human review before publishing

**Goal:** Reduce manual work required to discover new alerts.

---

## Stage 6 — Notifications

- Allow residents to subscribe to alerts by category or location
- Delivery channels to explore: email, browser push notifications, or messaging (e.g., Telegram bot)
- No-spam design: daily digest or threshold-based triggers only

**Goal:** Proactively reach residents instead of requiring them to check the app.

---

## Stage 7 — Mobile / PWA 🟡 (installability done, Sprint 158B)

- ✅ Make the app installable on Android and iOS as a Progressive Web App (PWA) — manifest, icon set, service worker, `/instalacja` install guide
- ✅ Safe offline handling — a standalone "no connection" screen, not stale cached alerts (see `docs/SPRINT_158B_PWA_INSTALLABILITY_AND_SAFE_OFFLINE_FOUNDATION_V1.md`)
- ❌ Deliberately *not* done: offline caching of alert content. Alert freshness matters more than offline availability for this app — a resident should never see an old alert presented as current just because it was cached. This is a product decision, not a gap to fill later.
- Consider a native app (Play/App Store wrapper) if the user base justifies it — not started

**Goal:** Reduce friction for daily residents who primarily use mobile devices, without ever risking stale safety-relevant information.

---

## Out of Scope (Unlikely to Change)

- The app will always surface alerts from official sources — not crowdsourced reports
- Alertownik is a reading tool, not a social platform (no comments, reactions, or user-generated content)
- The focus remains local and hyperlocal — not national news or weather
