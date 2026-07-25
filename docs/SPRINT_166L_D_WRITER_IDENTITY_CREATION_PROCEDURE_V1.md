# Sprint 166L-D — New Scheduled Writer Identity: Preparation Procedure (Path B)

**Status: preparation only. Nothing in this document has been executed.**
No Supabase Auth account has been created. No row has been inserted into
`automation_identities`. No Environment Variable has been set. No
sign-in has been attempted. No writer, RPC, Cron, claim/finish, email, or
Resend action has occurred. Every SQL statement in this document is
either read-only or explicitly marked "prepared, not run."

Adam approved Path B (Sprint 166L-C §4): a new, dedicated technical
identity, never the pre-existing, unexplained `automation_identities` row
(`user_id` ending `...da746`, added 2026-07-11) and never Adam's own
admin account.

**This document, and Claude, will never see, request, display, copy, or
store the new account's password, any session token, or any Vercel
secret value — at any point.** Every step that touches a real credential
is explicitly marked "Adam performs this step directly" below.

---

## 1. What "jednoznacznie oddzielone" (unambiguously separate) means here

The new identity must satisfy all of:
- A **different email address** than Adam's own Supabase/admin login.
- **Not** added to `public.admin_profiles` (that table stays exactly
  what it is today — 0 rows in Production, confirmed in the Sprint 166L-C
  audit).
- Added to `public.automation_identities` **only** — the same narrow
  table the existing (unused-going-forward) row is in, but as a distinct
  row with its own `user_id`.
- A **new** row, not a reuse or edit of the existing `...da746` row —
  that row is left untouched by this sprint; a decision about its fate
  is separate and not made here.

## 2. Step-by-step procedure for Adam (Supabase dashboard, Production project)

**Step 2.1 — Confirm project identity, exactly like every prior sprint.**
From the Supabase organization's project list (never a typed URL, never
an already-open tab), click the card literally labeled `alertownik-mvp`.
Confirm the dashboard header reads `alertownik-mvp` and the project ref
shown is `puhcjyffosgohbmxrczb`. Confirm this is **not**
`alertownik-preview` (`nowvcdbtgaigutyxpmdp`).

**Step 2.2 — Navigate to Authentication → Users.**

**Step 2.3 — Click "Add user" → "Create new user".** (Not "Invite" — an
invite sends a real email with a magic link, which this server-side
automation account will never click. A direct password-based user is
correct here.)

**Step 2.4 — Email field.** Enter an address that:
- is **not** Adam's own admin login email,
- clearly signals its purpose (e.g. a dedicated mailbox you control for
  this project, or a `+`-tagged alias of an address you already own —
  Supabase treats `you+alertownik-writer@example.com` as a fully
  distinct address from `you@example.com`, and either approach keeps the
  new identity visually unmistakable in the Users list from your own
  admin account or the old, unexplained row).
- Adam types this directly into the Supabase dashboard form. Claude never
  sees or suggests a specific address.

**Step 2.5 — Password field.** Generate a strong, random password
**outside this chat session entirely** — a password manager's generator,
or a local command like `openssl rand -base64 24` run in your own
terminal, output read only by you. **Never paste it into this
conversation, never paste it into any file in this repository, never let
Claude see it.** Type it directly into the Supabase dashboard's password
field. Store it only in your password manager (the same place
`SUPABASE_SCHEDULED_WRITER_PASSWORD`'s value will eventually live — no
new storage location needed beyond that and Vercel itself).

**Step 2.6 — "Auto Confirm User" — check this box.** This is not
optional: `signInScheduledWriter()` (`src/lib/scheduledWriter.ts`) calls
`signInWithPassword()` directly — there is no email-confirmation-link
flow anywhere in this codebase for this account, and none will ever run
unattended. If the account's email is left unconfirmed, every future
sign-in attempt fails permanently, indistinguishably from a wrong
password (both collapse to the same generic `sign_in_failed` → the same
generic `503` response). Checking this box now avoids a silent,
hard-to-diagnose dead end later.

**Step 2.7 — Save / Create user.**

