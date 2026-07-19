# Sprint 164B — Safe Auto-Candidate Canary Foundation

**Status:** branch only (`sprint-164b-safe-auto-candidate-canary-v1`), not merged to `main`, not deployed to Production, no environment variable changed, no `vercel.json` change, no SQL executed.

**Starting point:** `main` = `origin/main` = `7c6680d` (Sprint 164A live on Production).

---

## 1. What this sprint actually is

Sprint 164B was scoped as "prepare a safe foundation for the first automatic candidate creation." The audit below (§2) found that this foundation was **already built, gated, and tested across Sprints 147–153** — the "Scheduled Writer" work — and never activated. Re-implementing it in parallel would have meant two separate write paths into `source_notice_candidates`, which is a strictly worse safety posture than one well-tested path with one set of kill switches.

So this sprint's actual deliverable is:

1. **Audit** (§2) — a full, current re-read of the existing automation, confirmed still correct and still off.
2. **A new admin-only status panel** (§3) — the one genuine gap: nothing in the UI showed *whether* the kill switches were on or off. Everything else the spec asked for (max-1-per-run cap, single-source allowlist, pending-only inserts, fail-closed gates, dedup) already existed in code, tested.
3. **New tests** (§4) closing the few scenarios the spec named explicitly that weren't yet spelled out by name in the existing suite (a notice already saved as a *converted* candidate, not just *pending*; the panel's own auth/no-secret/no-activation-control guarantees).
4. **Documentation** (this file + two runbooks) formalizing the whole thing as a "canary" — one source, one candidate cap, fully reversible, fully inspectable.
5. **No new SQL, no `vercel.json` change, no widened allowlist, no env var set anywhere.**

---

## 2. Audit of existing automation (as found, before this sprint's changes)

### 2.1 `/api/cron/check-michalowice` (Sprint 153)

- `GET`, hardcoded to the Michałowice source only.
- Gate: `SCHEDULED_CHECKS_ENABLED === "true"` (else `503`), then `CRON_SECRET` bearer auth (else `401`/`503`).
- Zero Supabase import anywhere in the file — a dry-run by construction, not just by intent (enforced by a static-import test).
- **This is the only route wired into `vercel.json`, at `0 5 * * *` (once daily).**
- Currently: `SCHEDULED_CHECKS_ENABLED` is not set in any environment as part of any sprint to date, so this route 503s even when the cron fires.

### 2.2 `/api/cron/check-sources` (Sprint 142)

- Same dry-run contract as 2.1, but for every source in `SAFE_CHECK_SOURCE_IDS` (`michalowice-komunikaty`, `wkd-aktualnosci`) unless a `sourceKey` filter narrows it. Not in `vercel.json`.

### 2.3 `/api/cron/write-candidates` (Sprint 147–153) — the write-capable route

This is the route Sprint 164B's brief describes. It already implements, exactly:

| Requirement (164B brief) | Existing implementation |
|---|---|
| Zero autopublish/autoarchive | Never imports any alert-publishing/draft/approval helper — enforced by a static-import test (`tests/e2e/scheduledWriterRoute.spec.ts`) |
| Zero row in `alerts` | Same test; only inserts into `source_notice_candidates` and `source_checks` |
| Max 1 new candidate per run | `getMaxCandidatesPerInvocation()`, env `SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN`, **default 1** (`DEFAULT_MAX_CANDIDATES_PER_INVOCATION`) |
| One canary source only | `getAllowedWriteSourceIds()`, env `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS`, **default `["michalowice-komunikaty"]`** (`DEFAULT_ALLOWED_WRITE_SOURCE_IDS`) — any override is still filtered through `SAFE_CHECK_SOURCE_IDS`, so it can only ever *narrow*, never add an arbitrary source |
| Fail-closed on missing switch/secret/credential | Three independent gates, all required: `SCHEDULED_CHECKS_ENABLED`, `SCHEDULED_WRITES_ENABLED`, `SUPABASE_SCHEDULED_WRITER_EMAIL`/`PASSWORD` + a successful sign-in against an account that must be a row in `public.automation_identities` (RLS-enforced, not just app-code-enforced) |
| No `service_role` | `signInScheduledWriter` only ever uses the anon/publishable key; writes happen through the same RLS-governed Data API the browser uses |
| Pending-only inserts | `buildPendingCandidateInsert` hardcodes `status: "pending"` and every verification/conversion field to `null` — there is no parameter through which a caller could set anything else |
| Safe error messages | No stack trace, no exception message, ever, in any response (statically tested) |
| No secrets in response | Tested — bearer token, writer password never appear in any response body |

