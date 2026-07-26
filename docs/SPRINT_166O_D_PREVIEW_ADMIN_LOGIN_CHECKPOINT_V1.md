# Sprint 166O-D — Dedicated Preview Admin: Login Checkpoint

**Status: complete.** A dedicated Preview admin identity, separate from the
Preview scheduled-writer identity, was found already provisioned, its
password was reset, and a live authenticated admin session was
established against the correct Preview deployment. No `src/` or `tests/`
file changed. No Production data or Environment Variable was touched.

---

## 1. What was found (read-only preflight, before any write)

Discovered via the Supabase Studio SQL Editor against project
`alertownik-preview` (ref `nowvcdbtgaigutyxpmdp`) — **not** via the
`supabase-alertownik` MCP tool, which was confirmed this sprint to be
wired to **Production** (`auth.users` there lists only real accounts:
`ak.jurkowski@gmail.com`, `4money.aj@gmail.com`,
`alertownik.kontakt+scheduled-writer@gmail.com` — no `@example.invalid`
rows). All Preview reads/writes this sprint went through the Supabase
Studio browser UI instead.

- `auth.users` in `alertownik-preview` contains exactly 2 rows:
  - `preview-test-writer@example.invalid` (UID ending `...a966c52`) — the
    existing scheduled-writer identity, untouched this sprint.
  - `preview-test-admin@example.invalid` (UID ending `...67b0e`,
    full `950a90d6-3437-43a4-915a-f10b1be67b0e`) — **already existed**,
    `confirmed=true`, `banned_until=NULL`, `deleted_at=NULL`, created
    2026-07-21.
- `public.admin_profiles` (schema: `user_id uuid not null` PK/FK→
  `auth.users.id`, `created_at timestamptz default now()`) already
  contained **exactly one row**, for this same UID — the admin role was
  already granted. No `INSERT` was needed or performed.

Since a healthy, already-admin-granted account existed, no new user and
no new `admin_profiles` row were created, per the approved "reuse if
healthy" branch of this sprint's scope.

## 2. Password reset

Adam ran a locally-audited, one-shot PowerShell script
(`Sprint1660-D_ResetPreviewAdminPassword_v1.ps1`, statically AST-parsed
and audited by Claude before execution: 0 parse errors, exactly 1 network
call using `-Method Put`, 0 retry loops, no hardcoded secrets, `service_role`
read via hidden `SecureString`, password copied to clipboard only after an
HTTP 2xx response) against
`PUT https://nowvcdbtgaigutyxpmdp.supabase.co/auth/v1/admin/users/950a90d6-3437-43a4-915a-f10b1be67b0e`.
Result: **HTTP 200**. The new password exists only in Adam's clipboard/
password manager; Claude never read, copied, displayed, or logged it at
any point.

## 3. Login

Adam navigated (via Claude) to the correct Preview deployment for this
branch —
`https://alertownik-mvp-git-sprint-166o-preview-writer-9b4c1f-alertownik.vercel.app/login`
— Claude filled only the email field
(`preview-test-admin@example.invalid`), stopped with an empty, focused
password field, and Adam pasted the password himself. Claude clicked
"Zaloguj" exactly once after Adam's explicit confirmation the password was
pasted. Login succeeded — redirected to `/builder` with **Admin** and
**PREVIEW** badges visible in the header.

## 4. Read-only post-login verification

- **Session scope:** the only `*-auth-token` key in `localStorage` is
  `sb-nowvcdbtgaigutyxpmdp-auth-token` — confirms this session belongs to
  **Preview**, not Production (a different Supabase Auth instance/project
  ref entirely).
- **Admin access confirmed live:** `/admin/sources` loads fully
  (source registry, check history, canary status) under this session — not
  just a gate bypass, genuine authenticated content.
- **`GET /api/admin/automation-status`** (authenticated via the session's
  own `access_token`, read from `localStorage` and passed as a Bearer
  header — never displayed or logged) → **200 OK**:
  - `writerCredentialsConfigured: true`
  - `writesEnabled: false`, `writeAttemptsPossible: false`
  - `operationalNotificationRuntimeEnabled: false`
  - `emailAlertConfig: { enabled: false, configuredProvider: "none", activeProvider: "none", configComplete: false }`
  - The full response body contains **no mention of "ledger" anywhere** —
    consistent with `OPERATIONAL_NOTIFICATION_LEDGER_TEST_ENABLED` being
    absent everywhere (independently reconfirmed via a Vercel Environment
    Variables search returning zero results for `LEDGER_TEST`).
- **No write of any kind was performed.** No Environment Variable was
  changed. No request was sent to `ledger-test`, any RPC, claim/finish,
  SQL, or email/Resend.

## 5. Security audit

- No secret (password, session token, service_role key) was ever read,
  displayed, logged, or written anywhere by Claude this sprint stage.
- The password-reset script was statically audited (AST parse, network-call
  count, loop count, regex checks) **before** Adam ran it — Claude never
  executed it.
- The session `access_token` was read programmatically from `localStorage`
  solely to construct an `Authorization` header for two authenticated
  `GET` requests (`automation-status`) — its value was never printed,
  logged, or included in any tool response text.
- No Production Environment Variable, table, or account was read, changed,
  or copied this stage. No SQL write of any kind was executed.
- No merge to `main`; no branch deleted; no email or Resend contact.

## 6. Files and commits

This checkpoint document only — no `src/` or `tests/` file changed. The
password-reset script lives outside the repository
(`C:\Users\akjur\AppData\Local\Temp\Sprint1660-D_ResetPreviewAdminPassword_v1.ps1`),
never committed.

## 7. Next

With a live, verified Preview admin session now open, Sprint 166O-D's
live ledger canary (the single authenticated
`POST /api/admin/operational-notification-ledger-test`) can proceed under
Adam's separate, explicit approval for that specific step.
