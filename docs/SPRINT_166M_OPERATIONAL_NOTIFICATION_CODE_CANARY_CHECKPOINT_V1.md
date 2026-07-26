# Sprint 166M — Operational Notification Code-Level Canary: Day 5 Checkpoint

**Status: complete for the scope actually executed today.** Per Adam's
explicit choice, Day 5 exercised the operational-notification ledger's
`claim`→`finish` cycle **at the code level only** (fakes/mocks, zero I/O).
No real Production canary ran. This checkpoint keeps that distinction
explicit throughout — see the six-way split in §1.

---

## 1. What happened vs. what did not

| Item | Status |
|---|---|
| Code-level `claim`→`finish` test (Sprint 166M-C) | **Done** — 19 new tests, all passing |
| Production read-only baseline audit (Sprint 166M-A) | **Done** — read-only, zero drift found before or after |
| Real Production notification canary (flag flip + live claim/finish) | **Not executed — deliberately deferred**, see §2 and the design doc |
| Existing pending candidate (`c1bae2b7-...`) | **Untouched** — still `status=pending`, unchanged `created_at` |
| Production `operational_notification_events`/`scheduled_writer_runs`/`source_notice_candidates`/`alerts`/`source_checks`/`automation_identities` counters | **Unchanged** from the Day-4 closing checkpoint |
| Production Environment Variables | **Unchanged** — none read, set, or saved this session |

## 2. Why no real Production canary ran

Sprint 166M-B's code audit (this session, before any code was written)
found that `write-candidates/route.ts` is the only call site in the whole
codebase for the ledger's `claim`/`finish` RPCs, and that path only ever
reaches `"notify"` for a **non-success** `RunOutcome`. The existing
pending candidate came from a `success` run and can never retroactively
trigger a notification. Exercising the real path would have required both
setting `SCHEDULED_WRITES_ENABLED=true` and creating a new
`scheduled_writer_runs` row — both explicitly forbidden in today's scope.
Adam chose to defer the real Production test and do the full simulation in
code instead (Solution 1). See
`docs/SPRINT_166M_PRODUCTION_NOTIFICATION_CANARY_DESIGN_V1.md` for the
full analysis and the recommended future path (a narrow, admin-only,
flag-gated diagnostic route — not built today).

## 3. Code-level claim→finish simulation — what was proven

New file: `tests/e2e/operationalNotificationFullCycleSimulation.spec.ts`
(19 tests, all passing). Every collaborator is either a real module from
`src/lib` (the orchestrator itself, `createNoopNotificationAdapter`,
`createConfiguredNotificationAdapter`, `decideNotificationAdapterKind`) or
an in-memory fake reproducing the **real, already-deployed** Postgres
RPC's documented semantics (partial-unique-index duplicate guard, fixed
6-hour cooldown, stale-claim self-healing) — see
`docs/sql/PROPOSED_SPRINT_166H_PRODUCTION_SCHEDULED_WRITER_AND_LEDGER_MIGRATION_V1.sql`
§5. No fetch is ever mocked or installed in this file — any accidental
real network attempt would fail the test outright.

Proven, with a passing test for each:

- A forced non-`success` outcome (`total_failure`) produces exactly one
  qualifying event → exactly one `claim` → exactly one `finish`, ending in
  a valid terminal state (`abandoned` with the real noop adapter, `sent`
  with a successful adapter, `failed` with a provider error) — never left
  `claimed`.
- A `success` outcome: zero claim, zero adapter call, zero finish (both in
  isolation and cross-checked against every `RunOutcome` value —
  `success`, `skipped_kill_switch`, `skipped_lock_held` never claim;
  `partial_failure`, `total_failure`, `abandoned` always attempt to).
- A second run for the same fingerprint (sequential or genuinely
  concurrent via `Promise.all`) never reprocesses the same event — the
  second/losing attempt makes zero adapter calls and zero finish calls.
- Process-restart safety: the orchestrator holds no module-level mutable
  state (asserted structurally via source inspection) — a "restarted"
  call using only a fresh local closure plus the same injected ledger
  behaves identically to a call from the original process, because all
  real state lives in the ledger (Postgres in production), never in
  application memory.
- Adapter failure handling: a thrown adapter error resolves cleanly via
  `attemptOperationalNotification` (never propagates), an explicit
  `send_failed` result finishes as `status=failed`, and a throwing
  `claim()` call is swallowed with zero adapter/finish calls.
- `OPERATIONAL_EMAIL_ALERTS_ENABLED=false` (or absent), proven through the
  **real** `notificationAdapterFactory`: `decideNotificationAdapterKind()`
  resolves `"noop"`, and a full orchestrated run against the real
  `createConfiguredNotificationAdapter()` output ends `status=abandoned`,
  `providerStatus=null`, `sentAt=null` — never `sent`. Same result when
  the flag is `true` but Resend credentials are absent (`"misconfigured"`).
- Structural checks: the orchestrator module never references `alerts`,
  `source_notice_candidates`, `createClient`, `new Resend`, or `supabase`
  anywhere in its source — it cannot touch alert publishing, candidate
  writes, or a real provider client no matter what is fed into it.

### A real finding — documented, not silently patched

One test initially failed with a wrong expectation, which led to a real,
useful finding: when an adapter throws mid-send, the real RPC's
stale-claim self-healing clears the "stuck open" bookkeeping on the next
`claim()` attempt for that fingerprint, but the fingerprint's 6-hour
`cooldown_until` (set at the *original* claim time, independent of
eventual status) still blocks reclaiming for the rest of that window. In
other words: **an adapter-level crash silently consumes a full 6-hour
dedup window with nothing ever having been sent.** This matches the
already-deployed Production SQL exactly and is not something this
code-only session changes — see the corrected test's own comment for the
full reasoning, and §5 of the design doc, which folds this into the
future canary route's risk analysis.

