# Sprint 166G-3 — Preview Runtime Ledger Validation Checkpoint

Date of controlled test: 2026-07-24.

## 1. Scope

This checkpoint records the first (and, as of this document, only) live
invocation of the `GET /api/cron/write-candidates` route with
`OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED=true` wired in (Sprint 166G-1
design/audit — `SPRINT_166G_RUNTIME_LEDGER_INTEGRATION_AUDIT_AND_DESIGN_V1.md`)
against a real writer run, on the confirmed **Preview** project
`alertownik-preview` (project ref `nowvcdbtgaigutyxpmdp`) only. Production
(`alertownik-mvp`, project ref `puhcjyffosgohbmxrczb`) was never touched at
any point in this sprint.

## 2. Architecture recap (unchanged from Sprint 166G-1)

The runtime integration is a single `if (isOperationalNotificationRuntimeEnabled(...))`
block inserted after each of the writer route's two `history.closeRun(...)`
call sites — see `SPRINT_166G_RUNTIME_LEDGER_INTEGRATION_AUDIT_AND_DESIGN_V1.md`
§D for the full design. No code changed between that design sprint and this
validation — this checkpoint is a pure runtime/data verification, not a new
code change.

## 3. Branch-scoped flag activation (Preview + this branch only)

For the controlled test, three environment variables were added as
**branch-specific overrides** — scoped to Environment: Preview AND Git
Branch: `sprint-166g-runtime-ledger-integration-v1` — leaving the
project-wide Preview values, and all Production values, completely
untouched:

- `SCHEDULED_CHECKS_ENABLED=true` (branch-scoped override, added)
- `SCHEDULED_WRITES_ENABLED=true` (branch-scoped override, added)
- `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED=true` (existing branch-scoped
  variable, value changed from `false`)

`OPERATIONAL_EMAIL_ALERTS_ENABLED` was never set for this branch at any
point — it remains absent (equivalent to `false`) throughout.

A single empty activating commit triggered a fresh Preview deployment with
these flags in effect. A read-only smoke test (page load, `[SYNTHETIC
PREVIEW]` label, console, network) confirmed the deployment was healthy and
made zero automatic requests before the manual test.

## 4. The one-shot controlled request (v3)

Executed by Adam, exactly once, via a locally-prepared, statically-audited
PowerShell script (`alertownik-one-shot-writer-test-v3.ps1`, never
committed to this repository) using `vercel curl` against the confirmed
Preview deployment URL, with `CRON_SECRET` entered via a hidden prompt
(never displayed, logged, or stored). The script's own one-shot marker
(`alertownik-one-shot-writer-test-v3.done`) was created immediately after
the single attempt and was not deleted or reused.

Result: `vercel curl` exit code `0`, HTTP status **200**, JSON body:

```
ok: true, dryRun: false, checkedSources: 1, successfulSources: 1,
failedSources: 0, proposalsFound: 6, candidatesInserted: 1,
duplicatesSkipped: 2, ambiguousCandidates: 0, cappedSkipped: 3,
sourceChecksInserted: 1, duplicatesPreventedByDatabase: 0, published: false
```

No secret, token, or credential value is recorded anywhere in this
document, the script, its log file, or this repository.

## 5. Read-only database verification (`alertownik-preview`, confirmed fresh via the Supabase dashboard project list — never via the `supabase-alertownik` MCP connection, see §7)

Baseline (established in Sprint 166F-2B and unchanged until this test):
`scheduled_writer_runs` = 1 row, `open_runs` = 0, `operational_notification_events`
= 1 row (`claimed` count = 0), `source_notice_candidates` = 5 rows.

Post-test counts, verified via `SELECT`-only queries in a freshly-opened
SQL Editor tab within the confirmed project:

| Table | Before | After | Delta |
|---|---|---|---|
| `scheduled_writer_runs` | 1 | 2 | **+1** |
| `scheduled_writer_runs` (open) | 0 | 0 | 0 |
| `operational_notification_events` | 1 | 1 | 0 |
| `operational_notification_events` (`status='claimed'`) | 0 | 0 | 0 |
| `source_notice_candidates` | 5 | 6 | **+1** |
| `alerts` | 7 | 7 | 0 |

### 5.1 New `scheduled_writer_runs` row

`id = f16fb737-c836-411a-a509-d3b0aea4d5cc`, `trigger = manual`,
`environment_tag = preview`, `started_at = 2026-07-24 11:43:24.841038+00`,
`finished_at = 2026-07-24 11:43:27.087066+00` (run is **closed** — not an
open/abandoned row), `outcome = success`, `sources_checked = 1`,
`sources_failed = 0`.

