# Sprint 166G-1 — Runtime Writer Ledger Integration, Off By Default

Design + audit sprint. Wires the existing (pure, previously-unwired)
operational notification ledger/policy/orchestrator layer into the real
`GET /api/cron/write-candidates` scheduled writer route, gated behind a new
server-only flag that defaults to **false**. No real claim/finish RPC call,
no real Resend call, and no Production/Preview database write happens as
part of building or testing this sprint — see Etap 9/10 for the audit and
test evidence.

## A — Runtime writer flow, as it exists before this sprint

### A.1 — Entry point

`GET /api/cron/write-candidates` (`src/app/api/cron/write-candidates/route.ts`)
is the single entry point. It is invoked either manually (with `CRON_SECRET`)
or, in the future, by Vercel Cron — no cron schedule is configured today.

### A.2 — Full flow, in order

1. **Layer 0** — `checkDatabaseEnvironmentGuard()`. No I/O. Fails closed with
   a generic 503 if the environment/database pairing isn't explicitly
   configured and matching.
2. **Layer 1+2** — `SCHEDULED_CHECKS_ENABLED` and `SCHEDULED_WRITES_ENABLED`
   both must be `"true"`. Neither is set today. 503 if not.
3. **Cron auth** — `checkCronAuth` against `CRON_SECRET`. 401/503 if not.
4. **Layer 3** — technical writer credentials must be configured AND sign-in
   must succeed (which itself requires `automation_identities` membership,
   enforced by RLS policy, not application code). 503 if either fails.
5. **Atomic run-open** — `history.openRun(runId, "manual", environmentTag)`,
   calling the `open_scheduled_writer_run` RPC (Sprint 166C, live in
   Preview only). `opened: false` (lock genuinely held, OR any unexpected
   error) → 503 `{ reason: "lock_held" }`, **no run row was ever created**,
   `closeRun` is never called for this attempt.
6. **Per-source fetch + write**, wrapped per-source in try/catch so one
   source's failure never takes down the batch. Each source's outcome is
   one of `success | no_proposals | fetch_error | timeout | write_error`.
7. **Aggregate outcome computed**: `success` (0 failed) |
   `total_failure` (all failed) | `partial_failure` (some failed). This is
   the **only** place the live route computes its own final `RunOutcome`.
8. **`history.closeRun(runId, ...)`** — closes the row with that outcome,
   counts, and a generic `errorSummary` (`"${sourcesFailed}/${sourcesChecked}
   sources failed"` or `null`) — never a raw error, URL, or stack trace.
   Failure to close is swallowed (`.catch(() => ({ ok: false }))`) — never
   allowed to fail the response.
9. **Response returned** — `NextResponse.json({ ok: true, ... })`.
10. **Top-level catch** (should not normally trigger — every per-source path
    already catches its own errors) — still closes the run, with outcome
    `"total_failure"`, `errorSummary: "unexpected_error"`, then returns a
    generic 500.

### A.3 — Every `RunOutcome` the type allows vs. what this route ever writes

`RunOutcome` (`scheduledWriterRunSafety.ts`) is a 6-value closed set:
`success | partial_failure | total_failure | skipped_kill_switch |
skipped_lock_held | abandoned`.

