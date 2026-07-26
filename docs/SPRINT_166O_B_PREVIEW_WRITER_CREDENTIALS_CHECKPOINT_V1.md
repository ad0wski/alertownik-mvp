# Sprint 166O-B — Preview Writer Credentials: Execution Checkpoint

**Status: complete for the scope approved this sprint.** The existing,
already-documented Preview scheduled-writer identity
(`preview-test-writer@example.invalid`) now has credentials configured in
Vercel, scoped exclusively to Preview and pinned to exactly one branch.
No new Supabase Auth account was created. No row was inserted into
`automation_identities`. `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED`
remains absent everywhere. No claim/finish, no email, no Resend, no
Production change of any kind.

---

## 1. What happened

- **Password reset (Adam, personally, via a prepared one-shot script):**
  the existing Preview writer account's password was reset through the
  Supabase Admin API (`PUT /auth/v1/admin/users/{id}`), using Adam's own
  `service_role` key, entered via hidden `SecureString` input, never seen,
  read, or logged by Claude at any point. The first attempt (v1) used the
  wrong HTTP verb (`PATCH`) and returned `405` — diagnosed via Supabase's
  own documentation (GoTrue admin endpoints consistently use `PUT`) and
  confirmed empirically that the script's `finally` block still cleared
  the `service_role` variable from memory even on that failed attempt. v2
  (fixed verb) succeeded (`HTTP 200`), but the resulting password was lost
  when the clipboard was overwritten before pasting. v3 (new, independent
  one-shot marker) repeated the exact same audited procedure and
  succeeded (`HTTP 200`); the password was pasted directly into Vercel
  this time.
