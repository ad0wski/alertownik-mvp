# Sprint 166H — Production Scheduled Writer / Ledger Rollout Runbook

**Status: no phase below has been started.** This document describes a
plan only. No SQL has been executed, no Environment Variable has been
changed, no code has been deployed as part of this sprint beyond
documentation and the migration files themselves.

Applies to Production project `alertownik-mvp` (project ref
`puhcjyffosgohbmxrczb`). Every phase below requires Adam's own separate,
explicit approval before the phase begins — approval for one phase is
never approval for the next.

## Sprint 166K-D addendum — the canonical, granular Phase A–H design

Since this runbook was written, Phase A actually happened: the Sprint
166H migration is live in Production (schema + tables), and Sprint 166J-A's
ACL hardening is also live and verified (see
`SPRINT_166J_PRODUCTION_ACL_HARDENING_CHECKPOINT_V1.md`) — Production's
`scheduled_writer_runs`/`operational_notification_events` tables exist,
RLS is enabled, and `anon` has zero access to either table or any of the
four RPC functions.

Sprint 166K-D re-audited the full automation path end-to-end (code, tests,
and live Production configuration — read-only, names/scopes only, never
values) and found the original Phase A–H lettering below too coarse for
safe, incremental activation: it has no dedicated phase for the
environment-pairing guard, no dedicated phase for provisioning the writer
identity separately from testing it, no dedicated phase for the
notification ledger without a real send, and no dedicated phase for a
single, tightly-scoped email test. This addendum is the **authoritative,
current phase design** — it supersedes the lettering in the "Phased
rollout" section below for planning purposes; that section's still-accurate
procedural detail (the exact migration-application steps, already
executed for Phase A) is kept as historical record, not deleted, and is
cross-referenced from Phase A below.

**Confirmed live Production state (read-only Vercel dashboard check,
2026-07-25 — variable NAMES and ENVIRONMENT SCOPES only, no value ever
read):**

| Present in Production | Absent from Production (Preview/branch-scoped only, or not set anywhere) |
|---|---|
| `SCHEDULED_CHECKS_ENABLED` (used only by the existing zero-write daily `check-michalowice` Cron) | `SCHEDULED_WRITES_ENABLED` |
| `CRON_SECRET` | `SUPABASE_SCHEDULED_WRITER_EMAIL` / `SUPABASE_SCHEDULED_WRITER_PASSWORD` |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `SUPABASE_ENVIRONMENT_TAG` / `SUPABASE_EXPECTED_PROJECT_REF` |
| `ANTHROPIC_API_KEY` (unrelated — AI draft generator) | `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED` |
| | `OPERATIONAL_EMAIL_ALERTS_ENABLED` / `RESEND_API_KEY` / `OPERATIONAL_ALERT_EMAIL_TO` / `OPERATIONAL_ALERT_EMAIL_FROM` |
| | `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS` / `SCHEDULED_WRITER_SOURCE_REGISTRY_IDS` |

This means Production today is blocked by **three independent layers
simultaneously**: the environment guard (Layer 0 — no
`SUPABASE_ENVIRONMENT_TAG` configured, so `checkDatabaseEnvironmentGuard()`
always returns `database_tag_not_configured`), the write kill switch
(Layer 1/2 — `SCHEDULED_WRITES_ENABLED` absent), and the writer
credentials (Layer 3 — absent). `vercel.json`'s one Cron entry
(`/api/cron/check-michalowice`) only ever reaches the pre-existing,
structurally zero-write dry-run route — it never touches
`write-candidates`. A live read-only smoke test of `/admin/sources`
confirmed the page's own copy already states "cron jeszcze nieaktywny"
and made exactly one API call (`GET /api/admin/automation-status`, 200) —
matching this table exactly.

### FAZA A — Schema and ACL

- **Status: already executed and verified.** See the "Migration files this
  runbook uses" section and the existing Phase A procedure below (still
  accurate, kept as historical record) plus
  `SPRINT_166J_PRODUCTION_ACL_HARDENING_CHECKPOINT_V1.md` for the ACL
  hardening that followed it.
