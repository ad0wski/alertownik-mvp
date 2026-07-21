# Sprint 165C — Manual Gate 2: Isolated Preview Supabase Project Created

**Status:** infrastructure creation only — a single, empty Supabase project now exists for the future isolated Preview environment. Branch `sprint-165c-isolated-preview-supabase-infrastructure-v1`, not merged to `main`. **No SQL was executed. No table, RLS policy, function, or trigger was created. No Supabase Auth account was created. No Vercel environment variable was changed. No Redeploy was performed. No cron or automated write was activated. Production (`alertownik-mvp`) was not touched in any way.**

---

## What was created

| Field | Value |
|---|---|
| Project name | `alertownik-preview` |
| Organization | `ad0wski's Org` (Free Plan) |
| Region | West Europe (London) — `eu-west-2`, matching Production |
| Compute tier | `NANO` (Free plan default) |
| Status at creation | Healthy |
| Migrations | None |
| Backups | None |
| Branches | None (no GitHub repository connected) |

This is a **completely separate project** from Production (`alertownik-mvp`). No database password, publishable/anon key, service_role key, connection string, or JWT secret was opened, copied, or recorded anywhere in this repository, chat, or memory — Adam entered the database password directly into the Supabase form himself; Claude never saw it.

## What was NOT done

- No SQL executed against the new project (the as-built schema file from Phase 1, `docs/sql/SPRINT_165C_AS_BUILT_SCHEMA_NOT_EXECUTED_V1.sql`, remains unrun).
- No table, RLS policy, index, trigger, or function created on the new project — it is schema-empty.
- No Supabase Auth account created (test admin or test scheduled-writer).
- No `admin_profiles`/`automation_identities` row inserted.
- No Vercel environment variable added, edited, or removed — Preview still points at Production's Supabase project exactly as before.
- No Redeploy triggered.
- No cron or `SCHEDULED_CHECKS_ENABLED`/`SCHEDULED_WRITES_ENABLED` activation, anywhere.
- Production (`alertownik-mvp`) and the unrelated, paused `Trade Gamifier` project were both left untouched.

## Cost / plan confirmation

No cost, upgrade, or project-limit warning appeared at any point during project creation. The organization remains on the Free Plan; no payment method was added, no plan was changed.

## Next step (not started)

The next phase of Sprint 165C would be running `docs/sql/SPRINT_165C_AS_BUILT_SCHEMA_NOT_EXECUTED_V1.sql` against this new, empty project — a separate, later step requiring Adam's own explicit go-ahead and Adam's own action in the SQL editor, per `docs/SPRINT_165C_MANUAL_DEPLOYMENT_RUNBOOK_V1.md`. Not begun by this phase.