- **`SUPABASE_SCHEDULED_WRITER_EMAIL`** — value
  `preview-test-writer@example.invalid` (not a secret, typed and saved by
  Claude directly per Adam's explicit instruction), scope **Preview
  only**, branch-pinned to `sprint-166o-preview-writer-identity-v1`.
- **`SUPABASE_SCHEDULED_WRITER_PASSWORD`** — scope **Preview only**,
  branch-pinned to the same branch, `Sensitive` enabled. Claude prepared
  every non-secret field (key, scope, branch) and stopped exactly at the
  `Value` field; Adam pasted the password from his clipboard and clicked
  Save himself.
- **Exactly one Redeploy** of the branch's Preview deployment was
  performed after both variables were confirmed saved, producing a fresh
  build (commit `fb41c9c`) that picked up the new credentials — confirmed
  via the deployment's own "Created" timestamp being after both variable
  additions.

## 2. Read-only verification (this session)

- **Vercel, names/scopes only, no values read:** both
  `SUPABASE_SCHEDULED_WRITER_EMAIL` and `SUPABASE_SCHEDULED_WRITER_PASSWORD`
  confirmed scoped to **Preview**, branch
  `sprint-166o-preview-writer-identity-v1`, distinct from the untouched
  Production copies of the same variable names. A search for
  `LEDGER_TEST` across all Environment Variables returned **zero
  results** — `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED` was not set.
- **Fresh Preview deployment, read-only smoke test:**
  `https://alertownik-mvp-git-sprint-166o-preview-writer-9b4c1f-alertownik.vercel.app`
  — homepage loads cleanly (zero console errors, zero `/api/` calls);
  `/admin/sources` correctly gates behind login for an unauthenticated
  session; the ledger-test endpoint remains fail-closed
  (`POST` → `401 {"ok":false,"error":"Wymagane logowanie."}`, `GET` →
  `405`); `GET /api/admin/automation-status` also correctly returns `401`
  unauthenticated — same admin gate, no bypass.
- **Writer-credentials-configured confirmation — with an explicit
  limitation noted:** this specific Preview-branch deployment uses its
  own isolated Supabase Auth session (the `alertownik-preview` project),
  entirely separate from any Production admin session already open in the
  browser. No Preview admin login credentials were available this
  session, so the authenticated `automation-status` panel view (which
  would show `writerCredentialsConfigured: true` directly) could not be
  loaded. Confidence that it reports `true` is instead based on two
  already-verified facts composed together: (a) both required Environment
  Variables are confirmed present, by name and scope, on this exact fresh
  deployment, and (b) `getScheduledWriterCredentials()`
  (`src/lib/scheduledWriter.ts`) is a simple, already-unit-tested,
  deterministic function (`return email && password ? {...} : null`) —
  given both inputs are present, the output is not in question. This is a
  well-founded inference, not a visual confirmation, and is recorded here
  as an honest limitation rather than papered over.
- **Supabase Production counters (via MCP, read-only) — unchanged from
  every prior checkpoint this week:** `scheduled_writer_runs`=1 (0 open),
  `source_notice_candidates`=3, `source_checks`=2,
  `operational_notification_events`=0 (0 claimed), `alerts`=6,
  `automation_identities`=2.
- **Supabase Preview `automation_identities` (via SQL Editor, read-only):**
  still exactly **1** row, still the same writer `user_id`
  (`...a966c52`) — the password reset changed only the password, nothing
  in this table.

## 3. Security audit

- No secret value (service_role, password, token) was ever displayed,
  logged, written to a file, or pasted into this conversation by Claude.
- Every PowerShell script (v1/v2/v3) was statically parsed and audited
  (AST-based: exactly one network call, zero retry loops, correct body
  shape, secret-cleanup mechanism, marker discipline) **before** Adam ran
  it — never executed by Claude.
- `SUPABASE_SCHEDULED_WRITER_EMAIL`'s value (a non-secret email address)
  was typed and saved directly by Claude, per Adam's explicit,
  scope-limited instruction — confirmed correct via the field's own
  visible (non-masked, since it's not a real secret) value before saving.
- No Production Environment Variable was read, changed, or copied. No SQL
  `INSERT`/`UPDATE`/`DELETE` was executed by Claude at any point this
  sprint. No merge to `main`; no branch deleted.

## 4. What remains false/absent (confirmed)

| Flag | State |
|---|---|
| `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED` | absent everywhere — confirmed via Vercel search, zero results |
| `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED` | unchanged, scoped to an unrelated branch only |
| `OPERATIONAL_EMAIL_ALERTS_ENABLED` | unchanged, scoped to an unrelated branch only |
| `SCHEDULED_WRITES_ENABLED` | absent/false everywhere — unchanged |
| Production `SUPABASE_SCHEDULED_WRITER_EMAIL`/`_PASSWORD` | unchanged, Production scope only |

No request was ever sent to
`POST /api/admin/operational-notification-ledger-test` with a real admin
session or with the flag enabled. Zero claim/finish. Zero email. Zero
Resend contact.

## 5. Files and commits

This checkpoint document only — no `src/` or `tests/` file changed this
session (all work was Vercel/Supabase dashboard actions plus local,
never-committed PowerShell scripts in the session scratchpad, outside the
repository).

## 6. Next: Sprint 166O-C (plan only — not started)

The branch now has everything needed for a real, isolated Preview ledger
canary:

1. **Set `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED=true`**, Preview
   scope, branch-pinned to `sprint-166o-preview-writer-identity-v1` only
   — a real Environment Variable change, requiring Adam's separate,
   explicit approval (per this session's standing rule: flag activation
   is never automatic).
2. One Redeploy of the same branch to pick up the flag.
3. Read-only smoke test confirming the flag is now visible in the
   automation-status panel (this time with an authenticated admin
   session — Adam's own, or a decision about how Claude verifies this
   going forward) and that the endpoint is still admin-gated.
4. **Exactly one** authenticated `POST` to
   `/api/admin/operational-notification-ledger-test`, from a real admin
   session — the first genuine live `claim`→`finish` cycle against the
   Preview ledger, using the fixed `unexpected_error` eventType and fixed
   `ledger-test` scope key (§ design doc
   `SPRINT_166M_PRODUCTION_NOTIFICATION_CANARY_DESIGN_V1.md`).
5. Read-only verification: exactly one new
   `operational_notification_events` row in `alertownik-preview`, correct
   terminal status (`abandoned`, since `OPERATIONAL_EMAIL_ALERTS_ENABLED`
   stays false), zero new `scheduled_writer_runs` row, zero new
   `source_notice_candidates` row, a second invocation within the
   cooldown window correctly suppressed.
6. Immediate rollback: `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED`
   back to false/removed, one more Redeploy, confirmed fail-closed again.
7. Checkpoint, commit, push — still no merge to `main` without a
   separate, later decision.

**Not started. Requires Adam's explicit approval before step 1.**
