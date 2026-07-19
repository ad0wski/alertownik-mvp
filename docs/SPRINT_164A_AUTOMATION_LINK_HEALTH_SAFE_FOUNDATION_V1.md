# Sprint 164A — Automation & Link Health Safe Foundation

**Branch:** `sprint-164a-automation-link-health-safe-foundation-v1`
**Base:** `main` @ `aae9c958ec36fc3b060ac3d7a22ab5d1d9ab5680` (verified equal to `origin/main` at preflight)
**Date:** 2026-07-19
**Scope:** feature branch + Preview only. No merge to `main`, no Production deploy, no Supabase writes, no SQL executed, no env vars changed, no scheduled writes enabled.

---

## 1. State before this sprint

Sprints 161–163 were already on Production (dark/light/system theme, mobile app shell, admin authorization hardening). Prior sprints (142–153) had already built a substantial, well-tested automation foundation that this sprint's job was to **audit, not reinvent**:

- **`vercel.json`** — exactly one cron entry: `/api/cron/check-michalowice`, daily at 05:00 UTC, hardcoded to the `michalowice-komunikaty` source. No other route is scheduled.
- **`/api/cron/check-sources`** — dry-run only, multi-source via `?sourceKey=`, zero Supabase import (enforced by a static-import test), gated by `SCHEDULED_CHECKS_ENABLED` + `CRON_SECRET`.
- **`/api/cron/check-michalowice`** — same dry-run contract, hardcoded to Michałowice (avoids relying on undocumented Vercel cron query-string behavior).
- **`/api/cron/write-candidates`** — the one route that can actually write. Gated by **three independent, all-required** kill switches: `SCHEDULED_CHECKS_ENABLED`, `SCHEDULED_WRITES_ENABLED`, and configured scheduled-writer credentials that must sign in and be a member of `public.automation_identities`. Inserts at most 1 new `pending` candidate per invocation (`SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN`, default 1), restricted by default to Michałowice only (`SCHEDULED_WRITER_ALLOWED_SOURCE_IDS`), never publishes, never edits, never archives, never touches `alert_sources`.
- **RLS gap:** `alert_sources`'s four admin policies still checked only `auth.role() = 'authenticated'`, not `admin_profiles` — flagged in Sprint 161B, SQL written, not yet applied.
- **No live link-reachability check existed anywhere** — the closest thing, the Source Health Dashboard (Sprint 137, `src/lib/sourceHealth.ts`), only summarizes *manual check history* (`source_checks` rows); it never actually contacts a source's server.

None of the above required code changes this sprint — the write pipeline already satisfied every rule in this sprint's brief for automated Michałowice candidate creation (see §5).

---

## 2. RLS state — CONFIRMED CLOSED (2026-07-19)

Adam ran `docs/sql/VERIFY_SPRINT_161B_RLS_READ_ONLY.sql` (read-only) directly against Production Supabase, outside this session, and reported the result. Claude did not run any SQL, and no user id, email, or CSV export content is recorded anywhere in this repository.

Confirmed:

- RLS enabled on `alert_sources`, `alerts`, `automation_identities`, `source_checks`, `source_notice_candidates`.
- All four `alert_sources` admin operations (SELECT/INSERT/UPDATE/DELETE) now require `EXISTS (SELECT 1 FROM admin_profiles WHERE admin_profiles.user_id = auth.uid())`.
- Separate anon `SELECT` policy (`Public can read alert sources`) unchanged.
- `alerts` anon `SELECT` restricted to `status = 'published'`.
- Exactly one `admin_profiles` row exists.

Documentation updated to reflect this: `docs/SPRINT_161_CRITICAL_SECURITY_HARDENING_V1.md` §10a, `docs/LIMITATIONS.md`, `docs/ROADMAP.md` Stage 8, `README.md`.

---

## 3. What this sprint actually built

### 3a. Link Health Checker (new)

