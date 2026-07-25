# Sprint 166L-C — Scheduled Writer Identity Audit and Sprint 166L-D Credentials Plan

**Status: audit and plan only.** No Supabase Auth account was created,
modified, or signed in. No row was inserted, updated, or deleted in
`automation_identities` or any other table. No Environment Variable was
created or changed. No writer, RPC, Cron, claim/finish, email, or Resend
action occurred. Every SQL statement run for this audit was a `SELECT`.

---

## 1. Read-only Supabase audit (Production, project ref `puhcjyffosgohbmxrczb`, confirmed the same way as every prior sprint — via the connection's own positively-verified, non-synthetic data)

### 1.1 `automation_identities` — still exactly one row

Unchanged since the Sprint 166L-A audit two sessions ago: **1 row**,
`user_id` ending `...da746`, added 2026-07-11 15:22:26 UTC.

### 1.2 Is it a genuine, working writer-shaped identity?

Queried `auth.users` joined to `automation_identities` — id/timestamp/
status metadata only, **no email value, password hash, or token ever
read**:

| Check | Result |
|---|---|
| `automation_identities.user_id` matches a real `auth.users.id` | **yes** |
| Email confirmed | **yes** |
| Account banned | **no** |
| Account deleted | **no** |
| Has ever actually signed in | **yes — `last_sign_in_at = 2026-07-12 12:33:15 UTC`** (one day after creation) |
| `auth.users` created at | 2026-07-11 15:00:00 UTC |
| Added to `automation_identities` | 2026-07-11 15:22:26 UTC (22 minutes later — a deliberate, sequential provisioning action, not two unrelated events) |
| Email looks like a dedicated service account (contains "writer"/"scheduled"/"automation"/"bot"/"cron") | **no** |
| Email domain | **`gmail.com`** |

**This is a real, healthy, working, previously-used Supabase Auth
account** — not a stale placeholder. It was deliberately created and
added to `automation_identities` in one short session on 2026-07-11, and
was actually signed into once, the next day. It is also **not admin**
(`admin_profiles` has 0 rows in Production — confirmed, no overlap
possible).

**The material open question is provenance, not health:** its email
domain (`gmail.com`) and local part (does not match any service-account
naming convention) do not, on their own, distinguish it from a personal
account. Given the user's own account for this project is a `gmail.com`
address, this warrants Adam's direct confirmation before reuse — not
because anything found here is unsafe, but because pairing a
non-dedicated-looking identity with an unattended, server-side automation
credential is exactly the kind of ambiguity this project's phased-rollout
discipline exists to eliminate before activation, not after.

### 1.3 RPC function grants — complete, matches the Sprint 166J-A ACL hardening exactly

Queried `pg_proc`/`pg_roles` directly (not `information_schema`, which
has a known visibility limitation that hid these grants from a first
attempt):

| Function | `SECURITY DEFINER` | Roles with `EXECUTE` |
|---|---|---|
| `open_scheduled_writer_run` | yes | `authenticated`, `postgres`, `service_role` |
| `close_scheduled_writer_run` | yes | `authenticated`, `postgres`, `service_role` |
| `claim_operational_notification_event` | yes | `authenticated`, `postgres`, `service_role` |
| `finish_operational_notification_event` | yes | `authenticated`, `postgres`, `service_role` |

`anon` has `EXECUTE` on none of them — matches the 166J-A checkpoint
exactly, zero drift. **The permission surface is already fully complete
for any `authenticated` identity that is also an `automation_identities`
member** — no further grant, policy, or migration is needed before
credentials can be configured.

## 2. Authentication flow — code audit

