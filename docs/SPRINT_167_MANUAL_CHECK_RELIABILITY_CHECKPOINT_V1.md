# Sprint 167 — Manual Source-Check Reliability Hardening

**Status: implemented, tested, not deployed.** First product-focused sprint
after the Sprint 166F→166P operational-notification-ledger arc closed.
Adds bounded retry to the admin's manual "Sprawdź teraz przez aplikację"
check for the two live pilot sources (Gmina Michałowice — komunikaty,
WKD — aktualności), directly reducing the chance a momentary network blip
forces the admin to click the button again by hand. No merge to `main`,
no Environment Variable change, no SQL, no Cron, no email/Resend, no
auto-publish.

---

## 1. Context — read before starting

- `docs/NEXT_MILESTONES.md`: honest current stage is "Utility MVP...
  before a scalable data engine" — the main blocker is named explicitly
  as **data coverage and a repeatable source workflow**, not the app
  store, not UX polish, not pricing. Gate 2 (Local Beta: 3–5 data
  categories, 5–10 testers, no stale data) is the current focus; Gate 5
  (Store Launch) is still several gates away.
- Sprints 166F–166P (all reviewed): built and proved, end-to-end in both
  Preview and Production, an operational-notification ledger for
  monitoring the *automation's own health* — not the source-monitoring
  pipeline itself. That work is now closed; Production intentionally
  stays with the automated writer (`SCHEDULED_WRITES_ENABLED`), runtime
  notifications, and email alerts all still off, per Adam's explicit
  product decision this sprint.
- Current admin/source-monitoring state (read live, via `/admin/sources`
  and the codebase): 9 official sources are checklisted
  (`officialSourceChecklist.ts`), but only **2** — Michałowice komunikaty
  and WKD aktualności — have a working in-app "check" button
  (`SAFE_CHECK_SOURCE_IDS`, `sourceCheck.ts`). The other 7 remain
  manual-browser-checklist only, each for a documented technical reason
  (bot-blocking, PDF scans, a region-picker UI, or simply not yet
  verified).

## 2. Read-only audit — highest-priority next step

Investigated whether a third source could be safely added to the
in-app-check allowlist today, since two are same-domain
(`michalowice.pl`) and the checklist itself lists
`michalowice-wylaczenia-pradu` as low-risk with no documented technical
obstacle. **Live-fetched both pages and compared markup directly:**

- `michalowice-komunikaty` (already working): renders each notice as a
  `<div class="news-item">` block — the exact CMS list markup
  `pageParser.ts`'s `extractNewsListItems()` already targets.
- `michalowice-wylaczenia-pradu` (candidate): HTTP 200, HTML content-type,
  but **zero** `news-item` divs anywhere on the page. It is a static
  informational page, not a notice-list page — consistent with the
  checklist's own `whatToCheck` note ("gmina sama odsyła do PGE" — the
  page mostly just points elsewhere). Adding it to the allowlist today
  would not reliably surface anything; it needs its own investigation
  (or simply stays a manual-checklist source, which is already a
  perfectly fine, honest state) rather than a same-sprint quick add.

**Conclusion:** expanding source *coverage* is not a safe, high-confidence
same-day change — it needs per-source verification work this sprint
didn't have room for. The highest-confidence, genuinely safe improvement
available today is **reliability of the two sources that already work**,
which is exactly this sprint's scope.

## 3. What changed

- **New:** `src/lib/manualSourceCheckFetch.ts` — extracts
  `POST /api/sources/check`'s fetch/parse logic into a testable module
  and adds the same bounded-retry policy (`classifyFetchFailure`,
  `MAX_FETCH_ATTEMPTS = 2`, `RETRY_DELAY_MS`) the scheduled writer's own
  `fetchAndParseProposals` (`scheduledSourceFetch.ts`) already uses and
  this codebase already reviewed/tested. A transient failure (5xx,
  10s timeout, generic network error) gets exactly one retry; a
  permanent failure (4xx, wrong content type) still fails on the first
  attempt, unchanged from before this sprint.
- **Preserved exactly:** every admin-facing Polish error message
  (the 401/403 bot-block explanation, the 404 explanation, the
  timeout/content-type messages) — this sprint changes *when* a retry
  happens, never *what* the admin reads.