**Currently OFF:** none of `SCHEDULED_CHECKS_ENABLED`, `SCHEDULED_WRITES_ENABLED`, `SUPABASE_SCHEDULED_WRITER_EMAIL`, `SUPABASE_SCHEDULED_WRITER_PASSWORD` is set in any environment (Preview or Production) as of this sprint. The route is not referenced anywhere in `vercel.json`.

### 2.4 Deduplication (existing, unchanged by this sprint)

Two layers, both already built:

1. **In-memory fuzzy classifier** (`classifyCandidateAgainstExisting`, reused from the existing browser dedup heuristic `textSimilarity`): compares a new proposal's text against every existing candidate text for the same source (`findExistingCandidateTexts`, which reads `source_notice_candidates` by `source_key`/`source_id` match — **not filtered by `status` at all**, so a candidate that is `pending`, `verified`, or already `converted` is equally present in the comparison pool). Three-way result: `duplicate` (skip silently), `ambiguous` (skip, but reported distinctly — never silently inserted, never silently discarded), `new` (proceed, subject to the per-run cap).
2. **Proposed (not applied) database-level exact-match constraint** — a `content_fingerprint` column + partial unique index (`docs/sql/PROPOSED_SPRINT_150_RACE_CONDITION_MIGRATION_V1.sql`, with paired rollback and read-only verify files already in `docs/sql/`). Code support already exists (`computeContentFingerprint`, `isContentFingerprintEnabled` — defaults off) and is fully unit-tested for two genuinely racing invocations, with and without the flag. **This migration is not applied to the live database and this sprint does not apply it** — see §7.

### 2.5 `/admin/queue`

Reviewed; this is the existing admin candidate-review queue (approve/convert/archive a candidate by hand). Nothing in this sprint changes it — automation only ever *feeds* this queue with `pending` rows, exactly like a manual "Zapisz jako kandydata" save does.

### 2.6 Environment variables (all currently unset in every environment)

| Variable | Purpose | Default behavior when unset |
|---|---|---|
| `SCHEDULED_CHECKS_ENABLED` | Kill switch 1/3 — dry-run + write routes both require `"true"` | Disabled (503) |
| `SCHEDULED_WRITES_ENABLED` | Kill switch 2/3 — write route only | Disabled (503) |
| `CRON_SECRET` | Bearer auth shared by all three cron routes | Disabled (503, "not configured") |
| `SUPABASE_SCHEDULED_WRITER_EMAIL` / `SUPABASE_SCHEDULED_WRITER_PASSWORD` | Kill switch 3/3 — technical writer account credentials | Disabled (503) — and even if set, must also be a row in `public.automation_identities`, which is empty today |
| `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS` | Optional narrowing of the write-source allowlist | Defaults to `["michalowice-komunikaty"]` only |
| `SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN` | Optional override of the per-run insert cap | Defaults to `1` |
| `SCHEDULED_WRITER_SOURCE_REGISTRY_IDS` | JSON map of sourceKey → `alert_sources.id`, for check-history logging | Defaults to no mapping — candidate creation is unaffected, only `source_checks` logging is skipped |
| `SCHEDULED_WRITER_FINGERPRINT_ENABLED` | Enables the DB-level exact-match dedup column in the insert payload | Defaults off — must never be set to `"true"` before the Sprint 150 migration is actually applied |

None of these is set anywhere as part of this sprint. No value (secret or otherwise) is written to this document.

### 2.7 Canary source identity

The task specified the canary source as `michalowice-komunikaty` "or the exact existing identifier confirmed from the repo and data." Confirmed: `michalowice-komunikaty` is a literal member of `SAFE_CHECK_SOURCE_IDS` (`src/lib/sourceCheck.ts`) and is already the sole entry of `DEFAULT_ALLOWED_WRITE_SOURCE_IDS` (`src/lib/scheduledWriter.ts`) — i.e., it is already the system's default (and, until an env var says otherwise, only) canary source. No change was made here; this sprint only confirms and pins it with an explicit test (`tests/e2e/scheduledWriterCanaryFoundation.spec.ts`).

