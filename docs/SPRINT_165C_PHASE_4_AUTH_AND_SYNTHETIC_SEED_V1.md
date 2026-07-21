# Sprint 165C, Phase 4 — Isolated Preview: Auth Accounts and Synthetic Seed Complete

**Status:** two Supabase Auth accounts created and membership-linked, and the synthetic seed data run successfully, against the isolated `alertownik-preview` Supabase project. Branch `sprint-165c-isolated-preview-supabase-infrastructure-v1`, not merged to `main`. **Zero Vercel environment variable changes. Zero automation activated. Production (`alertownik-mvp`) was not touched.**

---

## Auth accounts created (Adam, manually, in the Supabase dashboard)

| Account | Email | Membership row |
|---|---|---|
| Test admin | `preview-test-admin@example.invalid` | `admin_profiles.user_id = 950a90d6-3437-43a4-915a-f10b1be67b0e` |
| Test scheduled-writer | `preview-test-writer@example.invalid` | `automation_identities.user_id = 2d30d5e3-2074-44b2-9374-e4812a966c52` |

Both created via "Create new user" (never "Send invitation" — the `.invalid` addresses are intentionally undeliverable), both with "Auto Confirm User" checked, both with a password Adam generated and entered directly (never seen, typed, or stored by Claude). Each account's single, correctly-scoped `INSERT` (one per account, executed only after Adam's explicit approval and a read-only pre/post check each time) confirmed:
- exactly 1 row in `admin_profiles`, matching the admin's UID;
- exactly 1 row in `automation_identities`, matching the writer's UID, a different UID from the admin's;
- exactly 2 accounts in `auth.users` total;
- no automatic trigger populates either table (confirmed in Phase 3's `pg_trigger` audit) — both inserts were manual, required, and RLS-consistent (neither table has an INSERT policy for any role; only the SQL Editor's `postgres` role can write them).

## Pre-run seed audit — one bug found and fixed before execution

Comparing `docs/sql/SPRINT_165B_ISOLATED_PREVIEW_SYNTHETIC_SEED_NOT_EXECUTED_V1.sql` line-by-line against the live, introspection-derived schema found the `synthetic-preview-draft` row inserted `category = 'municipal'` into `public.alerts` — but `alerts.category`'s CHECK constraint only allows `['transport','water','power','waste','roads','announcement']` (a different enum than `alert_sources`/`source_notice_candidates`, which do allow `'municipal'`). Unfixed, this would have aborted the entire 7-row `alerts` INSERT. Fixed to `'announcement'` — a synthetic-data-only correction, committed as `7bb7ac1`.

A second pre-run check found the file's seven INSERT statements were not wrapped in a transaction. Wrapped the entire executable body in `begin;`/`commit;` so all statements succeed or roll back together — committed as `332b795`.

Every other check passed: correct FK-respecting insert order, all synthetic placeholder data (no real names/PII/secrets/Production UUIDs), no `DROP`/`TRUNCATE`/`DELETE`/`UPDATE`/`ALTER`/RLS change/Auth account creation, no candidate row reaches `published`/`converted_to_draft`. Residual, documented (not fixed) characteristic: `source_checks`/`source_notice_candidates`/`waste_schedule_items` have no natural business key to guard against duplication on a second run — this file is designed for exactly one run against a freshly-empty project, which matched `alertownik-preview`'s confirmed state at execution time.

## Execution

The corrected, transaction-wrapped file (fetched from the pushed commit, not retyped) was pasted into the SQL Editor, the project header was reconfirmed as `alertownik-preview`, and Run was clicked exactly once. **Result: Success. No rows returned. No error, no ambiguous state.**

## Post-run verification (read-only)

| Table | Rows | Expected |
|---|---|---|
| `alert_categories` | 6 | 6 ✅ |
| `alert_sources` | 3 | 3 ✅ |
| `alerts` | 7 | 7 ✅ |
| `source_checks` | 3 | 3 ✅ |
| `source_notice_candidates` | 3 | 3 ✅ |
| `waste_schedule_items` | 4 | 4 ✅ |
| `admin_profiles` | 1 | 1 (unchanged) ✅ |
| `automation_identities` | 1 | 1 (unchanged) ✅ |
| `auth.users` | 2 | 2 (unchanged) ✅ |

Detailed checks, all exact matches:
- `alerts`: 5 `published`, 1 `draft`, 1 `archived`.
- `source_notice_candidates`: 1 `pending`, 1 `approved`, 1 `rejected`; **0** rows with status `published` or `converted_to_draft`.
- `alert_sources`: **0** URLs outside the `https://example-preview-only.test` domain; exactly 1 row with a `null` URL (by design); **0** source names missing the `SYNTHETIC` label.

Table Editor confirmed visually: the same 8 tables as before, no extras.

## What did NOT happen

- No additional Supabase Auth account was created.
- No change to RLS policies, functions, triggers, or schema — the seed file contains only `INSERT` statements.
- No Vercel environment variable was touched.
- No cron or `/api/cron/write-candidates` was called.
- No alert was published or archived through the application — every `status` value came directly from the seed's own `INSERT`, not an app action.
- Production (`alertownik-mvp`) was not opened or touched at any point in this phase.

## Next step (not started)

Vercel Preview environment-variable separation (pointing Preview at `alertownik-preview` instead of the shared Production project) — a separate, later, explicitly-scoped manual gate, not begun by this phase.
