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

## Stage 8 — Security Hardening 🟡 (critical/high closed, Sprints 161–161B)

- ✅ Server-side session verification on the three previously-unauthenticated admin API routes (`fetch-preview`, `sources/check`, `ai/draft-alert`)
- ✅ Server-side *authorization*, not just authentication — the same three routes now also require an `admin_profiles` row, not merely a valid Supabase Auth session (Sprint 161B; this project has more than one Supabase Auth account, so those two checks are genuinely different)
- ✅ SSRF defenses on the admin-supplied-URL fetch endpoint (private-IP/DNS/redirect validation)
- ✅ Real CSP and standard security headers (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, HSTS in production)
- ✅ Live RLS manually verified for `alerts`, `source_checks`, `source_notice_candidates` — all confirmed correct (Sprint 161B)
- ✅ `alert_sources` RLS fix — gap found (was checking only `auth.role() = 'authenticated'`, not `admin_profiles`), SQL written, statically verified, and **confirmed live on Production (Sprint 164A, 2026-07-19)** via read-only verification (`docs/sql/SPRINT_161B_ALERT_SOURCES_RLS_HARDENING.sql` / `VERIFY_SPRINT_161B_RLS_READ_ONLY.sql`)
- ❌ Credible rate limiting — needs Vercel Firewall or an external store, a manual infrastructure decision, not started (see `docs/SPRINT_161_CRITICAL_SECURITY_HARDENING_V1.md` §5)
- ❌ Server-side/middleware admin route guard — needs a `@supabase/ssr` cookie-session migration, not started (see the same doc, §9)
- ❌ Full DNS-rebinding closure on the SSRF guard — needs either a new HTTP-client dependency or a lower-level TCP client, documented as a residual risk for now (§4)

**Goal:** Close the gaps a pre-store security review would flag, before any app-store submission work begins.

---

## Stage 9 — Theme System ✅ (Sprint 162)

- ✅ Light / dark / system theme, default system, manual choice persisted locally (`alertownik-theme-preference`, never sent to Supabase)
- ✅ Semantic CSS-token color system (`background`, `surface`, `text-primary`, `border`, `primary`, `success`/`warning`/`danger`/`info`, etc.), Tailwind v4 `.dark`-class-driven `dark:` variant
- ✅ No flash of the wrong theme — a literal blocking `<script>` sets the theme class before first paint; verified `next/script strategy="beforeInteractive"` does NOT reliably do this in the App Router and switched approach
- ✅ System theme reacts live to an OS change, no reload
- ✅ Accessible three-way toggle (`role="radiogroup"`, ≥44px targets, visible state) on new `/ustawienia` page
- ✅ All 17 required routes covered (public, alert detail, admin, builder, AI helper, offline fallback), zero CSP change, PWA cache policy unchanged
- 🟡 Pre-existing pages/components got dark-mode coverage via an additive class sweep, not a full manual design pass — see `docs/LIMITATIONS.md` and `docs/SPRINT_162_THEME_SYSTEM_LIGHT_DARK_SYSTEM_V1.md`

**Goal:** Give residents and admins who prefer (or whose OS defaults to) a dark UI a correct, accessible option, as groundwork before Sprint 163's app-shell/mobile-nav work.

---

## Stage 10 — Mobile App Shell ✅ (Sprint 163)

- ✅ Fixed mobile bottom navigation — Dzisiaj / Alerty / Odpady / Więcej, hidden on desktop, hidden on `/login` and every admin route regardless of session, ≥44px targets, `aria-current`, safe-area-aware
- ✅ `/` is now a short "Dzisiaj" view (top active alert, next waste collection, up to 3 more alerts) instead of the full scrollable list — no new data source
- ✅ `/alerty` — the previous full list, moved verbatim (same `AlertList` component, same behavior, new URL)
- ✅ `/wiecej` — settings/info index, the mobile equivalent of the footer link row
- ✅ Native share (`navigator.share` + clipboard fallback) on the alert detail page, no new permissions, nothing sent to a server
- ✅ Touch-target pass to ≥44px on bottom nav, admin hamburger, mode-toggle buttons, alert-card action buttons, `/wiecej` rows
- ✅ Zero changes to Supabase/RLS/SQL/cron, zero changes to `serverAuth.ts`/`ssrfGuard.ts`, zero PWA cache-policy change

**Goal:** Make the public mobile experience feel like a coherent app shell instead of a scrolled webpage, without touching security, data, or the admin surface.

---

## Stage 11 — Automation & Link Health Safe Foundation 🟡 (Sprint 164A)

- ✅ `alert_sources` RLS gap (Stage 8) closed — confirmed live on Production
- ✅ Live, on-demand Link Health Panel on `/admin/sources` — SSRF-guarded HEAD/GET reachability check per active source, admin-triggered only, nothing persisted, nothing automatic
- ✅ Full audit of existing scheduled-check/scheduled-writer automation (Sprints 142–153) re-confirmed still fail-closed and unchanged by this sprint
- ❌ Michałowice candidate automation (`/api/cron/write-candidates`) remains built but OFF — not in `vercel.json`, no env vars configured; see `docs/LIMITATIONS.md`
- ❌ Persisted link-health history — proposed, not applied (`docs/sql/PROPOSED_SPRINT_164A_LINK_HEALTH_PERSISTENCE_V1.sql`)
- ❌ Credible rate limiting — same open item as Stage 8, re-assessed, still not started (no free, credible option on the current Vercel plan without a new external service)

**Goal:** build and prove out the next layer of automation (link health visibility, the first real scheduled-write candidate pipeline) entirely on a feature branch/Preview, with every write path still gated behind manual, separately-approved Production activation — see `docs/SPRINT_164A_AUTOMATION_LINK_HEALTH_SAFE_FOUNDATION_V1.md`.

---

## Stage 12 — Safe Auto-Candidate Canary Foundation 🟡 (Sprint 164B, branch only)

- ✅ Full re-audit of the Sprint 147–153 Scheduled Writer pipeline against a fresh safety spec — confirmed it already satisfies every requirement (max 1 candidate/run, single-source allowlist defaulting to `michalowice-komunikaty`, pending-only inserts, three independent fail-closed gates, no `service_role`, conservative dedup) without any code change needed to the write path itself
- ✅ New admin-only, read-only "Stan automatyzacji (canary)" panel on `/admin/sources` — the one genuine gap found: nothing previously showed whether the kill switches were on or off
- ✅ New tests closing the specific scenarios the spec named by identifier that weren't yet explicit (an already-*converted*, not just already-*pending*, candidate is still deduplicated correctly; the new panel's own auth/no-secret/no-activation-control guarantees)
- ✅ Activation and rollback runbooks written (`docs/SPRINT_164B_CANARY_ACTIVATION_RUNBOOK_V1.md`, `docs/SPRINT_164B_CANARY_ROLLBACK_AND_KILL_SWITCH_RUNBOOK_V1.md`)
- ❌ Not merged to `main`, not deployed, no environment variable set anywhere, `vercel.json` unchanged — activation remains Adam's separate, staged, manual decision

**Goal:** make the existing (already-safe) candidate-automation pipeline's state fully visible to the admin before ever turning it on, and give Adam an exact, staged, reversible path to do so when ready — see `docs/SPRINT_164B_SAFE_AUTO_CANDIDATE_CANARY_FOUNDATION_V1.md`.

---

## Out of Scope (Unlikely to Change)

- The app will always surface alerts from official sources — not crowdsourced reports
- Alertownik is a reading tool, not a social platform (no comments, reactions, or user-generated content)
- The focus remains local and hyperlocal — not national news or weather