### 5.2 New `source_notice_candidates` row

`source_key = michalowice-komunikaty`, `status = pending`,
`created_at = 2026-07-24 11:43:26.4536+00`, `converted_alert_id = NULL`
(never converted to a draft or published alert).

### 5.3 New `source_checks` row

`checked_at = 2026-07-24 11:43:26.792827+00`, `result = found_notice`,
`related_alert_id = NULL`.

### 5.4 `operational_notification_events` — unaffected, as designed

Row count and claimed count are unchanged. This is the **expected**
behavior per the Sprint 166G-1 design (§B): a `success` run outcome is
always suppressed by `evaluateNotificationEligibility` before any ledger
I/O — `categoryFromRunOutcome("success")` never resolves to a notifying
category. Zero claim, zero finish, zero adapter call, zero email, zero
Resend contact occurred as a structural consequence of this one run
finishing with `outcome = success`.

### 5.5 No alert created or published

`alerts` row count unchanged (7, last `created_at` from 2026-07-21,
predating this test). The new candidate's `converted_alert_id` is `NULL`.

## 6. Rollback (completed, same session)

Immediately after receiving the test result:

1. `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED` restored to `false`, same
   branch-specific scope.
2. The two branch-specific overrides (`SCHEDULED_CHECKS_ENABLED`,
   `SCHEDULED_WRITES_ENABLED`) were **deleted** (not merely set to
   `false`) — the branch now inherits whatever the project-wide Preview
   value is, exactly as before this sprint's controlled test began.
3. One empty disabling commit, pushed to this branch only.
4. Fresh Preview deployment confirmed Ready.
5. Read-only smoke test: `[SYNTHETIC PREVIEW]` label present, zero
   application console errors, zero automatic `/api/*` requests.

No further writer invocation, retry, manual `claim`/`finish`, email,
Resend contact, Cron activation, SQL migration, or Production change
occurred at any point after the single v3 request.

## 7. `supabase-alertownik` MCP — confirmed misconfigured, do not use for Preview

The MCP server named `supabase-alertownik` (configured in this machine's
local Claude Code settings, `project_ref=puhcjyffosgohbmxrczb`) points at
**Production** (`alertownik-mvp`), not at `alertownik-preview`
(`nowvcdbtgaigutyxpmdp`), despite its name. It is read-only, so no write
risk exists, but every read through it reflects Production data, not
Preview. All read-only verification in this checkpoint was performed
instead via a freshly-opened Supabase dashboard tab, navigated by clicking
the project card literally labeled `alertownik-preview` from the
organization's project list (never a typed/guessed URL, never a
previously-open tab) — see §5's parenthetical. Until this MCP connection
is reconfigured to the correct project ref (or removed), it must not be
used for any Preview-environment verification.

## 8. Risk assessment for this branch

- **Code risk: none.** No source file changed since Sprint 166G-1's
  design/audit — this checkpoint validates existing, already-tested code
  against a real database, it does not introduce new logic.
- **Data risk: none observed.** All writes during the test were exactly
  the ones the design predicted (one run row, one pending candidate, one
  source-check row), on the isolated Preview project only.
- **Configuration risk: none remaining.** All branch-specific flag
  overrides added for the test have been reverted or deleted; the branch's
  effective configuration is identical to before the test.
- **Known residual limitation:** the `supabase-alertownik` MCP
  misconfiguration (§7) is a tooling/session issue, not a code or data
  issue, but should be fixed (repointed to `nowvcdbtgaigutyxpmdp` or
  removed) before it is relied upon again for any Preview-environment
  claim.

## 9. Recommended next sprint

With the runtime ledger integration now validated end-to-end on a real
writer run in Preview (success-path suppression confirmed; the
failure/error-path notification behavior was already validated
structurally in Sprint 166G-1's test suite, not yet on a real failing
run), the next sprint should either:

- (a) run one further controlled test that forces a `total_failure` or
  `partial_failure` outcome (e.g. a temporarily-unreachable source) to
  observe a real `claim` → `finish` cycle end-to-end in Preview, before
  ever considering Production activation; or
- (b) proceed directly to deciding Production's own migration timeline
  for the Sprint 166C run-history and Sprint 166F ledger tables (both
  currently Preview-only), as a prerequisite for any future Production
  activation of this feature.

Either path is a separate, later, explicitly-approved decision — not
started by this checkpoint.

## 10. Do not repeat the v3 test without separate approval

Matching the discipline already established for the Sprint 166F-2B ledger
test and the Sprint 166E-2B email test: this exact controlled writer
invocation must not be re-run — including a single additional request —
without a fresh, separate, explicit approval from Adam.
