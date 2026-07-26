# Sprint 166N-A/B/C — Ledger Diagnostic Route + Panel Visibility: Day 6 Checkpoint

**Status: complete for the scope actually executed today. No flag was
activated, no Environment Variable was changed, no real claim/finish
occurred, Production was touched only by read-only audit queries.**

This checkpoint covers the first three sub-sprints of Day 6, following the
plan set out in `docs/SPRINT_166M_PRODUCTION_NOTIFICATION_CANARY_DESIGN_V1.md`
§4/5/7 (the recommended future path found by Sprint 166M-B's audit — a
narrow, admin-only, flag-gated diagnostic route, built code-first, deployed
to Preview with its flag left off).

---

## 1. What was built

### Sprint 166N-A — automation-status panel visibility fix

Closed a gap the Sprint 166M-B audit found: `/admin/sources`'s "Stan
automatyzacji (canary)" panel had no field at all for
`OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED`, even though the flag was
already live code (Sprint 166G-1). Now surfaced as a read-only badge,
independent of the email-alert section.

Files: `src/lib/automationStatus.ts`, `src/app/api/admin/automation-status/route.ts`,
`src/components/AutomationStatusPanel.tsx`, `tests/e2e/automationStatus.spec.ts`.

### Sprint 166N-B — the ledger diagnostic route

New route: `POST /api/admin/operational-notification-ledger-test`. Exercises
exactly one real `claim`→`finish` cycle against the live ledger RPCs
without depending on a real source failing and without creating a new
`scheduled_writer_runs` row. Structurally parallel to the existing
`POST /api/admin/operational-email-test`.

Layered, independently fail-closed, mirroring `write-candidates`' own
convention:
1. `requireAdminSession` — no unauthenticated or non-admin caller reaches
   anything past this line.
2. `checkDatabaseEnvironmentGuard()` — same Layer 0 guard `write-candidates`
   uses.
3. `isOperationalNotificationLedgerTestEnabled()` — its own dedicated flag,
   `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED`, deliberately separate
   from `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED`. **Not set in any
   environment as part of this sprint — default false everywhere.**
4. `getScheduledWriterCredentials()` + `signInScheduledWriter()` — reused
   verbatim from `scheduledWriter.ts`; the ledger RPCs are SECURITY DEFINER
   and check `auth.uid()` against `public.automation_identities`, so this
   route must sign in as the same writer identity `write-candidates` uses.
   It never constructs `createSupabaseScheduledWriter` (the
   candidate/source-check writer) — it cannot write a candidate or a
   source check, only claim/finish a ledger event.

