# Sprint 166M-D — Production Operational-Notification Canary: Design Only

**Status: design/plan only. Nothing in this document has been executed.**
No SQL, no Environment Variable, no Production request, no code path new
to `src/` was run or created as part of producing this document. See §10.

This document exists because Sprint 166M-B's code audit found that the
scope originally requested for Day 5 — "process the existing pending
candidate through the operational notification ledger" — has **no safe
existing path** in Production today. This document explains why, and lays
out the actual future path, for a later, separately-approved sprint.

---

## 1. Why the existing pending candidate cannot be processed today

The one `source_notice_candidates` row created on Day 4
(`c1bae2b7-...`, `status=pending`) came from a `scheduled_writer_runs` row
whose outcome was **`success`**. `attemptOperationalNotification()` is
called exactly once, synchronously, inline at the moment
`GET /api/cron/write-candidates` closes that specific run (see
`src/app/api/cron/write-candidates/route.ts`'s two `history.closeRun()`
call sites) — it is never re-invoked later, on a schedule, or against a
historical row. There is no "replay" or "re-evaluate this past run"
function anywhere in the codebase.

Even if such a replay function existed, `decideNotificationCategory()`
(`src/lib/operationalNotificationPolicy.ts`) maps a `success`-derived
category (`"none"`) unconditionally to `"suppress_success"` — never
`"notify"`. This is intentional policy (a successful run is never an
operational alert), not a gap: `operationalNotificationOrchestrator.ts`'s
own file header calls this "the ONE decision the policy layer must never
be talked out of."

**Conclusion: the existing pending candidate structurally can never
produce a ledger event, under the current design, no matter what
Environment Variables are set.**

## 2. Why the only real path requires a brand-new `scheduled_writer_run`

`attemptOperationalNotification` is called from exactly one place in the
whole codebase (verified by `grep -rn "attemptOperationalNotification\|ledger\.claim\|createSupabaseOperationalNotificationLedger" src/`):
`write-candidates/route.ts`. No other route — including the existing,
Preview-only `POST /api/admin/operational-email-test` — touches the
ledger at all; that route sends a real email directly via Resend and
bypasses `claim`/`finish` entirely, and it 403s outside `VERCEL_ENV ===
"preview"`, so it is not usable in Production regardless.

To reach `claim`/`finish` for real, a run must (a) actually execute — which
requires Layer 1 (`SCHEDULED_CHECKS_ENABLED`) **and** Layer 2
(`SCHEDULED_WRITES_ENABLED`) both `"true"` — and (b) end in a **non-success**
`RunOutcome` (`partial_failure`, `total_failure`, or `abandoned` — see
`buildRunLevelNotificationCategoryInput` in
`src/lib/scheduledWriterNotificationInput.ts`), since only those categories
decide `"notify"`.

## 3. Risks of deliberately forcing a source failure in Production

- **Blast radius beyond the test's intent.** The only way to force a
  non-success outcome against the real allowlisted source
  (`michalowice-komunikaty`) is to make its live fetch fail — e.g. by
  temporarily pointing `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS` at a URL that
  404s, or by relying on the source's own real transient unavailability
  (unpredictable, not schedulable). Either way, the test's timing and
  outcome are not fully under Claude's or Adam's control once the request
  is sent.
- **A second `scheduled_writer_runs` row is created no matter what.** Day
  4's own closing checklist treats "no additional run" as a thing to STOP
  and re-confirm before doing — a forced-failure test unavoidably adds one.
- **The cooldown-consumption risk found in Sprint 166M-C's testing
  (§5 below) applies live.** If the real adapter (still `noop` at this
  point, since `OPERATIONAL_EMAIL_ALERTS_ENABLED` stays false) or the
  ledger RPC itself throws mid-cycle for any unexpected reason, the
  fingerprint's 6-hour cooldown window is silently consumed with nothing
  ever having been sent or fully recorded — self-healing clears the
  "stuck open" bookkeeping on the next claim attempt, but does not restore
  alerting capability within that window. Low probability, but the
  consequence (a real future incident going unnotified during the window)
  is exactly the kind of risk this project treats conservatively.
