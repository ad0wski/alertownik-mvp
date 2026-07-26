# Sprint 166O-B — Preview Scheduled-Writer Identity: Preparation Procedure

**Status: preparation only. Nothing in this document has been executed.**
No Supabase Auth account has been created or modified. No row has been
inserted into `automation_identities`. No Environment Variable has been
set. No sign-in has been attempted. No writer, RPC, Cron, claim/finish,
email, or Resend action has occurred.

**Claude will never see, request, display, copy, or store any password,
session token, or Vercel secret value for this identity — at any point.**
Every step that touches a real credential is explicitly marked "Adam
performs this step directly" below.

---

## 1. Key finding — a dedicated Preview writer identity already exists

A read-only audit of `alertownik-preview` (project ref
`nowvcdbtgaigutyxpmdp`, confirmed via the Supabase dashboard's own project
card and SQL Editor breadcrumb) found:

- `public.automation_identities` already has **exactly 1 row** in Preview.
- That row's `user_id` belongs to a `auth.users` account whose purpose is
  already documented in this repository:
  `docs/SPRINT_165C_PHASE_4_AUTH_AND_SYNTHETIC_SEED_V1.md` §(seed table)
  names it explicitly as **"Test scheduled-writer"**, email
  `preview-test-writer@example.invalid` — an RFC 2606 reserved,
  unroutable domain, created alongside a separate, distinct
  **"Test admin"** account (`preview-test-admin@example.invalid`, linked
  to `admin_profiles`, never `automation_identities` — confirmed by a
  read-only join query: the writer account is `automation_identities`
  member, the admin account is not, and neither overlaps the other).
- This account is healthy: email confirmed, not banned, not deleted, and
  has signed in before (`last_sign_in_at` populated) — a real, working,
  previously-exercised identity, not a stale placeholder.

**Consequence: this sprint requires no new Supabase Auth account and no
new `automation_identities` INSERT.** The dedicated identity envisioned
by `SPRINT_166N_D_DAY6_FINAL_CLOSEOUT_V1.md` §C already exists, was
already created with unambiguous, documented, dedicated-purpose
provenance (unlike Production's own originally-ambiguous row — see
`SPRINT_166L_C_WRITER_IDENTITY_AUDIT_V1.md` §1.2 for that contrast). This
is closer to Sprint 166L-C's "Path A — clarify and reuse" than "Path B —
create new," except here the provenance is already fully documented with
high confidence, not merely asserted.

The only missing piece is credentials: `SUPABASE_SCHEDULED_WRITER_EMAIL` /
`SUPABASE_SCHEDULED_WRITER_PASSWORD` exist **only in Production scope** in
Vercel today — confirmed via a read-only pass over the Environment
Variables page. No Preview-scoped writer credential has ever been set (or
if one was, briefly, for the already-completed Sprint 166G-3 Preview
validation, it was fully removed afterward, matching this project's
"toggle → test → revert" discipline — the Vercel page shows zero
Preview-scoped entries for either variable today).

## 2. What "never copy Production credentials" means here

The existing Preview writer account's password is **not** the Production
writer account's password — they are two structurally distinct Supabase
Auth accounts in two structurally distinct Supabase projects
(`alertownik-mvp` / `puhcjyffosgohbmxrczb` vs. `alertownik-preview` /
`nowvcdbtgaigutyxpmdp`). There is no value to "copy" between them even in
principle — Adam sets a **fresh, newly generated** password for the
Preview account, exactly as if it were being created for the first time.

## 3. Step-by-step procedure for Adam (Supabase dashboard, `alertownik-preview` project)

**Step 3.1 — Confirm project identity**, exactly like every prior sprint.
From the Supabase organization's project list (never a typed URL, never
an already-open tab), click the card literally labeled `alertownik-preview`.
Confirm the dashboard header/breadcrumb reads `alertownik-preview` and
the project ref is `nowvcdbtgaigutyxpmdp`. Confirm this is **not**
`alertownik-mvp` (`puhcjyffosgohbmxrczb`).