| File | Purpose |
|---|---|
| `src/lib/ssrfGuard.ts` | Extended `guardedFetch()` with an optional `method: "GET" \| "HEAD"` (default `"GET"`, fully backward-compatible — every existing caller unaffected). |
| `src/lib/linkHealthCheck.ts` | Pure orchestration: `checkUrlHealth(url)` tries `HEAD` first, falls back to one `GET` only if `HEAD` itself errors, never reads a response body beyond cancelling it. Classifies into `healthy` / `needs_attention` / `blocked`. |
| `src/app/api/admin/link-health/route.ts` | `POST`, gated by `requireAdminSession` (same auth as `/api/sources/fetch-preview`). Accepts up to `MAX_LINK_HEALTH_TARGETS_PER_REQUEST` (40) `{id, name, url}` targets, runs `checkUrlHealth` on each, returns results. **Never listed in `vercel.json`. Never called by anything except the admin panel's button.** |
| `src/components/LinkHealthPanel.tsx` | Admin-only, manual-trigger UI on `/admin/sources`. Nothing fetches on mount. |

**Every outbound request goes through `guardedFetch`** — the same SSRF-hardened path already used by `/api/sources/fetch-preview` (blocks private/loopback/link-local/CGNAT/metadata/documentation-range targets and their IPv4-mapped-IPv6 forms, re-validates every redirect hop rather than trusting a single upfront check, fixed 8s timeout, fixed non-forwarded User-Agent, no client headers/cookies ever forwarded).

**No schema change.** Results are computed live and held only in the browser tab's component state for that session — nothing is written to `alert_sources`, `source_checks`, or any other table. A proposed (unexecuted) persistence design exists at `docs/sql/PROPOSED_SPRINT_164A_LINK_HEALTH_PERSISTENCE_V1.sql` with a paired rollback and read-only verify file, for a future sprint to consider.

**Distinct from problem categories, surfaced to the admin:**
- **Source problem** — `needs_attention` (4xx/5xx/timeout/network error): the source's own server, not this app.
- **Blocked (app/security)** — `blocked`: this app's own SSRF rule rejected the target before any request left the server. Never a source problem.
- **Parser problem** — explicitly out of scope for this checker; already surfaced separately via the existing dry-run cron (`parse_error` outcome) and the manual "Sprawdź stronę" preview flow. The panel's copy (`LINK_HEALTH_BLOCKED_NOTE`) points this out explicitly so an admin never conflates the two.

### 3b. Everything else in the brief was verification, not new code

Sections E (candidate automation safety) and much of B/D were satisfied by **auditing and testing existing Sprint 142–153 code**, not writing new code — see §5 and §7.

---

## 4. All potential database writes in this sprint's changes

**None from the code this sprint added.** `checkUrlHealth`, the `/api/admin/link-health` route, and `LinkHealthPanel` perform zero Supabase reads or writes — they only make outbound HTTP HEAD/GET requests to source URLs (through `guardedFetch`) and return JSON to the browser.

The pre-existing write path (`/api/cron/write-candidates`) is unchanged by this sprint and remains gated by its three kill switches, none of which are configured in any environment touched by this sprint.

---

## 5. Candidate pipeline (section E) — verified compliant, unchanged

Re-read against every rule in the brief:

| Rule | Status | Where enforced |
|---|---|---|
| Max 1 new candidate per run | ✅ | `DEFAULT_MAX_CANDIDATES_PER_INVOCATION = 1` in `scheduledWriter.ts`, env-overridable only upward by Adam, never by the caller |
| Candidate always `pending` | ✅ | `buildPendingCandidateInsert()` hardcodes `status: "pending"` — no parameter can override it |
| Never becomes an alert without manual decision | ✅ | Route never imports any alert-publish/Builder/draft helper |
| Never sets `alerts.status = 'published'` | ✅ | No `alerts` table write anywhere in `scheduledWriter.ts` or the write route |
| Never edits an existing alert | ✅ | Same — no `alerts` UPDATE path exists |
| Never archives | ✅ | Same |
| Keeps source URL + audit data | ✅ | `source_url`, `source_key`, `source_id` always populated on insert |
| Duplicates flagged for review, not auto-published | ✅ | Three-way classification (`new`/`duplicate`/`ambiguous`) — ambiguous is neither inserted nor discarded, reported distinctly |
| Broken parser ends safely | ✅ | `fetchAndParseProposals` never throws; parse failures degrade to a typed `fetch_error`/`parse_error` result, no partial/garbage insert |
| Kill switches fail-closed | ✅ | `SCHEDULED_CHECKS_ENABLED` + `SCHEDULED_WRITES_ENABLED` + writer credentials + `automation_identities` membership — all four independently required, none configured today |

