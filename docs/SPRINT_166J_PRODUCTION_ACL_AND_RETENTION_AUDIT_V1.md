# Sprint 166J-A — Production ACL, Retention, and Branch-State Audit

**Status: read-only and static audit only.** No DDL, DML, RPC, Environment
Variable change, deployment, or merge happened as part of this sprint. Every
finding below was gathered via `SELECT` statements, `has_function_privilege`/
`has_table_privilege`, static file reads, and local `git` commands.

---

## ETAP 1 — Git verification

```
Branch:        sprint-166i-production-schema-phase-a-v1
HEAD:          7f88057 docs(alerting): add Sprint 166H Production automation
               readiness audit and migration package
Upstream:      none configured (branch not yet pushed)
main:          6017df8 docs(alerting): record Sprint 166G-3 Preview runtime
               ledger validation checkpoint
origin/main:   6017df8 (identical to main — in sync)
Working tree:  M .gitignore, ?? .vscode/ (pre-existing, untouched this sprint)
```

`7f88057` also carries the ref labels `origin/sprint-166h-production-
automation-readiness-v1` and `sprint-166h-production-automation-readiness-v1`
— the current branch (`sprint-166i-...`) was created from that same commit
and has not diverged from it yet (no new commits made on `sprint-166i-...`
itself so far this session).

### Why `sprint-166f-operational-alert-ledger-v1` appeared in an earlier checkpoint

That name comes from this conversation's system-level `gitStatus` block,
which is a **one-time snapshot taken at the very start of the session** and
never refreshed afterward, regardless of how many branches are created or
switched during the conversation. Sprints 166G, 166H, and 166I all created
and moved across newer branches within this same session; the frozen
snapshot simply never caught up. It is not evidence of an actual checkout
change, and `git log`/`git branch --show-current` above are authoritative —
both confirm the actual, current branch is `sprint-166i-production-schema-
phase-a-v1`, matching what Sprint 166I was declared to run on. No branch
switch, creation, or merge was performed in this turn.

---

## ETAP 2 — Production effective-permission audit

Project: `alertownik-mvp`, ref `puhcjyffosgohbmxrczb`. Every query below is a
`SELECT` against `pg_proc`, `pg_class`, `pg_policies`, `pg_roles`, or
`pg_default_acl`, plus `has_function_privilege`/`has_table_privilege`. No RPC
was called.

### Functions

| Function | EXECUTE: anon | EXECUTE: authenticated | EXECUTE: service_role | EXECUTE: postgres | `prosecdef` | `search_path` |
|---|---|---|---|---|---|---|
| `open_scheduled_writer_run` | **true** | true | true | true | true | `""` (empty) |
| `close_scheduled_writer_run` | **true** | true | true | true | true | `""` (empty) |
| `claim_operational_notification_event` | **true** | true | true | true | true | `""` (empty) |
| `finish_operational_notification_event` | **true** | true | true | true | true | `""` (empty) |

Raw ACL for all four (identical shape): `{postgres=X/postgres,
anon=X/postgres, authenticated=X/postgres, service_role=X/postgres}` — i.e.
`anon` holds an **explicit** grant, not an inherited-through-PUBLIC one (the
migration's own `revoke all ... from public` already ran and is reflected —
there is no bare `=X/postgres` PUBLIC entry in the ACL at all).

1. **Effective EXECUTE roles**: `postgres`, `anon`, `authenticated`,
   `service_role` — all four, for all four functions.