**Step 3.2 — Navigate to Authentication → Users.**

**Step 3.3 — Find the existing `preview-test-writer@example.invalid`
account** (or confirm its `user_id` — non-secret — begins
`2d30d5e3-...` if you want an extra confirmation beyond the email; both
identify the same, single, already-documented row).

**Step 3.4 — Reset its password.** Use the dashboard's own
"Reset password" / "Send password recovery" action **or**, since this is
a server-side technical account with no real inbox behind
`example.invalid`, directly set a new password via the account's edit
form if the dashboard offers that (some Supabase dashboard versions allow
directly typing a new password for an existing user, same field as
account creation). Generate the password **outside this chat session
entirely** — a password manager's generator, or a local command like
`openssl rand -base64 24` run in your own terminal, output read only by
you. **Never paste it into this conversation, never paste it into any
file in this repository, never let Claude see it.**

**Step 3.5 — Confirm "Auto Confirm"/email-confirmed status is still
true** after the reset (it already was, per §1 — resetting a password
does not usually change this, but worth a glance since
`signInScheduledWriter()` calls `signInWithPassword()` directly with no
email-link flow).

**Nothing past this point requires typing a password anywhere again for
this step.**

## 4. No `automation_identities` action needed

Unlike the Production procedure
(`SPRINT_166L_D_WRITER_IDENTITY_CREATION_PROCEDURE_V1.md` §3), there is
**no prepared SQL file for this sprint** — the row already exists, dated
2026-07-21, already scoped to exactly this one account, already verified
as the sole member. Re-running an `INSERT` would violate the primary-key
constraint and is neither needed nor prepared here.

If, after Adam's own review, this row's provenance is judged insufficient
after all, the fallback is the same Path B procedure Production used
(new account, new `INSERT`) — not assumed or prepared by this document,
since §1's evidence makes it unnecessary by default.

## 5. Prepared — not set — Vercel Environment Variables

When Adam is ready (a separate action from everything above):

- `SUPABASE_SCHEDULED_WRITER_EMAIL` — **Preview scope**, ideally scoped
  further to exactly `sprint-166o-preview-writer-identity-v1` (this
  branch) or whichever branch will run the canary — matching this
  project's own established convention of pinning Preview-only flags to
  a specific branch (see `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED` and
  `OPERATIONAL_EMAIL_ALERTS_ENABLED`, both already scoped this way).
  Value = `preview-test-writer@example.invalid` (already known, not
  secret — an email address, not a credential; still typed directly by
  Adam to avoid any ambiguity).
- `SUPABASE_SCHEDULED_WRITER_PASSWORD` — same scope, value = the password
  generated and set in §3.4 (typed directly into Vercel by Adam, from the
  password manager — never re-typed from memory, never pasted via this
  chat).

**Not set by this sprint.** No existing Vercel value was read to prepare
this section beyond names/scopes (§6 of the Sprint 166O-A checkpoint).

## 6. Required redeploy

After setting both variables, one Preview redeploy of the relevant branch
is required for the new values to take effect (Next.js reads
`process.env` at request time on Vercel, but a fresh deployment is the
observable, conventional way this project has always confirmed a new
Environment Variable is live — see every prior FAZA in
`SPRINT_166H_PRODUCTION_ROLLOUT_RUNBOOK_V1.md`).

## 7. Read-only verification after setting credentials

- Vercel Environment Variables page: both variable **names** show the
  correct scope (Preview, ideally branch-pinned) — values never read back
  by Claude.
- `GET /api/admin/automation-status` on the resulting Preview deployment
  (admin session, already-existing pattern): `writerCredentialsConfigured`
  becomes `true` — a presence-only boolean, never the values.
