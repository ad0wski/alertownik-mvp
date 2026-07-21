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

## Stage 12b — Canary Environment Safety Audit ✅ (Sprint 164C, docs only)

- ✅ Read-only audit confirmed Vercel Preview and Production share one Supabase project — `NEXT_PUBLIC_SUPABASE_URL` is a single value scoped to both, not two independent ones
- ✅ Adam's decision recorded: keep the shared database for now (Option A) — a separate Preview project remains a future option, not a current requirement
- ✅ Activation runbook corrected to remove any "safely on Preview first" framing and add a mandatory pre-flight checklist (10 items) and post-run verification with explicit PASS/STOP/ROLLBACK criteria
- ✅ Read-only inventory of 13 orphaned branch-scoped environment variables on two stale branches (`sprint-148-controlled-writer-preview`, `sprint-150-race-condition-closure-package-v1`) — names/scopes only, no values, nothing deleted
- ❌ Nothing activated — no env var set, no SQL run, no RLS touched, no cron scheduled

**Goal:** make sure nobody — Adam in a future session or a future sprint — treats a Preview canary run as lower-risk than a Production one when it demonstrably is not, before the first real activation happens — see `docs/SPRINT_164C_CANARY_ENVIRONMENT_SAFETY_AUDIT_V1.md`.

---

## Stage 13 — Isolated Preview Environment: Design and Preflight 🟡 (Sprint 165A, design only)

- ✅ Full inventory of every Supabase table, RLS policy, function/trigger/index, account/role, environment variable, and write-capable route the app depends on
- ✅ Confirmed zero usage of Supabase Storage, Realtime, or Edge Functions — isolation only needs Postgres + Auth
- ✅ Recommended architecture: a separate Preview-only Supabase project, environment-scoped (not branch-scoped) Vercel variables, a visible `PRODUCTION`/`PREVIEW`/`DEVELOPMENT` admin badge, and a new fail-closed environment-pairing guard as a fourth, additive gate alongside the existing three write kill switches
- ✅ Minimal synthetic test-data plan and an ordered future execution checklist split across Claude Code / Claude in Chrome / Adam's manual approval / secrets Claude must never see
- ✅ Acceptance-test design for cross-environment isolation, kill-switch, and no-auto-publish guarantees
- ❌ Nothing built: no new Supabase project, no SQL executed, no data copied, no Vercel variable changed, no automation run

**Goal:** turn Sprint 164C's accepted shared-database limitation into a concrete, reviewed, buildable plan for real Preview/Production data isolation — see `docs/SPRINT_165A_ISOLATED_PREVIEW_ENVIRONMENT_DESIGN_V1.md`.

---

## Stage 14b — Isolated Preview Supabase Project Created 🟡 (Sprint 165C, Manual Gate 2)

- ✅ A new, empty, separate Supabase project, `alertownik-preview`, was created in the same organization as Production — region West Europe (London)/`eu-west-2` matching Production, Free plan, `NANO` compute — see `docs/SPRINT_165C_MANUAL_GATE_2_PROJECT_CREATED_V1.md`.
- ❌ Still schema-empty at that point: no SQL run, no tables/RLS/triggers, no Auth accounts, no Vercel variable changed, no automation activated. Production was not touched.

**Goal:** provide a genuinely separate database for the isolated Preview design (Sprint 165A) to eventually be built on, one manual gate at a time.

---

## Stage 14c — Isolated Preview Schema and RLS Replay Complete 🟡 (Sprint 165C, Phase 3)

- ✅ The as-built schema+RLS file (`docs/sql/SPRINT_165C_AS_BUILT_SCHEMA_NOT_EXECUTED_V1.sql`) was run, wrapped in a transaction, against `alertownik-preview` after a read-only empty-schema check. Result verified read-only: 8 tables, 28 RLS policies, 4 triggers, all 8 tables RLS-enabled — exact match with the live Production snapshot. All 8 tables confirmed at 0 rows. See `docs/SPRINT_165C_PHASE_3_SCHEMA_RLS_REPLAY_V1.md`.
- ❌ Still not done: no Supabase Auth accounts (test admin/scheduled-writer), no synthetic seed data, Vercel Preview still points at the original shared Production project (not yet reconnected to `alertownik-preview`), automation remains fully OFF everywhere.