1. **Required starting state:** none — this is the starting point.
2. **Exact actions:** already done; nothing further to execute.
3. **Allowed writes:** the migration's own DDL (tables, indexes, RLS
   policies, functions) and the ACL hardening's `REVOKE`/`GRANT`
   statements — both already applied, both schema/ACL only, zero data
   rows written.
4. **Forbidden actions:** re-running either SQL file (harmless no-op per
   their own checkpoints, but out of scope without a fresh approval).
5. **PASS:** both tables exist, RLS enabled, `anon` has zero access,
   0 rows in both tables — all confirmed in the 166J-A checkpoint.
6. **STOP:** not applicable — already passed.
7. **Rollback:** `ROLLBACK_SPRINT_166H_PRODUCTION_MIGRATION_V1.sql` (schema)
   and `ROLLBACK_SPRINT_166J_PRODUCTION_ACL_HARDENING_V1.sql` (ACL),
   both prepared and unexecuted, only if a future investigation finds
   either change broke real application behavior.
8. **Separate approval needed for this phase:** no — already granted and
   executed.
9. **Evidence preserved:** `SPRINT_166J_PRODUCTION_ACL_HARDENING_CHECKPOINT_V1.md`,
   `VERIFY_SPRINT_166H_PRODUCTION_POST_MIGRATION_READONLY_V1.sql` output.

### FAZA B — Environment guard and metadata

- **Required starting state:** Phase A complete (confirmed).
1. **Exact actions:** in Vercel's Production environment scope only, set
   `SUPABASE_ENVIRONMENT_TAG=production` and
   `SUPABASE_EXPECTED_PROJECT_REF=puhcjyffosgohbmxrczb`. No code change,
   no deployment beyond Vercel picking up the new env values on next
   request (Next.js reads `process.env` at request time for server-only
   vars — no rebuild strictly required, but a fresh deployment is the
   safer, observable way to confirm the values are live).
2. **Allowed writes:** exactly these two Environment Variables. No table
   row, no RPC call, no flag besides these two.
3. **Forbidden actions:** setting `SCHEDULED_WRITES_ENABLED`,
   writer credentials, or any notification flag in this phase — this
   phase proves the guard alone, nothing downstream of it.
4. **PASS criteria:** a manual, one-shot, CRON_SECRET-authenticated
   request to `GET /api/cron/write-candidates` (same one-shot-script
   discipline as every prior controlled test) returns the same generic
   `503` it already returns today — but for a different reason now
   (kill-switch block, `SCHEDULED_WRITES_ENABLED` still absent, not the
   environment-guard block) — confirmed indirectly: the guard no longer
   fails on `database_tag_not_configured` once these two vars are set
   correctly, since the response shape is deliberately identical for
   every Layer 0–3 failure (see `write-candidates/route.ts`'s own
   comments) and never distinguishes them to a caller. The only way to
   directly observe the guard change is via `/api/admin/automation-status`
   (admin-session-gated, read-only) — no direct signal exists for Layer 0
   alone, by design (never leaking which layer blocked).
5. **STOP criteria:** any unexpected HTTP status other than `503`; any
   sign of a write occurring (there should be none — Layer 1/2 still
   blocks regardless of Layer 0's new state).
6. **Rollback:** delete both Environment Variables in Vercel — instantly
   restores today's already-safe "guard fails closed" state.
7. **Separate approval needed:** **yes** — setting real Production
   Environment Variable values is itself an action requiring Adam's
   explicit approval in chat before either is set.
8. **Evidence to preserve:** the exact HTTP status/body of the one-shot
   verification request; confirmation both variables show the correct
   NAME with a scope of Production in the Vercel dashboard (value never
   read back by Claude).

### FAZA C — Writer identity and credentials

- **Required starting state:** Phase B complete.
1. **Exact actions:** Adam creates one new Supabase Auth account in
   `alertownik-mvp` (dashboard, Auth → Users → Add user — never via SQL,
   matching the existing Sprint 165C runbook convention for Preview's own
   technical accounts), then adds exactly one row to
   `public.automation_identities` for that account's `user_id` (a single,
   reviewed `INSERT` — Adam clicks Run, never Claude). Separately, Adam
   sets `SUPABASE_SCHEDULED_WRITER_EMAIL` / `SUPABASE_SCHEDULED_WRITER_PASSWORD`
   in Vercel's Production scope.