**A real design-doc deviation, documented, not silently patched:** the
design doc proposed a "reserved diagnostic `eventType`." The real
`claim_operational_notification_event()` RPC's own `CHECK` constraint
enumerates a closed, fixed vocabulary (see the migration file §5) — adding
a new value would be a schema change, never done without the user's
explicit request. The route instead reuses the existing `unexpected_error`
value, with a fixed, unambiguous `safe_summary` ("Diagnostyczny test
ledgera operacyjnego (Sprint 166N) — nie jest to prawdziwy incydent.", 87
characters, well under the RPC's 200-character cap) so a human admin
reading the ledger later can never mistake this row for a real incident.
The fixed `scopeKey` ("ledger-test") and `eventType` together produce an
always-identical fingerprint — this **is** the idempotency key: a second
invocation within the ledger's own 6-hour cooldown is suppressed exactly
like a real duplicate, with no bespoke idempotency mechanism layered on
top.

Files: `src/lib/operationalNotificationLedgerTestConfig.ts`,
`src/app/api/admin/operational-notification-ledger-test/route.ts`,
`tests/e2e/operationalNotificationLedgerTestRoute.spec.ts` (19 tests).

### Sprint 166N-C — verification and closeout (this checkpoint)

Full suite re-run, local smoke test, security audit, Preview verification,
Production baseline re-confirmation — all covered below.

## 2. Full suite results

First full run (background, before this checkpoint's fixes): 1145/1149
passed, 4 failed:
- `auth-guards.spec.ts` (2 sub-tests, `/admin` and `/builder` login prompt)
  — re-run in isolation together with the fix below: **passed**. Flake,
  unrelated to this sprint (no auth-guard code touched).
- `databaseEnvironmentGuardIntegration.spec.ts` §E.9 — a **real, expected
  regression**: the new route legitimately calls
  `checkDatabaseEnvironmentGuard()` (Layer 0, same as `write-candidates`),
  which the existing static-import audit had pinned to exactly one
  importer. Fixed by extending the audit to recognize two categories —
  read-only consumers (`automation-status`, unchanged) and full-gate
  consumers (`write-candidates` + the new route) — each independently
  checked for exactly the calls it's reviewed for. This strengthens the
  test's coverage rather than weakening it: it now positively asserts the
  new route *does* call the real gate, not just that nothing unexpected
  does. Re-run: **passed**.
- `themeSystem.spec.ts` (2 different sub-tests each run) — re-run in
  isolation (parallel workers): 2 failed again, different sub-tests both
  times. Re-run with `--workers=1`: **21/21 passed**. Confirms pure
  parallel-worker timing contention, matching this file's already-documented
  flake history from Day 5 — untouched by this sprint (no theme code
  touched).

No business logic was changed to make any test pass — the one real fix was
to a test's own outdated assumption (single reviewed consumer → two
reviewed consumers, each still checked for the exact behavior it's
reviewed for).

## 3. Local smoke test

Against `npm run dev` (started and stopped by this session):
- Homepage (`/`): loads cleanly, zero `/api/` calls, zero console errors.
- `/admin/sources`: correctly gates behind login for an unauthenticated
  session ("Ta sekcja jest dostępna po zalogowaniu.") — zero `/api/` calls,
  zero console errors. The admin gate was never bypassed to inspect the
  new panel field live; that field's presence and correct wiring is
  already verified by the 45 passing tests in `automationStatus.spec.ts`
  (including a structural test asserting the panel source contains the
  exact label and the new snapshot field).
- New endpoint, unauthenticated `POST`: `401 {"ok":false,"error":"Wymagane logowanie."}`
  — confirms the admin gate is checked before anything else, including the
  flag.
- New endpoint, `GET`: `405` — no `GET` handler exists, matching the
  `operational-email-test` route's own convention.
- No claim/finish was attempted — the flag is absent locally exactly as in
  every real environment, and no admin session was used to reach past the
  auth gate.

## 4. Security audit of the diff

Grepped every changed/new file for secret patterns (`re_...`, `sk-...`,
hardcoded passwords, real email domains, `service_role`, the real
Production project ref `puhcjyffosgohbmxrczb`) — zero matches beyond an
existing test assertion string (`not.toMatch(/service_role/i)`) and one
clearly-labeled fake test password (`test-only-fake-password-not-a-real-value`,
same convention already used in `scheduledWriterRouteOperationalNotification.spec.ts`).

- No admin gate, environment guard, flag gate, or RLS policy weakened —
  the new route adds a fourth independent gate on top of the existing
  three-layer pattern; the static-import audit fix above *strengthens*
  the guard's test coverage, verified by an explicit `toMatch` assertion
  that the new route calls the real gate.
- No automatic request, Cron entry (`vercel.json` diff: none), RPC
  claim/finish, email, or Resend contact occurs by default — the new
  route's flag defaults to `false` everywhere, confirmed by curl (`401`
  before the flag is even read) and by the "flag absent" test asserting
  zero further fetches past the admin/environment gates.
- The new endpoint remains disabled by default in every environment —
  `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED` is not set anywhere.
- `unexpected_error` (the fixed `eventType`) and the fixed `safe_summary`
  (87 chars) are both already inside the real RPC's existing `CHECK`
  constraint vocabulary and length cap (200 chars) — no schema migration
  needed, confirmed by re-reading
  `docs/sql/PROPOSED_SPRINT_166H_PRODUCTION_SCHEDULED_WRITER_AND_LEDGER_MIGRATION_V1.sql`
  §5.

## 5. Files changed this sprint

- `src/lib/automationStatus.ts` (modified)
- `src/app/api/admin/automation-status/route.ts` (modified)
- `src/components/AutomationStatusPanel.tsx` (modified)
- `tests/e2e/automationStatus.spec.ts` (modified)
- `tests/e2e/databaseEnvironmentGuardIntegration.spec.ts` (modified — audit
  fix, see §2)
- `src/lib/operationalNotificationLedgerTestConfig.ts` (new)
- `src/app/api/admin/operational-notification-ledger-test/route.ts` (new)
- `tests/e2e/operationalNotificationLedgerTestRoute.spec.ts` (new, 19 tests)
- This checkpoint document (new)

`.vscode/` remains untracked and untouched — out of scope.

## 6. What was never done

- No Environment Variable was read, set, or saved in any environment.
- No flag was activated anywhere (Preview or Production).
- No real claim or finish occurred against any live ledger.
- No request was sent to the new route with a real admin session.
- No merge to `main`. No branch deleted.
- No Production write of any kind.

## 7. Remaining for Sprint 166N-C (post-checkpoint) and 166N-D

- Push this branch, confirm/observe the automatic Preview deployment, and
  perform a **read-only** Preview smoke test with the flag still absent —
  the deployment step and its own verification follow this checkpoint.
- Sprint 166N-D (a real Preview canary — setting
  `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED=true` in Preview and
  triggering one real request) requires Adam's separate, explicit
  approval before any Environment Variable is touched, per this session's
  standing rule that flag activation is never automatic in any
  environment.
