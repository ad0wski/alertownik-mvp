# Sprint 166O-D — Preview Ledger Canary: Completion Checkpoint

**Status: complete.** The single authorized live claim→finish canary
against the Preview `operational_notification_events` ledger was executed
exactly once, produced the expected terminal outcome, and the environment
was fully rolled back to its pre-sprint state. Zero Production changes.
Zero merges. Zero emails.

---

## 1. Preflight (before enabling the flag)

- Branch: `sprint-166o-preview-writer-identity-v1` ✓
- Production/`main`: untouched (confirmed via MCP — see §6)
- Preview baseline (`alertownik-preview`, ref `nowvcdbtgaigutyxpmdp`),
  captured via Supabase Studio SQL Editor:
  - `operational_notification_events`: **1** total (0 claimed, 1
    abandoned) — the pre-existing row `b0215d44-...-1944c7`
    (`transient_fetch`, fingerprint `sprint-166f-2b-controlled-preview-ledger-test-1`,
    created 2026-07-23) from an earlier sprint's canary, left untouched.
  - `scheduled_writer_runs`: 2 · `source_notice_candidates`: 6 ·
    `source_checks`: 6 · `alerts`: 7 · `automation_identities`: 1 ·
    `admin_profiles`: 1
  - No open/claimed events.
- **Code review before touching anything:** read
  `src/app/api/admin/operational-notification-ledger-test/route.ts` and
  `src/lib/operationalNotificationOrchestrator.ts` directly. Confirmed:
  `requireAdminSession()` runs before any flag/business logic (admin-gating
  is structural, not configuration-dependent); the claim fingerprint is
  `${environmentTag}:ledger-test:unexpected_error` — completely different
  from the pre-existing row's fingerprint, so the canary was predicted to
  insert a **new** row, not mutate the old one; and since
  `OPERATIONAL_EMAIL_ALERTS_ENABLED` is false, the predicted terminal
  outcome was `status: "abandoned"`. Both predictions were confirmed
  correct after the run (§4).

## 2. Flag activation and redeploy

- `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED=true` set — **Preview
  only**, branch-pinned to `sprint-166o-preview-writer-identity-v1`, every
  field (key, value, environment scope, branch) verified via zoomed
  screenshot before Save. No other variable touched —
  `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED`, `OPERATIONAL_EMAIL_ALERTS_ENABLED`,
  `SCHEDULED_WRITES_ENABLED`, `SCHEDULED_CHECKS_ENABLED` all confirmed
  unchanged throughout.
- One redeploy via the Deployments list's "..." → Redeploy on the exact
  correct row (not the save-toast's Redeploy button, which this sprint has
  repeatedly found defaults to Production/`main`). Deployment
  `3u9jbHronKGFFSZxDp9jWDmMMzRS`, commit `73a112f`, environment Preview —
  reached **Ready**.

## 3. Preflight after redeploy

- Admin session (from Sprint 166O-D's earlier login checkpoint) still
  live on the fresh deployment — `sb-nowvcdbtgaigutyxpmdp-auth-token`
  present, `GET /api/admin/automation-status` → `200`,
  `writerCredentialsConfigured: true`,
  `operationalNotificationRuntimeEnabled: false` unchanged.
- `GET /api/admin/operational-notification-ledger-test` → `405` (route
  only exports `POST`) — structurally consistent regardless of flag state.
- Production counters re-checked via MCP: unchanged.

## 4. The one authenticated POST

Sent **exactly once**, from the existing Preview admin browser session,
using the session's own `access_token` (read from `localStorage`
programmatically, never displayed, copied, or logged) as an
`Authorization: Bearer` header:

```
POST /api/admin/operational-notification-ledger-test
→ HTTP 200
→ {"ok":true,"status":"abandoned"}
```

No retry. No second request of any kind was sent to this endpoint before
or after.

## 5. Immediate rollback

- `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED` **deleted** from Vercel
  (Preview scope, same branch) — confirmed via the delete-confirmation
  dialog showing the correct key and "Preview" scope before confirming.
- One rollback redeploy via the same "..." → Redeploy path (deleting an
  env var does not itself trigger a build). Deployment
  `HGGdDSCJG6GWuQqr77oY33waDuWP`, commit `73a112f`, environment Preview —
  reached **Ready**.

## 6. Full read-only audit (after rollback)

**New record — exactly one, fully terminal:**

