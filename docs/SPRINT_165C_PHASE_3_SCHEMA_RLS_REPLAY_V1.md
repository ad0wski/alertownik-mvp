# Sprint 165C, Phase 3 — Isolated Preview: Schema and RLS Replay Complete

**Status:** schema/RLS replay executed successfully against the new, isolated `alertownik-preview` Supabase project. Branch `sprint-165c-isolated-preview-supabase-infrastructure-v1`, not merged to `main`. **Zero seed data inserted. Zero Supabase Auth accounts created. Zero Vercel environment variable changes. Zero automation activated. Production (`alertownik-mvp`) was not touched.**

---

## What was executed

`docs/sql/SPRINT_165C_AS_BUILT_SCHEMA_NOT_EXECUTED_V1.sql` (490 lines, wrapped in `begin;` / `commit;` directly in the Supabase SQL Editor — the file in this repository was not modified) was run exactly once against `alertownik-preview`, after a read-only empty-schema check confirmed the target was genuinely empty first.

### Pre-run check (read-only, before replay)

| Check | Result |
|---|---|
| `public_tables` | 0 |
| `public_policies` | 0 |
| `public_noninternal_triggers` | 0 |

### Execution result

**Success. No rows returned.** No destructive-DDL confirmation prompt appeared (the script contains no `DROP`/`TRUNCATE`/`DELETE`). Run was clicked exactly once.

### Post-run verification (read-only, after replay)

| Check | Result | Expected |
|---|---|---|
| `public_tables` | 8 | 8 ✅ |
| `public_policies` | 28 | 28 ✅ |
| `public_noninternal_triggers` | 4 | 4 ✅ |
| `tables_with_rls` | 8 | 8 ✅ |

Row counts, all 8 tables — **every table confirmed at exactly 0 rows**: `alert_categories`, `alert_sources`, `alerts`, `admin_profiles`, `automation_identities`, `source_checks`, `waste_schedule_items`, `source_notice_candidates`.

Table Editor confirmed visually: exactly these 8 tables exist, no extras.

---

## Current state of `alertownik-preview`

- ✅ Project created (Manual Gate 2)
- ✅ Schema, RLS policies (28), triggers (4), and functions (2) replayed and verified against the live Production snapshot
- ❌ **No Supabase Auth accounts created** (test admin, test scheduled-writer) — schema-only, no `admin_profiles`/`automation_identities` row exists yet
- ❌ **No synthetic seed data run** — every table is empty (0 rows)
- ❌ **Vercel Preview is still not connected to this project** — `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` remain scoped to Production+Preview pointing at the original shared project; nothing in Vercel has changed
- ❌ **Automation remains fully OFF** — no `SCHEDULED_CHECKS_ENABLED`/`SCHEDULED_WRITES_ENABLED`, no `SUPABASE_ENVIRONMENT_TAG`, no `SUPABASE_EXPECTED_PROJECT_REF` configured anywhere

## What was NOT done in this phase

- No repository code, SQL file, or infrastructure config was changed — only the already-committed, unmodified `SPRINT_165C_AS_BUILT_SCHEMA_NOT_EXECUTED_V1.sql` was run, wrapped in a transaction directly in the SQL Editor.
- No Auth account created, no admin, no scheduled writer.
- No seed data inserted.
- No Vercel environment variable touched.
- No secret, key, password, or connection string opened, copied, or recorded.
- Production (`alertownik-mvp`) and the unrelated `Trade Gamifier` project were not opened or touched.

## Next step (not started)

Creating the two Supabase Auth accounts (test admin, test scheduled-writer) and their `admin_profiles`/`automation_identities` rows in `alertownik-preview`, per `docs/SPRINT_165C_MANUAL_DEPLOYMENT_RUNBOOK_V1.md` §6–7 — a separate, later manual gate requiring Adam's own action in the Supabase Authentication tab (account creation) and explicit go-ahead before Claude verifies the resulting rows read-only.
