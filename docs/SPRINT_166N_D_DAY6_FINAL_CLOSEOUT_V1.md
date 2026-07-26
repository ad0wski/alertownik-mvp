# Sprint 166N-D / Day 6 — Final Closeout

**Status: Day 6 closed in its approved, safe scope. No real Preview
claim→finish was performed. No Environment Variable was changed. No
Production write of any kind occurred.**

This document is the authoritative closeout of Day 6. It supersedes
nothing in `SPRINT_166N_LEDGER_TEST_ROUTE_AND_PANEL_VISIBILITY_CHECKPOINT_V1.md`
(Sprint 166N-A/B/C, still accurate) — it adds the Sprint 166N-D decision
and the final state of the day.

---

## Sprint 166N-D — decision and reason

Sprint 166N-B's route requires a signed-in scheduled-writer session to
reach the ledger RPCs (`getScheduledWriterCredentials()` +
`signInScheduledWriter()`, same as `write-candidates`). A read-only audit
of Vercel's Environment Variables (`alertownik-mvp` project,
Environment Variables page) found:

- `SUPABASE_SCHEDULED_WRITER_EMAIL` / `SUPABASE_SCHEDULED_WRITER_PASSWORD`
  exist **only in Production scope** — no Preview-scoped writer
  credentials exist today.
- `SUPABASE_ENVIRONMENT_TAG` exists in both Production and Preview scope
  — the environment guard itself would correctly resolve to Preview.
- `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED` and
  `OPERATIONAL_EMAIL_ALERTS_ENABLED` are Preview-scoped but pinned to
  specific, different git branches (`sprint-166g-runtime-ledger-integration-v1`,
  `sprint-166e-preview-email-alerting-v1`) — neither applies to this
  session's branch, confirming no cross-branch flag leakage.

**Consequence:** setting only the one approved variable
(`OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED=true`) would have made the
route reach Layer 3 (writer credentials) and return
`{ok:false,status:"misconfigured"}` — never a real `claim`. That result
would not have fulfilled the actual purpose of Sprint 166N-D (proving a
real `claim`→`finish` cycle), and reaching a real cycle would have
required either copying Production writer credentials into Preview or
provisioning a new dedicated Preview writer identity — both explicitly
outside today's one-variable approval.

**Adam's decision:** close Sprint 166N-D and Day 6 without a real Preview
claim→finish. Reasons, in Adam's own words:

- Production writer credentials stay in Production only — never copied to
  Preview.
- No new Supabase Auth account, no new `automation_identities` row, no new
  secret is created for Preview today.
- The code-level claim→finish simulation (Sprint 166M-C, 19 tests) already
  proves the full cycle; the real Preview endpoint is already confirmed
  fail-closed by both a local and a live Preview smoke test. That
  combination is accepted as sufficient for today.

No flag was set, no Environment Variable was touched, no rollback was
needed — the STOP happened before any state-changing action.

---

## A. What was accomplished (Day 6, full)

- **Sprint 166N-A:** `/admin/sources`'s "Stan automatyzacji (canary)"
  panel now shows `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED`'s live state
  — closing the visibility gap Sprint 166M-B's audit found.
- **Sprint 166N-B:** `POST /api/admin/operational-notification-ledger-test`
  exists, admin-session-gated, environment-guarded, and gated by its own
  dedicated `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED` flag — absent/false
  everywhere today.
- **Sprint 166N-C:** confirmed fail-closed both locally (`npm run dev`,
  unauthenticated `POST` → `401`, `GET` → `405`) and on the real, live
  Preview deployment (`https://alertownik-hkz077kkh-alertownik.vercel.app/`,
  same `401`/`405` result, zero credentials used).
- The full `claim`→`finish` cycle is proven at the code level: 19 tests in
  `tests/e2e/operationalNotificationFullCycleSimulation.spec.ts` (Sprint
  166M-C) exercise the real orchestrator and adapter-factory modules
  against a realistic ledger fake — forced non-success outcome, exactly
  one claim, exactly one finish, correct terminal states, duplicate/
  concurrent-run suppression, process-restart safety, adapter failure
  handling, and the email kill switch proven through the real factory.
- Zero contact with any external service throughout Day 6 — no email, no
  Resend, no real Supabase write, no Cron.
- Production counters confirmed unchanged at every checkpoint today:
  `scheduled_writer_runs`=1 (0 open), `source_notice_candidates`=3,
  `source_checks`=2, `operational_notification_events`=0 (0 claimed),
  `alerts`=6, `automation_identities`=2 — identical to the Day 5 close and
  to every re-check performed today.

## B. Deliberately deferred

- A real `claim`→`finish` cycle against the live Preview ledger RPCs.
- Provisioning a dedicated writer identity (Supabase Auth account +
  `automation_identities` row) for `alertownik-preview`.
- Adding any Preview-scoped writer or ledger-test credentials.
- The one-shot activation of `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED`
  in any environment.

## C. Condition for future execution

A future sprint may complete the deferred real Preview test only after:

1. Adam gives a separate, explicit approval specifically for creating a
   **dedicated Preview writer identity** (new Supabase Auth account in
   `alertownik-preview`, plus one `automation_identities` row there) and
   its own Preview-only credentials — mirroring the same Path-B discipline
   already used for Production in `SPRINT_166L_D_WRITER_IDENTITY_CREATION_PROCEDURE_V1.md`.
2. Production's `SUPABASE_SCHEDULED_WRITER_EMAIL` / `SUPABASE_SCHEDULED_WRITER_PASSWORD`
   are **never** reused, copied, or referenced for Preview under any
   circumstance.

---

## What was never done today (Sprint 166N-D)

- No Environment Variable was read (beyond names/scopes), set, or saved.
- `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED` was never set anywhere.
- No Supabase Auth account was created.
- No `INSERT`/`UPDATE`/`DELETE` or any write-performing SQL was executed,
  in Preview or Production.
- The ledger-test endpoint was never invoked with a real admin session.
- No `write-candidates`, writer, RPC claim/finish, Cron, email, or Resend
  activity occurred.
- No Production state changed.
- No merge to `main`; no branch deleted.

## Git state at closeout

- Branch: `sprint-166m-operational-notification-canary-v1`.
- No code changed since commit `25a427c` (Sprint 166N-A/B/C) — this
  session's Sprint 166N-D work was entirely read-only investigation
  (Vercel Environment Variables page) plus this closeout document.
- Full suite, typecheck, lint, and build were already green as of
  `25a427c` and are unaffected by this session (no source file changed).