Per the day's own instruction ("don't change business rules just to make
a test pass"), the fix here was to the **test's wrong expectation**, not
to any `src/` file — this is documented as a residual, accepted risk, not
patched.

## 4. Production baseline — before and after (unchanged)

Read-only, via Supabase MCP, at both the start and the end of this
session:

| Table | Count | Match to Day-4 close |
|---|---|---|
| `scheduled_writer_runs` (total / open) | 1 / 0 | ✅ unchanged |
| `source_notice_candidates` | 3 | ✅ unchanged |
| `source_checks` | 2 | ✅ unchanged |
| `operational_notification_events` | 0 | ✅ unchanged |
| `alerts` | 6 | ✅ unchanged |
| `automation_identities` | 2 | ✅ unchanged |

The pending candidate `c1bae2b7-db1d-4718-9835-e34cd3542d3a`
(`created_at=2026-07-25 18:18:42 UTC`) is confirmed still `status=pending`
— exactly as Day 4 left it.

Also confirmed this session (read-only, `pg_proc`): all four Sprint 166H
RPC functions (`open_scheduled_writer_run`, `close_scheduled_writer_run`,
`claim_operational_notification_event`, `finish_operational_notification_event`)
exist in Production — the ledger mechanism is technically ready for a
future canary, it simply has no safe existing trigger path today (§2).

## 5. Test results

- New file: `tests/e2e/operationalNotificationFullCycleSimulation.spec.ts`
  — 19/19 passed.
- Targeted layer re-run (policy, orchestrator, ledger, adapter, factory,
  automation status, write-candidates route, notification input): 167/167
  passed.
- Full suite: 1125 tests. 1123 passed on the first run; the 2 failures
  (`auth-guards.spec.ts`, `themeSystem.spec.ts`) are both pre-existing,
  unrelated to this session's changes (auth/session-timing and a
  dark/light toggle animation respectively — neither test touches
  notification, ledger, or writer code). Re-run in isolation:
  `auth-guards.spec.ts` passed (flake); `themeSystem.spec.ts`'s one test
  passed on a subsequent isolated run, confirming pure timing flake, not a
  regression.
- `npm run typecheck`: zero errors.
- `npm run lint`: zero errors, zero warnings.
- `npm run build`: succeeded; all expected routes present, including
  `/api/cron/write-candidates` and `/api/admin/automation-status`, both
  unchanged.

## 6. Smoke test (local — no Preview deployment exists for this unpushed branch)

Run against `npm run dev` serving this exact branch's code (no Vercel
Preview deployment exists yet for an unpushed branch):

- Homepage (`/`): loads cleanly, zero `/api/` calls (only anon Supabase
  reads for alerts/waste already present before this session), zero
  console errors.
- `/admin/sources`: correctly gates behind login ("Ta sekcja jest dostępna
  po zalogowaniu.") for an unauthenticated session — zero `/api/` calls
  triggered before authentication, zero console errors. This also
  confirms, by construction, that nothing added this session introduces
  an unauthenticated call to `write-candidates` or any other API route.

## 7. Security audit of the diff

Two new files this session (plus the pre-existing, untouched `.vscode/`
which is out of scope and was not added):

- `tests/e2e/operationalNotificationFullCycleSimulation.spec.ts`
- `docs/SPRINT_166M_PRODUCTION_NOTIFICATION_CANARY_DESIGN_V1.md`

Both reviewed line by line while being written, then grepped for secret
patterns (`re_...`, `sk-...`, hardcoded passwords, real email domains,
`service_role`) — zero matches. Neither file touches an Environment
Variable, contacts Vercel, Supabase (beyond the read-only MCP audit
queries already logged above), or Resend. Zero real credentials, zero
real Production data, zero `CRON_SECRET` or writer credential value
anywhere.

## 8. Files and commits

- `tests/e2e/operationalNotificationFullCycleSimulation.spec.ts` (new)
- `docs/SPRINT_166M_PRODUCTION_NOTIFICATION_CANARY_DESIGN_V1.md` (new)
- `docs/SPRINT_166M_OPERATIONAL_NOTIFICATION_CODE_CANARY_CHECKPOINT_V1.md`
  (this file, new)
- Branch: `sprint-166m-operational-notification-canary-v1`, created
  linearly from `sprint-166l-production-foundation-v1`'s `3890d53`.
- No merge to `main`. No branch deleted.

## 9. Remaining risk

- The real Production ledger path is still unexercised live — only
  code-simulated. The design doc's recommended narrow diagnostic route is
  not built; doing so is its own future, separately-approved sprint.
- The adapter-crash-consumes-cooldown behavior (§3) is a real, accepted
  residual risk in the already-deployed ledger design — worth keeping in
  mind for the future canary route's own risk review (already folded into
  the design doc §3), not something this session changes.
- The existing pending candidate still awaits manual admin review, same
  as it has since Day 4.
- `SCHEDULED_WRITER_SOURCE_REGISTRY_IDS` remains unconfigured in
  Production (unchanged from Day 4, not part of today's scope).

## 10. Overall assessment

**Day 5's approved, narrowed scope (Solution 1 — code-level simulation
only) is fully complete.** The claim→finish cycle is now proven
end-to-end against real orchestrator/adapter-factory code with a
realistic ledger fake, a genuine gap in test coverage was found and
closed without touching business logic, and Production was touched only
by read-only audit queries throughout — zero drift in any counter, zero
flag change, zero candidate processed, zero email, zero Resend contact.
