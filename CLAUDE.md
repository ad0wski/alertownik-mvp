@AGENTS.md

# Alertownik MVP — Claude Operating System

This file is the primary briefing for Claude Code. Read it in full before writing any code.

---

## Project Overview

Alertownik is a Polish local civic alerts web app. Residents see published alerts about nearby disruptions (transport, water, power, roads, waste, municipal). Admins create, publish, and monitor alerts using a protected toolset.

**Live:** https://alertownik-mvp.vercel.app/
**Stack:** Next.js 16.2.6 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS v4 · Supabase · Vercel

---

## Architecture

```
/src
  /app
    page.tsx                — Public homepage (alert list, search, Moje alerty)
    layout.tsx              — Root layout, metadata, viewport
    manifest.ts             — PWA manifest
    /alerts/[slug]/page.tsx — Public alert detail page (dynamic)
    /login/page.tsx         — Admin login
    /admin/page.tsx         — Admin dashboard (auth-gated)
    /admin/sources/page.tsx — Source registry + monitoring (auth-gated)
    /ai-helper/page.tsx     — AI Helper — prompt generator (auth-gated)
    /builder/page.tsx       — Alert builder (auth-gated)
  /components               — Shared components (AppHeader, AppFooter, AlertCard, etc.)
  /lib                      — Data fetching, Supabase helpers, utilities
  /types                    — TypeScript interfaces (Alert, AlertSource, SourceCheck)
/docs                       — Project docs (SQL migrations, QA, roadmap, etc.)
/public                     — Static assets (icon.svg, favicon.ico)
```

### Auth model

Supabase Auth with email/password. Any authenticated user is treated as admin. Public (anon) users have read-only access to published alerts only. Admin pages are wrapped in `AuthGate` or redirect to `/login`.

### Data flow

- **Public:** `getSupabaseAlerts()` → reads `alerts` table via anon key → only `status = 'published'` rows (enforced by RLS)
- **Admin:** `getAdminSupabaseAlerts()` → reads all alerts via authenticated session
- **Sources:** `getAlertSources()` → reads `alert_sources` via authenticated session
- **Source checks:** `getSourceChecks()` / `createSourceCheck()` → reads/writes `source_checks` via authenticated session
- **Builder write:** `supabaseAlertWrites.ts` → insert/update via authenticated session

### sessionStorage flows

- Sources → AI Helper: key `alertownik_pending_source_for_ai`
  `{ sourceId, sourceName, sourceUrl, suggestedCategory, checkNotes? }`
- AI Helper → Builder: key `alertownik_pending_ai_alert_json` + `alertownik_pending_alert_source_id`
- User preferences: `alertownik-user-preferences`, `alertownik-alert-mode` (localStorage, public users)

---

## Supabase Tables

| Table | Purpose | Access |
|---|---|---|
| `alerts` | All alerts (draft/published/archived) | Public: SELECT status=published only · Admin: full |
| `alert_sources` | Source registry | Admin only |
| `source_checks` | Manual source check history | Admin only |

### Key columns

**alerts:** `id, slug, category, severity, title, place, starts_at, ends_at, change, action, source_name, source_url, source_id (FK→alert_sources), status, created_at, updated_at, published_at`

**alert_sources:** `id, name, url, category, source_type, is_active, notes, last_checked_at, created_at, updated_at`

**source_checks:** `id, source_id (FK→alert_sources), checked_at, result, notes, related_alert_id, created_by, created_at`

### RLS policy pattern

All admin tables use `auth.role() = 'authenticated'` for full access. Public has no access to admin tables. Alerts table uses `status = 'published'` for anon SELECT.

---

## Supabase MCP

A local MCP server named `supabase-alertownik` may be available in this Claude Code session. It connects to the live Alertownik Supabase project and is configured in read-only mode.

### When to use MCP

Use MCP tools to:
- Inspect table structure (`list_tables`) before coding a feature
- Verify column names and types when writing queries or type definitions
- Confirm a SQL migration was applied correctly after the user runs it manually

Always run `npm run check` and `npm run test:e2e` after any coding changes, regardless of what MCP inspection revealed.

### MCP rules — never violate

1. **Read-only by default.** Use MCP only to inspect tables, columns, and data. Never insert, update, delete, or truncate rows unless the user explicitly approves the specific operation in this session.
2. **Never run destructive operations.** Never execute `DROP`, `TRUNCATE`, `DELETE`, or schema-altering SQL via MCP tools.
3. **Never use service_role credentials.** Do not attempt to escalate or switch to a service_role key via MCP.
4. **Schema and RLS changes still require explicit user confirmation.** Even if MCP tools allow it, never alter tables, columns, indexes, or RLS policies without the user requesting it first — write the SQL to a file in `docs/` for manual execution.
5. **MCP config stays local.** Never commit `.mcp.json` or any MCP credentials to the repository.

---

## Environment Variables

Defined in `.env.local` (never commit this file):

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Only the **anon key** is used. The service_role key is never used in any frontend code. `.env.local` is in `.gitignore`.

---

## Routes

