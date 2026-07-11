# Sprint 148 — Controlled Write Test Runbook v1

**Status: approval recorded, execution PENDING (Adam only).** Nothing in
this document has been executed by Claude Code. Every step below
requires a real Supabase/Vercel action that only Adam can perform —
account creation, credential generation, and Vercel environment
variables are explicitly reserved to the human operator by this
project's standing rules (`CLAUDE.md` § MCP rules, § Security Rules) and
were not delegated by Adam's approval message.

**Approved scope (2026-07-15):** items 1–9 below, in Vercel **Preview**
only, targeting **Gmina Michałowice — komunikaty only**.
**Not approved:** Vercel Cron activation, any schedule, repeated/
automatic invocations, WKD in this first write, `service_role`, any
`alerts`/`admin_profiles` change, the `alert_sources` cleanup, auto-draft,
autopublish, publishing, ads/analytics/push/payments.

**Hard rule for this entire runbook: no real password, token, or secret
value is ever pasted into this repository, into any Obsidian note, into
any chat message, or into any log.** Every step below that produces a
secret says explicitly where it goes instead (Vercel's own environment
variable UI, or a password manager) — never here.

---

## Step 1 — Apply the grant-hardening fix

Run, exactly as written, in the Supabase SQL Editor:

```
docs/sql/PROPOSED_AUTOMATION_IDENTITIES_GRANT_HARDENING_V1.sql
```

This revokes `TRUNCATE`/`TRIGGER`/`REFERENCES` on
`public.automation_identities` from `authenticated` (Sprint 146's
verified residual-grant finding). Verify immediately after with:

```
docs/sql/VERIFY_AUTOMATION_IDENTITIES_GRANTS_READ_ONLY_V1.sql
```

Expected: `authenticated` shows exactly one row — `SELECT`. Rollback
if ever needed:
`docs/sql/PROPOSED_AUTOMATION_IDENTITIES_GRANT_HARDENING_ROLLBACK_V1.sql`
(not expected to be needed).

## Step 2 — Create the technical Supabase Auth account

In the Supabase dashboard (Authentication → Users → Add user), create
**one** account dedicated to the scheduled writer — e.g.
`scheduled-writer@alertownik.internal` (any address Supabase Auth
accepts; it does not need to receive real mail). This is a manual
dashboard action — never scripted, never via MCP, per this project's
standing rule.