```
GET /api/cron/write-candidates
  │
  ├─ Layer 0: checkDatabaseEnvironmentGuard()              (databaseEnvironmentGuard.ts)
  │    now passes in Production (Sprint 166L-B) — proceeds to Layer 1
  │
  ├─ Layer 1+2: SCHEDULED_CHECKS_ENABLED && SCHEDULED_WRITES_ENABLED
  │    SCHEDULED_WRITES_ENABLED absent in Production → 503 today, unconditionally
  │    (independent of everything below — this alone still blocks the whole path)
  │
  ├─ CRON_SECRET bearer check                               (cronCheckSources.ts)
  │
  ├─ Layer 3a: getScheduledWriterCredentials()               (scheduledWriter.ts)
  │    reads SUPABASE_SCHEDULED_WRITER_EMAIL / _PASSWORD — both absent in
  │    Production → returns null → 503 "Tryb zapisu nie jest jeszcze
  │    skonfigurowany." (never distinguishes "absent" from "wrong" to a caller)
  │
  ├─ Layer 3b: signInScheduledWriter(credentials)             (scheduledWriter.ts)
  │    creates a FRESH, non-persisted, anon-key Supabase client per request
  │    (never the shared browser-facing client, never a service_role key)
  │    calls client.auth.signInWithPassword(credentials)
  │    any failure (wrong password, unconfirmed email, banned, network) →
  │    same generic 503 "Tryb zapisu nie jest jeszcze skonfigurowany."
  │
  ├─ open_scheduled_writer_run RPC call                       (scheduledWriterHistory.ts)
  │    SECURITY DEFINER — INSIDE the function, re-checks:
  │      exists(select 1 from automation_identities where user_id = auth.uid())
  │    NOT a member → function raises "not authorized" → caught by
  │    .catch(() => ({ opened: false })) → 503 "Poprzednie uruchomienie
  │    wciąż trwa." (distinguishable in wording from the Layer 3 message,
  │    but still never states WHY — could be a genuine lock OR a missing
  │    membership; no caller can tell which from the response alone)
  │
  └─ only past ALL of the above: source fetch + candidate write proceeds
```

**Where `auth.uid()` is compared to `automation_identities`:** exclusively
*inside* the four `SECURITY DEFINER` SQL functions themselves (see
`docs/sql/PROPOSED_SPRINT_166C_ATOMIC_LOCK_MIGRATION_V2.sql` and
`docs/sql/PROPOSED_SPRINT_166F_OPERATIONAL_NOTIFICATION_LEDGER_V1.sql`) —
never in application code. This is deliberate: RLS/function-level
enforcement is the actual security boundary, not a TypeScript `if`
statement that a future refactor could accidentally remove.

**Fail-closed conditions, all independent, all currently true in
Production:** missing `SCHEDULED_WRITES_ENABLED` (blocks regardless of
everything else); missing writer credentials; a sign-in failure; a
non-member sign-in success. Any one alone is suffient to keep the route
at `503` today.

## 3. Readiness table

| Component | Exists? | Complete? | Risk | Required action |
|---|---|---|---|---|
| Schema + ACL for both automation tables | yes | yes | none | none |
| Environment guard (Layer 0) | yes | yes (Sprint 166L-B) | none | none |
| RPC functions + grants | yes | yes | none | none |
| `SCHEDULED_WRITES_ENABLED` in Production | no | — | — (this is the intended state today) | future FAZA D, separate approval |
| An `automation_identities` row | **yes (1, pre-existing)** | technically yes | **provenance ambiguous — see §1.2** | Adam confirms what this account is |
| Writer credentials in Production Vercel scope | no | — | — | future FAZA C, separate approval |
| Decision: reuse existing identity vs. create new | **not yet made** | — | reusing an unconfirmed identity risks conflating a personal/unknown account with unattended server automation | see §4 recommendation |

## 4. Recommendation: create a new, dedicated identity — do not reuse the existing row without Adam's explicit clarification first

The existing identity is technically healthy and would work mechanically
(correct table membership, correct grants, real confirmed account). The
reason not to default to reusing it is provenance, not function: nothing
in this project's own documentation (Sprint 166A through 166L-B) explains
what it is, who created it, or why — and its email shape gives no signal
either way. This project's entire phased-rollout discipline exists
precisely to avoid exactly this situation: an unattended, credential-
bearing automation identity whose origin nobody can point to a checkpoint
for.

**Two paths, both requiring Adam's own decision — neither started here:**

- **Path A — clarify and reuse.** If Adam confirms this existing account
  was deliberately created for exactly this purpose (e.g. during earlier,
  undocumented exploratory work) and recalls/can reset its password, it
  can be reused: only the two Vercel credential variables need setting in
  Production scope, nothing else.
