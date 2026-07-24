# Sprint 166H — Production Scheduled Writer / Ledger Rollout Runbook

**Status: no phase below has been started.** This document describes a
plan only. No SQL has been executed, no Environment Variable has been
changed, no code has been deployed as part of this sprint beyond
documentation and the migration files themselves.

Applies to Production project `alertownik-mvp` (project ref
`puhcjyffosgohbmxrczb`). Every phase below requires Adam's own separate,
explicit approval before the phase begins — approval for one phase is
never approval for the next.

---

## Migration files this runbook uses

- `docs/sql/PREFLIGHT_SPRINT_166H_PRODUCTION_READONLY_V1.sql` — read-only,
  run before the migration.
- `docs/sql/PROPOSED_SPRINT_166H_PRODUCTION_SCHEDULED_WRITER_AND_LEDGER_MIGRATION_V1.sql`
  — the migration itself.
- `docs/sql/VERIFY_SPRINT_166H_PRODUCTION_POST_MIGRATION_READONLY_V1.sql` —
  read-only, run after the migration.
- `docs/sql/ROLLBACK_SPRINT_166H_PRODUCTION_MIGRATION_V1.sql` — not run
  unless a separate rollback decision is made.

## Migration application procedure (Phase A, expanded)

1. **Identify the correct project.** From the Supabase organization's
   project list (never a typed URL, never an already-open tab), click the
   card literally labeled `alertownik-mvp`. Confirm the dashboard header
   reads `alertownik-mvp` and the URL contains `puhcjyffosgohbmxrczb`.
   Confirm this is NOT `alertownik-preview` / `nowvcdbtgaigutyxpmdp`.
2. **Preflight.** Open a fresh SQL Editor tab in that confirmed project.
   Run `PREFLIGHT_SPRINT_166H_PRODUCTION_READONLY_V1.sql` in full. Record
   every result. If any result does not match its `-- expect` comment,
   STOP and report back — do not proceed to step 3 in the same session.
3. **Approval gate.** Before running the migration, Adam must explicitly
   confirm, in chat, all of the following (matching the exact gate used
   for the Sprint 166F Preview migration):
   - "I am looking at the alertownik-mvp project, confirmed by project ref
     puhcjyffosgohbmxrczb, not alertownik-preview."
   - "The preflight script above returned every expected result."
   - "I have read the migration file and understand it creates two new
     tables, five new indexes, two new RLS policies (both admin-only
     SELECT), and four new SECURITY DEFINER functions — no existing table,
     policy, function, or Environment Variable is altered, dropped, or
     changed."
   - "I approve running this migration now."
4. **Apply exactly once.** Paste the full contents of
   `PROPOSED_SPRINT_166H_PRODUCTION_SCHEDULED_WRITER_AND_LEDGER_MIGRATION_V1.sql`
   into the SQL Editor exactly as written — do not edit it inline. Adam
   clicks Run. This is a write-performing statement; per this project's own
   established convention, Claude does not click Run on write-performing
   SQL — Adam does.
5. **Verify immediately.** Run
   `VERIFY_SPRINT_166H_PRODUCTION_POST_MIGRATION_READONLY_V1.sql` in full,
   in the same session, same confirmed project. Every result must match
   its `-- expect` comment, and §9's counts must exactly equal the
   preflight script's own output from step 2.
6. **Stop-on-error procedure.** If the migration statement itself errors:
   the `begin`/`commit` wrapper means nothing partial was committed — no
   further action is needed beyond reporting the exact error text back
   before any retry is considered. If verification in step 5 shows any
   unexpected result after an apparently successful migration: STOP,
   do not attempt a repair migration in the same session, and report back
   with the specific mismatch.
7. **No runtime activation.** Completing this phase must not be followed,
   in the same session or the same day, by any Environment Variable
   change, any deployment, or any request to any `/api/cron/*` route in
   Production. This is a schema-only change; every runtime flag governing
   the writer and the ledger remains exactly as it is today (all
   false/absent).

