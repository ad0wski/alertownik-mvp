# Sprint 166J-A — Production ACL Hardening Checkpoint

**This checkpoint records a completed, already-executed, already-verified
change. It is a historical record, not a plan.** Do not run
`PROPOSED_SPRINT_166J_PRODUCTION_ACL_HARDENING_V1.sql` again — see the
"never re-run" note at the bottom of this document.

---

## What was executed

| | |
|---|---|
| **Date** | 2026-07-24 |
| **Environment** | Production |
| **Supabase project** | `alertownik-mvp` |
| **Project ref** | `puhcjyffosgohbmxrczb` |
| **File executed** | `docs/sql/PROPOSED_SPRINT_166J_PRODUCTION_ACL_HARDENING_V1.sql` |
| **SHA-256** | `73BD9BD0B77583A6DCC51F8FFB93FF15E6952CC80CD3AC9F727B0A8D8A5D0106` |
| **Who ran it** | Adam, manually, in the Supabase SQL Editor, exactly once |
| **Result** | **Success** |

No secrets, technical-account addresses, tokens, or Environment Variable
values appear anywhere in this document, matching every other checkpoint in
this project.

---

## Final ACL state (confirmed by read-only verification, not assumed)

| Role | Four RPC functions | `scheduled_writer_runs` | `operational_notification_events` |
|---|---|---|---|
| `PUBLIC` | no EXECUTE (already true since the Sprint 166H migration) | — | — |
| `anon` | **no EXECUTE** on any of the four | **no SELECT/INSERT/UPDATE/DELETE** | **no SELECT/INSERT/UPDATE/DELETE** |
| `authenticated` | EXECUTE retained on all four (required — see Sprint 166J-A audit §4.6) | SELECT retained (required for the existing admin-only RLS policy); no INSERT/UPDATE/DELETE | SELECT retained; no INSERT/UPDATE/DELETE |
| `service_role` | EXECUTE retained | full DML retained (unused by any application code) | full DML retained (unused by any application code) |
| `postgres` | EXECUTE retained (owner) | full DML retained (owner) | full DML retained (owner) |

RLS remains enabled on both tables; the two pre-existing admin-only `SELECT`
policies (`scheduled_writer_runs_admin_select`,
`operational_notification_events_admin_select`) are unchanged — this
hardening only ever touched GRANTs, never RLS or policies.

---

## VERIFY script results (`VERIFY_SPRINT_166J_PRODUCTION_ACL_HARDENING_READONLY_V1.sql`, SHA-256 `35B897D6151347255A884B8C35E7901C1EDD7F9BCFF6035A5796883C47AAC587`), run section-by-section immediately after applying the hardening

| § | Check | Result |
|---|---|---|
| 1 | EXECUTE per function per role | `anon_can_execute = false` for all 4 functions; `authenticated_can_execute` / `service_role_can_execute` / `postgres_can_execute = true` for all 4 |
| 2 | Table grants per role | `anon`: select/insert/update/delete all `false` on both tables; `authenticated`: select `true`, insert/update/delete `false` on both; `service_role`/`postgres` insert `true` on both (unchanged) |
| 3 | RLS enabled | `true` on both tables |
| 4 | Policies | exactly 2, unchanged: both `cmd = SELECT`, both `roles = {authenticated}` |
| 5 | Row counts | `scheduled_writer_runs_count = 0`, `operational_notification_events_count = 0` |

## Confirmed alongside the above

- **0 rows** in both `scheduled_writer_runs` and `operational_notification_events`.
- **0 open runs** (`scheduled_writer_runs` rows with `finished_at IS NULL`).
- **0 claimed events** (`operational_notification_events` rows with `status = 'claimed'`).
- **No RPC was called**, no writer was run, no Cron was triggered, no email
  was sent, no contact was made with Resend, as part of this hardening.
- **No Environment Variable was changed** in Production or Preview.

---

## Standing instructions

- **Do not re-run** `PROPOSED_SPRINT_166J_PRODUCTION_ACL_HARDENING_V1.sql`.
  Applying `REVOKE` statements a second time against an ACL that no longer
  holds the grants being revoked is a harmless no-op in Postgres, but this
  file's own purpose is fully served — there is no reason to run it again,
  and doing so is out of scope for any future sprint without a fresh,
  separate approval.
- **The prepared rollback** — `docs/sql/ROLLBACK_SPRINT_166J_PRODUCTION_ACL_HARDENING_V1.sql`
  (SHA-256 `B1834F9A747B5CDC2FA284D8166DFD08928C65959D9F24BCF2A7758126B90A66`) —
  remains prepared and unexecuted. It restores exactly the pre-hardening
  ACL (matching what Sprint 166I's own audit measured live, and what
  `alertownik-preview` still has today). It should only be run if a future,
  separately-approved investigation finds the hardening broke real
  application behavior — see that file's own header for the full
  before/after grant list.
- The full static and read-only audit behind this decision — the ACL
  investigation, the code review establishing why the hardening is safe,
  and the severity assessment (LOW/INFORMATIONAL) — lives in
  `docs/SPRINT_166J_PRODUCTION_ACL_AND_RETENTION_AUDIT_V1.md`. This
  checkpoint records the *outcome*; that document records the *reasoning*.
