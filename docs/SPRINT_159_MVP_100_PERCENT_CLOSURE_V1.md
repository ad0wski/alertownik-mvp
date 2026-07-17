# Sprint 159 — MVP 100% Closure

Branch: `sprint-159-mvp-100-percent-closure-v1`
Base: `main` @ `9960d90855fce1a3857c9a8824e43d648b62c745` (Sprint 158B, live on Production)

This sprint is an audit, not a feature sprint. Goal: answer honestly whether the current MVP scope — infrastructure, Core MVP, public beta, user-facing pilot readiness, PWA installability — is complete, and close any real blocker found. No new features were added; nothing was implemented purely to "produce a commit."

## 1. Scope of 100%

As defined in the sprint brief — see Section M (Closure Matrix) for the per-area definition applied. Explicitly **out of scope** for this closure and not counted against any percentage: push notifications, Google Play, App Store, Capacitor/TWA, user accounts, analytics, sponsors, monetization, English UI, dark mode, new sources, geographic expansion.

## 2. Excluded From Scope (Restated)

Per `docs/LIMITATIONS.md` and this sprint's brief — these are deliberate boundaries of the current MVP, not gaps:
- No automatic source monitoring (manual check-and-decide workflow).
- No AI auto-publish (draft-only, human review required).
- Single admin role, no audit trail.
- No push/real-time notifications.
- "Moja okolica" preferences are local-only (no account sync).
- Search is substring matching, not fuzzy/geographic.
- Pilot-coverage detection is a heuristic, not geocoding.
- PWA offline mode never shows alert content — by design (Sprint 158B).
- No English UI yet.

## 3. Production Evidence

Confirmed read-only, this session:

| Check | Result |
|---|---|
| `git rev-parse origin/main` | `9960d90855fce1a3857c9a8824e43d648b62c745` — matches expected |
| `/manifest.webmanifest` (Production) | 200, all fields present: name, short_name, `id: "/"`, start_url, scope, display=standalone, `lang: "pl-PL"`, orientation, theme/background color, full icon set |
| `/sw.js` (Production) | 200, content verified to match the reviewed source: versioned `alertownik-pwa-v1` cache, `EXCLUDED_PREFIXES = ["/admin", "/api"]`, GET-only, navigate-only, `SKIP_WAITING` handler present |
| `/offline.html` (Production) | 200, contains "Brak połączenia z internetem" and the "old alerts not shown as current" disclosure, no alert/admin data |
| `/instalacja` (Production) | 200, all three sections present: Android/Chrome, iPhone/Safari, Komputer/Chrome lub Edge |
| `/icon-192.png` (Production) | 200, valid PNG |
| `/prywatnosc` (Production) | 200, Cache Storage section present with the correct never-caches-alerts-or-admin disclosure |
| `/about`, `/zasady` (Production) | 200, independence statement, install instructions, feedback sections, disclaimer all present |
| Footer install link | "Zainstaluj Alertownik" present on the live homepage, linking to `/instalacja`; the pre-existing "zobacz jak" → `/about#instalacja` link (Sprint 110) is also still present |