2. **Allowed writes:** exactly one `auth.users` row (via dashboard, not
   SQL), exactly one `automation_identities` row, exactly two Environment
   Variables.
3. **Forbidden actions:** granting this account any role/membership
   beyond `automation_identities` (specifically: never `admin_profiles`);
   setting `SCHEDULED_WRITES_ENABLED` in this phase — live sign-in proof
   is deliberately deferred to Phase D's single controlled run, since the
   route only reaches the credentials/sign-in check (Layer 3) after
   Layers 1–2 already pass, and this phase keeps Layer 2 off on purpose.
4. **PASS criteria:** exactly one row in `automation_identities`
   (confirmed by a single read-only `SELECT count(*)`, never a broader
   query); both Environment Variables show the correct NAME with
   Production scope.
5. **STOP criteria:** more than one new row anywhere; any grant beyond
   `automation_identities` membership.
6. **Rollback:** delete the `automation_identities` row (single `DELETE`
   by known id, reviewed and run by Adam) and/or disable the Supabase Auth
   account; delete both Environment Variables.
7. **Separate approval needed:** **yes** — creating a real technical
   account and setting real credential Environment Variables both require
   explicit approval, and the `automation_identities` INSERT is itself a
   write-performing SQL statement Adam runs personally, matching this
   project's standing convention.
8. **Evidence to preserve:** confirmation of exactly one new
   `automation_identities` row (id only, never logged elsewhere);
   confirmation both credential variables exist with Production scope.

### FAZA D — Controlled writer run, no email

- **Required starting state:** Phases B and C complete.
- Maps onto, and fully absorbs, the original runbook's **Phase E** below
  (same actions, same success bar) — kept here as the canonical
  description; Phase E below is historical/cross-reference only.
1. **Exact actions:** set `SCHEDULED_CHECKS_ENABLED` (already true) and
   `SCHEDULED_WRITES_ENABLED=true` in Production; confirm
   `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS` is either absent (safe default:
   Michałowice only) or explicitly set to the same narrow allowlist; run
   exactly one one-shot-script request against `write-candidates`;
   immediately revert `SCHEDULED_WRITES_ENABLED` to false (and
   `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS` if it was set) regardless of
   outcome.
2. **Allowed writes:** at most one `scheduled_writer_runs` row, at most
   one `source_notice_candidates` row (`status='pending'`), at most one
   `source_checks` row. `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED` and
   `OPERATIONAL_EMAIL_ALERTS_ENABLED` remain false/absent throughout —
   this phase produces zero ledger activity by construction (Layer 0 of
   `runOperationalNotification` itself checks this flag first).
3. **Forbidden actions:** a second request in the same or a later
   session without a fresh approval; setting either notification flag;
   widening the source allowlist beyond one source for this first test.
4. **PASS criteria:** exactly the response shape and row deltas Sprint
   166G-3 already validated in Preview — one closed
   `scheduled_writer_runs` row, at most one new candidate, zero alert
   created/published, zero ledger/email/Resend activity.
5. **STOP criteria:** any second automatic request; any alert published;
   any ledger row created (would indicate
   `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED` was unexpectedly true).
6. **Rollback:** `SCHEDULED_WRITES_ENABLED` back to false immediately —
   already part of the phase's own actions, not a separate emergency step.
7. **Separate approval needed:** **yes** — this is a real Production
   write, narrower in scope than any prior Production action in this
   project.
8. **Evidence to preserve:** the exact JSON response; before/after
   read-only row counts for all three tables touched; confirmation flags
   were reverted.

### FAZA E — Operational ledger, no send