**120/120 existing tests** covering this pipeline (`scheduledWriter.spec.ts`, `scheduledWriterRoute.spec.ts`, `scheduledWriterConcurrency.spec.ts`, `scheduledWriterIdempotency.spec.ts`, `cronCheckMichalowiceRoute.spec.ts`, `cronCheckSourcesRoute.spec.ts`) re-run and pass unmodified.

`vercel.json` was deliberately **not** changed to add `write-candidates` — it stays exactly as it was (dry-run only), confirmed by the existing `vercelCronConfig.spec.ts` contract test, which explicitly asserts the cron never targets `write-candidates` or WKD.

---

## 6. Rate limiting reassessment (section F)

No fake in-memory limiter was built (explicitly forbidden by the brief, and would provide no real protection on Vercel's stateless serverless instances — each invocation gets its own memory).

**Recommendation, not implemented:** the credible free options are (a) Vercel's platform-level DDoS/abuse mitigation, which applies automatically and needs no configuration, or (b) Vercel Firewall rate-limiting rules, available on the Hobby plan with a low free-tier request allowance, configured entirely in the Vercel dashboard (no new dependency, no code change). Neither was enabled this sprint — that's an infrastructure/account decision for Adam, not something to silently turn on.

In the meantime, the actual blast radius is already bounded by defense-in-depth already in place: `requireAdminSession` (admin-only), `CRON_SECRET` + constant-time comparison (cron-only), three independent kill switches (writes), a 1-candidate-per-run cap, an 8–10s fetch timeout, and a `MAX_LINK_HEALTH_TARGETS_PER_REQUEST` cap of 40 on the new endpoint specifically to prevent one click from fanning out into an unbounded number of outbound requests.

---

## 7. Tests

New: `tests/e2e/linkHealthCheck.spec.ts` (11 tests), `tests/e2e/linkHealthRoute.spec.ts` (4 tests) — HTTP status classification, SSRF-blocked targets (private IP, redirect-to-private, cloud metadata), timeout, DNS-resolution failure, HEAD→GET fallback with body-cancellation, summary counts, admin-auth gating (401 unauthenticated / 403 non-admin, target never fetched in both cases), payload validation.

Full results: see §10 of the final report message accompanying this sprint (exact `npm run check` / `npm run test:e2e` / `npm run test:pwa` / `npm run build` / `git diff --check` output).

---

## 8. Manual Production Gate

Nothing in this sprint requires a gate beyond what already existed, because nothing here is wired to run automatically:

- The Link Health Panel is a button-click-only admin feature — merging it to `main` and deploying to Production makes it *available*, not *active*. No further env var is needed or exists for it.
- The Michałowice write pipeline's existing gate is unchanged: Adam would need to (1) create/configure the scheduled-writer Supabase Auth account and add it to `automation_identities`, (2) set `SUPABASE_SCHEDULED_WRITER_EMAIL`/`PASSWORD`, `CRON_SECRET`, `SCHEDULED_CHECKS_ENABLED=true`, `SCHEDULED_WRITES_ENABLED=true` in Vercel, and (3) add a `write-candidates` entry to `vercel.json` — none of which happened this sprint.

---

## 9. Known limitations

- Link health results are ephemeral (see §3a and `docs/LIMITATIONS.md`).
- DNS-rebinding TOCTOU on `guardedFetch` remains a documented, unclosed residual gap (unchanged from Sprint 161 — closing it needs a pinned-IP HTTP client dependency, a separate decision).
- No credible rate limiting yet (§6).
- `alert_sources` RLS gap is closed; the separately-tracked "server-side middleware admin route guard" (Stage 8) remains open, unrelated to this sprint.

---

## 10. Cost / Vercel plan notes

Zero new infrastructure or paid services. The Link Health Panel adds outbound HTTP requests only when an admin clicks the button, capped at 40 targets, each with an 8s timeout — bounded, on-demand load only, no cron addition. No new npm package was added.

---

## 11. What remains OFF

- `SCHEDULED_WRITES_ENABLED` — not set anywhere.
- `SCHEDULED_CHECKS_ENABLED` — not set anywhere.
- Scheduled-writer credentials — not configured.
- `write-candidates` in `vercel.json` — not added.
- Link-health persistence — not migrated (proposal only, unexecuted).
- Rate limiting — not enabled.
- Merge to `main` — not performed. Push to `main` — not performed. Production redeploy — not performed.
