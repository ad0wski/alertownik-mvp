# Sprint 171 — Source Health & Observability (Plan Day 4)

**Status: implemented, tested. Not merged to `main`, not deployed.**

Follow-up to the source-expansion phase (Sprints 168–170, closed with 4
active sources). This sprint audits `/admin/sources`'s existing source
health/observability surface against the plan's Day 4 goals, and adds the
one thing genuinely missing that's achievable without a database
migration.

---

## 1. Audit — what already existed before this sprint

Read in full before any code change: `src/lib/sourceHealth.ts`,
`src/lib/sourceCheck.ts`, `src/lib/officialSourceChecklist.ts`,
`src/components/SourceHealthDashboard.tsx`,
`src/components/OfficialSourceChecklist.tsx`,
`src/components/SourceApiCheckPanel.tsx`, `src/app/admin/sources/page.tsx`,
`src/types/alertSource.ts` (the `source_checks`/`SourceCheck` shape),
`tests/e2e/sourceHealth.spec.ts`, `tests/e2e/sourceCheck.spec.ts`.

Mapped against every item in this sprint's brief:

| Requirement | Status before this sprint |
|---|---|
| Ostatnia próba sprawdzenia źródła | Exists (`lastCheckAt`), but only reflects **logged** checks — a failed attempt is never persisted at all (see §2). |
| Ostatnie poprawne sprawdzenie | De facto identical to `lastCheckAt` today, since only successful/logged checks ever get a `source_checks` row. |
| Wynik ostatniego checku | Exists (`lastCheckResult`, from `source_checks.result`). |
| Liczba kolejnych błędów | **Did not exist.** No schema support (see §2). |
| Ostatni komunikat błędu | **Did not exist in the Source Health view.** Existed only ephemerally inside `SourceApiCheckPanel`'s own local React state (`check.error`) and separately in `SourceCard`'s fetch-preview flow (`previewError`) — never surfaced on the health dashboard, never shared across components, gone on reload. |
| Status wspierania źródła przez aplikację | Exists (`apiSupported`, derived from `SAFE_CHECK_SOURCE_IDS`). |
| Możliwość ręcznego sprawdzenia | Exists — drives whether `<SourceApiCheckPanel>` renders on a checklist card. |
| Dynamiczna liczba aktywnych źródeł | Exists and already correct — `summarizeSourceHealth().apiSupported` and `HEALTH_API_SUPPORT_NOTE` are both derived from `SAFE_CHECK_SOURCE_IDS.length` (fixed in the Sprint 168H hotfix after a hardcoded count went stale). |
| Odróżnienie zdrowe / ostrzeżenie / błąd / brak danych | **Partially exists.** `SourceHealthStatus` = `checked_recently` (zdrowe) / `stale` (ostrzeżenie) / `never_checked` (brak danych, actionable) / `unregistered` (brak danych, structural). There is **no persisted "błąd" bucket** — correctly so, since the schema cannot support it (see §2); inventing one from indirect signals (e.g. "hasn't been checked in a while → probably broken") would be a false claim, not an honest one. |

**Conclusion:** most of the brief's asks were already implemented,
correctly, and fail-closed (`never_checked`/`unregistered` never render as
"zdrowe" — confirmed in `SourceHealthDashboard.tsx`'s `statusBadgeClass`
and `HEALTH_STATUS_LABELS`). The one substantive, real gap — "czy ostatni
check się nie powiódł" and "jaka była bezpieczna, skrócona przyczyna
błędu" not being visible on the Source Health dashboard at all — is what
this sprint implements. Per the brief's own instruction ("Nie przebudowuj
rzeczy, które już działają"), nothing else was touched.

## 2. The exact schema gap (per item 18 — documented, no SQL run)

`SourceCheckResult` (`src/types/alertSource.ts`) is a closed union:
`"no_changes" | "found_notice" | "alert_created" | "needs_followup"`.
**There is no failure/error value.** `source_checks` has no column for an
error message either. This was already an intentionally, explicitly
documented gap before this sprint — `HEALTH_ERROR_FALLBACK_NOTE`
(`sourceHealth.ts`, Sprint 137) already tells the admin exactly this:
*"Błędy pobierania (np. timeout, HTTP 403) nie są zapisywane w bazie —
widać je tylko w chwili sprawdzenia. Trwały zapis błędów wymagałby zmiany
schematu i jest świadomie odłożony na sprint przygotowujący cron."*

