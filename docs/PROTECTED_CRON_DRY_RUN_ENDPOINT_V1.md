# Protected Cron Dry-Run Endpoint v1

**Sprint 142.** Implements the Sprint 142 stage of
`docs/SCHEDULED_CHECKS_ARCHITECTURE_V1.md`: a protected, cron-compatible
endpoint that fetches and parses allowlisted official sources and reports
what it *would* find — without saving anything.

**Status: exists in code, not wired to any scheduler, and inert by default.**
No cron calls it. No `CRON_SECRET` is configured in any environment. No
`vercel.json` cron entry exists. This document describes what the code
does when it is eventually invoked, not anything currently running.

---

## Endpoint

```
GET /api/cron/check-sources
```

Route file: `src/app/api/cron/check-sources/route.ts`
Pure logic: `src/lib/cronCheckSources.ts`

**Why `GET`, and why a new route instead of reusing `/api/sources/check`:**
Vercel Cron invokes its targets with a `GET` request — using `GET` here
means this route can be wired into a future `vercel.json` `crons` entry
with no handler changes. It is a **separate route** from the existing
admin-button endpoint (`/api/sources/check`, unchanged, still `POST`,
still browser-triggered) so that scheduler-specific authentication
(`CRON_SECRET`) and the admin session model never have to share one code
path — a bug or credential change in one can never affect the other.

---

## Authentication contract

1. The caller must send `Authorization: Bearer <CRON_SECRET>`.
2. The expected value is read **only** from `process.env.CRON_SECRET`,
   inside the route handler — never in a client component, never with a
   `NEXT_PUBLIC_` prefix.
3. **Fail-closed, two distinct cases:**
   - `CRON_SECRET` not set on the server at all → `503`, generic
     `"Endpoint nieskonfigurowany."` — this is an operator/deployment
     fact, safe to state plainly, and it stops the request *before* any
     source is fetched.
   - `CRON_SECRET` is set, but the request's header is missing, malformed,
     or wrong → `401`, generic `"Unauthorized."` — the response never
     hints at whether a secret exists or how close the guess was.
4. Comparison is constant-time: both the provided token and the expected
   secret are SHA-256 hashed, then compared with
   `crypto.timingSafeEqual` on the two (always equal-length) digests —
   this avoids both a timing side-channel on the raw value *and* the
   length-mismatch exception a naive `timingSafeEqual` on raw strings
   would throw (which would itself leak information via a different
   failure mode).
5. The `Authorization` header value is **never logged**, in any code path,
   success or failure.
6. No response body — success or error — ever contains the configured
   secret, an environment variable name/value, or any Supabase
   configuration detail.

### Kill switch

A second, independent gate: `process.env.SCHEDULED_CHECKS_ENABLED` must be
the exact literal string `"true"` or the endpoint returns `503` with a
generic "disabled" message, checked **before** authentication is even
evaluated. This means a valid `CRON_SECRET` alone is never sufficient to
make the endpoint do anything — a second, separately-managed flag has to
also be turned on. Neither variable is set in any environment as part of
Sprint 142; the endpoint is inert everywhere today, by construction, with
no additional action required to keep it that way.

---

## Dry-run behavior (only reached after both gates pass)

- The source list is **entirely server-controlled**:
  `resolveCronSources()` (`src/lib/cronCheckSources.ts`) defaults to every
  entry in the existing `SAFE_CHECK_SOURCE_IDS` allowlist
  (`src/lib/sourceCheck.ts` — unchanged, still exactly Gmina Michałowice
  komunikaty + WKD aktualności). An optional `?sourceKey=` query parameter
  narrows to one source, but is resolved through the same
  `getSafeCheckSource()` allowlist lookup the manual API already uses — an
  unrecognized or arbitrary value (including a full URL) resolves to
  **zero** sources checked, never a fetch of anything. There is no code
  path in this endpoint that can turn caller input into a URL outside the
  allowlist.
- Each source is fetched **independently**, with its own 10-second
  `AbortController` timeout (`CRON_FETCH_TIMEOUT_MS`, same value the
  manual `/api/sources/check` route already uses) and its own `try/catch`
  — one source's fetch/parse failure never affects another source's
  result, and never crashes the request.
- Parsing reuses the existing, unchanged `parsePageHtml()`
  (`src/lib/sourceParsers/pageParser.ts`) and `buildCheckProposals()`
  (`src/lib/sourceCheck.ts`), including the existing proposal cap
  (`MAX_CHECK_PROPOSALS = 6`) and boilerplate/short-fragment filtering.
- **No database call of any kind is made.** `src/lib/cronCheckSources.ts`
  and `src/app/api/cron/check-sources/route.ts` do not import
  `supabaseCandidateWrites`, `supabaseSourceWrites`, `supabaseAlertWrites`,
  `candidateVerifier`, `supabaseClient`, or `@supabase/supabase-js` at
  all — this is enforced by a static-import audit test
  (`tests/e2e/cronCheckSourcesRoute.spec.ts`), not merely by convention,
  so an accidental future import would fail CI rather than silently
  reintroducing a write path.

### Response shape