**Goal:** prove the isolated Preview project's schema is a faithful, verified replica of Production before any account or data is created on it.

---

## Stage 14d — Isolated Preview Auth Accounts and Synthetic Seed Complete 🟡 (Sprint 165C, Phase 4)

- ✅ Two Supabase Auth accounts created directly by Adam in `alertownik-preview` (test admin, test scheduled-writer, both `@example.invalid`, both password-only, never seen by Claude) and correctly membership-linked — one row each in `admin_profiles`/`automation_identities`, verified read-only after each insert.
- ✅ A genuine pre-run bug in the synthetic seed file was found and fixed (an `alerts.category` value invalid against the live CHECK constraint) and the file was wrapped in a `begin;`/`commit;` transaction — both fixes committed to the feature branch before execution.
- ✅ The corrected seed ran successfully: 6 categories, 3 sources, 7 alerts (5 published/1 draft/1 archived), 3 source checks, 3 candidates (pending/approved/rejected, none published or converted), 4 waste-schedule rows — every count verified read-only, exact match with plan. See `docs/SPRINT_165C_PHASE_4_AUTH_AND_SYNTHETIC_SEED_V1.md`.
- ❌ Still not done: Vercel Preview still points at the original shared Production project; automation remains fully OFF everywhere.

---

## Stage 14e — Isolated Preview: Full Acceptance and Production Release ✅ (Sprint 165C, complete — merged to `main`, live on Production)

