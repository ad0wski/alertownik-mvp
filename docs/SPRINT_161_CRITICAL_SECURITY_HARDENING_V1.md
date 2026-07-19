# Sprint 161 — Critical Security Hardening v1

Closes the CRITICAL and HIGH findings from Sprint 160A's read-only audit
(`docs/` — see the audit artifact referenced in that sprint's report) before
any further UI, automation, or app-store work. No cosmetic changes, no dark
mode, no scheduled writes turned on, no push notifications — scope is
security only, per the sprint brief.

> **Sprint 161B addendum (same branch):** Sprint 161's `requireAdminSession`
> only checked *authentication* (a genuine Supabase Auth session) — not
> *authorization* (that account being an administrator). Adam's manual
> read-only RLS verification found this project has more than one Supabase
> Auth account, and `alert_sources` still only checked
> `auth.role() = 'authenticated'` at the database level too, unlike
> `alerts`/`source_checks`/`source_notice_candidates`, which already gate
> on `admin_profiles` membership. Sprint 161B closes both: `serverAuth.ts`
> now additionally checks `admin_profiles` (403 for a valid-but-non-admin
> session), and a proposed (unexecuted) SQL package brings `alert_sources`
> in line with the other three tables. See the "Sprint 161B" sections
> inline below and `docs/sql/SPRINT_161B_ALERT_SOURCES_RLS_HARDENING.sql`.

---

## 1. Findings inherited from Sprint 160A

| # | Severity | Finding | Location |
|---|---|---|---|
| 1 | CRITICAL | SSRF-capable endpoint | `src/app/api/sources/fetch-preview/route.ts` |
| 2 | CRITICAL | No server-side authentication | `fetch-preview`, `sources/check`, `ai/draft-alert` |
| 3 | HIGH | No credible rate limiting | all three routes |
| 4 | HIGH | No real CSP / standard security headers | `next.config.ts` |
| 5 | MEDIUM | Admin routes are client-gated; RLS is the real (unverified-from-repo) boundary | `/admin/*`, `/builder`, `/ai-helper` |

Also reconfirmed by Sprint 160A and unaffected by this sprint: no autopublish
path anywhere, `CRON_SECRET` is fail-closed, no `service_role` key in code,
no `dangerouslySetInnerHTML`, the service worker never caches `/admin` or
`/api`, 429/429 e2e passing, 13/13 PWA passing, `npm run check` passing.

## 2. Threat model

The three routes this sprint hardens are reachable by anyone on the
internet — Next.js Route Handlers have no implicit access control, and
until this sprint the only protection was "the button that calls this
lives on a page wrapped in `AuthGate`," which stops nothing at the HTTP
layer. Two distinct attackers matter here:

- **An anonymous internet user calling the API directly**, skipping the
  admin UI entirely. Before this sprint they could: make the server fetch
  an arbitrary URL of their choosing (`fetch-preview`), including internal
  network addresses and the cloud metadata endpoint; and burn the metered
  `ANTHROPIC_API_KEY` credential at unlimited volume (`draft-alert`).
- **A logged-in admin's browser being tricked** (e.g. a malicious link) into
  submitting a request — mitigated by requiring a real bearer token per
  request rather than relying on cookie-based ambient authority, which
  also sidesteps classic CSRF for these specific routes since there's no
  cookie for a third-party page to ride on.

## 3. Server-side authentication

**The architecture problem, stated plainly:** `src/lib/supabaseClient.ts`
creates the browser Supabase client with default settings, which persists
the session in `localStorage`, not a cookie. A Next.js Route Handler only
sees the HTTP request — headers, body, URL — never the browser's
`localStorage`. That means there was nothing a server-side check could
read, at all, until the client started sending something explicit.

**The fix:** `src/lib/apiClientAuth.ts` exports `authFetch()`, a drop-in
replacement for `fetch()` that reads the current Supabase session's
`access_token` client-side and attaches it as `Authorization: Bearer
<token>`. `src/lib/serverAuth.ts` exports `requireAdminSession<T>(req)`,
which every one of the three routes now calls as its first line. It:

1. Fails closed (401) if `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   aren't configured — an unconfigured project is never treated as "no
   auth required."
2. Requires a well-formed `Bearer <token>` header — no header, a malformed
   header, or an empty token all fail closed without ever constructing a
   Supabase client or making a network call.
3. Calls `supabase.auth.getUser(token)` against Supabase's real Auth
   server — this validates the JWT server-side rather than trusting
   anything the client asserts about itself. No `isAdmin` field from the
   client body is ever read; no page-location assumption is made.
4. Returns a single generic 401 (`{ ok: false, error: "Wymagane
   logowanie." }`) for every failure mode — missing header, expired token,
   Supabase unreachable — so a caller can't fingerprint which one occurred.
5. Uses the anon/publishable key only, via a fresh, non-persisted client
   (`persistSession: false, autoRefreshToken: false`) — never
   `service_role`, matching the existing `scheduledWriter.ts` pattern for
   ephemeral server-side Supabase clients.
6. Never logs the token, the session, or any header value — only ever
   `console.error`s a fixed diagnostic string on the unreachable-Supabase
   path, no token content.

All four existing client call sites were switched from `fetch(...)` to
`authFetch(...)`: `src/app/ai-helper/page.tsx`,
`src/app/admin/sources/page.tsx` (two call sites),
`src/components/SourceApiCheckPanel.tsx`, and
`src/app/admin/new-alert/page.tsx`. A logged-in admin's existing behavior
is unchanged — `authFetch` only adds a header, it doesn't change the
request body, method, or response handling.

### 3a. Sprint 161B — authentication is not authorization

The paragraph above originally read "any authenticated Supabase Auth user
counts as admin" — Sprint 161B found that claim was true of the *app's*
existing model (CLAUDE.md) but not actually true of the *database*, and not
a safe assumption for `requireAdminSession` to keep making. Adam's manual
read-only RLS verification (`docs/SUPABASE_RLS_SECURITY_VERIFICATION_V1.md`)
confirmed this project has **more than one Supabase Auth account** — so "a
valid session exists" (authentication) and "this account is an
administrator" (authorization) are genuinely different claims here, not a
distinction without a difference.

The same verification also confirmed `alerts`, `source_checks`, and
`source_notice_candidates` already gate every admin write on membership in
a `public.admin_profiles` table (`EXISTS (select 1 from admin_profiles
where user_id = auth.uid())`) — this is not new infrastructure Sprint 161B
invents, it's the project's own existing, already-live administrator
membership mechanism (see `docs/SCHEDULED_WRITER_RLS_MIGRATION_PLAN_V1.md`
for its original introduction). `requireAdminSession<T>` simply started
using it too:

1. `getUser(token)` still runs first, exactly as before — confirms the
   token is genuine and currently valid. A missing, malformed, empty, or
   invalid token still returns **401**, unchanged.
2. If the token is valid, a second query now runs — `SELECT user_id FROM
   admin_profiles WHERE user_id = <the token's user id>` — using the same
   anon key, but with the caller's own bearer token set as that request's
   `Authorization` header, so the query runs *as that user* under RLS
   (via `admin_profiles`' own existing self-row SELECT policy), not as an
   anonymous or elevated request. `service_role` is never used anywhere in
   this check.
3. No matching row → **403** (`{ ok: false, error: "Brak uprawnień
   administratora." }`) — a deliberately different status than 401, since
   the token itself was genuinely valid; it's authorization that failed,
   not authentication. The response never explains *why* beyond that
   (doesn't confirm/deny whether the account exists, is signed in
   elsewhere, etc.).
4. The admin_profiles query result, and the fact that a lookup even
   happened for a given user id, is never logged.

A currently-working admin's request is unaffected end to end — the same
`admin_profiles` row that already lets them use `/admin`, `/builder`, and
the candidate queue today is the row this check now also finds.

## 4. SSRF defense

`src/lib/ssrfGuard.ts` is the new module; `fetch-preview/route.ts` is the
only route that uses it (the other two either fetch a server-owned
allowlisted URL or call Anthropic directly, not an admin-supplied URL).

`assertPublicHttpUrl(url)` checks, in order: parses as a URL at all;
protocol is `http:`/`https:` only; no embedded `username:password@`
credentials; hostname isn't `localhost` or a `.local`/`.internal`/
`.localhost` suffix; if the hostname is already a literal IP, classify it
directly; otherwise resolve **every** address `dns.lookup(hostname, { all:
true })` returns (not just the first) and reject if **any** of them is
private.

`isPublicIp()` rejects, for IPv4: `0.0.0.0/8`, `10.0.0.0/8`, `127.0.0.0/8`,
`169.254.0.0/16` (which covers the `169.254.169.254` cloud metadata
address), `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10` (carrier-grade
NAT), the three documentation/test ranges (`192.0.2.0/24`,
`198.51.100.0/24`, `203.0.113.0/24`), the benchmarking range
(`198.18.0.0/15`), and everything `≥224.0.0.0` (multicast/reserved/
broadcast). For IPv6: `::1`, `::`, `fe80::/10`, `fc00::/7`, `ff00::/8`, and
the IPv4-mapped form (`::ffff:a.b.c.d`) is unwrapped and checked against
the same IPv4 rules — so `::ffff:169.254.169.254` is blocked exactly like
its IPv4 form.

`guardedFetch()` wraps the actual request: validates the URL, fetches with
`redirect: "manual"`, and if the response is a 3xx, resolves the `Location`
header and **re-validates the resolved target through
`assertPublicHttpUrl` again** before following it — capped at 3 hops by
default, `too_many_redirects` beyond that. Every hop uses a fixed
`User-Agent`/`Accept` pair only; no client-supplied header, cookie, or
`Authorization` value is ever forwarded to the target host. `readLimitedText()`
streams the response body with a 2 MB cap, aborting the read (not just
truncating after full buffering) once exceeded.

The route itself never echoes back *why* a URL was rejected (`"Ten adres
nie może zostać sprawdzony."` for every SSRF-guard rejection reason) —
distinguishing "private IP" from "DNS failed" from "too many redirects" in
the response would hand an attacker a network-mapping oracle for free.

**Residual limitation, documented rather than silently accepted:** this is
a check-then-fetch design. `assertPublicHttpUrl` resolves DNS once via
Node's `dns.lookup`, and the subsequent `fetch()` call resolves the same
hostname again internally when it opens the TCP connection. If a DNS
answer changes between those two lookups — classic **DNS rebinding** — the
second resolution could return a different (private) address than the one
that was validated. Closing this completely requires pinning the exact
validated IP for the actual socket connection, which Node's built-in
`fetch` (undici under the hood) doesn't expose a supported option for
without either adding `undici` as an explicit dependency to get its
`Agent`/custom-`lookup`-dispatcher API, or writing a lower-level TCP
client by hand — both larger changes than this hardening sprint's scope,
and neither was added without asking first (`CLAUDE.md` rule: no new
dependency without explicit confirmation). Given the target sources here
are official municipal/institutional websites an admin explicitly typed in
(not attacker-supplied at the moment of the request — the admin session
requirement in §3 already narrows who can trigger this at all), this is a
reasonable residual risk to carry forward with the mitigation already in
place (DNS pre-check + per-redirect re-validation) rather than a live gap.
**Flagged for Adam:** closing it fully is a candidate follow-up if
`fetch-preview` is ever opened to a less-trusted caller.

## 5. Rate limiting decision — MANUAL INFRASTRUCTURE GATE ⚠️

**No in-memory rate limiter was implemented**, per the sprint brief's own
explicit instruction not to fake one: an in-memory counter only works
within a single serverless function instance, resets on cold start, and
gives zero real protection on Vercel, where concurrent/repeated requests
routinely land on different instances. Shipping that as "rate limiting"
would be worse than shipping nothing, because it would read as a solved
problem in this document when it isn't one.

**What IS in place independent of this decision** (the brief's own
required minimum, implemented regardless of the rate-limiter question):

- Authentication before any costly operation (§3) — this alone removes
  anonymous-caller abuse entirely; only an authenticated admin session can
  reach the fetch or the AI call at all now.
- Request body size limits: `sourceText` capped at 20,000 characters,
  `sourceName` at 200, `sourceUrl` at 2,000 (`ai/draft-alert/route.ts`);
  the admin-supplied URL is capped at 2,000 characters
  (`fetch-preview/route.ts`).
- A hard 2 MB response-size cap on fetched pages (`readLimitedText`).
- A 10-second fetch timeout, unchanged from before this sprint.
- Bounded redirect following (max 3 hops) instead of unbounded.
- Safe `413`/`422`/`401` responses with generic bodies — no internal detail
  leaked in any abuse-adjacent error path.

**What a credible rate limiter would require:** Vercel's Firewall product,
or an external store (Upstash Redis / Vercel KV) to hold counters that
survive across serverless instances — either a new paid service, a new
environment variable set, or both. None of that was set up: no account was
created, no config was touched, per the sprint's explicit "don't create
accounts or configuration" boundary.

**Recommendation for Adam:** the lowest-friction credible option is
**Vercel Firewall's built-in rate limiting rules** (available on the
current plan tier — confirm in the Vercel dashboard under
Project → Firewall), scoped to `/api/sources/fetch-preview`,
`/api/sources/check`, and `/api/ai/draft-alert`, since it requires no new
dependency and no application code change. The alternative — Upstash
Redis via `@upstash/ratelimit` — is more portable but adds a new
dependency and a new external account. Given auth is now required for all
three routes, the residual abuse surface is "a logged-in admin's session
being reused very fast," a much smaller risk than the pre-Sprint-161
"anyone on the internet" surface — this makes the rate-limiter decision
lower urgency than it was in the Sprint 160A audit, though still worth
closing before wider admin access (see `docs/LIMITATIONS.md`).

## 6. Request-size and abuse limits

Covered inline in §5 — summarized here for the checklist format the brief
asked for: body/text/URL length caps ✅, response byte cap ✅, timeout ✅,
bounded redirects ✅, safe 413/422/401 responses with no detail leakage ✅,
true concurrent-request throttling ⚠️ (manual gate, §5).

## 7. CSP and headers

`next.config.ts` replaces the previous `Content-Security-Policy: worker-src
'self'`-only header with a full policy:

```
default-src 'self';
script-src 'self' 'unsafe-inline'[ 'unsafe-eval' in dev only];
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self';
connect-src 'self' <the configured Supabase origin>;
worker-src 'self';
manifest-src 'self';
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests; [production only]
```

Plus the standard header set that was entirely absent before:
`X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin`, `X-Frame-Options: DENY` (fallback for
browsers that don't yet honor `frame-ancestors`), a minimal
`Permissions-Policy` (camera/microphone/geolocation/payment/usb all
denied), and `Strict-Transport-Security` (production only — HSTS on
`http://localhost` during `next dev` would be actively harmful).

**Why `'unsafe-inline'` on `script-src`/`style-src` instead of a
nonce-based strict policy:** this repo's own Next.js docs mirror
(`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`)
lays out both options. The nonce approach requires **every page to opt
into dynamic rendering** — Next.js can only inject a nonce during
server-side rendering of a request, so static generation, ISR, and CDN
caching would all have to be given up site-wide (the production build
currently produces 15 statically-generated routes out of 23 total). That's
a materially larger architectural change than "harden the three insecure
API routes," and this sprint's brief was explicit about not doing
cosmetic/architectural rebuilds. The `next.config.js`-based
"without nonces" approach is Next's own documented alternative for exactly
this situation. `'unsafe-eval'` is added only when
`NODE_ENV === "development"` (React's dev-mode error reconstruction needs
it — Next's docs flag the same exception) and is never present in the
value actually served in production.

**What was verified, not just written:** `tests/e2e/securityHeaders.spec.ts`
checks the header set is actually served (not just present in
`next.config.ts` source) on both a public page and an admin page, that no
bare `*` wildcard sneaks into the CSP, and — critically — that a real
`next dev` page load of both `/` and `/builder` produces **zero**
CSP-violation console errors, so this is not "a policy that passes a text
assertion but breaks the app" (the sprint brief's explicit warning).
`npm run test:pwa` (production build) independently re-confirms the
service worker, manifest, and offline flow still work with the new headers
in place — see §12.

## 8. Security headers

Covered together with CSP in §7 above (they're set from the same
`next.config.ts` array).

## 9. Admin route protection

**Investigated, not implemented — this is the correct call per the sprint
brief's own fallback clause, not a shortcut.** A real server-side/
middleware guard needs something a middleware function can read on every
request before the page renders — a cookie, typically. Supabase's browser
client here persists its session in `localStorage` (confirmed in §3),
which `middleware.ts` cannot see at all; there is no cookie carrying the
session today. Adding one means migrating to `@supabase/ssr`'s
cookie-based session helpers, which changes how login/logout/session
refresh work across the entire app — a real architecture change, not a
guard you can bolt on safely in a hardening sprint that's explicitly
scoped to not rebuild things.

Building a "guard" that can't actually read the session would either (a)
block everyone including logged-in admins, or (b) do nothing and just look
like protection — the sprint brief calls this out by name
("nie implementuj pozornej ochrony") and this sprint doesn't do it.

**What stays as the real boundary:** the existing client-side `AuthGate`
component (unchanged) plus Supabase RLS, which is the layer that actually
decides whether an unauthenticated request can read or write `alerts`,
`alert_sources`, `source_checks`, or `source_notice_candidates` — see §10
for what's confirmed and unconfirmed about that boundary today. The three
API routes hardened in §3 no longer depend on RLS alone, since they now
require a verified session before doing anything.

**Follow-up plan (not started, separate sprint):** migrate
`src/lib/supabaseClient.ts` and `src/lib/auth.ts` to `@supabase/ssr`,
which stores the session in an HTTP-only cookie and ships a documented
`middleware.ts` pattern for gating routes server-side. This is a genuine
scope of work (touches every place `supabase.auth.*` is called, both
client and any future server usage) and needs its own sprint, not a
tacked-on change here.

## 10. RLS evidence status

**Update (Sprint 161B) — this section originally said the `alerts` write
policy was unconfirmed from the repo and asked Adam to check it manually.
He did.** See `docs/SUPABASE_RLS_SECURITY_VERIFICATION_V1.md` for the
original instructions. The result:

- **`alerts`** — confirmed correct: anon `SELECT` is restricted to
  `status = 'published'`, every admin operation requires `EXISTS (...
  admin_profiles ...)`, and RLS is enabled. No action needed.
- **`source_checks`** and **`source_notice_candidates`** — confirmed
  correct: admins are checked via `admin_profiles`, the scheduled writer
  is checked via the separate `automation_identities` table, and the
  writer's write constraints are exactly as narrow as
  `docs/sql/PROPOSED_SCHEDULED_WRITER_RLS_MIGRATION_V1.sql` designed them.
- **`alert_sources`** — **problem found.** Its four admin policies still
  check only `auth.role() = 'authenticated'` (the original Sprint 42
  design, `docs/supabase_sources_schema.sql`) — they were never migrated
  to the `admin_profiles` mechanism the other three tables now use. Since
  this project has more than one Supabase Auth account, this means any
  signed-in account — not only the actual administrator — can currently
  read and write the entire source registry directly against Supabase,
  bypassing the app (and now also bypassing §3's `requireAdminSession`
  fix, since RLS is the database-level boundary the API layer sits in
  front of, not behind).

### 10a. alert_sources fix — CLOSED, LIVE VERIFIED ON PRODUCTION (2026-07-19)

**Status update (Sprint 164A):** this gap is closed. Adam ran
`docs/sql/VERIFY_SPRINT_161B_RLS_READ_ONLY.sql` (read-only) directly
against Production Supabase and confirmed the fix from
`docs/sql/SPRINT_161B_ALERT_SOURCES_RLS_HARDENING.sql` is live:

- RLS is enabled on `alert_sources`, `alerts`, `automation_identities`,
  `source_checks`, and `source_notice_candidates`.
- All four admin operations on `alert_sources` (`SELECT`, `INSERT`,
  `UPDATE`, `DELETE`) now require
  `EXISTS (SELECT 1 FROM admin_profiles WHERE admin_profiles.user_id = auth.uid())`
  — the same mechanism `alerts`/`source_checks`/`source_notice_candidates`
  already used, closing the gap this section originally flagged (any
  signed-in account, not just the administrator, could read/write the
  source registry directly against Supabase).
- The separate public anon-read policy (`Public can read alert sources`)
  remains in place and unchanged, as designed.
- `alerts` anon `SELECT` remains restricted to `status = 'published'`.
- Exactly one `admin_profiles` row exists (no unintended additional
  administrators).

No identifier, email address, or CSV export content from that
verification is recorded in this repository — only the policy-shape
result above. Claude did not run any SQL as part of this verification;
Adam ran the read-only verify file himself in the Supabase SQL editor and
reported the result for this doc update.

**Original proposal, for reference (superseded by the above):**
`docs/sql/SPRINT_161B_ALERT_SOURCES_RLS_HARDENING.sql` replaced the four
`auth.role() = 'authenticated'` policies with the `admin_profiles` EXISTS
check. It did not touch `alerts`/`source_checks`/`source_notice_candidates`,
did not touch `admin_profiles` itself, and did not touch `alert_sources`'s
separate anon-read policy (`docs/sql/PROPOSED_ALERT_SOURCES_PUBLIC_READ_CLEANUP_V1.sql`
remains its own, still-separately-proposed cleanup, unrelated to this gap).

**Scheduled writer gets nothing on `alert_sources`, confirmed from the
application code itself, not assumed:** `src/lib/scheduledWriter.ts:332-346`
states outright that the scheduled writer has "ZERO access to
alert_sources ... not even SELECT" by deliberate Sprint 146 design — it
resolves a source's registry id from a human-maintained environment
variable instead of querying the table. The hardening SQL grants
`automation_identities` members nothing on `alert_sources` at all,
matching that existing design exactly — see §6 below for the full
required-rights breakdown by actor.

## 11. Anthropic key abuse review

**No value from `ANTHROPIC_API_KEY` was displayed, logged, or read into
this document at any point.**

Before this sprint: `POST /api/ai/draft-alert` had zero authentication —
any request from anywhere could trigger a real, metered Anthropic API call
(when the key is configured), with no length limit on the input text sent
to the model, and error responses that (correctly, even before this
sprint) never leaked the key itself but didn't prevent the calls from
happening in the first place.

After this sprint: the route requires a verified admin session (§3) before
it does anything, and `sourceText`/`sourceName`/`sourceUrl` are all
length-capped (§5/§6) so even a legitimate admin session can't
accidentally (or maliciously) send an enormous prompt.

### Checklist for Adam

1. **Where to check usage:** the Anthropic Console (console.anthropic.com)
   → your organization → Usage/Billing shows request volume and spend per
   API key. Check this now as a baseline, then again a week after this
   sprint deploys, to see the abuse-surface reduction directly.
2. **What would look suspicious:** a spike in request volume with no
   corresponding admin activity (nobody using `/ai-helper`,
   `/admin/new-alert`, or the inline "Generuj draft AI" button on
   `/admin/sources` around that time); many requests in rapid succession
   from a similar time window; unusually large `input_tokens` counts per
   request compared to typical single-notice drafts.
3. **When to rotate the key:** rotate now if you have any reason to
   believe it was already exposed or abused before this sprint (check the
   Console's historical usage graph for any unexplained spike). Otherwise,
   rotation isn't urgently required by this sprint's findings alone, since
   the exposure window is now closed by the auth requirement — but
   rotating on your normal secret-hygiene schedule is still good practice.
4. **Rotate only after confirming this sprint's routes are actually
   deployed and working** — rotating the key without the auth fix live
   doesn't reduce risk, it just changes which unauthenticated caller can
   burn the new key.
5. **Never paste the key value into a chat, a commit, a log line, or this
   document** — if you ever need to share it for debugging, share that a
   problem exists and where, not the value.

## 12. Tests

New Sprint 161 test files (all under `tests/e2e/`, run by the existing
`npm run test:e2e` — no new test config needed):

- `serverAuth.spec.ts` — `requireAdminSession` unit tests: no Supabase
  configured → 401 fail-closed; missing/malformed/empty `Authorization` →
  401, Supabase never called; Auth server rejects the token → 401; Auth
  server unreachable → 401 (not a 500 or an unhandled rejection); a valid
  token → `ok: true` with the user id; the 401 response body never leaks
  "token"/"jwt"/"cookie"/the Supabase URL/"expired".
- `ssrfGuard.spec.ts` — `isPublicIp` across the full IPv4/IPv6 private
  range list from the brief (loopback, private, link-local, multicast,
  unspecified, CGNAT, documentation/test ranges, the metadata address,
  IPv4-mapped IPv6) plus genuinely public addresses; `assertPublicHttpUrl`
  for protocol/credentials/blocked-hostname/DNS-resolution cases including
  a hostname that resolves to a mix of public and private addresses (must
  reject); `guardedFetch` for a public→public redirect chain (followed and
  re-validated), a public→private redirect (rejected, private host never
  actually fetched), unbounded-redirect protection, and confirmation that
  no client-controlled header (cookie, Authorization) is ever forwarded.
- `adminApiRouteAuth.spec.ts` — calls the three route handlers directly
  with no `Authorization` header and asserts 401 **and** that the
  underlying `fetch`/AI call was never reached (the mock throws if called,
  so this proves ordering, not just that auth exists somewhere).
- `securityHeaders.spec.ts` — the full header set is actually served (not
  just present in source) on a public and an admin route; no bare `*` in
  the CSP; zero CSP-violation console errors on a real page load of `/`
  and `/builder`.
- `builderLocalToolsAntiDrift.spec.ts` — the legacy local-only Builder
  buttons (§13) never call a Supabase write helper; the relabeled copy
  correctly states this isn't a real publication; the count of code
  locations that ever set `status: "published"` is pinned at 2 (the same
  invariant Sprint 160A found), so a future change that adds a new publish
  path fails this test loudly.

**Sprint 161B additions:**

- `serverAuth.spec.ts` — extended with: a genuinely valid token but no
  `admin_profiles` row → **403**, not 401, and the `admin_profiles` query
  is confirmed to actually run (a test fails loudly if it doesn't); the
  `admin_profiles` query is confirmed to carry the caller's own bearer
  token, not an anonymous request; a valid token *with* a matching
  `admin_profiles` row → `ok: true` (the PASS case).
- `adminApiRouteAuth.spec.ts` — extended with a route-level version of the
  same 403 case on `fetch-preview`, so the check is proven wired into the
  actual route, not just the shared helper in isolation.
- `alertSourcesRlsSqlAntiDrift.spec.ts` (new) — static, file-content-only
  checks on the two new SQL files (no database involved): the hardening
  migration references `admin_profiles`, never reintroduces
  `auth.role() = 'authenticated'` as the CRUD barrier, never mentions
  `automation_identities` (the scheduled writer gets nothing), never
  touches `alerts`/`source_checks`/`source_notice_candidates`, never
  disables RLS, never uses `service_role`, drops exactly the four original
  policy names and creates exactly four replacements, and is wrapped in a
  single transaction; the verification file contains only `SELECT`
  statements and never queries `auth.users`.

### Results

| Suite | Result |
|---|---|
| `npm run check` (typecheck + lint + build) | see final report — run after all changes landed |
| `npm run test:e2e` (incl. 5 new Sprint 161 files) | see final report |
| `npm run build` | included in `npm run check` |
| `npm run test:pwa` | see final report |

(Exact pass/fail/skip/flaky counts are in the Sprint 161 final report
message, not duplicated here to avoid the two ever drifting out of sync.)

## 13. Legacy Builder feature

`src/app/builder/page.tsx`'s "Narzędzia" tab has two buttons
(`saveDraft`/`publishAlert`) that only ever read/write
`localStorage` (`alertownik-drafts`/`alertownik-published-alerts`) —
confirmed via `builderLocalToolsAntiDrift.spec.ts` that neither function
references Supabase in any form. Per the brief's own guidance ("usuń ją
albo bardzo jasno oznacz jako lokalny test" — small, unambiguous changes
only), this sprint **relabeled rather than removed** them: the button text
now reads "Zapisz jako opublikowany (test lokalny, nie Supabase)" instead
of the ambiguous "Opublikuj lokalnie," the button's color changed from the
same emerald green used by the real publish action to a neutral slate so
it doesn't visually read as equivalent, and a new warning box above both
buttons states in plain terms that nothing here touches Supabase or the
public site. Removing the feature outright would have meant also removing
its localStorage draft-list UI further down the page — a larger, less
surgical change than this sprint's scope called for.

## 14. Remaining risks

- **Rate limiting** — manual infrastructure gate, §5. Auth now closes the
  anonymous-caller version of this risk; a logged-in-session-abuse version
  remains until Vercel Firewall (or equivalent) is configured.
- **DNS rebinding on `fetch-preview`** — residual TOCTOU gap documented in
  §4, mitigated but not eliminated without a new dependency.
- **`alert_sources` RLS fix is proposed but not applied** — §10a, SQL
  written and verified statically, waiting on Adam's manual execution in
  the Supabase SQL Editor (this sprint's brief explicitly forbids Claude
  running it).
- **Admin routes remain client-side gated** — §9, real fix needs a
  `@supabase/ssr` migration, out of scope for this sprint. Note: §10
  confirmed `alerts`/`source_checks`/`source_notice_candidates` RLS is
  correct, and §10a's fix brings `alert_sources` in line too, so once that
  SQL is applied, RLS is a solid boundary for all four tables even while
  the admin UI itself stays client-gated.
- **CSP is `'unsafe-inline'`, not nonce-based** — §7, a deliberate,
  documented trade-off against the static-rendering cost of the
  alternative; revisit if the site's rendering strategy changes for other
  reasons anyway.

*(Resolved by Sprint 161B, no longer a risk: "`alerts` table RLS is
unverified from the repo" — confirmed correct by Adam's manual check, §10.
"`requireAdminSession` only checks authentication, not admin_profiles
membership" — fixed, §3a.)*

## 15. Documentation

This file, plus `docs/SUPABASE_RLS_SECURITY_VERIFICATION_V1.md`,
`docs/sql/SPRINT_161B_ALERT_SOURCES_RLS_HARDENING.sql`, and
`docs/sql/VERIFY_SPRINT_161B_RLS_READ_ONLY.sql` (all updated/new), and
updates to `README.md`, `docs/LIMITATIONS.md`, and `docs/ROADMAP.md`
noting what changed and what's still open.

## 16. Deployment checklist

Before merging/deploying this branch (not performed by this sprint —
Adam's manual steps):

1. Confirm `npm run check`, `npm run test:e2e`, and `npm run test:pwa` all
   pass on the branch (see §12/final report).
2. Read this document's §9, §10, §10a, §14 — §9 and the CSP trade-off in
   §14 are open follow-ups, not blockers. §10a (the `alert_sources` SQL)
   should be applied before or shortly after this branch deploys — see
   step 7 below.
3. ~~Run the RLS verification in `docs/SUPABASE_RLS_SECURITY_VERIFICATION_V1.md`~~
   **Done (Sprint 161B)** — see §10 for the result.
4. After deploying, spot-check in a real browser: log in as admin, use
   "Sprawdź stronę" on `/admin/sources` and "Generuj draft AI" — both
   should work exactly as before (the only change is an added header the
   browser now sends automatically).
5. Also spot-check logged-out: open browser dev tools, attempt a direct
   `fetch('/api/sources/fetch-preview', {method:'POST', body: JSON.stringify({url:'https://example.com'})})`
   from the console on the public site — expect a `401`.
6. Review the Anthropic Console usage graph per §11's checklist a few days
   after deploying to confirm the abuse-surface reduction shows up as
   expected (should trend toward "only real admin activity").
7. **New (Sprint 161B):** in the Supabase SQL Editor, run
   `docs/sql/VERIFY_SPRINT_161B_RLS_READ_ONLY.sql` first (confirms the
   `alert_sources` finding directly), then
   `docs/sql/SPRINT_161B_ALERT_SOURCES_RLS_HARDENING.sql`, then re-run the
   verify file to confirm the four new `admin_profiles`-based policies are
   live. Full manual steps: §13 of the Sprint 161B final report.
8. **New (Sprint 161B):** after applying that SQL, log in to
   `/admin/sources` as the real admin and confirm the page still loads,
   lists sources, and create/edit/delete all still work — the admin's
   existing `admin_profiles` row already covers this, no new row is
   needed.

## 17. Rollback checklist

If anything in this branch needs to be reverted:

- The three route handlers, `serverAuth.ts`, `apiClientAuth.ts`, and
  `ssrfGuard.ts` are additive/self-contained — reverting the branch
  restores the exact pre-Sprint-161 route behavior (auth removed, SSRF
  guard removed) with no data-layer or schema changes to undo for the
  Sprint 161 portion (it touched zero SQL, zero Supabase config).
- `next.config.ts`'s header changes are also self-contained — reverting
  restores the single `worker-src 'self'` CSP line and removes the other
  headers. No client code depends on any of the new headers being present
  (they're defensive, not functional dependencies).
- The Builder relabeling (§13) only changed button text/color and added a
  warning box — reverting restores the old "Opublikuj lokalnie" label with
  no functional change either direction.
- No environment variables were added, changed, or require rotation as
  part of a rollback — `NEXT_PUBLIC_SUPABASE_URL`/`_PUBLISHABLE_KEY` are
  the same ones already in use.
- **Sprint 161B code rollback** (`requireAdminSession`'s admin_profiles
  check): reverting the branch restores the Sprint-161-only behavior
  (authenticated-but-not-admin sessions would pass again) — this is a code
  revert only, no SQL to undo, since the admin_profiles check reads an
  existing table, it doesn't create one.
- **Sprint 161B SQL rollback** (if
  `SPRINT_161B_ALERT_SOURCES_RLS_HARDENING.sql` was already applied and
  needs to be undone): the hardening file's own commented-out ROLLBACK
  block (in the file itself, near the end) restores the exact four
  original `auth.role() = 'authenticated'` policies byte-for-byte — run it
  manually in the SQL Editor, the same way the forward migration is run.
  This is independent of the code rollback above; either can be reverted
  without the other.