- **Toggling `SCHEDULED_WRITES_ENABLED` on Production is not a free
  action.** Every prior sprint in this project has treated it as a
  narrowly-scoped, separately-approved action requiring a Redeploy and a
  read-only smoke test on both sides — not something to fold into a
  notification-focused test as a side effect.

## 4/5. Recommended future path — a narrow, admin-only, audited canary endpoint

Rather than repeatedly forcing a real source failure, the safest future
design is a **new, dedicated, admin-session-gated diagnostic route** —
structurally parallel to the existing
`POST /api/admin/operational-email-test`, but exercising the ledger
instead of Resend directly. Proposed shape (design only — not created
today):

`POST /api/admin/operational-notification-ledger-test`

Required properties, all mandatory for approval, mirroring
`operational-email-test`'s own already-accepted safety shape:

1. **Admin-session-gated** — `requireAdminSession()`, identical to every
   other `/api/admin/*` route. No unauthenticated caller can ever reach it.
2. **Processes exactly one synthetic, hardcoded event** — never a
   caller-supplied `eventType`, `sourceId`, or free-text summary. The
   route itself picks a single fixed, clearly-labeled synthetic
   `eventType` (e.g. a value reserved specifically for this diagnostic,
   never one of the real production event types like `permanent_fetch`
   or `abandoned_run` — so a real admin reading the ledger later can
   never mistake a canary row for a real incident).
3. **Environment-guarded** — reuses `checkDatabaseEnvironmentGuard()`
   exactly like `write-candidates` does, so it can never run against a
   database it wasn't explicitly paired with.
4. **Gated by its own dedicated flag**, off by default —
   e.g. `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED` — deliberately
   separate from `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED` (the real
   runtime flag) so enabling one can never accidentally enable the other.
5. **Structurally cannot publish an alert or create a candidate** — never
   imports `writeCandidatesForSource`, `fetchAndParseProposals`, or any
   Builder/alert-write helper, matching `write-candidates`' own existing
   "never imports any alert-publishing helper" guarantee (enforced today
   by a static-import test — the new route would get an equivalent test).
6. **Structurally cannot send a real email** — always constructs the
   adapter via `createConfiguredNotificationAdapter()`, so it inherits
   the exact same `OPERATIONAL_EMAIL_ALERTS_ENABLED` gate as the real
   runtime path; running this diagnostic never bypasses that gate.
7. **Idempotency key** — the route builds a fixed, deterministic
   fingerprint scope (e.g.
   `${environmentTag}:ledger-test:diagnostic_canary`) so a second
   invocation within the cooldown window is suppressed exactly like a
   real duplicate, proving the dedup path works rather than merely
   asserting it does.
8. **Hard limit of one execution per approval** — same one-shot-script
   discipline already used for every `write-candidates` Production test
   in this project: Adam runs it once, from a prepared request, no retry
   without a fresh approval.
9. **Full audit trail** — the route's JSON response reports only
   closed-vocabulary status strings (never a raw error, stack trace, or
   ledger row content) — matching `operational-email-test`'s own response
   shape exactly — and the resulting `operational_notification_events`
   row is inspected read-only afterward, exactly like every other
   Production verification in this project.
10. **Rollback** — delete/disable the dedicated flag; no other state needs
    reverting since the route never touches `alerts`,
    `source_notice_candidates`, or Resend.

This design produces exactly one real `claim`→`finish` cycle against the
live Production ledger RPCs, with zero dependency on a real source
failing, zero new `scheduled_writer_runs` row, and zero risk to the
existing pending candidate or any other data.

## 6. Alternative: a controlled failing `write-candidates` run — why it's less safe

This is FAZA E from `SPRINT_166H_PRODUCTION_ROLLOUT_RUNBOOK_V1.md`, still
valid as a fallback. Compared to §4/5 above, it is less safe because:

- It requires `SCHEDULED_WRITES_ENABLED=true`, a second live-flag change
  beyond `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED`, widening the blast
  radius of the test.