---

## Phased rollout (Phases A–H)

Each phase lists: entry conditions, the scope of approval required, exact
actions, success conditions, abort conditions, and rollback.

### Phase A — Production schema migration, all runtime flags OFF

- **Entry conditions:** Sprint 166H checkpoint accepted; preflight script
  clean; Adam has read this runbook.
- **Approval scope:** exactly the migration-application procedure above —
  nothing else. Does not authorize any later phase.
- **Actions:** the 7-step procedure above.
- **Success:** verification script fully matches expectations; every
  runtime flag (`SCHEDULED_WRITES_ENABLED`, `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED`)
  remains false/absent in Production; no deployment triggered.
- **Abort conditions:** any preflight mismatch; any migration error; any
  verification mismatch; discovery of an existing table/function with a
  colliding name that was not visible during the Sprint 166H audit.
- **Rollback:** `ROLLBACK_SPRINT_166H_PRODUCTION_MIGRATION_V1.sql`, safe at
  this point because both tables are guaranteed empty.

### Phase B — Read-only Production verification (standalone re-check)

- **Entry conditions:** Phase A complete and verified.
- **Approval scope:** a single, separate read-only pass, no time pressure
  — may happen the same day as Phase A or later. Does not authorize
  Phase C.
- **Actions:** re-open a fresh Supabase tab (not the one from Phase A),
  re-confirm project identity, re-run
  `VERIFY_SPRINT_166H_PRODUCTION_POST_MIGRATION_READONLY_V1.sql`.
- **Success:** identical results to Phase A's own verification pass.
- **Abort conditions:** any drift from Phase A's recorded results (would
  indicate an unexpected write occurred between phases — treat as an
  incident, not a retry-and-continue situation).
- **Rollback:** none needed — this phase performs no write.

### Phase C — Deploy code with runtime still OFF

- **Entry conditions:** Phase B confirms schema is stable.
- **Approval scope:** confirms only that Adam wants the already-existing,
  already-merged Sprint 166G code (which already defaults every flag to
  off) running in Production — which it already is, since Sprint 166G
  merged to `main` and deployed to Production in the previous sprint. This
  phase is therefore a no-op confirmation unless a newer, still-unmerged
  branch is involved — if so, that merge is its own separate approval,
  identical in kind to the Sprint 166G merge procedure.
- **Actions:** confirm the live Production deployment's commit matches
  `main`'s current HEAD; confirm build/typecheck/lint status is green (already
  true as of the Sprint 166G checkpoint).
- **Success:** Production is running the exact code that now has
  `scheduled_writer_runs`/`operational_notification_events` available to
  it, with every runtime flag still false/absent.
- **Abort conditions:** any drift between deployed commit and `main` HEAD.
- **Rollback:** not applicable (no new deployment happens in this phase
  unless one was already pending for unrelated reasons).

### Phase D — One controlled dry-run / no-publish test

- **Entry conditions:** Phases A–C complete.
- **Approval scope:** a single, explicitly-scoped test using the EXISTING
  dry-run endpoint (`/api/cron/check-sources` or `/api/cron/check-michalowice`,
  both already zero-write by construction and already exercised safely
  many times) OR a single write-candidates invocation with
  `SCHEDULED_WRITES_ENABLED` still false (confirming the kill switch still
  works in Production, expecting the same clean 503 seen in every prior
  Preview test at this same gate). Does not authorize turning any flag on.
- **Actions:** exactly one request, using the same one-shot-script
  discipline established across Sprints 166G-2/166G-3 (hidden CRON_SECRET
  prompt, one-shot marker, no retry).
- **Success:** the expected fail-closed or dry-run response, zero writes
  observed in a subsequent read-only check.
- **Abort conditions:** any unexpected write; any unexpected HTTP status.
- **Rollback:** none needed if success — no state changed. If an
  unexpected write occurred, treat as an incident: stop, do not retry,
  perform a full read-only audit before any further action.

