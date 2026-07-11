# Scheduled Checks Architecture v1

**Sprint 141 — Scheduled Checks Architecture & Security Gate.**
Status: **architecture/planning only — nothing in this document is active.**
No cron exists. No privileged credential exists. No schema/RLS change was made.
This file is the canonical technical reference for how a *future* scheduled
check would work; the Obsidian note "Scheduled Checks Architecture v1" is the
short decision-level summary that links back here.

---

## 1. Why this sprint exists

Sprints 134–139 built a **manual** Source Check API: an admin clicks a
button on `/admin/sources`, the server fetches one allowlisted official
page, parses it, and returns proposals to the browser. The admin's browser
then — through their own authenticated Supabase session — saves a candidate
(`source_notice_candidates`, status `pending`) and/or logs a
`source_checks` row. See `src/app/api/sources/check/route.ts` and
`src/lib/sourceCheck.ts`.

The long-term goal (per the Automation Implementation Plan) is to run this
check **on a schedule**, not on a click. A scheduled job has no browser, no
logged-in admin, and no session token — so it **cannot** call
`createSourceCandidateNotice()` / `createSourceCheck()` the way the browser
does today. This document defines the safest way to close that gap, without
closing it yet.

---

## 2. Current architecture audit (facts, not proposals)

### 2.1 Source-check API
- `POST /api/sources/check` (`src/app/api/sources/check/route.ts`): accepts
  only `{ sourceKey: string }`. The URL is *never* taken from the request —
  it's resolved server-side via `getSafeCheckSource(sourceKey)`
  (`src/lib/sourceCheck.ts`), which only recognizes
  `SAFE_CHECK_SOURCE_IDS = ["michalowice-komunikaty", "wkd-aktualnosci"]`.
  Any other key returns HTTP 422 with `UNSUPPORTED_SOURCE_ERROR`.
- Fetch has a 10s `AbortController` timeout, a `text/html` content-type
  guard, a 500KB response-size cap (`raw.slice(0, 500_000)`), and a fixed
  `User-Agent: Alertownik-Monitor/1.0`.
- The route **performs zero database writes**. It returns
  `{ ok, source, pageTitle, fetchedAt, proposals }` to the caller. Proposal
  building (`buildCheckProposals` in `sourceCheck.ts`) is a pure function:
  deterministic, capped at `MAX_CHECK_PROPOSALS = 6`, drops boilerplate and
  sub-60-char fragments, de-dupes by normalized title within one run.
- `src/app/api/sources/fetch-preview/route.ts` is the same fetch/parse
  shape but accepts an arbitrary admin-supplied URL (used for ad-hoc
  preview of sources not yet on the safe allowlist) — **this route must
  never be reachable by a cron job**; only the allowlisted
  `/api/sources/check` is a candidate for scheduling.

### 2.2 Parser layer
- `src/lib/sourceParsers/pageParser.ts` does the actual HTML→candidate
  extraction (news-item pass, blogPost/Joomla pass, generic block pass, in
  that precedence order — Sprint 138/139). Pure, fixture-tested
  (`tests/e2e/sourceParserFixtures.spec.ts`,
  `tests/e2e/wkdParserFixtures.spec.ts`), zero live-site dependency in
  tests.
- `src/lib/sourceParsers/index.ts` / `pdfParser.ts` exist for strategy
  detection but PDF sources are explicitly manual-only (no scheduled path
  is proposed for them in this document).

### 2.3 Candidate persistence (today: browser-only)
- `src/lib/supabaseCandidateWrites.ts` — `createSourceCandidateNotice()`,
  `updateCandidateStatus()`, `saveCandidateVerification()`,
  `markCandidateConverted()`. Every one of these calls
  `supabase.from("source_notice_candidates")...` using the **module-level
  `supabase` client** from `src/lib/supabaseClient.ts`:

  ```ts
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  export const supabase = url && key ? createClient(url, key) : null;
  ```

  This client uses the **anon/publishable key**. Anon key + no session ⇒
  Postgres role `anon`. Anon key + a signed-in user's session (attached
  automatically by the SDK after `signInWithPassword`) ⇒ Postgres role
  `authenticated`. **The write succeeds today only because the admin is
  signed in in their browser tab** — the client library itself is
  identical for anon and authenticated callers; only the session differs.