**Do not paste the resulting user id or email into this repository, this
conversation, or Obsidian if you consider either sensitive** — a bare
`auth.users.id` (UUID) is not itself a secret (Sprint 144's audit already
recorded the admin's own id in Obsidian for reference), but the account's
**password** absolutely must never appear anywhere but Supabase's own
dashboard and your password manager.

## Step 3 — Add the account's id to `automation_identities`

In the Supabase SQL Editor, run (substituting the real UUID from Step 2
— **do not paste that UUID into this repo's files**, run it directly in
the SQL Editor as a one-off manual statement, not saved anywhere):

```sql
insert into public.automation_identities (user_id)
values ('<the-technical-account-uuid-from-step-2>');
```

This is the one and only manual INSERT this whole project sanctions for
this table — matching the design in
`docs/SCHEDULED_WRITER_RLS_MIGRATION_PLAN_V1.md` (no application code
path can perform this insert; it is intentionally SQL-Editor-only).

Verify with `docs/sql/VERIFY_AUTOMATION_IDENTITIES_GRANTS_READ_ONLY_V1.sql`
§4 (`select user_id, created_at from public.automation_identities`) —
expect exactly one row now.

## Step 4 — Generate strong, private credentials

Generate a strong password **outside this repository** — a password
manager, or a terminal command whose output you copy directly into the
password manager and Vercel (never into a file Claude Code or this
session can read), e.g.:

```
openssl rand -base64 32
```

Set this as the technical account's password in the Supabase dashboard
(Authentication → Users → the account → Reset/set password, or via the
Admin API if you prefer). **This password is never written to any file
in this repository, any Obsidian note, or this conversation.**

## Step 5 — Add secrets as server-only environment variables (Vercel Preview only)

In Vercel's project settings → Environment Variables, scoped to
**Preview only** (not Production, not Development unless you also want
it there — recommend Preview-only for this controlled test), add:

| Variable | Value |
|---|---|
| `SUPABASE_SCHEDULED_WRITER_EMAIL` | the technical account's email from Step 2 |
| `SUPABASE_SCHEDULED_WRITER_PASSWORD` | the password from Step 4 |
| `CRON_SECRET` | a fresh, strong random value (e.g. `openssl rand -hex 32`), used only to authenticate requests to `/api/cron/write-candidates` and `/api/cron/check-sources` |
| `SCHEDULED_WRITER_SOURCE_REGISTRY_IDS` | `{"michalowice-komunikaty":"<alert_sources.id for Michałowice>"}` — **omit `wkd-aktualnosci` entirely** from this mapping (see the source-scope note below) |

All four are read only inside `src/lib/scheduledWriter.ts` /
`src/app/api/cron/*/route.ts` — never in a client component, never
`NEXT_PUBLIC_`-prefixed (already enforced by this codebase's design and
its static-import tests). None of these values are ever set in
Production by this runbook.

## Step 6 — Enable the two kill switches (Preview only)

In the same Vercel Preview environment-variable scope, add:

| Variable | Value |
|---|---|
| `SCHEDULED_CHECKS_ENABLED` | `true` |
| `SCHEDULED_WRITES_ENABLED` | `true` |

Redeploy (or trigger a new Preview deployment) so these take effect.
**Production remains completely untouched and still fully disabled** —
Vercel's per-environment variable scoping is the actual isolation
mechanism here, not application code; verify in the Vercel dashboard
that these four+two variables show "Preview" only in their environment
badges before proceeding.

## Step 7 — One controlled write test, Michałowice only

**Critical: call the endpoint with an explicit `sourceKey` query
parameter.** Do not call it bare — a bare call iterates every
allowlisted source (both Michałowice and WKD), which would violate the
"WKD excluded from this first write" approval condition. Call exactly:

```
GET https://<your-preview-deployment-url>/api/cron/write-candidates?sourceKey=michalowice-komunikaty
Authorization: Bearer <CRON_SECRET from Step 5>
```

(e.g. via `curl -H "Authorization: Bearer <secret>"
"https://<preview-url>/api/cron/write-candidates?sourceKey=michalowice-komunikaty"`
— run this from your own terminal, not pasted with the real secret into
this conversation).

This is a **single, manual, one-off HTTP request** — not a schedule, not
a loop, not Vercel Cron (unapproved, untouched). Expect a JSON response
with `checkedSources: 1`, `published: false`, and either
`candidatesInserted`/`sourceChecksInserted` counts (if the source has a
current notice) or `proposalsFound: 0` (if it doesn't right now — both
are valid, honest outcomes, not a failure).

## Step 8 — Verify via SELECT-only queries

Run `docs/sql/VERIFY_SPRINT_148_CONTROLLED_WRITE_TEST_READ_ONLY_V1.sql`
(new, prepared alongside this runbook) in the Supabase SQL Editor.
Confirm:
- At most the expected small number of new `source_notice_candidates`
  rows exist, all `status = 'pending'`, all `source_key =
  'michalowice-komunikaty'`, none with a non-null verifier/conversion
  field.
- At most one new `source_checks` row, `result` in
  `('no_changes', 'found_notice')`, `related_alert_id IS NULL`.
- **Zero** new rows for `source_key = 'wkd-aktualnosci'` in either
  table (confirms WKD was genuinely untouched).
- `alerts` row count and every existing row's `updated_at` are
  **unchanged** from before the test (confirms nothing was published or
  modified).

If anything looks unexpected, stop and investigate before proceeding to
Step 9 — do not repeat the write test to "see if it clears up."

## Step 9 — Disable write mode after the test

Per the deployment runbook's own kill-switch principle
(`docs/SCHEDULED_WRITER_RLS_DEPLOYMENT_RUNBOOK_V1.md` §13): once Step 8
confirms a clean result, the safer resting state is **write mode off**.
Remove or set `SCHEDULED_WRITES_ENABLED` back to anything other than
`"true"` in the Preview environment (fastest, code-level disable — no
redeploy of application code needed, only the environment variable
change + a redeploy/env-refresh). Optionally also revoke the technical
account's session or rotate its password if you want an even more
conservative resting state; removing it from
`public.automation_identities` (a `DELETE` on that one row) is the
most conservative option of all, fully reversible by re-running Step 3.

**This runbook does not decide step 9 for you** — "if the runbook deems
it safer" was Adam's own condition; the honest answer is: yes, turning
`SCHEDULED_WRITES_ENABLED` off after a single manual test is the safer
resting state, since leaving it on serves no purpose between manual
tests and only adds exposure.

---

## What remains explicitly unapproved after this runbook

- Vercel Cron activation, any `vercel.json` schedule, or any external
  scheduler pointed at this endpoint.
- Any automatic or repeated invocation — every call to
  `/api/cron/write-candidates` is a manual, one-off action until a
  future, separately-approved sprint says otherwise.
- Including WKD in any write-mode call.
- `service_role`, or any change to `alerts`, `admin_profiles`, or the
  `alert_sources` cleanup proposal.
- Auto-draft creation, autopublish, or any alert publication path.
- Ads, analytics, push notifications, payments.

## Rollback summary (if anything goes wrong at any step)

- Grant hardening: `PROPOSED_AUTOMATION_IDENTITIES_GRANT_HARDENING_ROLLBACK_V1.sql`.
- Technical account membership: `delete from public.automation_identities where user_id = '<uuid>';`
- Kill switches: remove/flip `SCHEDULED_WRITES_ENABLED` and/or
  `SCHEDULED_CHECKS_ENABLED` in Vercel Preview — takes effect on next
  request, no code change needed.
- Full RLS rollback (only if the underlying migration itself is ever
  suspected faulty, not expected here):
  `docs/sql/PROPOSED_SCHEDULED_WRITER_RLS_ROLLBACK_V1.sql`.
- No step in this runbook writes to `alerts` under any circumstance —
  there is nothing to roll back there.