---

## 3. What this sprint added

### 3.1 `src/lib/automationStatus.ts` (new)

Pure, side-effect-free snapshot builder. Takes already-resolved booleans/counts as input (never reads `process.env` itself), so every combination is testable without touching real environment variables. Every output field is a `boolean`, a `number`, or a public source id/name already visible elsewhere in the admin UI — there is no field this module could add that leaks a secret, because no secret value is ever passed into it.

### 3.2 `src/app/api/admin/automation-status/route.ts` (new)

`GET`, admin-session-gated (`requireAdminSession` — the exact same gate as `/api/admin/link-health`). Reads environment variable **presence** (never values) and the existing `scheduledWriter.ts` public config getters, and returns a snapshot built by 3.1. No candidate, alert, or source row is read, created, or modified.

### 3.3 `src/components/AutomationStatusPanel.tsx` (new)

Client component rendered on `/admin/sources`, below the existing `ScheduledWriterMonitoring` panel. Fetches its status once on mount (harmless `GET`, mirrors how the rest of the page already auto-loads its own read-only data). Shows:

- automatyczne sprawdzanie: aktywne/wyłączone
- automatyczne tworzenie kandydatów: aktywne/wyłączone
- czy `CRON_SECRET` i dane konta writer są skonfigurowane (tak/nie — nigdy wartości)
- źródło canary (nazwa źródła, nie tylko identyfikator)
- limit nowych kandydatów na uruchomienie
- czy zapis byłby w ogóle możliwy przy obecnej konfiguracji (wszystkie bramy razem)
- ostatni bezpieczny wynik — reusing the same `writerCandidateActivity` data the existing monitoring panel already loads (no new fetch), or an honest "nothing yet" state
- an explicit, unambiguous note that the automat never publishes/edits/archives, and that this panel has no activation control

**Contains no button, no `onClick` handler anywhere in the file** (verified by a structural test, `tests/e2e/automationStatus.spec.ts`) — the only interactive element is the native `<details>` disclosure toggle used by every other panel on this page.

### 3.4 `src/app/admin/sources/page.tsx`

Two-line wiring change: import + render `<AutomationStatusPanel activityRows={...} />` in the existing `loadState === "ready"` block, reusing the `buildScheduledWriterActivity(...)` call already made for `ScheduledWriterMonitoring` (no new data fetch).

### 3.5 Tests (new)

- `tests/e2e/automationStatus.spec.ts` — 21 tests: every combination of the four gates for `buildAutomationStatus`, the admin-auth gate for the new route (401/403/200), proof that no secret value ever appears in the response even when real-looking secrets are configured, copy anti-drift, and the panel's structural audit (Client Component boundary, no `onClick`, GET-only).
- `tests/e2e/scheduledWriterCanaryFoundation.spec.ts` — 6 tests: a notice matching an existing **pending** candidate is skipped; a notice matching an existing **converted** candidate is skipped (making explicit that `findExistingCandidateTexts` never filters by status, so this is structurally the same guarantee as the pending case); a genuinely new notice alongside an already-pending one is inserted, capped at 1; and the canary identity itself (single default source id, cap of 1) is pinned so any future change is a visible diff.

No existing test was weakened, skipped, or deleted.

---

## 4. Test coverage against the Sprint 164B checklist