- `src/lib/supabaseSourceWrites.ts` — same pattern for `alert_sources` and
  `source_checks` (insert/update/select), same shared client, same
  reliance on an authenticated browser session.

### 2.4 RLS assumption (confirmed from `docs/supabase_source_notice_candidates.sql`
  and CLAUDE.md — **not modified, only read**)
  ```sql
  create policy "Authenticated admins can insert source_notice_candidates"
    on public.source_notice_candidates for insert
    with check (auth.role() = 'authenticated');
  ```
  Every admin table (`alert_sources`, `source_checks`,
  `source_notice_candidates`) uses this exact pattern: **any** authenticated
  Supabase session is treated as admin — there is no separate "admin" role,
  no row ownership check, no per-source permission. `alerts` additionally
  allows anon `SELECT` where `status = 'published'`.

  **This is the crux of the architecture question:** `auth.role() =
  'authenticated'` is satisfied by *any* valid Supabase session JWT — it
  does not require the *browser* specifically. A server process that holds
  a valid `authenticated`-role session (or that uses the `service_role` key,
  which bypasses RLS entirely) can write through the exact same policies
  without any RLS change.

### 2.5 Auth model
- `src/lib/auth.ts` — `signIn(email, password)` calls
  `supabase.auth.signInWithPassword()`. There is exactly one class of
  account: "signed in" = admin. No roles table, no `is_admin` column, no
  service accounts today.

### 2.6 Existing precedent for a server-only secret
- `src/app/api/ai/draft-alert/route.ts` already reads
  `process.env.ANTHROPIC_API_KEY` **only inside a route handler**, never in
  a client component, never with a `NEXT_PUBLIC_` prefix. This is the
  existing, working pattern this sprint's recommendation extends — not a
  new concept for this codebase.

### 2.7 Vercel / package configuration
- No `vercel.json` exists in the repo → **no cron configuration of any
  kind exists today** (confirmed by absence of the file).
- `next.config.ts` is the default scaffold — no rewrites, no headers, no
  cron-adjacent config.
- `package.json` scripts: `dev`, `build`, `start`, `lint`, `typecheck`,
  `check`, `test:e2e`, `test:e2e:ui`. No scheduler-related script exists.
- Environment variables actually referenced in `src/` (names only, values
  never inspected or displayed):
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `ANTHROPIC_API_KEY`, `NODE_ENV`. **No `CRON_SECRET`, no
  `SUPABASE_SERVICE_ROLE_KEY`, no scheduler-related variable exists yet.**
  `.env.local` exists locally, is gitignored (`.env*` with `!.env.example`
  exception), and was not read or modified.

### 2.8 Source Health Dashboard / Verifier / Queue (read for architecture fit only)
- `src/lib/sourceHealth.ts` already computes, from existing data
  (`alert_sources`, `source_checks`, candidates), which sources are
  `checked_recently` / `stale` / `never_checked` / `unregistered`, and
  already carries `apiSupported` per source from `SAFE_CHECK_SOURCE_IDS`.
  **A scheduled check slots into this exact model with zero changes**: a
  cron-run check is just another `source_checks` row and another set of
  `source_notice_candidates` rows: the dashboard, badges, and counts would
  reflect it automatically, the same way they already reflect a
  manually-triggered check.
