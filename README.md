# Alertownik

**Alertownik** is a Polish local civic alerts web app. It helps residents quickly understand nearby disruptions — transport delays, water outages, power cuts, road works, and municipal announcements.

Each alert has a fixed structure: what's happening, where, when, and what to do. Every alert links back to the original official source.

**Live:** [https://alertownik-mvp.vercel.app/](https://alertownik-mvp.vercel.app/)

> Early-stage MVP built for learning and product validation. No real user PII is stored or included in this repository.

> **MVP scope closure (Sprint 159):** infrastructure, Core MVP, controlled public beta, user-facing pilot readiness, and PWA installability are each at 100% of their current defined scope. Push notifications, app-store distribution, analytics, and monetization are separate, not-yet-started scopes — see `docs/SPRINT_159_MVP_100_PERCENT_CLOSURE_V1.md`.

> **Security hardening (Sprints 161–161B, RLS closed 164A):** the three admin-triggered API routes now require a verified *and authorized* Supabase session server-side (a genuine session alone isn't enough — it must also have an `admin_profiles` row), the source-preview fetch endpoint has SSRF defenses (private-IP/DNS/redirect validation), the site serves a real CSP plus standard security headers, and live RLS was manually verified for `alerts`/`source_checks`/`source_notice_candidates`/`alert_sources` — **all four confirmed correct on Production as of Sprint 164A (2026-07-19)**. Rate limiting and a true server-side admin route guard remain open — see `docs/SPRINT_161_CRITICAL_SECURITY_HARDENING_V1.md` and `docs/LIMITATIONS.md`.
>
> **Automation & link health foundation (Sprint 164A):** an admin-triggered, SSRF-guarded Link Health Panel (`/admin/sources`) checks each active source's live HTTP reachability on demand — nothing persisted, nothing automatic. The existing Michałowice candidate-automation pipeline (Sprints 147–153) was re-audited and confirmed still fully fail-closed and OFF in every environment — see `docs/SPRINT_164A_AUTOMATION_LINK_HEALTH_SAFE_FOUNDATION_V1.md`.
>
> **Safe auto-candidate canary foundation (Sprint 164B, live on Production — automation still OFF):** a read-only "Stan automatyzacji (canary)" panel on `/admin/sources` shows whether the existing Michałowice candidate-automation pipeline's kill switches are on or off — never their secret values. The pipeline itself (Sprints 147–153) already satisfied every safety requirement this sprint set out to add (max 1 candidate per run, single-source allowlist, pending-only inserts, fail-closed on any missing switch/credential). Still OFF in every environment; activation is a separate, manual, staged process — see `docs/SPRINT_164B_SAFE_AUTO_CANDIDATE_CANARY_FOUNDATION_V1.md`.
>
> **Canary environment safety audit (Sprint 164C, docs only):** a read-only audit found Preview and Production currently share one Supabase project — a canary run triggered from a Preview URL writes to the same data as Production. Adam decided to keep this shared setup for now; the activation runbook was corrected so the first canary run is treated as a Production-data operation regardless of URL, with a mandatory pre-flight/post-run checklist — see `docs/SPRINT_164C_CANARY_ENVIRONMENT_SAFETY_AUDIT_V1.md`.
>
> **Isolated Preview environment design (Sprint 165A, design only — not built):** a full audit and architecture plan for a genuinely separate Preview Supabase project (own URL/key, own test admin, own scheduled-writer account, replayed schema/RLS, synthetic data only, environment badge, fail-closed environment-pairing guard). Nothing was created or changed — see `docs/SPRINT_165A_ISOLATED_PREVIEW_ENVIRONMENT_DESIGN_V1.md`.
>
> **Isolated Preview code safety package (Sprint 165B/165B-2, code + docs — no infrastructure yet):** the code half of Sprint 165A's design is now live in the codebase — a single-source-of-truth environment identity (`VERCEL_ENV`-derived), a visible `PRODUCTION`/`PREVIEW`/`DEVELOPMENT`/`UNKNOWN` badge in the admin panel, and a fail-closed database-environment guard added as a fourth, additive gate on the one write-capable automation route (`write-candidates`). A Sprint 165B-2 re-audit found and closed a real gap in the first version — matching environment *labels* alone don't prove which Supabase *project* is actually wired up — so the guard now independently confirms the actual project identity (derived from `NEXT_PUBLIC_SUPABASE_URL`) against a new `SUPABASE_EXPECTED_PROJECT_REF` value, alongside the existing `SUPABASE_ENVIRONMENT_TAG` check. No value is configured for either new variable anywhere, so every environment (including Production) is blocked by this gate today, exactly as it already was for other reasons — no infrastructure, SQL, or automation was touched. See `docs/SPRINT_165B_ISOLATED_PREVIEW_CODE_SAFETY_PACKAGE_V1.md`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5 |
| UI | React 19 |
| Styling | Tailwind CSS v4 |
| Database | Supabase (PostgreSQL + Auth + RLS) |
| Hosting | Vercel |

---

## Run Locally

**Prerequisites:** Node.js 18+, a Supabase project (see `docs/SUPABASE_SETUP_CHECKLIST.md`)

```bash
git clone <repo-url>
cd alertownik-mvp
npm install
# Copy .env.local with your Supabase URL and anon key
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## What Works

| Feature | Location |
|---|---|
| "Dzisiaj" — compact daily view (top alert, next waste collection) | `/` |
| Public alert list, search, category filters, "Moja okolica" | `/alerty` |
| Mobile bottom navigation (Dzisiaj/Alerty/Odpady/Więcej) | all public pages, mobile only |
| Settings/info index for mobile ("Więcej" tab) | `/wiecej` |
| Alert detail pages, incl. native share | `/alerts/[slug]` |
| Admin login (Supabase Auth) | `/login` |
| Admin dashboard with stats and source overview | `/admin` |
| Alert Builder — create, edit, publish, archive | `/builder` |
| AI Helper — manual prompt → ChatGPT/Claude → JSON | `/ai-helper` |
| Source registry — add, edit, monitor sources | `/admin/sources` |
| Manual source monitoring and check history | `/admin/sources` |
| Source check → AI Helper shortcut | `/admin/sources` → `/ai-helper` |
| Installable PWA — manifest, icons, service worker, safe offline screen | all public pages, `/instalacja` |
| Light / dark / system theme (localStorage, no server sync) | `/ustawienia`, applies app-wide |

---

## Key Documents

| Document | Purpose |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Claude Code operating system — read before writing any code |
| [docs/AI_WORKFLOW.md](docs/AI_WORKFLOW.md) | How to work with Claude Code safely |
| [docs/AUTOMATED_CHECKS.md](docs/AUTOMATED_CHECKS.md) | `npm run check` — what it does, what it doesn't cover |
| [docs/QA_MANUAL_CHECKLIST.md](docs/QA_MANUAL_CHECKLIST.md) | Manual QA checklist for every sprint |
| [docs/NEXT_MILESTONES.md](docs/NEXT_MILESTONES.md) | Product milestone roadmap |
| [docs/SUPABASE_SETUP_CHECKLIST.md](docs/SUPABASE_SETUP_CHECKLIST.md) | Supabase project setup guide |
| [docs/supabase_source_checks.sql](docs/supabase_source_checks.sql) | SQL migration: source_checks table (Sprint 49) |
| [docs/supabase_sources_schema.sql](docs/supabase_sources_schema.sql) | SQL migration: alert_sources table |
| [docs/supabase_alerts_source_id.sql](docs/supabase_alerts_source_id.sql) | SQL migration: source_id FK on alerts |
| [docs/PRODUCT_NOTES.md](docs/PRODUCT_NOTES.md) | Product thinking and design principles |
| [docs/DEMO_GUIDE.md](docs/DEMO_GUIDE.md) | How to demo the app |
| [docs/LIMITATIONS.md](docs/LIMITATIONS.md) | Honest current constraints |
| [docs/SPRINT_158B_PWA_INSTALLABILITY_AND_SAFE_OFFLINE_FOUNDATION_V1.md](docs/SPRINT_158B_PWA_INSTALLABILITY_AND_SAFE_OFFLINE_FOUNDATION_V1.md) | PWA manifest, icons, service worker, cache policy, offline UX |
| [docs/SPRINT_159_MVP_100_PERCENT_CLOSURE_V1.md](docs/SPRINT_159_MVP_100_PERCENT_CLOSURE_V1.md) | MVP scope closure audit — infrastructure, Core MVP, beta, pilot readiness, PWA |
| [docs/MVP_INCIDENT_AND_ROLLBACK_RUNBOOK_V1.md](docs/MVP_INCIDENT_AND_ROLLBACK_RUNBOOK_V1.md) | What to do when something breaks in Production |

---

## Notes

- The app UI is in **Polish** — target users are Polish-speaking local residents.
- The service_role Supabase key is never used in frontend code — only the anon key.
- `.env.local` is in `.gitignore` and must never be committed.
- `npm run build` must pass before every commit.