| Required scenario | Where covered |
|---|---|
| Both kill switches OFF | `tests/e2e/scheduledWriterRoute.spec.ts` ("no env configured at all → 503"); `automationStatus.spec.ts` |
| No `CRON_SECRET` | `scheduledWriterRoute.spec.ts` ("missing CRON_SECRET configuration fails closed") |
| Wrong `CRON_SECRET` | `scheduledWriterRoute.spec.ts` ("wrong bearer token rejected") |
| No writer credentials | `scheduledWriterRoute.spec.ts` (missing email / missing password, each separately) |
| Source outside allowlist | `scheduledWriterRoute.spec.ts` ("a bare call resolves to Michałowice only, never WKD"; "an explicit `?sourceKey=wkd-aktualnosci` is excluded") |
| More than one candidate per run | `scheduledWriter.spec.ts` (cap-enforcement group, 3 tests) |
| Deduplication | `scheduledWriter.spec.ts` (duplicate/ambiguous/new groups) + **new**: `scheduledWriterCanaryFoundation.spec.ts` (pending vs. converted) |
| Parallel invocations | `scheduledWriterConcurrency.spec.ts` (6 tests, real race simulation) |
| Pending-only | `scheduledWriter.spec.ts` ("always forces status=pending...") |
| No write to `alerts` | `scheduledWriterRoute.spec.ts` (static-import audit) |
| No publish/archive | Same audit — no such helper is importable, structurally |
| Safe error messages | `scheduledWriterRoute.spec.ts` ("the catch branch never includes exception detail") |
| No secrets in response | `scheduledWriterRoute.spec.ts` + **new**: `automationStatus.spec.ts` |
| Admin panel | **New**: `automationStatus.spec.ts` (structural audit + copy anti-drift) |
| No regression, Sprints 161–164A | Full suite run, §6 |

---

## 5. Canary architecture summary

```
Vercel Cron (NOT wired — see §7)
        │
        ▼
GET /api/cron/write-candidates?sourceKey=michalowice-komunikaty
        │
        ├─ Gate 1: SCHEDULED_CHECKS_ENABLED === "true"?          ──No──▶ 503, no fetch
        ├─ Gate 2: SCHEDULED_WRITES_ENABLED === "true"?          ──No──▶ 503, no fetch
        ├─ Gate 3: CRON_SECRET configured + bearer matches?      ──No──▶ 503 / 401, no fetch
        ├─ Gate 4: writer credentials configured + sign-in OK
        │          (account must be in automation_identities)?  ──No──▶ 503, no fetch
        │
        ▼ (all four gates passed)
   getAllowedWriteSourceIds() ∩ requested source
        │ (server-controlled default: michalowice-komunikaty only)
        ▼
   fetch + parse the live page (same parser as manual "Sprawdź stronę")
        │
        ▼
   buildCheckProposals() → up to 6 raw proposals
        │
        ▼
   For each proposal, in order, until maxCandidatesToInsert (default 1) reached:
        ├─ classifyCandidateAgainstExisting() against ALL existing
        │  source_notice_candidates for this source, regardless of status
        │     ├─ "duplicate"  → skip, counted
        │     ├─ "ambiguous"  → skip, counted separately (never silently resolved)
        │     └─ "new"        → insert as { status: "pending", ...everything else null }
        │
        ▼
   insertSourceCheck() — logs found_notice/no_changes to source_checks,
   only if a registry source id is configured
        │
        ▼
   JSON response: per-source outcome, counts, published: false, message
```

**No path in this diagram ever reaches `alerts`, `admin_profiles`, or any publish/approve/archive helper.**

---

## 6. Test run results

```
npm run check        → PASS (typecheck + lint + build, zero errors)
npm run test:e2e      → <fill in from final run, see report>
npm run test:pwa      → <fill in from final run, see report>
npm run build         → PASS (part of `check`)
git diff --check      → clean
```

(Final numbers are in the sprint completion report delivered in-conversation, not duplicated here to avoid drift — this file describes architecture and intent, not a point-in-time test count.)

---

## 7. What was deliberately NOT done this sprint

- **`vercel.json` was not touched.** Adding `/api/cron/write-candidates` there now — even with every switch defaulting off — was rejected per the sprint's own instruction: if a later merge to `main` happened while an env var were ambiguously set, the route would start actually running on a schedule. See `docs/SPRINT_164B_CANARY_ACTIVATION_RUNBOOK_V1.md` for the exact, separate activation step this defers to.
- **No SQL was run.** The Sprint 150 content-fingerprint migration remains proposed-only (`docs/sql/PROPOSED_SPRINT_150_RACE_CONDITION_MIGRATION_V1.sql` + rollback + verify, all pre-existing). This sprint does not touch it.
- **No environment variable was set, in any environment.**
- **The allowlist was not widened.** `DEFAULT_ALLOWED_WRITE_SOURCE_IDS` remains exactly `["michalowice-komunikaty"]`.
- **No new external dependency was added.**