### Phase E — One controlled writer run for one source, no email

- **Entry conditions:** Phase D confirms the kill switches behave exactly
  as designed in Production.
- **Approval scope:** narrowly scoped exactly like every Sprint 166G-2/3
  Preview test: `SCHEDULED_CHECKS_ENABLED`/`SCHEDULED_WRITES_ENABLED` set
  to true for Production (this is a real Production flag change and must
  be called out explicitly as such — there is no branch-scoping mechanism
  for Production the way there is for Preview, since Production deploys
  are never branch-scoped), `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED`
  and `OPERATIONAL_EMAIL_ALERTS_ENABLED` remain false throughout this
  phase. One source, one request, one-shot script discipline, immediate
  flag rollback after the result is recorded — identical structure to
  Sprint 166G-3's v3 test.
- **Actions:** flip flags → empty commit not needed (Production has no
  branch-scoping concept; a Vercel "Redeploy" or waiting for the next
  natural deploy applies the env change) → wait for the change to take
  effect → one-shot script → immediate flag rollback → read-only
  verification.
- **Success:** exactly one new `scheduled_writer_runs` row, at most one new
  `source_notice_candidates` row (`status = pending`), no alert
  created/published, zero email, zero Resend contact — same success
  bar as Sprint 166G-3.
- **Abort conditions:** any second automatic request; any claim/finish
  activity (would be unexpected since
  `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED` stays false); any alert
  published.
- **Rollback:** revert `SCHEDULED_CHECKS_ENABLED`/`SCHEDULED_WRITES_ENABLED`
  to false in Production immediately after the result is recorded,
  regardless of outcome.

### Phase F — Data verification and flag rollback confirmation

- **Entry conditions:** Phase E's single test executed.
- **Approval scope:** read-only only.
- **Actions:** the same structured verification used after every Sprint
  166G Preview test (run count, candidate detail, ledger unaffected, no
  alert, no email), performed against Production this time.
- **Success:** all counts and details match Phase E's success criteria
  exactly; flags confirmed back to false in Production metadata.
- **Abort conditions:** any mismatch — treat as an incident requiring a
  full explanation before any further phase is considered.
- **Rollback:** none needed if this phase itself only reads.

### Phase G — Cron activation decision (not started by this runbook)

- **Entry conditions:** Phases A–F all successful, reviewed together as a
  single package, separately from the day they happened.
- **Approval scope:** a wholly separate decision — whether and when to add
  a `write-candidates` entry to `vercel.json`'s `crons` array (today it
  contains only the zero-write `check-michalowice` dry-run route) and
  whether `SCHEDULED_CHECKS_ENABLED`/`SCHEDULED_WRITES_ENABLED` should be
  left on persistently in Production rather than toggled for a single
  test. This decision is explicitly out of scope for Sprint 166H and is
  not implied by approval of any phase above.
- **Actions/success/abort/rollback:** to be defined in a future sprint,
  once Adam decides to open this decision.

### Phase H — Email alert activation decision (not started by this runbook)

- **Entry conditions:** Phase G decided (in either direction) and, if
  cron was activated, some period of stable unattended operation observed
  first.
- **Approval scope:** a wholly separate decision — whether to set
  `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED=true` persistently in
  Production and whether to also enable `OPERATIONAL_EMAIL_ALERTS_ENABLED`
  (today, RESEND_API_KEY and the two OPERATIONAL_ALERT_EMAIL_* variables
  do not exist in Production at all — provisioning them is itself part of
  this future decision, not assumed here).
- **Actions/success/abort/rollback:** to be defined in a future sprint.

---

## Explicit non-goals of Sprint 166H

Per the sprint's own instructions, this document and its accompanying SQL
files are a **plan and a prepared package only**. None of the following
happened as part of Sprint 166H: any SQL executed against Production, any
Environment Variable changed, any writer invocation, any claim/finish
call, any email, any Resend contact, any Cron change, any merge to
`main`, any branch deletion.
