# Sprint 165B — Isolated Preview Code Safety Package v1

**Status:** code and documentation only, branch `sprint-165b-isolated-preview-code-safety-package-v1`, not merged to `main`. No Supabase project was created. No SQL was executed. No RLS was changed. No Supabase Auth account was created. No secret was opened, copied, or typed. No Vercel environment variable was changed. No Redeploy was performed. No cron was run. No candidate was created. No alert was published, edited, or archived.

**Sprint 165B-2 addendum (same branch):** an independent re-audit found the original guard compared only self-reported labels and never confirmed the actual Supabase project identity — a real gap, closed before merge by adding two more independent signals (the actual project ref derived from `NEXT_PUBLIC_SUPABASE_URL`, and a new `SUPABASE_EXPECTED_PROJECT_REF` variable). Browser QA of the environment badge was also performed against the real Vercel Preview deployment for this branch. See the "Sprint 165B-2 correction" subsection below and the Browser QA section for full detail.

**Trigger:** Sprint 165A designed a genuinely isolated Preview Supabase project. This sprint builds the code-level half of that design — the parts that can be written, tested, and reviewed *before* the new infrastructure exists — so that when the infrastructure is created (a future sprint, 165C), the application already knows how to detect its own environment, show it honestly to the admin, and refuse to write automation data anywhere the environment/database pairing hasn't been explicitly confirmed safe.

---

## What was built (code)

### 1. Central environment identity — `src/lib/environmentIdentity.ts`

One pure function, `resolveEnvironmentIdentity(raw)`, maps a `VERCEL_ENV`-shaped string to `"production" | "preview" | "development" | "unknown"`. Every other consumer calls one of two thin wrappers around it:

- `getServerEnvironmentIdentity()` — reads `process.env.VERCEL_ENV` (server-only: Route Handlers, Server Components).
- `getClientEnvironmentIdentity()` — reads `process.env.NEXT_PUBLIC_VERCEL_ENV` (client components; Next.js inlines this as a build-time constant, so server-rendered HTML and the client's first render evaluate the identical literal — no hydration mismatch, because nothing is fetched or computed asynchronously after mount).

Both env vars are Vercel's own, automatically populated for every deployment — no new secret, no manual configuration required for the identity resolution itself. An empty, missing, or unrecognized value resolves to `"unknown"` — never guessed, never defaulted to a specific known environment.

### 2. Visible admin badge — `src/components/EnvironmentBadge.tsx`

A small, read-only `<span>` showing exactly one of `PRODUCTION` / `PREVIEW` / `DEVELOPMENT` / `UNKNOWN`, styled distinctly per identity (`UNKNOWN` uses a pulsing red style, deliberately reading as a warning). Wired into `AppHeader.tsx` immediately next to the existing "Admin" pill, in both the desktop nav and the mobile dropdown menu — both already gated behind `session &&`, so the badge is never rendered for an anonymous/public visitor (Requirement C.6), and appears on every admin-panel page that uses the shared header. No technical identifier, URL, or secret ever appears in its markup — verified by a structural test (see Tests below) asserting the component never references `process.env` directly, never imports a Supabase-connection or credential env var name, and has no `onClick`/`fetch`.

### 3. Fail-closed database/environment pairing guard — `src/lib/databaseEnvironmentGuard.ts`

**Sprint 165B-2 correction.** The version of this guard originally shipped in Sprint 165B compared only two self-reported *labels* — the resolved Vercel environment and `SUPABASE_ENVIRONMENT_TAG` — and never looked at which Supabase project was actually configured. A re-audit found this insufficient: two matching labels are not proof of which database is wired up. Concretely, `VERCEL_ENV=preview` + `SUPABASE_ENVIRONMENT_TAG=preview` while `NEXT_PUBLIC_SUPABASE_URL` still pointed at the **Production** project would have passed the original guard. This was a real gap in the original implementation, confirmed by direct code reading (the original file never referenced `NEXT_PUBLIC_SUPABASE_URL` at all), closed in this same sprint before merge — see `tests/e2e/databaseEnvironmentGuard.spec.ts` §D.3/§D.4 for the exact regression test.

`checkDatabaseEnvironmentGuard()` now independently confirms **four** signals, all required:

| # | Signal | Source | Failure reason if missing/invalid/mismatched |
|---|---|---|---|
| 1 | **Runtime application environment** | `getServerEnvironmentIdentity()` — `VERCEL_ENV`-derived | `environment_unknown` |
| 2 | **Declared database environment** | `SUPABASE_ENVIRONMENT_TAG` (new env var, name only — see below) | `database_tag_not_configured` / `database_tag_unknown` / `environment_mismatch` (vs. signal 1) |
| 3 | **Actual Supabase project identity** | Derived independently from `NEXT_PUBLIC_SUPABASE_URL`'s hostname (`<project-ref>.supabase.co` → `<project-ref>`) — never a self-reported label | `supabase_url_missing_or_invalid` |
| 4 | **Expected Supabase project identity** | `SUPABASE_EXPECTED_PROJECT_REF` (new env var, name only — see below) | `expected_project_ref_not_configured` / `project_ref_mismatch` (vs. signal 3) |

Signals 1+2 are checked first (cheapest, no derivation needed) — if either fails, signals 3+4 are never even computed. The project-ref extraction (signal 3) is pure string/URL parsing — no network call, no Supabase client, no I/O — so the guard remains synchronous and stays Layer 0 (cheapest, checked first, before the pre-existing kill switches). Every caller-facing surface still uses one single generic message (`DATABASE_ENVIRONMENT_GUARD_GENERIC_ERROR = "Zapis jest tymczasowo niedostępny."`) — none of the seven possible failure reasons, the resolved environment, the configured tag, the actual project ref, or the expected project ref is ever returned to an HTTP caller or written to a log line.

The project ref extracted from the URL is not treated as a secret in this codebase (Supabase's own anon key already ships this value to every browser via the public connection URL), but it is still never logged, never returned in any API response, and never interpolated into the generic error string — verified directly by test.

**No value for `SUPABASE_ENVIRONMENT_TAG` or `SUPABASE_EXPECTED_PROJECT_REF` is set anywhere as part of this sprint** — every environment, including Production, therefore fails this guard today (reaching `database_tag_not_configured` before the project-ref signals are even evaluated). This is safe and non-regressive, for the same reasons as before:
- The guard is only ever consulted inside the one write-capable automation route (see next section) — every read path (public site, admin dashboard, source registry, etc.) is completely unaffected, so **Production stays fully functional in its existing read/write-via-admin-session behavior.**
- `write-candidates` was already unreachable in every environment before this sprint (`SCHEDULED_WRITES_ENABLED` has no configured value anywhere — confirmed by the Sprint 148/150 orphaned-environment-variable cleanups). A fifth/sixth/seventh reason it stays blocked changes nothing observable.
- The two dry-run cron routes never import this guard or the scheduled-writer module at all (verified structurally, see Tests) — their zero-write guarantee is unchanged, and **the existing Production cron (`check-michalowice`, daily 05:00 UTC dry-run) continues running exactly as before, writing nothing, as it always has.**
- No `service_role` key is read, used, or referenced anywhere in this module.

### 4. Guard wired into the one write-capable automation route

`GET /api/cron/write-candidates` (`src/app/api/cron/write-candidates/route.ts`) now checks the guard as **Layer 0** — first, cheapest (no I/O), before the pre-existing Layers 1-3 (the two kill switches, then technical-account credentials). This is strictly additive: every prior gate's logic, ordering, and behavior is unchanged; Layer 0 can only narrow what was already blocked, never widen it.

---

## Real write paths inventoried (re-confirmed this sprint)

| Path | Writes automation data? | Guarded by Layer 0? |
|---|---|---|
| `GET /api/cron/write-candidates` | **Yes** — the only automation write path in the codebase | **Yes** |
| `GET /api/cron/check-sources`, `GET /api/cron/check-michalowice` | No — dry-run only, no Supabase import at all | N/A — structurally can never write, unchanged |
| Browser, under an authenticated admin session (Builder, source registry, candidate review) | Yes, but these are human-initiated writes under RLS + `admin_profiles` session checks, not "automation" in the sense this guard addresses | Not in scope for this guard — Sprint 165A's design scopes the guard to the automation write path specifically |
| `POST /api/ai/draft-alert` | No — calls Anthropic only, returns JSON; the browser's own later save/publish click is what writes | N/A |

A structural test confirms `createSupabaseScheduledWriter` (the only function that constructs a Supabase client capable of the scheduled-writer's narrow inserts) is called from exactly one file in the entire `src/` tree — the guarded route — so nothing bypasses the guard via a direct import elsewhere.

---

## Configuration variables introduced (names only — no value set)

| Variable | Values / example placeholder | Set anywhere in this sprint? |
|---|---|---|
| `SUPABASE_ENVIRONMENT_TAG` | `production` \| `preview` \| `development` (placeholder example only — never a real value) | **No.** Not in Vercel, not in `.env.local`, not in any file in this repository. |
| `SUPABASE_EXPECTED_PROJECT_REF` | e.g. `abcdefghijklmnopqrst` (a Supabase project ref shape — placeholder example only, never a real value) | **No.** Not in Vercel, not in `.env.local`, not in any file in this repository. |

`VERCEL_ENV` / `NEXT_PUBLIC_VERCEL_ENV` and `NEXT_PUBLIC_SUPABASE_URL` are Vercel's/this project's own pre-existing variables — nothing was added or changed for those; `SUPABASE_EXPECTED_PROJECT_REF` is compared against a value *derived* from the existing `NEXT_PUBLIC_SUPABASE_URL`, never against a new copy of it.

**Sprint 165C will need**, once the isolated Preview project exists: `SUPABASE_ENVIRONMENT_TAG=preview` and `SUPABASE_EXPECTED_PROJECT_REF=<the new Preview project's actual ref>`, both scoped to Preview only in Vercel — see the updated `docs/SPRINT_165C_MANUAL_DEPLOYMENT_RUNBOOK_V1.md` §8.

---

## Tests

New files, all pure/structural (no live database, no live Supabase project, no real credential):

- `tests/e2e/environmentIdentity.spec.ts` — the resolver's full decision table (known values, case-insensitivity, whitespace, missing/empty/garbage input, the two wrappers' independence from each other's env var).
- `tests/e2e/databaseEnvironmentGuard.spec.ts` — the full four-signal decision table (Sprint 165B-2): matching everything on both Preview and Production passes; the exact "matching labels, wrong project" gap this sprint closed is blocked (`project_ref_mismatch`); missing/malformed/non-Supabase/multi-label URLs all block as `supabase_url_missing_or_invalid`; a missing `SUPABASE_EXPECTED_PROJECT_REF` blocks; UNKNOWN always blocks regardless of every other signal; Development requires every signal explicitly configured, no implicit pass; no failure reason or the passing result ever contains a URL, project ref, or the word "supabase".
- `tests/e2e/databaseEnvironmentGuardIntegration.spec.ts` — the guard inside the real route: still blocks today even with layers 1-3 fully satisfied and a valid bearer token; blocks on mismatch even with everything else configured; response never leaks the configured secrets; only the guarded route imports the guard module; the two dry-run cron routes import neither the guard nor the scheduled writer; `createSupabaseScheduledWriter` has exactly one caller; the route calls the guard before constructing any writer (source-order assertion).
- `tests/e2e/environmentBadge.spec.ts` — structural audit of the badge component and its `AppHeader` wiring (Client Component, no secret/env-var-name references, no raw `process.env` interpolation, no `onClick`/`fetch`, no `useEffect`/`useState` — resolved synchronously to avoid hydration-mismatch risk, rendered only inside the existing `session &&` gate).

An existing file, `tests/e2e/scheduledWriterRoute.spec.ts`, was updated: its shared `ENABLED_ENV` fixture (and two individual kill-switch tests that build their own env object) now include a passing `VERCEL_ENV`/`SUPABASE_ENVIRONMENT_TAG` pairing, so the pre-existing Layer 1-3 tests continue to exercise exactly what they claim to (kill switches, auth, sign-in) rather than being short-circuited by the new Layer 0 — no existing test's assertions or intent were weakened, only its fixture extended.

**Results:** `npm run check` (typecheck + lint + build) passed with zero errors. `npm run test:e2e` — 668 passed, 0 failed. `npm run test:pwa` — 17 passed, 0 failed. `git diff --check` — clean, no whitespace errors.

(One test, `themeSystem.spec.ts`'s "clicking Jasny overrides a dark system preference," failed once under full-suite parallel load and passed on an isolated re-run — a pre-existing flake unrelated to this sprint's changes; not a file this sprint touched.)

---

## Browser QA — manual gate, not run

This branch has not yet been pushed, so no Vercel Preview URL exists for it yet. Per this sprint's instructions, Claude did not log in, did not guess a URL, and did not attempt to fabricate this verification. **This is a manual gate for Adam**, once the branch is pushed and Vercel generates a Preview deployment: confirm the `EnvironmentBadge` renders correctly (desktop, light/dark/system theme, no console errors, no layout shift in the mobile bottom navigation) and that a signed-in admin session sees no unexpected 401/403 and triggers no write action anywhere on the pages it visits. Nothing about this sprint's automated-test completion depends on that manual step — every automated check above already passed.

---

## Schema replay manifest and synthetic seed (not executed)

- `docs/sql/SPRINT_165B_ISOLATED_PREVIEW_SCHEMA_REPLAY_MANIFEST_V1.md` — an itemized audit of every SQL file in `docs/` and `docs/sql/`, sorted into "candidate for replay," "supersede," "exclude (proposal-only, rollback-only, verification-only, or Production-specific data)," with an honest finding: the historical file trail does **not**, on its own, provably reconstruct the live schema (several tables/policies have no corresponding committed file at all — direct dashboard changes, historically). The manifest recommends a future sprint generate one fresh, introspection-derived "as-built" script instead of trusting the historical sequence blindly, and gives a provisional dependency-ordered list as a cross-check either way.
- `docs/sql/SPRINT_165B_ISOLATED_PREVIEW_SYNTHETIC_SEED_NOT_EXECUTED_V1.sql` — clearly marked `NOT EXECUTED` / `SYNTHETIC PREVIEW DATA ONLY` in its header. Contains only invented categories, sources, alerts (spanning draft/published/archived, every severity, an expired and an upcoming entry), source checks, candidates, and waste-schedule rows. Creates no Auth account, no `admin_profiles`/`automation_identities` row, no email, no password, no real Production-derived id.

## Manual deployment runbook (planning only)

`docs/SPRINT_165C_MANUAL_DEPLOYMENT_RUNBOOK_V1.md` — the full future execution plan for Sprint 165C: exact steps split across Claude Code / Claude in Chrome / Adam-only manual actions, how to create the project, run the schema replay, create both test accounts, configure only the Preview scope in Vercel, prove isolation in both directions, roll back without touching Production, and six explicit STOP points before the riskiest steps (project creation, SQL, Auth accounts, secrets, Vercel env changes, first write attempt).

---

## What this sprint deliberately did not do

- Did not create a Supabase project, run SQL, change RLS, or create a Supabase Auth account.
- Did not open, copy, or type any secret value — `SUPABASE_ENVIRONMENT_TAG` and every other new-sprint variable name is documented as a name and placeholder example only, never a real value.
- Did not change any Vercel environment variable, and did not click Redeploy.
- Did not run any cron, call `write-candidates`, or create a real candidate.
- Did not publish, edit, or archive any alert.
- Did not start Sprint 165C — the runbook above describes that future work without performing any of it.

---

## Code vs. infrastructure vs. SQL vs. automation — explicit status

| Layer | Status |
|---|---|
| Code (environment identity, badge, guard, route wiring, tests) | **Built, tested, passing** |
| Documentation (this file, schema manifest, seed package, runbook) | **Written** |
| Infrastructure (new Supabase project, Vercel Preview-scoped variables) | **Not created — zero infrastructure changes this sprint** |
| SQL (schema replay, seed data) | **Not executed — prepared only, both files explicitly marked as such** |
| Automation activation (`SCHEDULED_CHECKS_ENABLED`/`SCHEDULED_WRITES_ENABLED` anywhere) | **Not touched — remains exactly as it was before this sprint** |