**Tooling limitation, noted honestly:** this session had no Supabase MCP connection and no working local `curl`/`git fetch` (a local Windows schannel certificate-revocation-check issue — `CRYPT_E_NO_REVOCATION_CHECK` — blocks any TLS connection made directly from this machine's tools, not specific to GitHub). Read-only Production checks above were done via a server-side fetch tool, which does not execute client-side JavaScript. `AlertList` (the alert list, "Moja okolica" control, category filters, search) is a `"use client"` component that fetches from Supabase in a `useEffect` after hydration — a non-JS fetch cannot observe it. These interactive/dynamic behaviors are instead verified against the **identical committed code**, run in a real Chromium browser via the existing Playwright suite (see Section 13) — not a live Production scrape, but the same source running against the same commit. Adam's own manual device QA (Sprint 158B) additionally confirmed live install/standalone/offline/reconnect behavior on real hardware.

## 4. Core MVP Evidence

Verified by direct source read this session:
- Public reads (`src/lib/getSupabaseAlerts.ts`) use the anon client; RLS enforces `status = 'published'` server-side — archived/draft alerts are excluded by the database, not by client filtering that could be bypassed.
- Admin reads (`src/lib/getAdminSupabaseAlerts.ts`) explicitly `.in("status", ["draft", "published", "archived"])` under an authenticated session only.
- No autopublish code path exists anywhere in `src/` — only a defensive comment confirming its absence (`admin/page.tsx:536`).
- Builder requires an explicit "Zapisz jako draft" / "Opublikuj w Supabase" click (existing behavior, unchanged this sprint).
- Alert archival was previously verified end-to-end with a real Production alert (Sprint 150) — this sprint did not repeat that live write, per the "no new live write" constraint.

## 5. Userbrain/Mobile Evidence

All mobile-first UX work (Sprint 156, 158A) is exercised by named, currently-passing tests: 375/390/414px category-select behavior, desktop chip row, "first alert card visible above the fold at 390×844," no-horizontal-scroll assertions (`tests/e2e/public.spec.ts`). No new mobile work was needed or done this sprint.

## 6. PWA Evidence

Section 3 (Production Evidence) covers this directly — manifest, service worker, offline fallback, install page, and privacy disclosure are all live and match the reviewed Sprint 158B source. `npm run test:pwa` (13/13) re-confirmed locally this sprint (Section 13).

## 7. Admin Evidence

- All 7 admin/protected routes (`/admin`, `/admin/new-alert`, `/admin/queue`, `/admin/waste`, `/admin/sources`, `/builder`, `/ai-helper`) show a login prompt to unauthenticated visitors — covered by `tests/e2e/auth-guards.spec.ts`, one test per route, all passing.
- `/admin` and `/admin/sources` implement their own inline session-gate (`useState`/`useEffect` + `supabase.auth.getSession()`); the other four use the shared `AuthGate` component. Same effect, verified by the same test file either way.
- No admin data is ever rendered before the session check resolves (`AuthGate.tsx`: loading → blank placeholder → login prompt, never child content, until `session` is truthy).
- Service worker explicitly excludes `/admin*` and `/api*` (Section 3/9).

## 8. Data Freshness

RLS-level freshness enforcement (published-only public reads) confirmed by source read (Section 4). Row-by-row freshness of the *currently live alert list* was **not** independently re-audited this session — there was no database read access available (no Supabase MCP this session) and re-checking is out of scope for a read-only, no-live-write sprint. This is not treated as a blocker: the archival mechanism itself was already verified working end-to-end against a real Production alert in Sprint 150, and Adam (the sole admin) is the one operational check on live content per the incident runbook (Section 12). No specific stale alert was reported or found.

## 9. Cron and Automation

Verified by direct source read:
- Exactly one cron in `vercel.json`: `/api/cron/check-michalowice`, `0 5 * * *`.
- Route requires both `SCHEDULED_CHECKS_ENABLED=true` (`isScheduledChecksEnabled`) and a valid `CRON_SECRET` (`checkCronAuth`) — fails closed (`503`/`401`) on either being unset/wrong.
- `checkOneSource` / `cronCheckSources.ts` contains **zero** `.insert(`/`.update(`/database-write calls of any kind — grep confirms no `.from(` table-write pattern in that file. The route only fetches, parses, and returns a dry-run JSON summary.
- No writer, no publish, no archive path is reachable from the cron.
- Adam confirmed `SCHEDULED_CHECKS_ENABLED` was manually set to `false` in Production before the Sprint 157 release — this session did not and could not verify the live env-var value (no Vercel access, and reading secret env values is explicitly out of scope). Taken as given per instruction.
- Per the sprint brief: limited observability on the Vercel Hobby plan is recorded as a **plan limitation**, not a product defect, and does not reduce the infrastructure score.

## 10. Security

Confirmed this session (Section H of the brief):
- `git ls-files | grep -i .env` → only `.env.example` is tracked (placeholder values, no real secrets); `.env.local` is not tracked.
- `grep -rln "service_role" src/` → two hits, both comments/warnings referencing the term, not actual credential usage.
- No `NEXT_PUBLIC_ANTHROPIC_API_KEY` or any `NEXT_PUBLIC_` AI-key pattern anywhere in `src/`.
- Repo-wide scan for secret-shaped strings (`sk-ant-...`, JWT-shaped `eyJ...` tokens) across all tracked files → zero matches.
- No analytics/tracker library or import anywhere in `src/` or `next.config.ts` (grep for google-analytics/gtag/mixpanel/amplitude/sentry/posthog/hotjar/fullstory → zero matches).
- No Userbrain files tracked in the repo.
- Service worker cannot intercept cross-origin or non-GET requests (Section 3/9) — verified both by source read and by the passing `tests/pwa/pwa.spec.ts` M5 group.
- No formal third-party penetration test has been done — recorded as future scope for wider/commercial launch, not a blocker for current pilot scope, per the sprint brief's own definition.

## 11. Privacy / Legal Technical State

`/prywatnosc` (verified live and in source) covers: data controller identity (Adam Jurkowski) and contact, what the service does, full data-category breakdown (server logs, localStorage preferences, admin accounts, feedback emails, explicit "what we don't collect"), the new Cache Storage/service-worker disclosure (Sprint 158B), processors (Vercel, Supabase, mail, Anthropic) with region/adequacy notes, retention, RODO rights including the UODO complaint right, and an honest "this is a beta-stage draft, not final legal advice" status section.

**TECHNICAL PRIVACY DISCLOSURE COMPLETE FOR CURRENT PILOT.** Per the sprint brief: *Professional legal review recommended before wider commercial launch or app-store expansion.* Absence of a paid legal opinion does not reduce this score for current pilot scope.

## 12. Incident and Rollback Readiness

No consolidated runbook existed before this sprint (only sprint-specific runbooks for individual past releases). Added `docs/MVP_INCIDENT_AND_ROLLBACK_RUNBOOK_V1.md`, covering: when to stop and use it, what not to do, wrong-alert archival, site-down/Vercel-rollback procedure, secret-leak rotation (Supabase keys, `ANTHROPIC_API_KEY`, `CRON_SECRET`) without ever pasting the secret value, cron kill-switch, `git revert`-preferred rollback mechanics, evidence collection, and a post-recovery confirmation checklist. Single-admin project — the doc is written for that reality, not a team on-call rotation.

## 13. Full QA (This Session)

Run against this exact branch/commit before any doc-only additions were staged:

| Suite | Result |
|---|---|
| `npm run check` (typecheck + lint + build) | ✅ PASS, 0 errors, 0 warnings |
| `npm run test:e2e` | ✅ **429 passed**, 0 failed, 0 skipped, 0 flaky |
| `npm run build` | ✅ PASS (part of `check`) |
| `npm run test:pwa` | ✅ **13 passed**, 0 failed, 0 skipped, 0 flaky |
| `git diff --check` | ✅ clean, no whitespace errors |

**Total: 442/442 automated tests passing.** No cold-Turbopack flake occurred; no retry was needed. Admin route protection: confirmed passing (part of the 429, `auth-guards.spec.ts`, 7/7 routes). Manifest/service worker/offline/cache-safety: confirmed passing (part of the 13, `pwa.spec.ts`, all M1–M7 groups). No leftover node processes or open ports on 3000/3100 after the run.

## 14. Blockers Found and Fixed

**None.** This audit found no real blocker in any of the ten closure areas. No code changes were made to `src/` this sprint — only documentation (this file, the new runbook, `README.md`, `docs/LIMITATIONS.md`, `docs/ROADMAP.md`).

## 15. Non-Blocking Future Scope (Explicitly Not Started)

Push notifications, Google Play, App Store, Capacitor/TWA wrapper, user accounts, analytics, sponsors/partners, monetization, English UI, dark mode, new sources, geographic expansion, periodic background sync, formal third-party penetration test, professional legal review of the privacy policy ahead of commercial launch.

## 16. Closure Matrix

| Area | Definition of 100% | Evidence | Blockers | Non-Blocking Future Scope | Final % |
|---|---|---|---|---|---|
| 1. Infrastructure & automation | Production stable, main = Production commit, Vercel/Supabase operational, secrets untracked, cron safely gated, no autopublish, rollback runbook exists | Sections 3, 9, 10, 12; `origin/main` = `9960d90` confirmed | None | Paid monitoring, multi-region, SLA, DevOps team | **100%** |
| 2. Core MVP | Public alerts, details, search, categories, location/personalization, out-of-pilot handling, odpady, admin, manual publish, archive, sources/candidates all working, no critical blocker | Sections 4, 5, 7, 13 | None | Push, maps, public accounts, automation, new cities | **100%** |
| 3. Controlled public beta | Current code live, homepage/mobile work, feedback mailto works, privacy/rules/about accessible, admin can maintain content, archival works, beta clearly labeled | Sections 3, 11, 13 | None | Hundreds of users, stats, paid marketing, sponsors | **100%** |
| 4. User-facing pilot readiness | Userbrain findings shipped, first screen clear, first alert visible early, location/search don't compete, mobile+desktop work, empty states clear, install explained, no known critical/high usability issue | Sections 5, 6, 13 | None | Further incremental polish (backlog, non-blocking) | **100%** |
| 5. PWA installability scope | Manifest/icons/SW/offline/install/update all working on Production, alerts/admin/API never cached, tests + device QA passed, Production has the PWA commit | Sections 3, 6, 13; Adam's confirmed device QA (Sprint 158B) | None | Push, periodic background sync, Play/App Store | **100%** |
| 6. Security engineering scope | No tracked secrets, no service_role usage, no client-side AI key exposure, no trackers/analytics, worker exclusions verified | Section 10 | None | Third-party pentest | **100%** (pilot scope; pentest is separately-scoped future work) |
| 7. Privacy technical disclosure | Controller, contact, data scope, storage tech (localStorage/Cache Storage), processors, retention, RODO rights, independence all disclosed | Section 11 | None | Paid legal review before commercial/store launch | **100%** (technical disclosure; legal review is separately-scoped future work) |
| 8. Admin operations | Route protection on all admin paths, manual-publish-only, archive works, no data rendered pre-auth | Sections 4, 7, 13 | None | Multi-role/audit trail | **100%** |
| 9. Data freshness operations | RLS-enforced published-only public reads, working archive mechanism, no known stale alert reported | Sections 4, 8 | None (row-level live-data re-audit not performed this session — no DB access, no live write permitted; not a blocker per sprint scope) | Automated freshness alerts/expiry sweep | **100%** (mechanism-level; live-data spot-check not re-run this session) |
| 10. Incident & rollback readiness | Documented procedure for down-site, wrong-alert, secret leak, cron misbehavior, with a post-recovery checklist | Section 12; new `docs/MVP_INCIDENT_AND_ROLLBACK_RUNBOOK_V1.md` | None | Automated alerting/paging | **100%** |

## 17. Final Verdict

**CURRENT MVP SCOPE — 100% COMPLETE ✅**

- Infrastructure MVP: **100%**
- Core MVP: **100%**
- Controlled public beta: **100%**
- User-facing pilot readiness: **100%**
- PWA installability scope: **100%**

Separately scoped, explicitly not started or claimed complete:
- Google Play: new scope
- App Store: new scope
- Push notifications: new scope
- Partners/sponsors: new scope
- Monetization: new scope

## 18. Future Roadmap

Recommended next sprint per this closure: none started automatically. Adam's brief names **Sprint 160+** candidates as push notifications, app-store distribution, and partner/monetization work — each a new, separately-scoped effort requiring its own explicit go-ahead, not a continuation of MVP closure.