- ✅ Vercel Preview environment separation: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_ENVIRONMENT_TAG=preview`, `SUPABASE_EXPECTED_PROJECT_REF` all split into Preview-only values, separate from Production's own unchanged entries — Production and Preview now use two different Supabase project refs.
- ✅ A new Preview deployment (triggered by an empty commit) confirmed live: environment badge reads `PREVIEW`, every Supabase call verified hitting `alertownik-preview`'s own project ref, zero write requests during any QA pass.
- ✅ Sprint 165C-1: a genuine, previously-unknown bug — `alert_sources.url` (nullable in the database) was typed as a non-nullable `string`, crashing `/admin/sources` whenever a registry row had no URL — was found by the synthetic seed's own deliberately-null-URL test source, fixed by correctly modeling `string | null` throughout (no casts, no fake substitute values), covered by new regression tests, and re-verified live.
- ✅ Full acceptance pass: 682/682 e2e tests, 17/17 PWA tests, clean typecheck/lint/build, all 8 required pages QA'd on the live Preview deployment. See `docs/SPRINT_165C_FINAL_ACCEPTANCE_V1.md`.
- ✅ **Release:** feature branch fast-forward-merged to `main` (no merge commit) and deployed to Production. A full read-only smoke test of the official Production URL (all 8 required pages, admin included) and a post-release recheck of Preview both confirmed zero regressions, correct `PRODUCTION`/`PREVIEW` badges, and continued database isolation. See `docs/SPRINT_165C_POST_RELEASE_CLOSURE_V1.md`.
- ❌ Automation (`SCHEDULED_CHECKS_ENABLED`/`SCHEDULED_WRITES_ENABLED`) remains fully OFF — a separate, later, explicitly-scoped decision.

**Goal achieved:** a genuinely isolated Preview Supabase project — own database, own Auth, own environment variables — verified end-to-end and released to Production, so that Preview testing (including the eventual candidate-automation canary) can no longer touch Production data by construction, not by discipline alone.

---

## Stage 14 — Isolated Preview Code Safety Package 🟡 (Sprint 165B/165B-2, code + docs — no infrastructure yet)

- ✅ Single-source-of-truth environment identity (`src/lib/environmentIdentity.ts`), `VERCEL_ENV`-derived, no hydration risk (build-time constant on both server and client)
- ✅ Visible `PRODUCTION`/`PREVIEW`/`DEVELOPMENT`/`UNKNOWN` badge in the admin panel only, never on public pages
- ✅ Fail-closed database-environment guard, wired as an additive fourth gate on `write-candidates` — blocks every environment today (no value configured anywhere), non-regressive since that route was already unreachable
- ✅ **Sprint 165B-2:** re-audit found the guard originally only compared self-reported labels and never confirmed the actual Supabase project — closed by adding two more independent signals (actual project ref derived from the connection URL, plus a new `SUPABASE_EXPECTED_PROJECT_REF` value), all four now required together
- ✅ Schema replay manifest and a NOT-EXECUTED synthetic-data-only seed package prepared for the future Preview project
- ✅ Full Sprint 165C manual-deployment runbook with 6 STOP points, actor-by-actor
- ✅ `npm run check`, `test:e2e` (679 passed, 1 pre-existing unrelated flake confirmed non-deterministic), `test:pwa`, `build`, `git diff --check` all clean; browser QA of the badge completed (signed in, all 7 admin pages, all 3 themes, zero console/hydration errors, zero write actions)
- ⚠️ Mobile 390×844 badge QA not reliably automatable this session — flagged as a manual gate for Adam, not guessed
- ❌ Nothing built: no Supabase project, no SQL executed, no Vercel variable changed, no automation activated

**Goal:** have every piece of code and planning ready so that creating the actual isolated Preview project (a future Sprint 165C) is a pure infrastructure/execution exercise against an already-reviewed design — see `docs/SPRINT_165B_ISOLATED_PREVIEW_CODE_SAFETY_PACKAGE_V1.md`.

---

## Stage 15 — Preview Canary Rehearsal: Audit and Design 🟡 (Sprint 166A, design only)

- ✅ Full read-only audit of the existing candidate-automation pipeline (Sprints 147–153, 164B, 165A–C): data flow, endpoints, cron entries, environment variables, Auth accounts, RLS policies, kill switches, limits, idempotency/race safeguards, dry-run paths, and rollback points — all mapped in `docs/SPRINT_166A_PREVIEW_CANARY_REHEARSAL_AUDIT_AND_DESIGN_V1.md`.
- ✅ Designed the smallest possible safe first canary: single source (Michałowice, the existing default), hard cap of 1 candidate, Preview-only by construction (via the Sprint 165B/165B-2 database-environment guard), dry-run first, ends on a `pending` candidate, never auto-publishes.
- ✅ Full list of the environment variables a future execution phase would need, with purpose/secrecy/source/scope for each — none set this sprint.
- ✅ Read-only confirmation (reusing the existing Sprint 165C Phase 4 record, no new sign-in or query) that the Preview scheduled-writer identity exists and is correctly membership-linked.
- ✅ Code-safety assessment: existing safeguards (hard cap, source allowlist, dry-run route, JSON-response reporting) already sufficient for a first small canary — no code change made.
- ✅ Manual execution checklist for the next phase: exact variables Adam must set, what Claude in Chrome can do unattended, dry-run-then-write order of operations, and explicit PASS/STOP/rollback criteria.
- ❌ Nothing activated: no Vercel variable added, no SQL run, no cron invoked, no automation turned on. Execution is a separate, later, explicitly-scoped sprint.

**Goal:** have an exact, reviewed, buildable plan for the pipeline's first real run — entirely on the isolated Preview environment Sprint 165C built — before any execution happens.

---

## Future Direction — Nationwide Source Coverage (design note, not scheduled)

Once the Preview canary above is confirmed successful, the next large area of work is a nationwide official-source registry, not yet scheduled as a numbered sprint:
- Full Poland hierarchy: województwo → powiat → gmina → miejscowość → dzielnica/sołectwo.
- Source classification by alert category (transport/water/power/roads/waste/municipal).
- Per-source quality/availability status (building on the existing Link Health Panel concept, Stage 11).
- Duplicate detection across sources (building on the existing fuzzy/DB-fingerprint dedup, Sprint 149/150).
- Manual and automated source verification stages.
- Location- and interest-based personalization (building on the existing "Moja okolica" local-only preferences).
- A separate, later legal/RODO and location-consent design stage.
- Preparation for app-store submission and partner/investor conversations remains a later, separate milestone (see Stage 8's remaining rate-limiting/server-guard items as a prerequisite).

**None of this is implemented or scheduled yet — recorded here as direction only.**

---

## Out of Scope (Unlikely to Change)

- The app will always surface alerts from official sources — not crowdsourced reports
- Alertownik is a reading tool, not a social platform (no comments, reactions, or user-generated content)
- The focus remains local and hyperlocal — not national news or weather