The live route today **only ever writes** `success`, `partial_failure`, or
`total_failure` via `closeRun`. It never writes `skipped_kill_switch` or
`skipped_lock_held` — every kill-switch/lock-held early return happens
**before** `openRun` is even attempted (steps 1–4 above, and step 5's own
`lock_held` early return), so there is no open row to close with those
outcomes. `abandoned` is never this route's *own* outcome either — it is
set by a **different** invocation's `open_scheduled_writer_run` call, as a
side effect of auto-closing a *previous, stale* open row for the same
scope (see `scheduledWriterRunSafety.ts`'s own doc comment). No code
anywhere currently reads back or acts on a row that was auto-abandoned.

### A.4 — Is there one finalization point, or several?

**One**, for the case that matters: `history.closeRun(...)` is called from
exactly two places in the file — the normal per-source-results path, and
the top-level catch. Both are the genuine, final point where this
invocation's own `RunOutcome` is known and persisted. Every *earlier*
return (environment guard, kill switches, auth, lock-held) is a case where
**no run was ever opened**, so there is structurally nothing to notify
about at the run level yet (the lock-held case is explicitly a suppression
case already — see §C below).

### A.5 — Data available at the finalization point

At both `closeRun` call sites, in scope: `environmentTag` (string, always
resolved, `"unknown"` fallback), `runId` (uuid, always present — generated
before `openRun`), the final `outcome` (`RunOutcome`), `sourcesChecked` /
`sourcesFailed` (counts), and (only in the normal path) the full
per-source `results` array with each source's own outcome/diagnostic.
`source_id` in the ledger sense (the registry UUID) is NOT a single value
at this point — the run covers a *set* of sources — so a run-level
notification event has no single `source_id`; it is `null` (see §D).

### A.6 — Can notification only happen after `close_scheduled_writer_run`?

Yes, and this sprint enforces exactly that: the integration call is placed
**after** `history.closeRun(...)` (or its `.catch()`) has already resolved
at both call sites. No notification attempt reads or writes the run
row itself — it is entirely independent I/O against a different table.

### A.7 — Can the integration change or mask the writer's own result?

No, structurally: the integration is a single `await` on a helper
(`attemptOperationalNotification`, §D.5) whose own promise **never
rejects** (internal try/catch swallows everything) and whose return value
(`void`) is never read by the route, never merged into the
`NextResponse.json(...)` payload. The writer's `outcome`, counts, and
response shape are all already fixed by the time this call happens.

### A.8 — How "alerting must never change the writer's result" is enforced

Three independent layers, each sufficient alone:
1. `attemptOperationalNotification` never throws (internal try/catch).
2. It is called with `void`/fire-and-continue semantics — its resolution
   is awaited (so the request doesn't return before all its own I/O is
   done, avoiding a dangling-promise warning on Vercel) but its result is
   discarded.
3. It runs strictly after the response payload's own values (`outcome`,
   counts, `results`) are already computed and closed — nothing it does
   can retroactively change a value already read into the response object.

### A.9 — Files reviewed for this audit

`scheduledSourceFetch.ts`, `automationErrorClassifier.ts`,
`operationalNotificationPolicy.ts`, `operationalNotificationLedger.ts`,
`operationalNotificationOrchestrator.ts`, `notificationAdapter.ts`,
`notificationAdapterFactory.ts`, `resendNotificationAdapter.ts`,
`emailAlertConfig.ts`, `automationStatus.ts`, `runHistoryStatus.ts`,
`scheduledWriterRunSafety.ts`, `scheduledWriterHistory.ts`,
`scheduledWriter.ts`, `databaseEnvironmentGuard.ts`,
`src/app/api/cron/write-candidates/route.ts`,
`src/app/api/cron/check-sources/route.ts` (dry-run counterpart, confirmed
untouched by this sprint), and the existing test suites for all of the
above.

## B — Recommended integration point

**After `history.closeRun(...)` resolves, at both of the route's two
`closeRun` call sites, using the run's own aggregate `RunOutcome`.**

Rejected alternative: per-source notification (one evaluation per source,
using `categoryFromSourceOutcome`). This would multiply claim attempts per
invocation (up to N per run, one per source) and requires deciding a
per-source `source_id`/fingerprint scope — a legitimate future extension,
but out of scope for "smallest possible change" (Etap 7) and for "one
orchestration attempt per run for the same scope" (Etap 4.10). This
sprint evaluates **exactly one** run-level scope (`scopeKey = "run"`) per
invocation. A future Sprint 166G-2 could add per-source evaluation as a
separate, additive change without touching this sprint's run-level path.

Consequence of this scope choice: `categoryFromRunOutcome` only ever
produces `none | unexpected_error | kill_switch_disabled | lock_held` at
the run level (it never produces `transient_fetch`, `permanent_fetch`,
`write_error`, `credentials_not_configured`, or
`environment_guard_blocked` — those are per-source-only categories in this
codebase). In practice, this means a `partial_failure` or `total_failure`
run notifies once as `unexpected_error`, and a `success` run is always
suppressed. This is a real, documented narrowing — not a gap — because the
next sprint can add per-source detail additively.

## C — Runtime flag decision

No existing server-side flag can safely gate *ledger persistence* on its
own. `OPERATIONAL_EMAIL_ALERTS_ENABLED` (existing, `emailAlertConfig.ts`)
only ever gates whether `createConfiguredNotificationAdapter()` returns a
real Resend adapter vs. a no-op — using it to *also* gate whether
`claim()`/`finish()` run would conflate "should we persist a claimed
event" with "should we send an email," which are genuinely different
questions (an admin may want the ledger recording events, e.g. for the
admin panel, without emailing anyone).

**New flag**: `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED`
(`src/lib/operationalNotificationRuntimeConfig.ts`).

- Never `NEXT_PUBLIC_*`.
- Exact-string-match parser: `flagValue === "true"`, nothing else —
  identical convention to `isWriteModeEnabled`/`isScheduledChecksEnabled`/
  `isEmailAlertsEnabled`. Absent, empty, or any other value → `false`.