- **Required starting state:** Phase D successful and flags already
  reverted to false.
1. **Exact actions:** set `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED=true`
   in Production (`OPERATIONAL_EMAIL_ALERTS_ENABLED` stays
   false/absent — `decideNotificationAdapterKind()` resolves to `noop`
   regardless of ledger activity, so a claim can be exercised with zero
   send capability even configured). Run exactly one controlled
   `write-candidates` invocation designed to produce a non-`success`
   outcome (e.g., temporarily pointing the allowlisted source's URL
   check at a condition that fails, mirroring the discipline used for
   Preview's own future "force a failure" test suggested in
   `SPRINT_166G_PREVIEW_RUNTIME_VALIDATION_CHECKPOINT_V1.md` §9) so the
   run-level notification path actually reaches `claim`/`finish`, not
   just the always-suppressed `success` path already proven in Preview.
   Immediately revert `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED` and
   `SCHEDULED_WRITES_ENABLED` to false after the result is recorded.
2. **Allowed writes:** at most one new `scheduled_writer_runs` row (as
   Phase D), at most one new `operational_notification_events` row
   (status ending `abandoned` — since the adapter is `noop`, per
   `mapSendResultToFinish`'s own mapping, never `sent`).
3. **Forbidden actions:** setting `OPERATIONAL_EMAIL_ALERTS_ENABLED` or
   any Resend variable in this phase; a second claim/finish cycle.
4. **PASS criteria:** exactly one `claim` → `finish` cycle, ending
   `status='abandoned'`, `provider_status=NULL`, `sent_at=NULL` — the
   same success shape Sprint 166F-2B already validated in Preview, now
   confirmed reachable from the real writer runtime in Production.
5. **STOP criteria:** `status='sent'` anywhere (would mean the adapter
   was not actually `noop` — treat as an incident); more than one ledger
   row; any Resend network attempt (verifiable only by the total absence
   of a `RESEND_API_KEY` in Production during this phase — structurally
   impossible for `createConfiguredNotificationAdapter()` to reach the
   `resend` branch without it).
6. **Rollback:** both flags back to false/absent immediately.
7. **Separate approval needed:** **yes** — a new flag, in Production, for
   the first time.
8. **Evidence to preserve:** the ledger row's `status`/`provider_status`/
   `sent_at`; confirmation of zero Resend contact; flags confirmed
   reverted.

### FAZA F — Single email test

- **Required starting state:** Phase E successful; a real Resend account
  and sender domain already provisioned and verified by Adam outside
  this codebase (out of scope for any sprint to automate).
1. **Exact actions:** set `RESEND_API_KEY`, `OPERATIONAL_ALERT_EMAIL_FROM`,
   and `OPERATIONAL_ALERT_EMAIL_TO` (the **to** address must be an
   address Adam personally controls and has explicitly approved — never
   a resident-facing or third-party address) in Production;
   `OPERATIONAL_EMAIL_ALERTS_ENABLED=true`; trigger exactly one send —
   preferably via the existing, already-built, confirm()-gated
   `/api/admin/operational-email-test` route (Sprint 166E-2A, admin-
   session-gated, POST, requires an explicit confirm dialog — the same
   mechanism already validated in Preview) rather than forcing a real
   writer failure again. Immediately revert
   `OPERATIONAL_EMAIL_ALERTS_ENABLED` to false after the result is
   recorded.
2. **Allowed writes:** exactly one email send via Resend; the ledger row
   this specific test route creates/finishes (if it uses the ledger —
   confirm against that route's own implementation before running).
3. **Forbidden actions:** any second send; sending to any address other
   than the one pre-approved value; leaving
   `OPERATIONAL_EMAIL_ALERTS_ENABLED=true` after the test.
4. **PASS criteria:** exactly one email received at the approved address;
   the corresponding ledger row (if applicable) shows
   `status='sent'`, `provider_status='sent'`, `sent_at` populated with a
   real timestamp.
5. **STOP criteria:** any delivery to an unapproved address (treat as a
   real incident, not a retry situation); any second send;
   `provider_status` indicating a Resend-side rejection needing
   investigation before any further phase.
6. **Rollback:** `OPERATIONAL_EMAIL_ALERTS_ENABLED` back to false
   immediately; if credentials were mis-scoped, delete
   `RESEND_API_KEY`/`OPERATIONAL_ALERT_EMAIL_FROM`/`OPERATIONAL_ALERT_EMAIL_TO`
   entirely, returning to Phase E's state.
7. **Separate approval needed:** **yes**, explicitly naming the approved
   recipient address in chat before this phase begins.
8. **Evidence to preserve:** `sent_at`/`provider_status` from the ledger
   row; confirmation the email was received at exactly the approved
   address and nowhere else.

### FAZA G — Limited Cron

- **Required starting state:** Phases B–F all successful, reviewed
  together as one package, on a separate day from when they happened (no
  same-day momentum decision).
- Supersedes the original runbook's **Phase G** below, which left this
  fully undefined — this is now the full spec.
1. **Exact actions:** add exactly one new entry to `vercel.json`'s
   `crons` array, targeting `write-candidates`, at the **lowest
   defensible frequency** (matching the existing `check-michalowice`
   cadence — once daily — never more often for this first activation);
   `SCHEDULED_WRITES_ENABLED` set persistently true in Production (no
   longer toggled per-test); the source allowlist stays at exactly the
   one source already proven in Phase D (`SCHEDULED_WRITER_ALLOWED_SOURCE_IDS`
   left at its safe default, or explicitly pinned to it); a defined
   observation window (minimum one full week of daily runs) before any
   further widening is even discussed.
2. **Allowed writes:** one `scheduled_writer_runs` row and at most the
   per-invocation candidate cap (default 1) per scheduled invocation —
   never more, per the existing `getMaxCandidatesPerInvocation()` /
   `getAllowedWriteSourceIds()` server-side caps, neither of which this
   phase raises.
3. **Forbidden actions:** any automatic publish path (none exists in this
   codebase today — candidates are always `status='pending'`, requiring a
   human Builder review; this phase does not change that); raising the
   per-run candidate cap; widening the source allowlist; increasing Cron
   frequency, all within the observation window.
4. **PASS criteria:** the observation window completes with every run
   outcome `success` or an honestly-reported `partial_failure`/
   `total_failure` (never a framework error), zero unexpected candidates,
   zero unexpected alerts, zero ledger anomalies (per
   `getConfiguredDatabaseEnvironmentTag()`-scoped run-history review in
   `/admin/automation-status`).
5. **STOP criteria:** any run outcome pattern indicating a stuck lock
   (`open_runs` staying non-zero across checks — see the retention
   preflight report's own §2 anomaly signal, applicable here too); any
   candidate that looks materially wrong; any admin-action-required flag
   raised by the automation-status panel.
6. **Rollback:** remove the Cron entry from `vercel.json` (a code change,
   deployed) **and** set `SCHEDULED_WRITES_ENABLED=false` immediately —
   two independent kill actions, either one alone already fully stops
   future writes; removing the Cron entry alone does not retroactively
   undo any run already logged, matching this project's existing
   "no automatic data rollback" convention.
7. **Separate approval needed:** **yes** — the first-ever standing,
   unattended, persistent automation in Production. This is a materially
   larger decision than any single controlled test above and should be
   treated as its own dedicated approval conversation, not folded into
   approving Phase F.
8. **Evidence to preserve:** the full observation-window run history
   (via `/admin/automation-status`, read-only); the exact `vercel.json`
   diff, committed and reviewed like any other code change.

### FAZA H — Fuller rollout and monitoring

- **Required starting state:** Phase G's observation window passed
  cleanly.
- Supersedes the original runbook's **Phase H** below, which only covered
  the email activation decision — broadened here per Sprint 166K-D's
  scope to the full fuller-rollout/monitoring/incident-response/retention
  picture.
1. **Exact actions (each its own separately-approved sub-decision, not a
   single bundled approval):** widening the source allowlist beyond one
   source; raising the per-run candidate cap; increasing Cron frequency;
   activating `OPERATIONAL_EMAIL_ALERTS_ENABLED` persistently (building on
   Phase F's one-shot proof) so real operational alerts reach Adam
   automatically going forward; defining and, once separately approved,
   activating the Production retention cleanup (see
   `SPRINT_166K_D_PRODUCTION_RETENTION_DESIGN_V1.md` — design only, not
   executable by this addendum).
2. **Allowed writes:** whatever each specific sub-decision's own scope
   defines — never a blanket "everything is now allowed."
3. **Forbidden actions:** treating approval of one sub-decision here as
   approval of any other; running the Production retention cleanup
   without its own separate activation procedure (see that design doc).
4. **PASS criteria:** defined per sub-decision at the time it's opened.
5. **STOP criteria:** defined per sub-decision at the time it's opened;
   at minimum, any operational-health panel `adminActionRequired=true`
   signal pauses further widening until resolved.
6. **Rollback:** each sub-decision's own flag/config reverts
   independently — this phase never introduces a single combined kill
   switch that could itself become a new single point of failure;
   `SCHEDULED_WRITES_ENABLED=false` (Phase G's own kill switch) remains
   the one action that always, unconditionally stops all writer activity
   regardless of which Phase H sub-decisions are active.
7. **Separate approval needed:** **yes**, once per sub-decision, each its
   own future sprint.
8. **Evidence to preserve:** an incident-response note for any STOP
   trigger; the automation-status panel's run-history export at the time
   of each new sub-decision's approval, as a "before" baseline.

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

### Phase G — Cron activation decision (superseded — see the Sprint 166K-D addendum's FAZA G above)

- **Entry conditions:** Phases A–F all successful, reviewed together as a
  single package, separately from the day they happened.
- **Approval scope:** a wholly separate decision — whether and when to add
  a `write-candidates` entry to `vercel.json`'s `crons` array (today it
  contains only the zero-write `check-michalowice` dry-run route) and
  whether `SCHEDULED_CHECKS_ENABLED`/`SCHEDULED_WRITES_ENABLED` should be
  left on persistently in Production rather than toggled for a single
  test. This decision is explicitly out of scope for Sprint 166H and is
  not implied by approval of any phase above.
- **Actions/success/abort:** fully specified now — see the Sprint 166K-D
  addendum's **FAZA G** at the top of this document, which supersedes this
  heading.
- **Rollback:** not applicable to this heading on its own — this section
  is retained only as historical record of the original, undefined
  placeholder. The addendum's FAZA G defines the actual rollback (remove
  the Cron entry from `vercel.json` and set
  `SCHEDULED_WRITES_ENABLED=false`); this heading itself changes no state.

### Phase H — Email alert activation decision (superseded — see the Sprint 166K-D addendum's FAZA H above)

- **Entry conditions:** Phase G decided (in either direction) and, if
  cron was activated, some period of stable unattended operation observed
  first.
- **Approval scope:** a wholly separate decision — whether to set
  `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED=true` persistently in
  Production and whether to also enable `OPERATIONAL_EMAIL_ALERTS_ENABLED`
  (today, RESEND_API_KEY and the two OPERATIONAL_ALERT_EMAIL_* variables
  do not exist in Production at all — provisioning them is itself part of
  this future decision, not assumed here).
- **Actions/success/abort:** fully specified now — see the Sprint 166K-D
  addendum's **FAZA H** at the top of this document, which supersedes this
  heading.
- **Rollback:** not applicable to this heading on its own — see the
  addendum's FAZA H for the actual per-sub-decision rollback; this
  heading itself changes no state.

---

## Explicit non-goals of Sprint 166H

Per the sprint's own instructions, this document and its accompanying SQL
files are a **plan and a prepared package only**. None of the following
happened as part of Sprint 166H: any SQL executed against Production, any
Environment Variable changed, any writer invocation, any claim/finish
call, any email, any Resend contact, any Cron change, any merge to
`main`, any branch deletion.