- **Path B — create new, dedicated identity (recommended default if
  Path A cannot be confirmed).** Follows the original FAZA C procedure
  exactly: Adam creates one new Supabase Auth account (dashboard, Auth →
  Users → Add user — never SQL), with an address and naming that clearly
  identifies it as the scheduled-writer service identity; adds exactly
  one new `automation_identities` row for it (a single, reviewed `INSERT`,
  Adam runs it personally); leaves the existing, unexplained row
  untouched — deleting it is a separate decision, not assumed here, and
  its mere presence poses no additional risk on its own (RLS membership
  checks are additive, not exclusive — a second member does not weaken
  anything).

This document takes no position on which path Adam prefers — both are
fully specified in Sprint 166L-D (§5) so either can proceed once chosen.

## 5. Sprint 166L-D — plan (not started)

1. Adam decides Path A or Path B (§4).
2. **If Path A:** Adam confirms/resets the existing account's password
   via the Supabase dashboard (Auth → Users), never via SQL.
   **If Path B:** Adam creates a new Supabase Auth account via the
   dashboard, then runs exactly one reviewed `INSERT` into
   `automation_identities` for its `user_id` (Adam clicks Run, never
   Claude — matching this project's standing convention for every prior
   write-performing SQL statement).
3. In Vercel, Production scope only: set `SUPABASE_SCHEDULED_WRITER_EMAIL`
   and `SUPABASE_SCHEDULED_WRITER_PASSWORD` for the chosen account.
4. `SCHEDULED_WRITES_ENABLED` remains **false/absent** throughout this
   phase — live sign-in proof is deferred to the future FAZA D controlled
   writer run (a separate, later, separately-approved sprint), exactly as
   the original runbook specifies; this phase never itself triggers a
   sign-in.
5. Read-only confirmation: both credential variables show the correct
   NAME with Production scope (values never read back); if Path B, exactly
   one new `automation_identities` row exists (`SELECT count(*)` only).
6. **Stop.** This still does not authorize `SCHEDULED_WRITES_ENABLED`,
   any notification flag, or any live writer invocation — those remain
   FAZA D/E/F, each its own separate approval.

## 6. Rollback

- **Vercel credentials:** delete `SUPABASE_SCHEDULED_WRITER_EMAIL` /
  `SUPABASE_SCHEDULED_WRITER_PASSWORD` from Production scope — the route
  immediately returns to today's `getScheduledWriterCredentials() → null`
  fail-closed state, no redeploy strictly required (env absence is
  checked fresh on every request) though one is still recommended for
  observability, matching FAZA B's own convention.
- **Path B's new `automation_identities` row:** a single, reviewed
  `DELETE` by known `user_id`, run by Adam personally.
- **Path A:** resetting the reused account's password again (or removing
  its `automation_identities` membership) fully revokes write capability
  without touching any other identity or table.
- No rollback here ever requires touching RLS, grants, or the RPC
  functions themselves — this phase changes none of them.

## 7. Separate approval text — paste exactly this to authorize Sprint 166L-D

This approval covers **only** the credentials step chosen below. It does
not authorize `SCHEDULED_WRITES_ENABLED`, any notification flag, any live
writer invocation, or any later FAZA.

> I approve Sprint 166L-D, Path [A / B — state which]. If Path A: I confirm
> the existing automation_identities account (added 2026-07-11) was
> deliberately created for the scheduled writer, and I will reset/confirm
> its password via the Supabase dashboard myself. If Path B: I will create
> a new Supabase Auth account and run the single automation_identities
> INSERT myself. Either way, I will then set
> SUPABASE_SCHEDULED_WRITER_EMAIL and SUPABASE_SCHEDULED_WRITER_PASSWORD
> in Vercel, Production scope only. I understand this does not enable
> SCHEDULED_WRITES_ENABLED and does not trigger any sign-in or writer
> invocation by itself. This approval does not extend to FAZA D's actual
> controlled writer run or any later phase.

## 8. What this sprint explicitly does not do

- Does not create, modify, sign into, or delete any Supabase Auth account.
- Does not insert, update, or delete any row in `automation_identities`
  or any other table.
- Does not set, change, or delete any Environment Variable.
- Does not invoke `/api/cron/write-candidates`, any RPC, any Cron, any
  claim/finish cycle, any email, or Resend.
- Does not merge to `main`.
- Does not read, log, or store any real credential, token, or password
  anywhere in this repository.