- Not set in Vercel by this sprint, in any environment.
- Independent from `OPERATIONAL_EMAIL_ALERTS_ENABLED`: with the runtime
  flag `true` but the email flag `false`, the ledger still claims/finishes
  events, but `createConfiguredNotificationAdapter()` returns the no-op
  adapter, so `finish` always closes with `status: "abandoned"` (never
  `"sent"`) — a real, auditable "we would have notified, but sending is
  off" trail, without ever emailing anyone.

## D — Integration shape (as implemented)

1. `src/lib/operationalNotificationRuntimeConfig.ts` (new) —
   `isOperationalNotificationRuntimeEnabled(flagValue)`.
2. `src/lib/operationalNotificationLedgerSupabase.ts` (new) — the first
   real, RPC-backed `OperationalNotificationLedger` implementation, mirrors
   `scheduledWriterHistory.ts`'s `createSupabaseScheduledWriterHistory`
   exactly: `.rpc()` only, never `.from(table)`, never a service_role
   client, never logs its input or the raw RPC error. `claim()` throws a
   generic `Error` (no detail) on any RPC-level error or missing row —
   this is the "fail_closed" realization for this interface (mirrors this
   codebase's existing convention, see design doc history in
   `SPRINT_166F_OPERATIONAL_ALERT_LEDGER_AUDIT_AND_DESIGN_V1.md` §H.6) —
   never silently reinterpreted as `suppress_duplicate`. `finish()` returns
   `{ ok: false }` on an RPC-level error (mirrors `closeRun`'s own
   convention) — a genuine network-level throw from the client still
   propagates naturally, uncaught here.
3. `src/lib/scheduledWriterNotificationInput.ts` (new) — two small pure
   functions: `buildRunLevelNotificationCategoryInput(outcome)` (composes
   the already-existing `categoryFromRunOutcome` + `isAbandonedRunOutcome`
   so the abandoned/lock-held distinction is never lost) and
   `buildRunLevelSafeSummary({ eventType, sourcesFailed, sourcesChecked })`
   (closed-vocabulary label + counts only, capped at
   `SAFE_SUMMARY_MAX_LENGTH`, no raw error/URL/stack ever passed in).
4. `src/lib/operationalNotificationOrchestrator.ts` (extended) — two new
   exported functions:
   - `orchestrateRunLevelNotification(ledger, adapter, input)` — the full
     evaluate → claim → send → finish composition for one run-level scope.
     Can throw (propagates any collaborator's error) — deliberately not
     itself responsible for the "never affects the writer" guarantee.
   - `attemptOperationalNotification(ledger, adapter, input)` — the
     function actually wired into the route: wraps the call above in its
     own try/catch, swallowing everything, returning `void` always. This
     is the actual "alerting can never break the writer" boundary,
     independently testable without touching the route or any network.
5. `src/app/api/cron/write-candidates/route.ts` (smallest possible edit) —
   after each of the two `closeRun` call sites, if
   `isOperationalNotificationRuntimeEnabled(process.env
   .OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED)`, construct the real ledger
   (reusing the already-signed-in writer client — the same identity the
   ledger RPCs check against `automation_identities`, so no second sign-in
   is needed) and the configured adapter, then `await
   attemptOperationalNotification(...)`. At flag `false` (the default),
   this whole block is skipped entirely — zero env reads beyond the one
   flag check, zero ledger construction, zero claim, zero finish, zero
   adapter call, zero new database query.

## E — Guarantees, restated for the checkpoint

- **Flag off → zero I/O**: the flag check is the very first line of the
  new integration block; everything else is inside that `if`.
- **Policy suppress → zero claim**: `orchestrateRunLevelNotification`
  returns immediately after `evaluateNotificationEligibility` if the
  decision isn't `"notify"`.
- **Claim suppressed (duplicate/cooldown) → zero adapter, zero finish**:
  returns immediately after `claimEventForSending` if `!claimed`.
- **Adapter disabled/misconfigured → honest `finish` status**: already
  guaranteed by the existing, unmodified `mapSendResultToFinish` (maps
  `disabled`/`no_adapter_configured` to `"abandoned"`, never `"sent"`).
- **Any collaborator throws → writer response unaffected**:
  `attemptOperationalNotification`'s try/catch, tested directly with fakes
  that throw at each of the three steps.
- **One orchestration attempt per run per scope**: the route calls
  `attemptOperationalNotification` at most once per invocation (the two
  call sites are mutually exclusive — normal path vs. top-level catch —
  never both in the same request).