**Step 2.8 — Read only the new user's `user_id`.** In the Users list (or
the just-created user's detail view), copy the **UUID** shown as its ID
— a non-secret identifier, the same kind already safely documented for
the existing `...da746` row in the Sprint 166L-C audit. Do **not** copy
the email, password, or any token field. You may share this UUID with
Claude if you want it recorded in a future checkpoint (matching how the
existing row's id was documented) — it carries no more risk than the
`...da746` reference already in this repository's docs.

**Nothing past this point requires typing a password anywhere again for
this sprint.**

## 3. Prepared — not executed — `automation_identities` INSERT

`docs/sql/PROPOSED_SPRINT_166L_D_NEW_WRITER_IDENTITY_V1.sql` (new file,
this sprint) contains:
- a single `INSERT` templated with an obviously-invalid placeholder
  (`'PASTE_NEW_WRITER_USER_ID_HERE'` — not a well-formed UUID, so running
  the file unedited fails a type-cast error rather than silently
  inserting a wrong row — the same "fail loudly on an unfilled
  placeholder" discipline established in the Sprint 166K-C retention
  hardening),
- a read-only verification query confirming exactly one row exists for
  that specific `user_id` after the real one is substituted in,
- a scoped rollback `DELETE` that removes only that one row, guarded by
  a `RAISE EXCEPTION` if it would match zero or more than one row (never
  a bare, unguarded `DELETE`).

**This file is not run by this sprint.** Adam pastes the real `user_id`
in, reviews the file, and clicks Run himself — matching this project's
unbroken convention that Claude never executes write-performing SQL.

## 4. Prepared — not set — Vercel Environment Variables

When Adam is ready (a separate action from everything above):
- `SUPABASE_SCHEDULED_WRITER_EMAIL` — Production scope only, value = the
  new account's email (typed directly into Vercel by Adam).
- `SUPABASE_SCHEDULED_WRITER_PASSWORD` — Production scope only, value =
  the same generated password (typed directly into Vercel by Adam, from
  the password manager — never re-typed from memory, never pasted via
  this chat).

**Not set by this sprint.** No existing Vercel value was read to prepare
this section — the plan only names which two variables, in which scope,
matching exactly what Sprint 166L-C already established.

## 5. Confirmed unchanged for the full duration of Sprint 166L-D

| Flag | State |
|---|---|
| `SCHEDULED_WRITES_ENABLED` | absent/false — unchanged |
| `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED` | absent/false — unchanged |
| `OPERATIONAL_EMAIL_ALERTS_ENABLED` | absent/false — unchanged |

None of these is touched by creating an identity or setting credentials
— `SCHEDULED_WRITES_ENABLED` alone already keeps `write-candidates` at a
`503` regardless of whether valid writer credentials exist (Layer 1/2
precedes Layer 3 in the route — see Sprint 166L-C §2's flow diagram).

## 6. Rollback

- **New Supabase Auth account:** delete via the dashboard (Auth → Users
  → the new row → Delete), or disable it — either fully revokes it.
- **`automation_identities` row (if the prepared INSERT was run):** the
  same file's own guarded `DELETE`, scoped to that one `user_id`.
- **Vercel credentials (if set):** delete both variables from Production
  scope — instant return to today's fail-closed state, no redeploy
  strictly required (though recommended for observability, matching
  every prior phase's convention).

## 7. Explicit non-actions in this preparation turn

- No Supabase Auth account was created.
- No SQL was executed (the one `SELECT`-only, table-existence-style
  checks from Sprint 166L-C were not repeated here — nothing new was
  read from Supabase in this turn).
- No Environment Variable was set, read, or changed.
- No sign-in was attempted; no credential was tested.
- No `/api/cron/write-candidates`, writer, Cron, RPC, claim/finish,
  email, or Resend action occurred.
- No merge to `main`; no branch deleted.

## 8. Execution checkpoint — new identity created and linked (2026-07-25)

**Status: Path B is now complete.** Adam performed every credential-bearing
step personally, exactly per §2 above:

- A new, dedicated Supabase Auth account was created in Production
  (`alertownik-mvp`, project ref `puhcjyffosgohbmxrczb`) via
  Authentication → Users → Add user → Create new user, with
  "Auto Confirm User" checked.
- Read-only verification (via Supabase MCP, `SELECT` only) confirmed
  before the insert: the account exists in `auth.users`, its email is
  confirmed, it is not banned or deleted, and no `automation_identities`
  row referenced its `user_id` yet.
- `docs/sql/READY_SPRINT_166L_D_NEW_WRITER_IDENTITY_V1.sql` was prepared
  with the real `user_id` filled in (non-secret — an opaque identifier,
  same precedent as the existing `...da746` row). The template file
  (`PROPOSED_SPRINT_166L_D_NEW_WRITER_IDENTITY_V1.sql`, still using the
  fail-loud placeholder) was left untouched.
- Adam pasted the single `INSERT` statement into a fresh Supabase SQL
  Editor tab, confirmed the project header read `alertownik-mvp` /
  `main` / `PRODUCTION`, and clicked Run himself, exactly once.
- Post-insert read-only verification (via Supabase MCP, `SELECT` only)
  confirmed:
  - Exactly one `automation_identities` row exists for the new
    `user_id`.
  - `automation_identities` now holds exactly 2 rows total: the
    pre-existing `...da746` row (unchanged, `created_at` unchanged) and
    the new row.
  - Every other `public` table's row count is unchanged from the
    Sprint 166L-C/166L-D baseline (`alerts`=3, `alert_categories`=0,
    `alert_sources`=0, `admin_profiles`=0, `source_checks`=2,
    `waste_schedule_items`=40, `source_notice_candidates`=2,
    `scheduled_writer_runs`=0, `operational_notification_events`=0) —
    the insert touched only `automation_identities`, nothing else.

**Still not done — separate, later, explicitly-approved steps:**
- `SUPABASE_SCHEDULED_WRITER_EMAIL` / `SUPABASE_SCHEDULED_WRITER_PASSWORD`
  have not been set in Vercel (see §4 — plan only, unexecuted).
- No sign-in with the new credentials has been attempted.
- `SCHEDULED_WRITES_ENABLED` and the notification flags remain
  false/absent (§5, unchanged).
- No writer, RPC, Cron, claim/finish, email, or Resend action has
  occurred.
- No merge to `main`; no branch deleted.