- `src/lib/candidateVerifier.ts` is pure/client-side and already
  documents its own extension point ("a future `aiVerifyCandidate()`...
  requires Adam's explicit approval of API cost"). A scheduled check does
  **not** need the verifier to run server-side in Sprint 142–144 — proposals
  can land as `pending`/unverified and get verified in the browser during
  the existing review flow, same as manually-saved candidates today.
- `/admin/queue` reads whatever is in `source_notice_candidates` — no
  changes needed for it to show scheduler-created rows.

---

## 3. Critical architecture question: how does a scheduled job write safely?

**Restated:** the manual flow's persistence step runs in the *admin's
browser*, authenticated by their session. A scheduled job runs *server-side,
with no user and no browser*. It needs some way to satisfy
`auth.role() = 'authenticated'` (or bypass RLS) without:
- weakening RLS (not allowed without approval — and not needed, see below),
- storing a real admin's password anywhere,
- giving a compromised endpoint god-mode over the whole database if it leaks.

### 3.1 Two credential strategies for the write step (evaluated, neither implemented)

**Strategy 1 — Dedicated machine-admin Supabase Auth account (recommended)**
A second Supabase Auth user is created (e.g.
`automation@alertownik.internal` or similar), with its own password, used
for nothing except this server-side write path. The route handler calls
`supabase.auth.signInWithPassword()` **using the existing anon key** with
this account's credentials, gets a fresh `authenticated`-role session for
that single invocation, performs its inserts, and discards the session
(no persistent session storage needed — a cron invocation is short-lived).
- **Pros:** No RLS change. No service_role anywhere in the codebase. Blast
  radius of a leaked credential is bounded to exactly what the existing
  admin-authenticated policies already allow (i.e., no worse than a leaked
  real-admin password today) — it does not bypass RLS on tables this
  document hasn't even considered. Writes are attributable to a named
  account (useful if `created_by`-style columns are ever added).
  Conceptually the smallest possible change to the trust model: "another
  authenticated party" rather than "a new kind of god-mode party."
- **Cons:** Still a secret (email+password) that must live in an
  environment variable — same handling rigor as any other secret. Requires
  creating one real Supabase Auth user (a `service_role`-equivalent
  *administrative* action in the Supabase dashboard, not a schema change —
  still requires Adam's explicit approval and must happen through the
  Supabase dashboard, never via an automated script per the MCP rules).

**Strategy 2 — `SUPABASE_SERVICE_ROLE_KEY` (documented fallback, not
recommended as primary)**
The route handler uses a second Supabase client constructed with the
service_role key, which bypasses RLS entirely for every table.
- **Pros:** Standard, well-documented Supabase pattern; no need to create
  or manage a separate Auth user; works even if RLS policies change later
  (service_role always wins).
- **Cons:** Maximum possible blast radius — a leaked key grants full
  read/write/delete on every table, not just the two this sprint cares
  about. Directly contradicts the project's stated rule ("never use
  service_role in any frontend code" — while a route handler is
  server-side and technically compliant, the *spirit* of minimizing
  privileged-credential surface area argues against introducing
  service_role at all when Strategy 1 achieves the same goal with a
  narrower credential). Recommended **only** if Adam prefers the more
  conventional Supabase pattern over maintaining a machine Auth account, or
  if a future automated path genuinely needs to bypass RLS for a reason
  Strategy 1 can't cover (none identified yet).

**Recommendation: Strategy 1 (dedicated machine-admin account) as the
primary design for Sprint 143.** Strategy 2 is documented as the fallback
if Adam prefers it. **Neither is implemented in Sprint 141.** Creating the
Supabase Auth user, and adding either credential to Vercel's environment
variables, both require Adam's explicit approval at the Sprint 143 gate
(see §7).

### 3.2 What does NOT change either way
- The **sourceKey allowlist model stays exactly as-is**
  (`SAFE_CHECK_SOURCE_IDS` in `src/lib/sourceCheck.ts`). A scheduled caller
  sends a `sourceKey` (or the endpoint iterates the fixed allowlist
  server-side with no caller input at all — see §4.3); it can never supply
  an arbitrary URL. `/api/sources/fetch-preview` (arbitrary-URL preview)
  is never wired to any scheduled path.
- RLS policies are not touched under either strategy.
- The parser layer (`pageParser.ts`) is reused unchanged.

---

## 4. Endpoint design (for Sprint 142+, not built this sprint)

### 4.1 Route
A new route, e.g. `POST /api/cron/check-sources` (exact path decided in
Sprint 142), separate from `/api/sources/check` (which stays the
admin-button-triggered, no-write endpoint it is today). Keeping them
separate means the admin-button flow is never accidentally affected by
scheduler changes, and the scheduler route can have stricter/different
auth than the admin UI's session-based access.