| Route | Visibility | Purpose |
|---|---|---|
| `/` | Public | Alert list, search, category filter, Moje alerty |
| `/alerts/[slug]` | Public | Alert detail page |
| `/login` | Public | Admin login form |
| `/admin` | Admin | Dashboard: stats, sources-to-check, recent checks |
| `/admin/sources` | Admin | Source registry, monitoring, check history |
| `/ai-helper` | Admin | Prompt generator → ChatGPT/Claude → JSON |
| `/builder` | Admin | Create/edit/publish/archive alerts in Supabase |
| `/manifest.webmanifest` | Public | PWA manifest |

---

## Security Rules — Never Violate

1. **Never use the Supabase service_role key** in any frontend or client-side code. It must never appear in any file under `src/`. Only the anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) is allowed.
2. **Never commit `.env.local`**. It is in `.gitignore`. Do not hardcode env values in source files.
3. **Never expose admin tools to public users.** Admin pages use `AuthGate` or explicit session checks. Public users must not see `/admin`, `/builder`, `/ai-helper`, or `/admin/sources`.
4. **Never modify RLS policies without explicit user confirmation.** RLS is the security boundary between public and admin data.
5. **Never change the Supabase schema** (add/drop tables or columns, change constraints) without the user explicitly requesting it. When a schema change is needed, write a SQL file in `docs/` for the user to run manually — never execute SQL automatically.
6. **Never add, remove, or upgrade npm packages** without the user confirming the dependency is needed.
7. **Never modify `.env.local`**.

---

## What Claude Must Never Do (Without Explicit Permission)

- Add AI API keys or call LLM APIs from server or client code
- Add web scraping or automated source monitoring
- Add cron jobs or background tasks
- Add push notifications or email sending
- Change the public UI language (must stay Polish)
- Expose source registry or check history to public users
- Store real user PII
- Run destructive SQL (DROP, TRUNCATE) in any automated way — including via Supabase MCP tools
- Use Supabase MCP to write, update, or delete data without explicit user approval in the current session
- Push to the remote repository
- Auto-commit changes

---

## Build & Dev Commands

```bash
npm run dev          # Start dev server (Turbopack, port 3000)
npm run typecheck    # Fast TypeScript-only check (no build output)
npm run lint         # ESLint on src/ — warnings are OK, errors must be zero
npm run build        # Full production build including TypeScript check
npm run check        # typecheck + lint + build — run this before every commit
npm run test:e2e     # Playwright smoke tests (requires dev server or starts one)
npm run test:e2e:ui  # Playwright interactive UI mode
```

**Rule:** Before considering any coding task complete, run `npm run check`. If it fails:
1. Read the error output
2. Fix the problem in the source file
3. Run `npm run check` again
4. Do not tell the user the task is complete until `npm run check` passes with zero errors

`npm run check` currently passes with zero errors and zero warnings.

For UI or routing changes, also run `npm run test:e2e` after `npm run check`.

See `docs/AUTOMATED_CHECKS.md` for what each command checks and what it does NOT cover.

Check Next.js docs at `node_modules/next/dist/docs/` for current API conventions — this project uses Next.js 16 which differs from training data. Note: `next lint` was removed from the Next.js 16 CLI; use `npm run lint` instead.

---

## Development Workflow

1. User describes a sprint goal
2. Claude reads the relevant source files before writing any code
3. Claude implements changes in the smallest reasonable set of files
4. Claude runs `npm run check` and fixes any errors before reporting completion
5. Claude reports what changed, what SQL (if any) needs to be run manually, and what to test
6. User tests manually and commits

### File inspection before coding

Before implementing any feature, always read:
- The page file(s) directly involved
- The lib helper files involved
- The type definitions involved
- Any SQL migration files if schema is being discussed

### Prefer existing patterns

- Always check how existing similar features are implemented before inventing a new approach
- Follow the existing `rowToX()` mapping pattern in lib helpers
- Follow the existing RLS policy pattern in new SQL migrations
- Do not introduce new state management patterns if useState/useEffect suffices

---

## Git Workflow

- Branch: `main` is the only branch (MVP phase)
- Commits: user creates commits manually after reviewing changes
- Do not auto-push, auto-commit, or auto-amend
- Never force-push

---

## Current Roadmap

See `docs/NEXT_MILESTONES.md` for the milestone roadmap.

### Immediate next priorities (as of June 2026)

- Source monitoring polish
- Pilot user testing
- AI API integration (optional, later milestone)
- Notifications (later milestone)

---

## Definition of Done (Every Task)

A task is complete when all of the following are true:

1. `npm run check` passes with zero errors (`typecheck` + `lint` + `build`)
2. No new warnings in the build output
3. The public homepage still works (alert list loads, filters work)
4. Admin login still works
5. The specific feature being built works end-to-end
6. No `.env.local` modifications
7. No service_role key usage
8. No new npm packages unless explicitly approved
9. Polish UI text throughout
10. Code is simple and readable — no unnecessary abstractions
11. If a Supabase schema change is needed: a SQL file in `docs/` exists and the user has been told to run it manually