**This sprint does not close that gap** — no migration, no `ALTER TABLE`,
no new `source_checks` column, exactly per the brief's constraint. Closing
it for real would need at minimum: a new `SourceCheckResult` value (or a
separate `success: boolean` column) plus an `error_message` column, and a
decision about retention. That's real future schema work, not something
to slip in as a side effect of an observability sprint.

## 3. What this sprint adds (no migration, existing data + config only)

A **session-only** (never persisted, resets on page reload) outcome per
source, surfaced directly on its Source Health row — closing the "not
visible where the admin is actually looking" gap without touching the
database at all:

- **`src/lib/sourceHealth.ts`** — new `SessionCheckOutcome` type,
  `nextSessionCheckOutcome()` (pure folding function: increments a
  consecutive-failure counter on failure, resets it to 0 on success), and
  `describeSessionCheckOutcome()` (pure formatter — returns `null` with no
  outcome yet, so the UI renders nothing extra rather than a false
  "healthy" claim; per item 16 of the brief).
- **`src/components/SourceApiCheckPanel.tsx`** — after every manual check
  (success or failure), calls a new optional `onCheckOutcome` prop with
  `{ ok, message, at }`. `message` is always the same already-curated,
  safe Polish string the panel already displayed to the admin (from
  `data.error` — itself always hand-composed in
  `manualSourceCheckFetch.ts`, never `err.message`/`err.stack` — or the
  panel's own existing generic connection-failure copy). No new error
  text was invented; this only *forwards* what already existed.
  `onCheckOutcome` is optional so nothing changes for any test or caller
  that doesn't pass it.
- **`src/components/OfficialSourceChecklist.tsx`** — threads
  `onCheckOutcome` through to each `SourceApiCheckPanel`, tagging the
  outcome with the checklist id.
- **`src/app/admin/sources/page.tsx`** — new `sessionCheckOutcomes` state
  (`Record<string, SessionCheckOutcome>`), updated via
  `nextSessionCheckOutcome`, passed to both `OfficialSourceChecklist`
  (to receive outcomes) and `SourceHealthDashboard` (to display them).
- **`src/components/SourceHealthDashboard.tsx`** — renders
  `describeSessionCheckOutcome(sessionCheckOutcomes?.[row.checklistId])`
  inline on the matching row when non-null, styled red for a failure and
  green for a success, always including the literal phrase "niezapisane w
  historii, znika po odświeżeniu strony" so the ephemeral, non-persisted
  nature is never ambiguous to the admin reading it.

### What this explicitly is NOT

Not history. Not cross-session. Not cross-admin. Not a replacement for
`HEALTH_ERROR_FALLBACK_NOTE`'s existing honest disclosure (which stays,
unchanged, describing the DB-level gap). If the admin closes the tab and
comes back, every session outcome is gone — exactly like every other
ephemeral UI state already in this admin area (source preview, inline AI
draft, etc.). This is a deliberate, honest scope boundary, not an
oversight.

## 4. Fail-closed and safety guarantees (items 16–17)

- **No data ⇒ neutral, never "healthy".** `describeSessionCheckOutcome`
  returns `null` when there's no session outcome yet; the dashboard row
  then shows nothing extra — the existing, already-fail-closed
  `SourceHealthStatus` badge remains the sole authority on persisted
  status. Test: *"no outcome yet this session → null (never a false
  healthy claim)"*.
- **No secrets, no tokens, no stack traces.** `message` is typed `string`,
  not `Error | unknown` — there is no code path through which a raw
  exception object could reach this display layer. Every message that
  actually flows through it is one of the small, fixed set of hand-written
  Polish strings already reviewed in Sprint 167/168's own security audits
  (`manualSourceCheckFetch.ts`'s `describePageFetchFailure`, the
  timeout/network-error copy, `isWordpressRestPostArray`'s
  parse-exception copy). Test: *"never leaks anything resembling a stack
  trace or secret"* — a regex assertion against stack-trace/token/API-key
  patterns.
- **Safe summary + timestamp only.** `describeSessionCheckOutcome` outputs
  exactly: ok/error, the curated message, a local `HH:MM` time
  (`Europe/Warsaw`), and — on repeated failures — a plain consecutive
  count. Nothing else.

## 5. Test coverage

`tests/e2e/sessionCheckOutcome.spec.ts` (11 tests):