### 4.2 Authentication
- **Header-based shared secret**: the caller must send
  `Authorization: Bearer <CRON_SECRET>` (Vercel Cron supports this natively
  by injecting the header when the cron config includes it — see Vercel's
  own cron docs). The route compares against `process.env.CRON_SECRET`
  using a constant-time comparison (`crypto.timingSafeEqual`, not `===`,
  to avoid timing side-channels) and returns `401` immediately on
  mismatch, **before** touching any source or database call.
- No session, no cookie, no admin login is involved in this check — it is
  a separate, narrower trust boundary than `/admin/*` pages.
- `CRON_SECRET` is generated once (e.g. `openssl rand -hex 32`), stored
  only in Vercel's environment variables and (if using an external
  scheduler) that scheduler's own secret store — never committed, never
  logged, never returned in any response body.

### 4.3 Never allow arbitrary URLs
The route accepts **no URL from the request body at all** in the
recommended design — safer than even the current `sourceKey` pattern.
Instead of the caller choosing which source to check, the route internally
iterates `SAFE_CHECK_SOURCE_IDS` itself (or a scheduler-specific subset —
see §8 frequency tiers) and calls `getSafeCheckSource()` for each. If a
per-source trigger is ever needed (e.g. an external scheduler with
separate per-source schedules), it may pass a `sourceKey` exactly like the
manual endpoint — resolved server-side the identical way, never a raw URL.

### 4.4 Timeouts
- Reuse the existing 10s per-fetch `AbortController` timeout
  (`/api/sources/check` already does this) — unchanged.
- Add an **overall run budget** (e.g. 25s, safely under Vercel's function
  duration limits for the relevant plan) so that N sources are checked
  sequentially with a hard stop — if the budget is exhausted, remaining
  sources are simply skipped for this run and picked up next run (never a
  hung invocation).

### 4.5 Per-source isolation
Each source's fetch+parse+persist is wrapped in its own `try/catch`. One
source throwing (network error, parser exception, unexpected markup) is
caught, logged as a `source_checks` failure row for *that source only*,
and the loop continues to the next source. The route's overall HTTP
response is `200` with a per-source result array — a single broken source
must never fail the whole run or block sources that would have succeeded.

### 4.6 Deduplication and idempotency
Two layers, both server-side, both reusing existing helpers:
1. **Within a run**: `buildCheckProposals()` already de-dupes by
   normalized title (`seenTitles` set) — unchanged, already sufficient for
   duplicate blocks within one fetch.