```jsonc
{
  "ok": true,
  "dryRun": true,
  "checkedAt": "2026-07-12T10:00:00.000Z",
  "checkedSources": 2,
  "successfulSources": 2,
  "failedSources": 0,
  "totalProposalCount": 3,
  "savedCandidates": 0,
  "savedSourceChecks": 0,
  "published": false,
  "message": "Dry-run: nic nie zostało zapisane w bazie, żaden kandydat ani historia sprawdzenia nie powstały, nic nie zostało opublikowane.",
  "results": [
    {
      "sourceKey": "michalowice-komunikaty",
      "sourceName": "Gmina Michałowice — komunikaty",
      "outcome": "success",
      "proposalCount": 2,
      "hasDateSignalCount": 1,
      "durationMs": 812
    },
    {
      "sourceKey": "wkd-aktualnosci",
      "sourceName": "WKD — aktualności",
      "outcome": "no_proposals",
      "proposalCount": 0,
      "hasDateSignalCount": 0,
      "durationMs": 640
    }
  ]
}
```

- `outcome` is one of `success`, `no_proposals`, `fetch_error`,
  `parse_error`, `timeout`.
- A failed source additionally carries `diagnostic`, one of a **fixed set
  of short codes** (`http_4xx`, `http_5xx`, `non_html_content_type`,
  `network_error`, `timeout_10s`, `parse_exception`) — never a raw error
  message, never a stack trace.
- Per-source results never include the fetched HTML, page body, or any
  proposal's title/excerpt/raw text — only counts. This is deliberately
  more conservative than the admin-facing manual check API (which does
  return titles/excerpts to a logged-in admin) because this endpoint's
  caller is a scheduler, not a human reviewing content.
- `savedCandidates`, `savedSourceChecks`, and `published` are always `0`
  / `0` / `false` in this sprint's implementation — stated explicitly in
  every response, not just true by omission, so the guarantee is visible
  to whoever (or whatever) reads the response, not just provable by
  reading the source.

---

## What this sprint deliberately does NOT do

- No cron trigger exists anywhere (no `vercel.json`, no dashboard entry,
  no external scheduler configuration).
- No real `CRON_SECRET` or `SCHEDULED_CHECKS_ENABLED` value exists in any
  `.env` file, any committed file, or any Vercel project setting.
- No privileged Supabase client, technical Supabase Auth account, or
  `service_role` key was added — this endpoint has **no way** to write to
  the database even if someone wanted it to; that capability doesn't
  exist in this code at all yet.
- No schema, RLS, or migration change.
- No retry logic — a failed fetch is simply reported as failed; the
  *schedule itself* is the retry mechanism, deferred to Sprint 145 per
  `docs/SCHEDULED_CHECKS_ARCHITECTURE_V1.md` §4.9/§9.

## Unresolved before Sprint 143

Sprint 141's architecture review recommended a dedicated Supabase Auth
**technical account** as the write-path identity for a future scheduled
job (over a `service_role` key), on the reasoning that it satisfies the
existing `auth.role() = 'authenticated'` RLS policies without introducing
a key that bypasses RLS entirely.

**That reasoning has a gap this sprint surfaced explicitly, and does not
resolve:** a technical account solves *authentication* (a non-human
caller can obtain a valid `authenticated` session) but says nothing about
*authorization scope*. Every current admin-table RLS policy
(`alert_sources`, `source_checks`, `source_notice_candidates`) grants
**full select/insert/update/delete to any authenticated session** — there
is no per-account restriction, no row ownership, no narrower policy a
technical account could be scoped down to today. In other words: a
technical account is not automatically least-privilege just because it
isn't `service_role` — under the current policies, a technical account
would have exactly as much write access as a compromised real admin
password, which is a real improvement over `service_role` (smaller blast
radius: it only reaches these RLS-governed tables, not every table in the
project) but is **not** the same as "this account can only insert
`pending` candidates and log checks."

**This must be audited, not assumed, before Sprint 143 adds any
credential:** either (a) confirm the current broad
`auth.role() = 'authenticated'` policy is an acceptable scope for a
technical account given what this endpoint would actually do (only
insert-shaped operations on two tables), or (b) design a narrower policy
(e.g. a dedicated Postgres role or a `security definer` function limited
to the exact insert shape this endpoint needs) before the account is
created. Sprint 141's document did not perform this audit — it named the
technical-account strategy as the recommended direction without
verifying its authorization scope, and Sprint 142 is flagging that gap
explicitly rather than letting Sprint 143 inherit it silently.

---

## Testing

- `tests/e2e/cronCheckSources.spec.ts` — pure-function tests for auth
  logic, the kill switch, allowlist resolution, and result/summary shape.
  Fixture HTML only, no network, no route, no real secret.
- `tests/e2e/cronCheckSourcesRoute.spec.ts` — imports the actual route
  `GET` handler and invokes it directly with a hand-built `NextRequest`,
  `global.fetch` mocked to fixture HTML/synthetic errors, and a
  clearly-fake token set only in the test process's `process.env` for the
  duration of each test (never written to any file). Covers: both
  fail-closed paths, wrong/missing tokens, per-source isolation, timeout
  and content-type/5xx classification, the arbitrary-URL/sourceKey
  rejection, and a static source-text audit asserting neither this route
  nor its lib module imports any Supabase write helper or the verifier.
- No test in this suite depends on a live website or a live PDF.