- No sign-in is attempted by this step alone — `SUPABASE_SCHEDULED_WRITER_EMAIL`/
  `_PASSWORD` being present only means `getScheduledWriterCredentials()`
  now returns non-null; `signInScheduledWriter()` is only ever called
  when a request actually reaches Layer 3, e.g. a real ledger-test
  invocation (Sprint 166O-D, not this step).

## 8. Rollback, for each step

- **Password reset (§3.4):** reset again to a new, different value, or
  disable the account entirely (Auth → Users → the row → Disable) — either
  fully revokes the old credential.
- **Vercel credentials (§5, if set):** delete both variables from their
  Preview (branch-pinned) scope — instant return to today's
  `getScheduledWriterCredentials() → null` fail-closed state for that
  branch; a redeploy is recommended for observability, not strictly
  required (env absence is checked fresh per request).
- **No `automation_identities` row was created by this sprint** — so
  there is nothing new to delete there. If a future decision ever revokes
  this identity entirely, that is a separate, later, explicitly-approved
  action (a guarded `DELETE` matching the Production file's own pattern),
  not prepared here since it is out of scope for enabling a canary.

## 9. Confirming no privilege beyond the existing RPC/RLS mechanism

This identity gains **no new capability** by any action in this document:

- `automation_identities` membership already grants exactly what the
  existing, already-hardened RLS policies and the four `SECURITY DEFINER`
  RPC functions (`open_scheduled_writer_run`, `close_scheduled_writer_run`,
  `claim_operational_notification_event`, `finish_operational_notification_event`)
  already define — unchanged by this sprint, no migration, no grant, no
  policy edit anywhere in this document.
- The account is **not** a member of `admin_profiles` (confirmed:
  `preview-test-admin` is the distinct account holding that membership;
  the writer account has never been linked to it) — it can never reach
  any `/admin/*` route via `requireAdminSession`, only the
  `automation_identities`-gated RPCs.
- Resetting its password does not touch, widen, or bypass RLS, grants, or
  the RPC functions themselves.

## 10. Confirmed unchanged for the full duration of this preparation

| Flag | State |
|---|---|
| `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED` | absent everywhere — unchanged |
| `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED` | Preview-scoped to a different, unrelated branch only — unchanged |
| `OPERATIONAL_EMAIL_ALERTS_ENABLED` | Preview-scoped to a different, unrelated branch only — unchanged |
| `SCHEDULED_WRITES_ENABLED` | absent/false in every scope — unchanged |
| `SCHEDULED_CHECKS_ENABLED` | Production only, `true` — unchanged, irrelevant to Preview |
| Production writer credentials | Production scope only — never read, never copied |

## 11. What this document explicitly does not do

- Does not create, modify, sign into, or delete any Supabase Auth account.
- Does not insert, update, or delete any row in `automation_identities` or
  any other table.
- Does not set, change, or delete any Environment Variable.
- Does not invoke the ledger-test endpoint, `/api/cron/write-candidates`,
  any RPC, any Cron, any claim/finish cycle, any email, or Resend.
- Does not merge to `main`; does not delete any branch.
- Does not read, log, or store any real credential, token, or password
  anywhere in this repository.

## 12. Separate approval text — paste exactly this to authorize Sprint 166O-D (a future sprint)

This approval covers **only** resetting the existing Preview writer
account's password and setting the two Vercel credential variables in
Preview (branch-pinned) scope. It does not authorize
`OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED`, any real claim/finish, or
any later phase.

> I approve Sprint 166O-D. I will reset the password for the existing
> `preview-test-writer@example.invalid` account via the Supabase
> dashboard myself, then set SUPABASE_SCHEDULED_WRITER_EMAIL and
> SUPABASE_SCHEDULED_WRITER_PASSWORD in Vercel, Preview scope
> (branch-pinned), myself. I understand this does not enable
> OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED and does not trigger any
> sign-in or writer invocation by itself. This approval does not extend
> to the actual ledger-test canary invocation or any later phase.
