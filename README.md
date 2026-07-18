# Alertownik

**Alertownik** is a Polish local civic alerts web app. It helps residents quickly understand nearby disruptions — transport delays, water outages, power cuts, road works, and municipal announcements.

Each alert has a fixed structure: what's happening, where, when, and what to do. Every alert links back to the original official source.

**Live:** [https://alertownik-mvp.vercel.app/](https://alertownik-mvp.vercel.app/)

> Early-stage MVP built for learning and product validation. No real user PII is stored or included in this repository.

> **MVP scope closure (Sprint 159):** infrastructure, Core MVP, controlled public beta, user-facing pilot readiness, and PWA installability are each at 100% of their current defined scope. Push notifications, app-store distribution, analytics, and monetization are separate, not-yet-started scopes — see `docs/SPRINT_159_MVP_100_PERCENT_CLOSURE_V1.md`.

> **Security hardening (Sprint 161):** the three admin-triggered API routes now require a verified Supabase session server-side, the source-preview fetch endpoint has SSRF defenses (private-IP/DNS/redirect validation), and the site serves a real CSP plus standard security headers. Rate limiting and a true server-side admin route guard remain open — see `docs/SPRINT_161_CRITICAL_SECURITY_HARDENING_V1.md` and `docs/LIMITATIONS.md`.

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
| Public alert list, search, category filters | `/` |
| "Moja okolica" user preferences (localStorage) | `/` |
| Alert detail pages | `/alerts/[slug]` |
| Admin login (Supabase Auth) | `/login` |
| Admin dashboard with stats and source overview | `/admin` |
| Alert Builder — create, edit, publish, archive | `/builder` |
| AI Helper — manual prompt → ChatGPT/Claude → JSON | `/ai-helper` |
| Source registry — add, edit, monitor sources | `/admin/sources` |
| Manual source monitoring and check history | `/admin/sources` |
| Source check → AI Helper shortcut | `/admin/sources` → `/ai-helper` |
| Installable PWA — manifest, icons, service worker, safe offline screen | all public pages, `/instalacja` |

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