- `nextSessionCheckOutcome`: first success → 0 failures; first failure →
  1; repeated failures increment (tested to 3); a success resets the
  streak to 0; a failure right after a success starts a fresh streak of 1
  (doesn't carry over the prior run's count).
- `describeSessionCheckOutcome`: no outcome → `null`; healthy outcome
  mentions "powodzenie" + the never-persisted disclaimer; a single failure
  shows the safe message and time with no streak suffix; a failure with
  `consecutiveFailures: 3` mentions "3 razy z rzędu w tej sesji"; a
  failure with no message falls back to an honest generic label, never
  blank; a curated message is never mixed with anything resembling a
  stack trace, file path, or bearer/API-key-shaped token.

Existing coverage this sprint relied on without duplicating:
`tests/e2e/sourceHealth.spec.ts` already covers "zdrowe źródło"
(`checked_recently`), "brak historii checków" (`never_checked`/
`unregistered`), and "dynamiczna liczba źródeł" (the 168H-added dynamic
`SAFE_CHECK_SOURCE_IDS.length` test) — re-run this sprint, still green,
not modified.

Full targeted run this sprint: `sourceHealth.spec.ts`, `sourceCheck.spec.ts`,
`sessionCheckOutcome.spec.ts`, `wordpressRestParser.spec.ts`,
`pruszkowRestParser.spec.ts`, `manualSourceCheckFetchRetry.spec.ts`,
`manualSourceCheckWordpressRest.spec.ts`, `manualSourceCheckPruszkowRest.spec.ts`,
`adminApiRouteAuth.spec.ts` — **99/99 passed.**

`npm run typecheck`, `npm run lint`, `npm run build` — all clean, zero
errors/warnings.

## 6. Admin panel rendering — verification and its limits

This codebase has no existing convention for automated, authenticated
Playwright rendering tests of `/admin/*` pages (confirmed by auditing
every `page.goto(...)` test in `tests/e2e/` — all of them cover
*unauthenticated* behavior, e.g. `auth-guards.spec.ts`'s login-prompt
checks, never a signed-in admin session). Building that harness from
scratch was judged out of scope for this sprint ("nie przebudowuj rzeczy,
które już działają") — every prior sprint this session verified admin-page
rendering via a manual, read-only smoke test instead, and this sprint
follows the same convention:

- `npm run build` succeeded, which fully type-checks and compiles every
  new/changed JSX prop and render path across all four touched
  components — a prop mismatch, undefined-callback crash, or invalid JSX
  would fail here.
- Local dev server: `/admin/sources` returns `200` and correctly shows the
  unauthenticated login prompt with zero console errors (no local admin
  session available to this agent).
- **What was deliberately NOT done this turn:** actually clicking
  "Sprawdź teraz przez aplikację" to watch the new session-outcome banner
  appear live. This sprint's own constraints forbid a manual source check
  against Production, and this agent has no local admin credentials to
  exercise it pre-merge either. The banner's exact text and styling are
  therefore verified by code review + the 11 unit tests of the pure
  functions that produce its content, not by an eyes-on browser click.
  **Recommended first action after this branch merges and deploys:**
  Adam clicks the check button once on a real source in Production to
  visually confirm the banner renders as designed — this is the one
  verification step this sprint could not complete itself, disclosed
  honestly rather than skipped silently.

## 7. Risks and limitations

- The session-only outcome is lost on page reload — by design, but worth
  restating: an admin who checks a source, sees a failure, then reloads
  the page before acting on it, loses that signal entirely (same as
  today, since it was never visible outside the one panel before this
  sprint either — this sprint makes it *more* visible, not less durable).
- "Liczba kolejnych błędów" is now meaningfully answerable, but only
  within one continuous browser session — it is not the same guarantee a
  persisted counter would give (e.g. it can't tell you "this source has
  failed its last 5 checks over the past week").
- No schema change was made. The real gap (persisted failure/error
  tracking) remains exactly as documented in §2, for a future sprint that
  explicitly budgets a migration.

## 8. What this session did NOT do

No Environment Variable was changed. No Production SQL was run, no
migration was created or applied. No cron was touched. No writer identity
was touched. No email/Resend was touched. No alert was auto-published. No
manual source check was run against Production. No merge to `main` was
performed.

## 9. Branch

`sprint-171-source-health-observability-v1`, branched from `main` at
`1df4f96`. Not merged to `main`.