- It creates a real, permanent `scheduled_writer_runs` row and depends on
  successfully forcing the real allowlisted source to fail on demand —
  timing and exact failure category are not fully controllable.
- It cannot be idempotency-key-protected the same way — a retry after an
  ambiguous result means either a second real run or an unresolved
  question about whether the first one actually completed.
- It is harder to clearly label as "this row is a deliberate test" in the
  run-history UI, since it reuses the exact same code path and event types
  as a real incident.

It remains available as a fallback only if §4/5's dedicated route is,
after review, judged not worth building for a one-time canary.

## 7. Future implementation plan — Preview, then Production

1. **Preview:** implement the route from §4/5 behind
   `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED`, write its own static-import
   and route-level tests (mirroring `scheduledWriterRouteOperationalNotification.spec.ts`'s
   existing pattern), exercise it once against the Preview database (which
   already has the Sprint 166F ledger migration live), confirm exactly one
   `claim`→`finish` cycle and zero side effects.
2. **Code review / merge to `main`** as its own PR, reviewed independently
   of any Production activation.
3. **Production activation, its own separately-approved sprint:** set
   `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED=true` in Production only,
   redeploy, run the route exactly once via an authenticated admin-session
   request (browser, not a script — no `CRON_SECRET` needed since this is
   admin-session-gated, not cron-gated), verify the resulting ledger row
   read-only, then immediately set the flag back to `false` and redeploy.
4. **Observation:** no standing activation — this stays a one-shot
   diagnostic tool, disabled by default, forever, unless a future sprint
   makes a separate case for something more persistent (e.g. a
   `/admin/sources` "test the alert pipe" button — explicitly out of scope
   here).

## 8. Separate approvals this future path would require

- Building the new route and its tests (a normal code-review-scoped
  approval, no live-system risk).
- Merging it to `main`.
- Setting `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED=true` in
  Production (a real Environment Variable change, same ritual as every
  prior flag: Claude types, Adam saves, Claude verifies read-only).
- The single Redeploy to activate it.
- The one approved request against it.
- Setting the flag back to `false` and the confirming Redeploy.

Each of these is its own gate — approval of one is not approval of the
next, matching this project's standing convention.

## 9. PASS / STOP / rollback criteria for that future test

**PASS:** exactly one new `operational_notification_events` row, using the
reserved diagnostic `eventType`; status ends `abandoned` (adapter stays
`noop` — `OPERATIONAL_EMAIL_ALERTS_ENABLED` stays false throughout); zero
new `scheduled_writer_runs` row; zero new `source_notice_candidates` row;
zero change to `alerts`; a second invocation within the cooldown window is
suppressed (`suppress_cooldown` or `suppress_duplicate`), proving the
idempotency key works.

**STOP:** any status other than `abandoned` while
`OPERATIONAL_EMAIL_ALERTS_ENABLED` is false (would indicate the adapter
factory is miswired); any row in `alerts` or `source_notice_candidates`;
any HTTP error the admin session doesn't expect; any sign the request
reached Resend (only possible if `OPERATIONAL_EMAIL_ALERTS_ENABLED` was
unexpectedly true — treat as an incident, not a retry situation).

**Rollback:** delete/set `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED=false`
in Production immediately after the result is recorded, redeploy, confirm
via a read-only check that the route now 404s or fails closed.

## 10. What has NOT been done today

As of this document's creation (Sprint 166M-D, same session as 166M-C):

- No new endpoint exists in `src/`. `POST /api/admin/operational-notification-ledger-test`
  is a proposal only, not a file.
- No Environment Variable was changed in Preview or Production.
- No request was sent to Production or Preview `write-candidates`,
  `operational-email-test`, or any diagnostic route (none exists).
- The existing pending candidate (`c1bae2b7-...`) remains untouched.
- No SQL was executed beyond the read-only baseline audit already recorded
  in `SPRINT_166M_OPERATIONAL_NOTIFICATION_CODE_CANARY_CHECKPOINT_V1.md`.
- This document is planning material only, per the Sprint 166M-D
  instructions that produced it.
