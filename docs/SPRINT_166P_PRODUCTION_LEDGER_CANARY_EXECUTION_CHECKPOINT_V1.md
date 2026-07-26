# Sprint 166P — Production Ledger Canary: Execution Checkpoint

**Status: complete.** The single authorized live claim→finish canary
against the **Production** `operational_notification_events` ledger was
executed exactly once, produced the predicted terminal outcome, and the
environment was fully rolled back. Zero Production data corruption. Zero
email. Zero Resend contact. Zero merges. Zero branch deletions.

---

## 1. Preflight (before enabling the flag)

- Git branch: `sprint-166p-production-ledger-canary-v1` ✓
- Production project confirmed via MCP (server address matches every
  prior Production checkpoint this project).
- Admin session: pre-existing, live, correctly scoped
  (`sb-puhcjyffosgohbmxrczb-auth-token`), confirmed via authenticated
  `GET /api/admin/automation-status` → `200`.
- Baseline counters (Production):

  | Table | Value |
  |---|---|
  | `scheduled_writer_runs` — total | 1 |
  | `scheduled_writer_runs` — open | 0 |
  | `operational_notification_events` — total | 0 |
  | `operational_notification_events` — open/claimed | 0 |
  | `source_notice_candidates` | 3 |
  | `source_checks` | 2 |
  | `alerts` | 6 |
  | `automation_identities` | 2 |
  | `admin_profiles` | 1 |

- RPC signatures reconfirmed live (`pg_proc`, not the privilege-filtered
  `information_schema` views — see Day 10's own correction):
  `claim_operational_notification_event(p_environment_tag text, p_channel
  text, p_event_type text, p_severity text, p_fingerprint text,
  p_scheduled_writer_run_id uuid, p_source_id uuid, p_safe_summary text,
  p_stale_claim_after_seconds integer) returns table(claimed boolean,
  event_id uuid, suppressed_reason text)` and
  `finish_operational_notification_event(p_id uuid, p_status text,
  p_provider_status text, p_sent_at timestamptz) returns boolean`, both
  `authenticated`-executable, matching the application code exactly.

## 2. Flag activation and redeploy

- `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED=true` — **Production
  only**, no other Environment Variable touched. Every field (key, value,
  environment scope) verified via zoomed screenshot before Adam's own
  manual Save click (Checkpoint 1).
- One redeploy via the Deployments list's "..." → Redeploy on the exact
  Production row (never the save-toast's Redeploy button, per this
  project's own repeatedly-confirmed rule about that button's
  environment-defaulting risk). Deployment `FYYQLT3myJ4BtKC91QNEZqmJvtYL`,
  commit `179386d`, environment Production — reached **Ready**.

## 3. Preflight after redeploy

- Admin session still live on the fresh build (same session key).
  `GET /api/admin/automation-status` → `200`.
- `emailAlertConfig.enabled: false`, `configuredProvider: "none"`,
  `activeProvider: "none"` — confirmed structurally: no Resend client
  could ever be constructed in this state (`decideNotificationAdapterKind()`
  always returns `"noop"` when this flag is false/absent, before any
  Resend-related code runs).
- `operationalNotificationRuntimeEnabled: false` — unchanged.

## 4. The one authenticated POST

Sent **exactly once**, from the existing Production admin browser
session, using the session's own `access_token` (read from `localStorage`
programmatically, never displayed, copied, or logged) as an
`Authorization: Bearer` header:

```
POST /api/admin/operational-notification-ledger-test
→ HTTP 200
→ {"ok":true,"status":"abandoned"}
```

Exactly the outcome predicted by the Day 10 audit's code analysis. No
retry. No second request of any kind was sent to this endpoint before or
after.

## 5. Immediate rollback

- `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED` value changed from
  `true` to `false` (kept, not deleted, per this sprint's explicit
  instruction) — Production scope, unchanged. Every field verified before
  Adam's own manual Save click (Checkpoint 2). Note: the "Sensitive"
  toggle in Vercel's edit form appeared disabled/grayed during this edit
  — confirmed to be expected Vercel behavior (sensitivity cannot be
  changed via this form after creation); the variable's "Sensitive" tag
  remained set throughout, unaffected.
- One rollback redeploy via the same "..." → Redeploy path. Deployment
  `FWEZCWgQL8vyYoygofqGPNMGkeoa`, commit `179386d`, environment Production
  — reached **Ready**.

## 6. Full read-only audit (after rollback)

**New record — exactly one, fully terminal:**