| Field | Value |
|---|---|
| id | `e156f8df-...-72af` (masked) |
| event_type | `unexpected_error` |
| status | `abandoned` (terminal — correct, since email alerts stay disabled) |
| fingerprint | `preview:ledger-test:unexpected_error` |
| claimed_at | `2026-07-26 11:37:34.582246+00` |
| finished_at | `2026-07-26 11:37:34.722302+00` (~140ms later — no stale claim) |
| sent_at | `NULL` |
| provider_status | `NULL` |

**Counters, before → after (Preview):**

| Table | Before | After | Δ |
|---|---|---|---|
| `operational_notification_events` | 1 | 2 | **+1** (exactly the new canary row) |
| `scheduled_writer_runs` | 2 | 2 | 0 |
| `source_notice_candidates` | 6 | 6 | 0 |
| `source_checks` | 6 | 6 | 0 |
| `alerts` | 7 | 7 | 0 |
| `automation_identities` | 1 | 1 | 0 |
| `admin_profiles` | 1 | 1 | 0 |

- **No email, no Resend, no "sent" status:** `status = "abandoned"`,
  `sent_at = NULL`, `provider_status = NULL` — no send was ever attempted
  (the adapter's own `OPERATIONAL_EMAIL_ALERTS_ENABLED` gate, confirmed
  false throughout, was never bypassed).
- **Zero open/stale claimed events:** the one new row has both
  `claimed_at` and `finished_at` set — no row anywhere in the table has
  `claimed_at IS NOT NULL AND finished_at IS NULL`.
- **Flag confirmed absent again:** a Vercel Environment Variables search
  for `LEDGER_TEST` across the whole project returns **No Results Found**.
- **Endpoint fail-closed again:** `GET` → `405` (route shape unchanged);
  admin-gating on `POST` remains structural (`requireAdminSession()` first
  line of the handler, confirmed via source read in §1 — unaffected by
  flag state).
- **Pages work:** authenticated `GET /api/admin/automation-status` → `200`
  on the rolled-back deployment; public homepage (`GET /`) → `200`.
- **Production unchanged (via MCP, read-only, re-confirmed after
  rollback):** `swr_total=1, candidates_total=3, source_checks_total=2,
  one_total=0, alerts_total=6, automation_identities_total=2` — identical
  to every prior checkpoint this week.

## 7. Security audit

- No secret (session token, password, service_role key, Environment
  Variable value) was ever displayed, logged, or written anywhere by
  Claude. The session `access_token` was read only to construct one
  `Authorization` header per request and never appeared in any tool
  output text.
- Exactly one write-capable request (`POST .../ledger-test`) was sent this
  entire sprint stage — zero retries, zero repeats, confirmed by direct
  action-by-action review of this checkpoint.
- The only Environment Variable change was `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED`,
  Preview-only, branch-pinned, created and then fully deleted within this
  same session — verified absent both by direct search and by its absence
  from the automation-status payload.
- No SQL `INSERT`/`UPDATE`/`DELETE` was ever executed directly by Claude —
  the one new database row was created entirely by the application's own
  RPC path (`claim_operational_notification_event` → `finish`), triggered
  solely by the one authorized HTTP request.
- No Production Environment Variable, table, or account was read, changed,
  or copied this stage beyond read-only `SELECT`s via MCP.
- No merge to `main`; no branch deleted/force-pushed; no email or Resend
  contact of any kind.

## 8. Files and commits

This checkpoint document plus the earlier Sprint 166O-D login checkpoint
(`SPRINT_166O_D_PREVIEW_ADMIN_LOGIN_CHECKPOINT_V1.md`, commit `73a112f`)
are the only repository changes this stage — no `src/` or `tests/` file
was touched, so no test suite or typecheck/build run was needed per the
Definition of Done's own conditional scope.

## 9. Where this leaves the rollout

The Preview environment now has a fully proven, end-to-end verified
operational-notification ledger path: dedicated writer identity,
dedicated admin identity, and a genuine live claim→finish→terminal cycle
against the real RPCs — all exercised safely, all reverted. This was the
last remaining piece of *Preview-side* confidence-building before any
future decision about enabling the same mechanism in Production.

No formally documented "Day 8" scope exists in this repository or the
linked Obsidian vault for me to compute an exact percentage against —
that plan lives outside what I have access to verify. Based only on what
*is* documented here (Day 7 = `main` merge-readiness audit, immediately
followed by this session's Preview writer identity → admin identity →
live ledger canary sequence), this session closes out the full Preview
validation arc that a "Day 8" continuing from Day 7 would most plausibly
cover. Treat any percentage as Adam's own call, not a number Claude can
verify against a tracked plan.