2. **Does PUBLIC have EXECUTE?** No — the migration's `revoke all ... from
   public` succeeded; there is no bare-PUBLIC ACL entry.
3. **Does anon have EXECUTE, and how?** Yes, **directly** — via Supabase's
   project-wide `pg_default_acl` entry for object type `f` (functions) in
   schema `public`, owned by both `postgres` and `supabase_admin`, which
   auto-grants EXECUTE to `anon`/`authenticated`/`service_role` on every new
   function the instant it is created — independent of, and not overridden
   by, the migration's `revoke ... from public` (that revoke only removes
   the PUBLIC pseudo-role's entry, a distinct ACL slot from the
   directly-granted-to-`anon` entry created by the default-privilege rule).
   Not inherited through role membership — `anon` is not a member of any
   role that holds EXECUTE.
4. **Does authenticated have EXECUTE?** Yes — required, and correctly so
   (see ETAP 4 §6).
5. **Do service_role and postgres have EXECUTE?** Yes, both — expected and
   required for Supabase platform internals.
6. **Does every function verify `auth.uid()` against `automation_identities`
   before any write?** Yes, all four — each begins with
   `select exists (select 1 from public.automation_identities where
   user_id = auth.uid()) into v_is_writer; if not v_is_writer then raise
   exception 'not authorized'; end if;` before touching any table.
7. **Is there any path for anon or a plain authenticated user to write
   without a genuine writer identity?** No. Calling any of the four RPCs as
   `anon` (no session, `auth.uid()` is `null`) or as any authenticated user
   who is not a row in `automation_identities` (e.g. a logged-in admin)
   fails the check above and raises before any `insert`/`update` statement
   runs.
8. **Do function arguments allow bypassing the identity/environment check?**
   No — every parameter is either a value/count/text under an explicit
   `check` (see `p_stale_after_seconds`, `p_outcome`, `p_channel`,
   `p_event_type`, `p_severity`, length caps on `p_error_summary`/
   `p_safe_summary`) or an opaque `uuid` foreign key; none of them can
   substitute for or short-circuit the `automation_identities` membership
   check, which uses only `auth.uid()` — a value the caller cannot pass in
   or influence via any argument.
9. **Is `search_path` and object-qualification safe?** Yes — all four set
   `search_path = ''` and every object reference inside each function body
   is schema-qualified (`public.automation_identities`, `pg_catalog.now()`,
   `pg_catalog.make_interval(...)`, `pg_catalog.char_length(...)`, etc.),
   eliminating search-path-hijack risk.

### Tables

| Table | anon SELECT/INSERT/UPDATE/DELETE (raw grant) | authenticated SELECT/INSERT/UPDATE/DELETE (raw grant) | RLS enabled | INSERT/UPDATE/DELETE policies |
|---|---|---|---|---|
| `scheduled_writer_runs` | true/true/true/true | true/true/true/true | true | **none** |
| `operational_notification_events` | true/true/true/true | true/true/true/true | true | **none** |

1. **Raw grants**: both tables show identical `relacl`:
   `{postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres,
   authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres}` — full
   privilege letters (`arwdDxtm`) for every one of the four roles.
2. **Effective privilege after RLS**: `anon` and `authenticated` both have
   `rolbypassrls = false` (confirmed via `pg_roles`) — both are fully
   subject to RLS. Each table has **exactly one** policy, `... FOR SELECT TO
   authenticated USING (EXISTS (SELECT 1 FROM admin_profiles WHERE
   admin_profiles.user_id = auth.uid()))`. With RLS enabled and zero
   permissive policies for INSERT/UPDATE/DELETE, Postgres denies those
   commands outright for every non-owner, non-bypass role — `anon` and
   `authenticated` can neither insert, update, nor delete a single row,
   regardless of the raw table grant. `anon` additionally cannot `SELECT`
   any row even though it holds the raw grant, because the one existing
   policy only authorizes `authenticated` callers who are also members of
   `admin_profiles`.
3. **INSERT/UPDATE/DELETE policies**: none exist on either table — writes
   are only ever possible via the four `SECURITY DEFINER` functions, which
   run as the table owner (`postgres`) and bypass RLS/grants entirely by
   virtue of ownership, independent of any caller-role grant.
4. **Can any role besides the owner or a bypass-RLS role actually write
   without going through an RPC?** No — confirmed by (2) and (3) together:
   `anon`/`authenticated` are RLS-bound with zero write policies;
   `service_role`/`postgres` (both `rolbypassrls = true`) could write
   directly, but neither is ever used that way by any application code (no
   `service_role` key exists client-side per this project's own security
   rules; `postgres` is only used by migrations run manually through the
   SQL Editor).
5. **Do the default grants come from `pg_default_acl`?** Yes, confirmed
   directly: `pg_default_acl` in this project has entries for both
   `postgres` and `supabase_admin`, schema `public`, object type `r`
   (relations), each granting `arwdDxtm` to `anon`/`authenticated`/
   `service_role`/`postgres` — applied automatically to any new table,
   including these two, independent of this migration's own SQL.
6. **Is the pattern identical to other new tables in this project?** Yes —
   the same `pg_default_acl` entries apply project-wide to *every* new
   table/function/sequence in schema `public`, not just this migration's
   objects; this is a standing Supabase project characteristic, confirmed
   to also be present, byte-for-byte identical, on `alertownik-preview`
   (see ETAP 3).
7. **Would revoking these grants break Supabase, migrations, the admin
   panel, or the RPC functions?** No — see ETAP 4 §5 for the full
   reasoning. In short: `SECURITY DEFINER` functions execute as their owner
   (`postgres`), so caller-role table grants are irrelevant to their own
   internal writes; the Supabase dashboard, migrations, and PostgREST
   internals all authenticate as `service_role` or `postgres`, neither of
   which this hardening touches; and no application code performs direct
   `.from(table)` calls on either table (confirmed by static read of
   `operationalNotificationLedgerSupabase.ts` and the equivalent run-history
   adapter — both are documented and implemented as `.rpc()`-only).

---

## ETAP 3 — Preview comparison

Project: `alertownik-preview`, ref `nowvcdbtgaigutyxpmdp`. Read-only only —
no MCP (`supabase-alertownik` points at Production, per the standing note
carried since Sprint 166G), a freshly-confirmed browser tab against
`alertownik-preview` instead.

| Check | Production | Preview | Match |
|---|---|---|---|
| Function ACL (`anon`,`authenticated`,`postgres`,`service_role` all `EXECUTE`) | yes | yes | ✅ identical |
| Table ACL (`anon`,`authenticated`,`postgres`,`service_role` all full `arwdDxtm`) | yes | yes | ✅ identical |
| `pg_default_acl` (postgres + supabase_admin, schema public, r/f/S → anon/authenticated/service_role) | present | present, byte-identical | ✅ identical |
| RLS enabled on both tables | yes | yes (established in earlier sprints) | ✅ identical |
| Policies (2, admin-only SELECT) | yes | yes (established in earlier sprints) | ✅ identical |

Conclusion: the wide grants are not a Production-specific regression or an
artifact of the Sprint 166H migration's own SQL — they are a pre-existing,
project-wide Supabase default-privilege characteristic shared identically by
both environments.

---

## ETAP 4 — Static code and migration audit

Files reviewed: the executed migration, all four RPC bodies (via the
migration file), `operationalNotificationLedgerSupabase.ts`,
`operationalNotificationOrchestrator.ts`, `scheduledWriterNotificationInput.ts`,
`/api/cron/write-candidates/route.ts`, `databaseEnvironmentGuard.ts`, and the
`automation_identities` check embedded in each RPC.

1. **Actual vulnerability, or unmet least-privilege hardening?** Unmet
   least-privilege hardening, not a live vulnerability. Every write path is
   gated twice, independently: (a) RLS with zero write-policies blocks
   `anon`/`authenticated` at the table layer regardless of the raw grant,
   and (b) each `SECURITY DEFINER` function independently re-checks
   `automation_identities` membership before doing anything. Both layers
   would need to fail simultaneously for the wide grant to matter, and
   neither depends on the other.
2. **Worst realistic scenario for an anonymous user:** can invoke any of the
   four RPCs (network round-trip to PostgREST) and will always receive a
   raised exception (`not authorized`) before any read or write happens
   inside the function. No data is read, no row is written, no information
   beyond "this call is rejected" is disclosed. Direct table access via
   PostgREST is separately blocked by RLS (no SELECT policy admits `anon`
   at all).
3. **Worst realistic scenario for a plain authenticated (logged-in, non-
   writer) user:** identical outcome to (2) — this project's auth model
   treats every authenticated user as an admin (`admin_profiles`), but
   `admin_profiles` membership is a *different* table from
   `automation_identities`; an ordinary admin session is not a member of
   the latter, so the same "not authorized" exception fires. An admin can
   `SELECT` from either table (the one real, intentional policy), seeing
   run-history/ledger rows for legitimate observability — this is the
   feature working as designed, not a leak.
4. **Should service_role and postgres keep their privileges?** Yes,
   unconditionally — both are required for Supabase platform internals
   (dashboard, PostgREST, migrations) and are never exposed to any client;
   this project's own security rules already forbid the service_role key
   from ever appearing in frontend code.
5. **Should the hardening (REVOKE EXECUTE FROM PUBLIC/anon, GRANT EXECUTE TO
   authenticated, table-grant changes) be performed, or is RLS + function
   protection sufficient on its own?** RLS + the function's internal check
   are sufficient for *safety* today — nothing is presently exploitable.
   The recommended hardening is still worth doing as a proportionate,
   low-risk cleanup: it makes the deployed ACL match the migration file's
   own stated intent, and — critically — it is provably safe to apply,
   because `SECURITY DEFINER` functions execute as their owner regardless
   of the caller's table grants, so revoking `anon`'s table/function access
   and `authenticated`'s direct table DML cannot break either the RPCs or
   any legitimate admin read. `REVOKE ... FROM PUBLIC` is already done by
   the original migration and needs no further action. See the prepared
   `PROPOSED_SPRINT_166J_PRODUCTION_ACL_HARDENING_V1.sql` for the exact,
   minimal statement set (functions: revoke EXECUTE from `anon` only;
   tables: revoke all direct DML from `anon`, revoke INSERT/UPDATE/DELETE
   from `authenticated` while preserving its SELECT).
6. **Is `authenticated` the right role for the RPCs, given the real control
   is `automation_identities`?** Yes, and it is the *only* viable choice —
   Postgres/Supabase's role model has exactly three client-facing roles
   (`anon`, `authenticated`, `service_role`); the live scheduled-writer
   service account signs in via Supabase Auth and therefore holds the
   `authenticated` Postgres role for its own RPC calls like any other signed
   -in user. There is no finer-grained "this one specific identity" role to
   grant instead without inventing a custom Postgres role and a JWT-claim-
   to-role mapping — a materially larger architecture change. The function
   -internal `automation_identities` check is the correct place for that
   finer-grained authorization, exactly as currently implemented.
7. **Would a separate uprivilege model or further function-level
   restriction be better?** No — over-engineering for a boundary that is
   already enforced correctly and doubly (RLS + function check) is not
   justified. The one proportionate improvement — removing the unnecessary
   `anon` grant and the unused direct-DML grants for `authenticated` — is
   exactly what the prepared (not executed) hardening file does; nothing
   more is recommended this sprint.

---

## ETAP 5 — Retention proposal (design only, nothing executed)

Tables in scope: `scheduled_writer_runs`, `operational_notification_events`,
`source_notice_candidates`, `source_checks`. All four are currently empty or
low-volume; this is a forward-looking design, not an urgent need.

1. **Successful records** (`outcome = 'success'` / `status = 'sent'`): keep
   **90 days**. Long enough to explain "did the writer run last week"
   during pilot support, short enough that a healthy steady-state system
   doesn't accumulate router-history noise indefinitely.
2. **Errors and operational events** (`partial_failure`, `total_failure`,
   `run_success`→ escalated events, `transient_fetch`, `permanent_fetch`,
   `write_error`, etc.): keep **180 days**. Errors are the most valuable
   audit trail for diagnosing recurring source problems — twice the
   success-record window on purpose.
3. **Suppressed/abandoned records** (`suppress_*` outcomes,
   `status = 'abandoned'`): keep **30 days**. These represent "the system
   correctly declined to act" — useful for a short window to confirm the
   suppression logic itself is behaving, not valuable as long-term audit
   trail once confirmed.
4. **The Preview synthetic-test record** (from the Sprint 166G-3 controlled
   test): **keep indefinitely**, or at minimum flag it for manual exclusion
   from any future automated retention pass — it is the only concrete
   evidence a real end-to-end run was ever exercised against Preview and has
   documentation value independent of its age.
5. **Mechanism**: start with a **manual runbook** (a documented, reviewed
   `DELETE ... WHERE created_at < now() - interval '...'` template that Adam
   runs by hand via the SQL Editor after reading the current row counts),
   not an endpoint, Cron job, or SQL function, and not this sprint. This
   matches the project's existing discipline (no automation is added
   without an explicit, separate approval) and avoids introducing a new
   always-on code path before real usage volume justifies one.
6. **Avoiding accidental audit-data loss**: any retention statement should
   (a) always filter on the *closed* timestamp (`finished_at`/`sent_at`
   /`checked_at`), never `created_at` alone, so an unfinished/open row is
   never eligible regardless of age; (b) always run inside a transaction
   with a `SELECT count(*)` sanity check immediately before, compared by
   hand against the expected order of magnitude, before any `DELETE`
   commits; (c) never target a table by an unqualified name or a
   dynamically-built identifier; (d) exclude the Preview synthetic-test
   record explicitly by its known id/fingerprint until a decision is made
   to let it age out too.
7. **Path to automation later, without enabling it now**: once real
   production volume exists and the manual runbook has been exercised a few
   times successfully, the same DELETE statements can be wrapped in a
   `SECURITY DEFINER` function (mirroring the existing RPC pattern — no new
   grant surface, callable only by the same writer identity or a new,
   narrower "retention" identity) and invoked from a new, separately-scoped
   Cron entry — exactly the same phased-rollout discipline already used for
   Sprint 166H/166G (a dedicated runbook with its own entry conditions,
   abort conditions, and rollback, approved as its own sprint).

---

## ETAP 6 — Prepared files

| File | SHA-256 |
|---|---|
| `docs/sql/PROPOSED_SPRINT_166J_PRODUCTION_ACL_HARDENING_V1.sql` | `73BD9BD0B77583A6DCC51F8FFB93FF15E6952CC80CD3AC9F727B0A8D8A5D0106` |
| `docs/sql/VERIFY_SPRINT_166J_PRODUCTION_ACL_HARDENING_READONLY_V1.sql` | `35B897D6151347255A884B8C35E7901C1EDD7F9BCFF6035A5796883C47AAC587` |
| `docs/sql/ROLLBACK_SPRINT_166J_PRODUCTION_ACL_HARDENING_V1.sql` | `B1834F9A747B5CDC2FA284D8166DFD08928C65959D9F24BCF2A7758126B90A66` |

None of these three files has been executed against any Supabase project.
The hardening file is a single transaction, touches only `anon`'s grants
(fully) and `authenticated`'s table-level INSERT/UPDATE/DELETE (removed,
SELECT preserved), never touches `service_role`/`postgres`, never calls a
function, never writes a row, never changes RLS/policies/Environment
Variables/Cron, and contains no dynamic SQL.

---

## ETAP 7 — Test results

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ pass, zero errors |
| `npm run lint` | ✅ pass, zero warnings |
| Writer/ledger/policy/orchestrator/runtime-config suites (7 spec files, 132 tests) | ✅ 131 passed, **1 pre-existing failure** (`databaseEnvironmentGuardIntegration.spec.ts` §E.9 — confirmed via earlier sprints' `git diff` against `main` to predate this work entirely, last touched Sprint 166D/166E; not fixed here per standing instruction not to repair unrelated pre-existing failures without a separate report) |
| Scheduled-writer/route/concurrency/idempotency suites (8 spec files, 166 tests) | ✅ all 166 passed |
| `npm run build` | ✅ pass, all routes compiled, zero errors |

---

## Summary

- **Actual branch**: `sprint-166i-production-schema-phase-a-v1`, HEAD
  `7f88057` — confirmed correct; no branch action taken.
- **ACL state**: wide (`anon`+`authenticated`+`service_role`+`postgres` all
  have EXECUTE/full table DML) on both new functions and tables, in both
  Production and Preview, caused by Supabase's project-wide
  `pg_default_acl` — not a migration defect.
- **Effective RLS behavior**: fully blocks `anon`/`authenticated` writes on
  both tables (zero write policies exist); the four functions' own
  `automation_identities` check independently blocks unauthorized RPC use.
- **Preview vs Production**: identical in every dimension checked.
- **Severity assessment**: **LOW / INFORMATIONAL** — not blocking, not
  high, not medium. A least-privilege hardening opportunity, not a live
  exposure.
- **Recommendation**: apply the prepared hardening (narrow, provably safe,
  zero functional risk) at Adam's convenience — no urgency.
- **Retention**: designed above, nothing scheduled or automated this
  sprint.
- **Next step requiring Adam's separate, explicit approval**: whether and
  when to run `PROPOSED_SPRINT_166J_PRODUCTION_ACL_HARDENING_V1.sql`
  against Production, using the same one-shot, byte-exact-paste, Adam-
  clicks-Run discipline established in Sprint 166H/166I. Nothing else in
  this sprint (retention automation, Cron, email, branch merge) is implied
  or requested by this checkpoint.