| Field | Value |
|---|---|
| id | `7cf5a740-495a-405a-9f85-37e537322da3` |
| event_type | `unexpected_error` |
| status | `abandoned` (terminal — correct, since email alerts stay disabled in Production) |
| fingerprint | `production:ledger-test:unexpected_error` (exactly as predicted in the Day 10 audit's collision analysis — distinct from Preview's `preview:ledger-test:unexpected_error`) |
| claimed_at | `2026-07-26 12:52:40.827244+00` |
| finished_at | `2026-07-26 12:52:40.97818+00` (~151ms later — no stale claim) |
| sent_at | `NULL` |
| provider_status | `NULL` |
| attempt_count | `1` |

**Counters, before → after (Production):**

| Table | Before | After | Δ |
|---|---|---|---|
| `operational_notification_events` | 0 | 1 | **+1** (exactly the new canary row) |
| `scheduled_writer_runs` | 1 | 1 | 0 |
| `source_notice_candidates` | 3 | 3 | 0 |
| `source_checks` | 2 | 2 | 0 |
| `alerts` | 6 | 6 | 0 |
| `automation_identities` | 2 | 2 | 0 |
| `admin_profiles` | 1 | 1 | 0 |

- **Exactly one claim and one finish:** `attempt_count = 1`, both
  `claimed_at` and `finished_at` set on the single new row — no second
  claim attempt, no retry, no stale reopen.
- **No email, no Resend contact:** `sent_at = NULL`,
  `provider_status = NULL` — no send was ever attempted (the adapter's
  own `OPERATIONAL_EMAIL_ALERTS_ENABLED` gate, absent/false throughout,
  was never bypassed).
- **Zero open/stale claimed events:** the one new row has both
  `claimed_at` and `finished_at` set — no row anywhere in the table has
  `claimed_at IS NOT NULL AND finished_at IS NULL`.
- **Zero new alerts, zero changes to any other table:** every counter
  above besides `operational_notification_events` is unchanged.
- **Flag confirmed reset:** value is `false`, Production scope,
  unchanged elsewhere.
- **Endpoint fail-closed again:** `GET` → `405` (route shape unchanged);
  authenticated `GET /api/admin/automation-status` → `200` with **no
  mention of "ledger" anywhere** in the response, matching the flag's own
  disabled state.
- **Pages work:** authenticated admin session confirmed live and
  functional throughout; public homepage unaffected (no code path this
  canary touches intersects public routes).

## 7. Security audit

- No secret (session token, Environment Variable value, service_role key)
  was ever displayed, logged, or written anywhere by Claude. The session
  `access_token` was read only to construct one `Authorization` header
  per request and never appeared in any tool output text.
- Exactly one write-capable request (`POST .../ledger-test`) was sent
  this entire canary — zero retries, zero repeats, confirmed by direct
  action-by-action review of this checkpoint.
- The only Environment Variable touched was
  `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED`, Production-only,
  toggled `true` → `false` within this same session, both changes made
  only after Adam's own manual Save click (never an automated Save).
- No SQL `INSERT`/`UPDATE`/`DELETE` was ever executed directly — the one
  new database row was created entirely by the application's own RPC
  path (`claim_operational_notification_event` → `finish_operational_notification_event`),
  triggered solely by the one authorized HTTP request. No `apply_migration`
  call was made — none was needed, since the schema was already fully
  applied (confirmed in the Day 10 migration preflight).
- No other Environment Variable, table, or account was read, changed, or
  copied beyond read-only `SELECT`s via MCP and the two authenticated
  `GET`s to `automation-status`.
- No merge to `main`; no branch deleted or force-pushed; no email or
  Resend contact of any kind; no Cron invoked.

## 8. Files and commits

This checkpoint document is the only repository change this stage — no
`src/` or `tests/` file was touched, so no test suite, typecheck, or
build run was needed.

## 9. Where this leaves the rollout

Production now has a fully proven, end-to-end verified operational-
notification ledger path: the existing schema and RPCs (confirmed
correctly applied in the Day 10 migration preflight), the existing admin
account, the existing writer credentials, and now a genuine live
claim→finish→terminal cycle against the real Production database — all
exercised safely, all reverted, zero side effects beyond the one
intended, now-terminal event row.

The mechanism is proven end-to-end in both Preview and Production. Any
future decision to actually *enable* `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED`
and/or `OPERATIONAL_EMAIL_ALERTS_ENABLED` for real, ongoing operational
alerting in Production remains a distinct, separate, future decision that
this canary does not make or imply — this canary only proved the
diagnostic path works, not that live alerting should be turned on.

## 10. Production canary program — completion

**100%.** Every step of the approved runbook (§7 of the Day 10 audit
document) was executed exactly as scoped: fresh preflight, one flag
activation, one redeploy, `automation-status` confirmation, one
authenticated POST with zero retry, immediate rollback preparation with
both manual Save checkpoints honored, one rollback redeploy, and a full
before/after audit — with the correct predicted outcome
(`production:ledger-test:unexpected_error`, terminal `abandoned` status,
exactly one new row, zero side effects) confirmed at every step.
