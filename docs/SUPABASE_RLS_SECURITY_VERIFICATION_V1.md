# Supabase RLS Security Verification — v1

**Sprint 161 — Critical Security Hardening.** Read-only. No SQL was executed
against Supabase during this sprint, no policy was changed, no migration was
run. This document exists because Sprint 160A's audit and this sprint's own
threat model both depend on RLS being the real access-control boundary for
`/admin`, `/builder`, `/ai-helper` (see `docs/SPRINT_161_CRITICAL_SECURITY_HARDENING_V1.md`
§10), and that boundary's exact live configuration cannot be confirmed from
the repository alone.

> **Result (Sprint 161B):** Adam ran this verification manually.
> `alerts`, `source_checks`, and `source_notice_candidates` all came back
> correct — RLS enabled, admin operations gated on `admin_profiles`
> membership, public `SELECT` on `alerts` correctly restricted to
> `status = 'published'`. **`alert_sources` did not** — its four admin
> policies still only check `auth.role() = 'authenticated'`, and this
> project has more than one Supabase Auth account, so that check does not
> actually mean "administrator." The fix is proposed (not yet applied) in
> `docs/sql/SPRINT_161B_ALERT_SOURCES_RLS_HARDENING.sql` — see
> `docs/SPRINT_161_CRITICAL_SECURITY_HARDENING_V1.md` §10/§10a for the
> full writeup and §16 step 7 for exact manual apply steps.

## What's already committed and can be confirmed from the repo

| Table | Committed policy source | What it says |
|---|---|---|
| `alert_sources` | `docs/supabase_sources_schema.sql`, `docs/sql/PROPOSED_ALERT_SOURCES_PUBLIC_READ_CLEANUP_V1.sql` | **Confirmed live and still a problem (Sprint 161B):** admin policies check only `auth.role() = 'authenticated'`, never `admin_profiles` — any signed-in Supabase Auth account, not only the administrator, can read/write this table. Fix proposed, not applied: `docs/sql/SPRINT_161B_ALERT_SOURCES_RLS_HARDENING.sql`. |
| `source_checks` | `docs/supabase_source_checks.sql`, later migrated by `docs/sql/PROPOSED_SCHEDULED_WRITER_RLS_MIGRATION_V1.sql` | **Confirmed live and correct (Sprint 161B):** admin operations gated on `admin_profiles` membership; scheduled writer gets a narrow, separate `automation_identities`-based `INSERT`-only policy. |
| `source_notice_candidates` | `docs/supabase_source_notice_candidates.sql`, `docs/sprint132_candidate_persistence_schema_proposal.sql`, later migrated by `docs/sql/PROPOSED_SCHEDULED_WRITER_RLS_MIGRATION_V1.sql` | **Confirmed live and correct (Sprint 161B):** same `admin_profiles`/`automation_identities` split as `source_checks`. |

## What was NOT confirmed from the repo (historical — resolved Sprint 161B)

*The paragraph below is kept as a record of what this document originally
asked Adam to check, and why. It has since been checked — see the "Result"
callout at the top of this file. `alerts` turned out correct;
`alert_sources` turned out to be the actual gap, and is now tracked
separately (§10a of the main sprint doc).*

The **`alerts`** table's live write policy was the one gap every audit
since Sprint 143/144 had flagged and none had closed: the repo had no
committed `CREATE POLICY` statement for `alerts`. CLAUDE.md states the
intended design ("public: SELECT status=published only · admin: full") but
intent documented in a markdown file is not the same as a verified live
Postgres policy — and this is exactly the table anon read/write on
`alerts` would have been most damaging on, since it's the one
public-facing write surface in the whole schema. **This has now been
confirmed correct.**

This sprint's own hardening (requireAdminSession on the three admin API
routes, see the main sprint doc) reduces how much weight RLS alone has to
carry for those three routes specifically, but does not touch `alerts`
RLS and does not reduce how much the admin UI still depends on RLS being
correct — the admin pages remain client-side gated (§F of the sprint doc),
so a misconfigured `alerts` policy would still let an unauthenticated
request write rows directly against Supabase, bypassing the Next.js app
entirely.

## How to verify (manual, read-only, ~5 minutes)

**Preferred: run the existing read-only SQL inspection file.**
`docs/sql/INSPECT_LIVE_RLS_READ_ONLY.sql` already contains exactly the
queries needed — it was written for Sprint 144 and covers all four tables
including `alerts`. It contains `SELECT` statements only (no INSERT,
UPDATE, DELETE, ALTER, CREATE, DROP, GRANT, or REVOKE) and was still
unexecuted as of this sprint (no read-only Supabase MCP/CLI connection was
available in this session either). Run it in the Supabase SQL Editor and
check:

1. **§1 (policies)** — confirm `alerts` has a `SELECT` policy restricted to
   `status = 'published'` for `anon`, and that any `INSERT`/`UPDATE`/`DELETE`
   policy requires `auth.role() = 'authenticated'`. If an `INSERT` or
   `UPDATE` policy exists for `anon` on `alerts`, or if `alerts` has zero
   policies while `relrowsecurity` is `false` (§3), **stop and treat this as
   a live incident** — it means any visitor could currently write alerts
   directly against Supabase, bypassing every gate in the Next.js app
   entirely (Builder's confirm dialog, `requireAdminSession`, all of it).
2. **§3 (RLS enabled/forced)** — confirm `rls_enabled = true` for all four
   tables, not just that policies exist (a table can have policies defined
   while RLS itself is switched off, making every policy a no-op).
3. **§2 (grants)** — confirm the underlying Postgres `GRANT`s match what
   the RLS policies assume (RLS only restricts an already-granted role; it
   doesn't grant anything on its own).

**Alternative: Supabase Dashboard, no SQL.**
`Authentication → Policies` (or `Database → Tables → alerts → RLS`) lists
every policy on `alerts` by name, command, and target role directly in the
UI — equivalent information to §1 above without running SQL, for anyone who
prefers the dashboard.

## After verifying

- If `alerts` matches the intended design (public SELECT-published-only,
  authenticated-only writes) and RLS is enabled/forced: record the date
  this was checked in the sprint log; no further action needed.
- If it does not match: this is a schema/RLS change, which per CLAUDE.md's
  security rules requires the user's explicit request and a SQL file in
  `docs/` for manual execution — it must not be applied automatically by
  Claude even after being found. Report the exact gap and propose the
  minimal `CREATE POLICY`/`ALTER POLICY` fix as a new, separate `docs/sql/`
  file for review, following the existing `auth.role() = 'authenticated'`
  pattern the other three tables already use.