- **Updated:** `src/app/api/sources/check/route.ts` — now a thin wrapper
  around the new module (mirrors the existing `fetchAndParseProposals` /
  cron-route split). No behavior change to auth, request validation, or
  response shape (`SourceCheckApiResponse` unchanged).
- **New tests:** `tests/e2e/manualSourceCheckFetchRetry.spec.ts` — 8
  cases mirroring `scheduledSourceFetchRetry.spec.ts`'s existing pattern
  exactly (single success, permanent 404/403, transient 500 recovery,
  two consecutive failures, network error, non-HTML content type,
  timeout) — all against mocked `global.fetch`, zero live network calls,
  zero real delay (fast override).

## 4. What did NOT change

- No `SAFE_CHECK_SOURCE_IDS` change — still exactly Michałowice +
  WKD (confirmed unchanged, still pinned by `sourceCheck.spec.ts`'s own
  anti-drift test).
- No candidate-save or check-history-log logic touched — those still
  run entirely in the admin's authenticated browser session
  (`SourceApiCheckPanel.tsx`, unchanged).
- No Environment Variable, schema, RLS, Cron, email/Resend, or
  auto-publish path touched anywhere.
- No `SCHEDULED_WRITES_ENABLED`-gated writer code touched — this
  sprint's change is entirely on the *manual*, admin-button-triggered
  path, structurally separate from the automated writer route.

## 5. Tests

- `npm run typecheck` → clean, 0 errors.
- `npm run lint` → clean, 0 warnings.
- `npm run build` → succeeds, all 30 routes compiled.
- Targeted Playwright run — `manualSourceCheckFetchRetry.spec.ts` (new,
  8 tests) + `scheduledSourceFetchRetry.spec.ts` (7, unaffected sibling
  policy) + `sourceCheck.spec.ts` (14, allowlist/proposal-building
  unaffected) + `adminApiRouteAuth.spec.ts` (5, confirms the refactored
  route still requires an admin session before ever calling `fetch`,
  and still returns 401 with zero fetch attempts when unauthenticated):
  **29 + 5 = 34/34 passed**, 0 failed.
- Full suite not re-run — no change to any other module, consistent with
  this session's own "only run tests justified by real changes" rule.

## 6. Local smoke test

Started `npm run dev` locally (background), confirmed clean boot
(`✓ Ready in 1467ms`, zero errors in the log) and `GET /` /
`GET /admin/sources` both return `200`. A full authenticated click-through
of the check button was not performed — the change is fully covered by
the retry-behavior unit tests above (which exercise the exact same code
path the button calls, via mocked `fetch`), and admin login requires
real Supabase credentials this session did not use for a purely
mechanical refactor. Dev server stopped afterward; port 3000 confirmed
free.

## 7. Risk assessment

**None to users, admin or public.** This is a backend reliability
refactor of an already admin-gated, already-manual, already-no-write
endpoint. Worst case if something were subtly wrong: the check button
would behave exactly as it did before this sprint (single attempt,
same messages) — the new code path only ever adds a second attempt on
failures that were already failures before.

## 8. Branch and commit

Created linearly from `main` (`343d4d5`):
```
git checkout main && git pull --ff-only origin main
git checkout -b sprint-167-manual-check-reliability-v1
```
This checkpoint, plus the three changed/added files, are committed and
pushed to this branch only. No merge to `main` performed.

## 9. What's left to close out this block

1. **Optional, separate future decision:** investigate
   `michalowice-wylaczenia-pradu` (or another checklist source) properly
   — read its actual markup, decide whether a new targeted parser pass
   is warranted, the same way Sprint 138/139 did for the two sources
   that already work. Not started this sprint; explicitly out of
   today's safe/same-day scope (§2).
2. **Candidate review UX polish** (bulk actions, quicker approve-to-draft)
   was considered but not started this sprint — the existing
   `SourceApiCheckPanel.tsx` flow (check → per-proposal duplicate
   warning → save → link to queue → log check history) is already
   reasonably convenient; no concrete gap was identified that would
   justify UI changes without a more specific ask.
3. Merge to `main` — awaiting Adam's separate, explicit approval, per
   this session's own standing rule.