2. **Across runs** (new logic needed in Sprint 143, not built now): before
   inserting a candidate, compare its title/excerpt against **existing
   pending/recent candidates for the same `source_id`** using the same
   `findSimilarText()` heuristic the browser flow already uses
   (`src/lib/candidateWarnings.ts`) — if a sufficiently similar candidate
   already exists (e.g. detected within the last N days, same source), skip
   the insert rather than creating a duplicate. This makes repeated runs
   idempotent in effect (not byte-for-byte idempotent, but "does not pile
   up duplicates," which is the property that matters).
3. A hard per-source cap (`MAX_CHECK_PROPOSALS = 6`, already enforced) sets
   an upper bound on candidates a single run can create regardless of
   dedup outcome.

### 4.7 Maximum candidates per source/run
Already bounded by `MAX_CHECK_PROPOSALS = 6` per source per fetch
(existing constant, unchanged). A future run-level cap (e.g. "stop after
20 total candidates created across all sources in one invocation") is a
one-line addition worth adding in Sprint 143 as a second, coarser safety
net independent of per-source dedup.

### 4.8 `source_checks` result recording
The existing `SourceCheckResult` enum (`no_changes`, `found_notice`,
`alert_created`, `needs_followup` — `src/types/alertSource.ts`) does not
currently have failure-specific values. Two honest options, neither
requiring a schema change in Sprint 141:
- **Recommended for Sprint 143/144**: keep using existing values for the
  success path (`no_changes` / `found_notice`, exactly as
  `suggestCheckResult()` already decides), and record fetch/parse/timeout
  failures **only in application logs**, not in `source_checks` — this
  mirrors the existing, already-shipped decision documented in
  `HEALTH_ERROR_FALLBACK_NOTE` (`src/lib/sourceHealth.ts`): *"Błędy
  pobierania... nie są zapisywane w bazie... trwały zapis błędów
  wymagałby zmiany schematu i jest świadomie odłożony."* Scheduled checks
  should honor the same already-stated policy, not quietly reintroduce a
  schema change through the back door.
- **If Adam wants persisted failure visibility** (reasonable once checks
  are unattended and nobody is watching logs in real time): a schema
  change adding a `notes`-embedded failure marker (no new column, reuse
  `notes` with a fixed prefix like `[FETCH_FAILED]`) is a **zero-schema-
  change** way to get *some* persisted failure signal without touching the
  `source_checks_result_check` constraint. A dedicated `failed` enum value
  would require a migration and is explicitly deferred to a future sprint
  requiring approval.

### 4.9 Retry behavior
No in-request retries for a failed fetch (a single 10s timeout is already
generous for a static HTML page from these sources; retrying inside one
invocation risks running long and doesn't help against a genuinely down
site). Instead: **the schedule itself is the retry** — if WKD's site is
down at 08:00, the next scheduled run (whatever tier it's in) will try
again. This keeps the endpoint simple and avoids duplicate proposals from
a retry racing a slow-but-eventually-successful first attempt.

### 4.10 Logging rules
- Log: source key, HTTP status, elapsed time, proposal count, any error
  **type/message** (e.g. `"AbortError"`, `"non-html content-type"`) —
  exactly the granularity `/api/sources/check` already logs today
  (`console.error("[sources/check] fetch error:", err)`).
- Never log: full page HTML/body, the `CRON_SECRET` value, the machine
  account's password, any Supabase key, or full response headers (which
  could carry cookies/tokens from the fetched third-party site).
- Never log full stack traces containing environment variable dumps —
  Next.js/Vercel's default error serialization is already scoped to the
  thrown `Error`, not `process.env`, but this is called out explicitly as
  a rule for whoever writes the Sprint 142 handler.

### 4.11 Safe error responses
The endpoint's HTTP responses never include: the `CRON_SECRET`, any
Supabase key, stack traces, or raw fetched HTML. A malformed/unauthorized
request gets a generic `401`/`400` with a short fixed string — the same
posture `/api/sources/check` already has for its 422 case
(`UNSUPPORTED_SOURCE_ERROR` is a fixed, pre-written string, never an
interpolated raw error).

### 4.12 Kill switch
A single environment variable, e.g. `SCHEDULED_CHECKS_ENABLED` (or simply:
delete the Vercel Cron entry / pause it from the Vercel dashboard — the
simplest possible kill switch, requiring no code). Recommended as
**belt-and-suspenders**: the route handler itself checks a flag (defaulting
to **disabled**) at the very top and returns `503`/no-op if unset or
`"false"` — so even if the cron trigger itself can't be paused quickly for
some reason, flipping one env var and redeploying (or even without a
redeploy, if read at request time) stops all writes immediately. This is
cheaper and faster than editing `vercel.json` under pressure.

### 4.13 Dry-run behavior
The Sprint 142 endpoint (see §7) **is** the dry-run: it performs the full
fetch → parse → proposal pipeline and returns/logs the would-be candidates
**without writing to Supabase at all**. A `?dryRun=true` query param (or a
`DRY_RUN` env flag) should remain available even after Sprint 143 ships
real writes, so the same endpoint can always be re-verified against a live
source without touching the database — cheap insurance for every future
change to the parser or allowlist.

### 4.14 No automated path publishes alerts
Confirmed by design, not by a runtime check that could be bypassed:
- The scheduled endpoint's only possible database writes (Sprint 143+) are
  `insert` into `source_notice_candidates` (status always `pending`) and
  `insert`/`update` into `source_checks`. It has no code path that touches
  the `alerts` table at all.
- `markCandidateConverted(..., status: "published")` is called from
  exactly one place in the entire codebase: the manual publish action in
  `src/app/builder/page.tsx`, gated behind the admin clicking "Opublikuj w
  Supabase." The scheduled endpoint does not import Builder's write path
  and has no reason to.
- This is architecturally enforced (different modules, different tables
  touched) rather than merely policy-enforced — even a bug in the
  scheduled endpoint cannot publish an alert, only create a `pending`
  candidate that still requires the full existing human review chain
  (Verifier → review actions → AI Helper/Builder → manual publish).

---

## 5. Option comparison

| Criterion | **A: Vercel Cron → Route Handler** | **B: Supabase Cron → Edge Function** | **C: External scheduler → protected endpoint** |
|---|---|---|---|
| Security | Header-secret auth on a route Vercel already hosts; same trust model as existing routes | Requires managing a second secrets store (Supabase project secrets) and a second auth mechanism (Edge Function invoke auth) | Same as A — the endpoint is the trust boundary, not the caller; only as secure as the shared secret and the caller's own storage of it |
| Fits current architecture | **Best fit** — reuses existing Next.js route-handler pattern (`/api/ai/draft-alert`, `/api/sources/check`) 1:1 | Requires a second runtime (Deno), duplicating the TypeScript parser in a different language/environment, or having the Edge Function call back into the Vercel app anyway (which collapses to Option A with extra hops) | Fits well — no app-side change vs. A, only the trigger differs |
| RLS implications | None — write strategy (§3) is independent of what triggers the endpoint | None, same independence | None |
| Secrets required | `CRON_SECRET` + one write credential (§3.1) | `CRON_SECRET`-equivalent for the Edge Function + the same write credential + Supabase project-level secret management | `CRON_SECRET` + the same write credential; secret also lives in the external scheduler's config |
| Risk of accidental client exposure | Low — one route handler file, same review surface as existing AI route | Low, but a second location secrets could leak from (Supabase dashboard) | Slightly higher — secret must also be entered into a third-party scheduler's UI/config, one more place it could be mishandled |
| Deployment complexity | **Lowest** — part of the existing `next build`/Vercel deploy, zero new tooling | High — separate Supabase CLI deploy step, separate function logs/dashboard, Deno-specific tooling unfamiliar to this codebase | Low for the app; the scheduler itself is configured outside the repo entirely |
| Observability | Vercel function logs, same place as every other route today | Split across two dashboards (Vercel for the app, Supabase for the function) | Vercel function logs (endpoint side) + whatever the external scheduler provides (often minimal) |
| Retries | Vercel Cron itself does not auto-retry a failed invocation; retry is "next scheduled run" (§4.9) | Similar — Supabase Cron doesn't provide rich retry either | Depends entirely on the chosen scheduler — some (e.g. GitHub Actions) can be configured to retry, most simple cron services cannot |
| Operating limitations | **Frequency capped by Vercel plan** (see §6) | Supabase's own cron/function limits (project-tier dependent, less documented for this stack) | **Not capped by Vercel plan at all** — frequency is whatever the external scheduler allows, often more generous free tiers |
| MVP cost | Included in existing Vercel plan (Hobby or current paid tier) — zero new spend for low frequency | Possible additional Supabase usage-tier cost depending on function invocations | Usually free (GitHub Actions scheduled workflows, cron-job.org free tier) — zero new spend |
| Frequency limitations | Tied to Vercel plan (§6) | Tied to Supabase plan, less predictable for this project's tier | Effectively caller-controlled — best option specifically to escape Vercel Hobby's coarse cron granularity |
| Vendor lock-in | Ties scheduling to Vercel specifically | Ties scheduling to Supabase specifically, on top of already depending on Supabase for data | **Lowest** — the endpoint is vendor-neutral; swapping schedulers later is a config change outside the repo |
| Ease of later scaling | Straightforward — add more cron entries or increase frequency as plan allows | Would require learning Edge Functions properly if scaled up | Straightforward — just point a more capable scheduler at the same endpoint |

---

## 6. Vercel plan sensitivity (do not assume a tier)

This document does not assume Hobby vs. a paid Vercel plan, per instruction.
Two scenarios, both compatible with the **same endpoint code**:

- **If the project is on Vercel Hobby**: Vercel's Hobby tier has
  historically restricted Cron Jobs to a small number of jobs and coarse
  scheduling (commonly: at most once per day per job, and a low total job
  count) — verify the exact current limits on Vercel's own pricing/docs
  page before committing to a schedule, since these limits change over
  time and this document intentionally does not hard-code a number that
  could go stale. Under this constraint, the **recommended fallback is
  Option C** (an external scheduler such as a GitHub Actions scheduled
  workflow, or a free-tier third-party cron service) calling the exact same
  protected `/api/cron/check-sources` endpoint with the same `CRON_SECRET`
  header — this achieves higher-frequency checks (e.g. the "high-freshness"
  tier in §8) without upgrading the Vercel plan and without any code
  difference from the Option A design.
- **If the project is on a Vercel plan allowing more frequent cron
  execution**: Option A alone is sufficient for every frequency tier in
  §8 — no external scheduler needed, one fewer moving part, one fewer
  external secret location.

**Recommendation stands regardless of tier**: build the endpoint once
(Option A's Route Handler), and treat "what calls it" (Vercel Cron vs. an
external scheduler) as a swappable, low-stakes decision made at Sprint 144
based on whichever plan is active then — not a decision that needs to be
made or locked in during Sprint 141.

---

## 7. Required approval gate before Sprint 143

Per the safety rules governing this sprint, **the following must not be
added without Adam's explicit, specific approval, given at the start of
Sprint 143**:
1. Any new environment secret (`CRON_SECRET`, a machine-admin account's
   credentials, or `SUPABASE_SERVICE_ROLE_KEY` if Strategy 2 is chosen).
2. Creating the machine-admin Supabase Auth account itself (a Supabase
   dashboard action, not a schema change, but still a privileged-identity
   change requiring sign-off).
3. Any database write path added to a server route (even to `pending`-
   status tables under existing RLS).
4. Any change to Vercel environment variables or Vercel project settings.
5. Activating Vercel Cron, Supabase Cron, or any external scheduler against
   a production endpoint.

Sprint 142 (§8 roadmap) is scoped specifically to require **none** of the
above — it is safe to build without this approval gate.

---

## 8. Schedule design (proposed tiers, not activated)

Not configured anywhere in this sprint (no `vercel.json`, no dashboard
entry). Proposed for future activation once approved:

| Tier | Example sources | Rationale | Illustrative frequency |
|---|---|---|---|
| High-freshness (transport) | WKD — aktualności | Service disruptions are time-sensitive; commuters need same-day awareness | A few times per day on a capable plan; once/day (or via Option C) on Hobby |
| Medium-freshness (municipal/infrastructure) | Gmina Michałowice — komunikaty | Municipal notices change less often than live transport status | Once daily |
| Low-freshness (e.g. future PDF/waste-schedule sources, once in-scope) | Not yet in the safe-check allowlist | Rarely updated; checking more than weekly would be pure overhead | Weekly or "when needed," matching the existing manual-checklist `frequency` field already in `officialSourceChecklist.ts` |

These tiers intentionally mirror the `frequency`/`frequencyNote` fields
already present on `OfficialSourceCheck` entries (`daily` / `weekly` /
`when_needed`) — no new taxonomy is being invented, just a future automated
trigger for a classification that already exists and is already shown to
the admin on the checklist cards today.

---

## 9. Implementation roadmap (Sprints 142–145)

### Sprint 142 — Protected dry-run endpoint
- New route (e.g. `/api/cron/check-sources`) authenticated by `CRON_SECRET`.
- Iterates the existing `SAFE_CHECK_SOURCE_IDS` allowlist server-side.
- Reuses existing fetch/timeout/parse/`buildCheckProposals` logic
  unchanged.
- **Writes nothing to Supabase.** Logs/returns would-be proposals only.
- No cron trigger configured — invoked manually (e.g. via `curl` with the
  header) for verification during the sprint, exactly like testing any
  other route handler.
- New tests: fixture-based, asserting the endpoint's auth gate (401
  without/with wrong secret), per-source isolation (one failing mocked
  source doesn't block others), and that it makes zero Supabase client
  calls (e.g. by asserting the module never imports
  `supabaseCandidateWrites`/`supabaseSourceWrites`).
- Requires **no new secret in Vercel** yet — `CRON_SECRET` can be exercised
  with a local `.env.local` value during development and is not required
  to exist in production for this sprint's deliverable (the route simply
  401s in any environment where the secret isn't set, which is safe-by-
  default).

### Sprint 143 — Controlled server-side persistence (**requires explicit
approval before starting**, per §7)
- Add the chosen write credential (Strategy 1 or 2 from §3.1) — **only
  after Adam approves which strategy and confirms the secret is created**.
- Wire the dry-run endpoint's proposals into real
  `source_notice_candidates` inserts (`status: "pending"`) and
  `source_checks` inserts, using the existing dedup heuristic (§4.6) newly
  applied cross-run.
- Still **no cron trigger activated** — this sprint proves the write path
  works when manually invoked, same posture as Sprint 142.
- Still no autopublish, no schema change (existing tables/columns only).

### Sprint 144 — Actual scheduled execution, tiny allowlist
- Activate exactly one schedule entry (Option A or C per §6, decided based
  on the Vercel plan active at the time) for the single lowest-risk source
  (likely `michalowice-komunikaty`, `risk: low` already on the checklist).
- Add monitoring/failure visibility: at minimum, confirm Vercel's own
  function-invocation logs are sufficient; consider a lightweight
  `source_checks`-based "last N scheduled runs" view reusing
  `SourceHealthDashboard`'s existing data (no schema change needed — it
  already reads `source_checks`).
- Still no autopublish. Kill switch (§4.12) must be verified working
  *before* this sprint is considered done — i.e., prove you can turn it
  off in under a minute.

### Sprint 145 — Hardening
- Idempotency/dedup tuned against real accumulated data from Sprint 144's
  run history (not just the heuristic — actual false-positive/negative
  rate observed).
- Timeouts and retries reviewed against real-world source behavior
  (does WKD ever legitimately take >10s? adjust if so).
- Per-source isolation stress-tested (temporarily point at a deliberately
  broken/unreachable URL in a non-prod check to confirm the run continues).
- Kill switch and dry-run mode both re-verified.
- Written **operational runbook**: what to check when a scheduled run
  fails, how to disable it, how to read the logs, who to notify. Likely an
  Obsidian page, cross-linked from this document and from Source Health
  Dashboard's existing honesty-copy constants.
- Still no autopublish — that remains a distinct, much later, narrowly-
  scoped decision (A7 in the Automation Implementation Plan) requiring its
  own dedicated approval gate.

**Sequencing note:** this split (142 dry-run → 143 writes-behind-approval
→ 144 tiny-schedule → 145 hardening) is deliberately more conservative than
combining 142+143, because Sprint 141's repository audit found the
existing codebase already treats "propose" and "persist" as cleanly
separable steps (the manual API already only proposes; the browser already
does all persistence) — preserving that separation for the scheduled path
means each sprint's approval gate maps to exactly one new capability
(fetch → write → schedule → harden), never bundling a secret-requiring
change with a schedule-activating change in the same sprint.

---

## 10. Explicit confirmations

- **No cron is active.** No `vercel.json`, no Vercel dashboard cron entry,
  no Supabase scheduled function, no external scheduler configuration was
  created or modified.
- **No privileged Supabase client was added.** `src/lib/supabaseClient.ts`
  is unchanged; it still constructs exactly one client, with the anon key,
  as before.
- **No `service_role` key or other server secret was added.**
  `SUPABASE_SERVICE_ROLE_KEY` / `CRON_SECRET` do not exist in this repo or
  in any file this sprint touched.
- **No schema, RLS, or migration change was made or proposed for
  execution** — this document only reads and cites existing SQL files.
- **No autopublish path exists or is proposed** — see §4.14.
- **No external AI was added** — the existing `ANTHROPIC_API_KEY` /
  `@anthropic-ai/sdk` usage is unchanged and unrelated to this document.
