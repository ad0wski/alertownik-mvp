# Sprint 165B — Isolated Preview Schema Replay Manifest v1

**NOT EXECUTED.** This document describes an order in which SQL files *would* need to be run against a brand-new, empty Supabase project to reconstruct the current live schema/RLS. **No SQL from this manifest, or any other file, was executed as part of Sprint 165B.** No new Supabase project exists yet. This is planning only, per Sprint 165A's design (`docs/SPRINT_165A_ISOLATED_PREVIEW_ENVIRONMENT_DESIGN_V1.md`).

---

## 0. Important finding: the historical `docs/sql/` trail is NOT a complete, reliable replay source

Before proposing an order, this manifest records an honest limitation discovered while compiling it: **no single file, or ordered sequence of existing files, fully and provably reconstructs today's live schema.** Evidence:

- `docs/supabase/schema-draft.sql` (the earliest, most complete-looking "base schema" file) is explicitly marked `STATUS: DRAFT — do not execute` and has **diverged** from the live schema in verifiable ways: it gives `alert_categories.id` as `text`, while the live table uses `uuid` with a separate `slug` column; it includes an `alerts.location` column not present live; it defines an `alerts_set_updated_at` trigger that **does not exist** on the live database (Sprint 165A's read-only audit found zero triggers in `public` via `information_schema.triggers`); and it never mentions `admin_profiles`, `automation_identities`, `source_notice_candidates`, `source_checks`, or `waste_schedule_items` at all.
- No committed file was found that creates `admin_profiles`, `alert_categories` (in its live `uuid`/`slug` shape), or `waste_schedule_items` from scratch — these tables' live schema was confirmed by direct read-only introspection (Sprint 165A §B.1), not derived from a file in this repository.
- Several files record that a live policy or grant was found to already exist **without a corresponding committed migration file** — e.g. `PROPOSED_ALERT_SOURCES_PUBLIC_READ_CLEANUP_V1.sql`'s own header states the `alert_sources` public-read policy it discusses "is not present in any committed repository file." This is a known, historical pattern in this project (schema changes applied directly via the Supabase SQL editor, not always paired with a saved file at the time).

**Recommendation, not performed in this sprint:** before ever running SQL against a new Preview project, a future sprint should generate ONE new, authoritative "as-built" schema+RLS script by re-running the exact read-only introspection queries Sprint 165A already used (`list_tables` verbose, the `pg_policies` query, the `pg_indexes` query, the `pg_proc` query — all reproduced in `docs/SPRINT_165A_ISOLATED_PREVIEW_ENVIRONMENT_DESIGN_V1.md` §B) against **Production**, and turn that live-confirmed shape directly into `CREATE TABLE`/`CREATE POLICY`/`CREATE INDEX` statements — reviewed line-by-line by Adam against the introspection output, not assembled by replaying history. This is both safer (no silent omission of an undocumented manual change) and more honest than trusting an incomplete historical trail. The ordered list below remains useful as a **cross-check** — anything it produces should match the fresh introspection-derived script exactly; a mismatch would itself be a valuable finding.

Everything below is offered as that cross-check reference, not as a script ready to run as-is.

---

## 1. Base tables and columns — status of each candidate file

| File | Covers | Status for replay |
|---|---|---|
| `docs/supabase/schema-draft.sql` | `alert_categories`, `alert_sources`, `alerts`, a trigger | **Do not use as-is** — confirmed stale/divergent from live (see §0). Useful only as historical context. |
| `docs/supabase_sources_schema.sql` | `alert_sources` | Candidate — needs a line-by-line diff against the live column list in Sprint 165A §B.1 before use (not performed this sprint). |
| `docs/supabase_source_checks.sql` | `source_checks` | Candidate — same caveat. |
| `docs/supabase_alerts_source_id.sql` | `alerts.source_id` FK | Candidate — an ALTER, not a CREATE; only meaningful after `alerts` and `alert_sources` both exist. |
| `docs/supabase_source_notice_candidates.sql` | `source_notice_candidates` | Candidate — predates the Sprint 150 `content_fingerprint` column (see §3), needs that column added afterward. |
| `docs/supabase_waste_schedule_items.sql` | `waste_schedule_items` | Candidate — independent of every other table, safe to apply at any point after RLS is understood. |
| `docs/supabase_waste_schedule_seed_example.sql` | Sample waste rows | **Exclude from schema replay** — this is real-looking seed data, not schema; the synthetic seed package (§G of the main doc) supersedes it for Preview. |
| — (no file found) | `alert_categories` (live `uuid`/`slug` shape), `admin_profiles`, `automation_identities` (table shape only, not membership rows) | **Missing** — must be authored fresh from the live introspection output per §0's recommendation. |

## 2. RLS and grant hardening — status of each candidate file

| File | Applied live? (per Sprint 165A's confirmed `pg_policies` read) | Action |
|---|---|---|
| `docs/sql/PROPOSED_SCHEDULED_WRITER_RLS_MIGRATION_V1.sql` | **Yes** — the scheduled-writer INSERT/SELECT policies on `source_checks`/`source_notice_candidates` match this file's shape exactly | Include, after the base tables exist and `automation_identities` exists |
| `docs/sql/PROPOSED_SCHEDULED_WRITER_RLS_ROLLBACK_V1.sql` | N/A | **Exclude** — rollback-only, never run during a forward build |
| `docs/sql/PROPOSED_AUTOMATION_IDENTITIES_GRANT_HARDENING_V1.sql` | Not independently re-confirmed this sprint | Candidate — low-risk hardening (revokes residual TRUNCATE/TRIGGER/REFERENCES grants), include after `automation_identities` exists |
| `docs/sql/PROPOSED_AUTOMATION_IDENTITIES_GRANT_HARDENING_ROLLBACK_V1.sql` | N/A | **Exclude** — rollback-only |
| `docs/sql/SPRINT_161B_ALERT_SOURCES_RLS_HARDENING.sql` | **Yes** — live `alert_sources` admin policies use `admin_profiles`-membership checks, matching this file, not the older broader `auth.role() = 'authenticated'` check | Include |
| `docs/sql/PROPOSED_ALERT_SOURCES_PUBLIC_READ_CLEANUP_V1.sql` | Needs re-verification — live anon SELECT policy on `alert_sources` is `qual: true` (all rows, not filtered) | Candidate only if Adam confirms this cleanup was never actually applied; **do not assume** — re-run the read-only check against Production first |
| `docs/sql/INSPECT_LIVE_RLS_READ_ONLY.sql` | N/A | **Exclude from replay** — a verification query, not a migration |
| `docs/sql/VERIFY_SCHEDULED_WRITER_RLS_READ_ONLY_V1.sql`, `VERIFY_AUTOMATION_IDENTITIES_GRANTS_READ_ONLY_V1.sql`, `VERIFY_SPRINT_161B_RLS_READ_ONLY.sql` | N/A | **Exclude from replay** — read-only verification, useful *after* replay to confirm success, not part of building the schema |

## 3. Later-sprint migrations — status of each candidate file

| File | Applied live? | Action |
|---|---|---|
| `docs/sql/APPLY_SPRINT_150_STEP_1_ADD_FINGERPRINT_COLUMN_V1.sql` | **Yes** — `source_notice_candidates.content_fingerprint` column exists live, with the exact comment text this file's design describes | Include, after `source_notice_candidates` exists |
| `docs/sql/APPLY_SPRINT_150_STEP_2_CREATE_UNIQUE_INDEX_V1.sql` | **Yes** — `source_notice_candidates_writer_fingerprint_uniq` partial unique index confirmed live | Include, immediately after Step 1 |
| `docs/sql/APPLY_SPRINT_150_STEP_2B_COMMENT_ON_INDEX_V1.sql` | Cosmetic (`COMMENT ON INDEX`) — low priority | Include for completeness, order-independent relative to other files once Step 2 has run |
| `docs/sql/PROPOSED_SPRINT_150_RACE_CONDITION_MIGRATION_V1.sql` | **Superseded** — this is the original combined proposal; Steps 1/2/2B above are its applied, split-out form | **Exclude** — do not run in addition to Steps 1/2/2B (would be redundant/conflicting) |
| `docs/sql/ROLLBACK_SPRINT_150_RACE_CONDITION_MIGRATION_V1.sql` | N/A | **Exclude** — rollback-only |
| `docs/sql/VERIFY_SPRINT_150_RACE_CONDITION_MIGRATION_READ_ONLY_V1.sql`, `VERIFY_SPRINT_150_FINGERPRINT_CONTROLLED_TEST_SINGLE_RESULT_READ_ONLY_V1.sql` | N/A | **Exclude from replay** — verification only |
| `docs/sql/PROPOSED_SPRINT_164A_LINK_HEALTH_PERSISTENCE_V1.sql` | **Not applied** — no matching table/column found in the live schema audit | **Exclude** — this is a genuine "not yet decided" proposal for a future feature, unrelated to reconstructing *today's* live shape. Do not include in an isolated-Preview replay meant to mirror current Production. |
| `docs/sql/ROLLBACK_SPRINT_164A_LINK_HEALTH_PERSISTENCE_V1.sql`, `VERIFY_SPRINT_164A_LINK_HEALTH_READ_ONLY_V1.sql` | N/A | **Exclude** |

## 4. Automation-identity membership rows — never part of schema replay

| File | Nature | Action |
|---|---|---|
| `docs/sql/INSERT_SCHEDULED_WRITER_AUTOMATION_IDENTITY_V1.sql` | Inserts a **specific Production `auth.users` UUID** into `automation_identities` | **Exclude entirely** — this row is Production-specific data, not schema. The isolated Preview project needs its own fresh membership row, inserted manually per the Sprint 165C runbook (§H), for its own newly-created test scheduled-writer account — never this file. |
| `docs/sql/FIX_SCHEDULED_WRITER_AUTOMATION_IDENTITY_V1.sql` | Corrects a specific Production data-entry mistake (a wrong UUID) | **Exclude entirely** — same reasoning; also historical/Production-specific, not applicable to a fresh project that never had the mistake. |
| `docs/sql/VERIFY_SCHEDULED_WRITER_AUTOMATION_IDENTITY_READ_ONLY_V1.sql`, `..._FIXED_READ_ONLY_V1.sql` | Read-only checks against the above | **Exclude from replay** |
| `docs/sql/GET_MICHALOWICE_SOURCE_REGISTRY_ID_READ_ONLY_V1.sql` | Reads Production's `alert_sources.id` for Michałowice, for `SCHEDULED_WRITER_SOURCE_REGISTRY_IDS` configuration | **Exclude from replay** — Preview's own Michałowice-equivalent seed row (§G synthetic data) will have its own, different id; the equivalent lookup must be re-run against the *new* project once seeded. |

## 5. Everything else audited and excluded

| File | Reason for exclusion |
|---|---|
| `docs/draft_alert_insert_template.sql`, `docs/first_real_alert_wkd_draft.sql`, `docs/sprint118_pruszkow_roadworks_draft_proposal.sql`, `docs/sprint121_pruszkow_hot_water_draft_proposal.sql`, `docs/sprint122_komorow_waste_seed_proposal.sql`, `docs/sprint123_komorow_waste_import_proposal.sql` | Real (or real-looking) content drafts/inserts tied to actual past Production announcements — not schema, not synthetic, must never be replayed into Preview |
| `docs/sprint113_archive_stale_alerts_proposal.sql` | A one-time data-maintenance operation against specific Production rows, not schema |
| `docs/sprint122_waste_schedule_readonly_check.sql` | Read-only verification query |
| `docs/sprint132_candidate_persistence_schema_proposal.sql` | Superseded by `docs/supabase_source_notice_candidates.sql` + the Sprint 150 fingerprint files (§3) — an earlier-stage proposal for the same table |
| `docs/sql/VERIFY_SOURCE_NOTICE_CANDIDATE_DUPLICATES_READ_ONLY_V1.sql`, `..._SINGLE_RESULT_READ_ONLY_V1.sql`, `VERIFY_SPRINT_148_CONTROLLED_WRITE_TEST_READ_ONLY_V1.sql`, `..._SINGLE_RESULT_READ_ONLY_V1.sql` | Read-only verification/test-result queries tied to specific past controlled-write test runs on Production — not schema |

---

## 6. Provisional safe order (pending §0's recommended fresh-introspection script)

If, despite §0's recommendation, a future session chooses to replay history directly rather than author a fresh as-built script, this is the order that respects every dependency found above:

1. `docs/supabase_sources_schema.sql` (`alert_sources`) — **after** first authoring the missing `alert_categories` create statement (§1) from live introspection, since `alert_sources.category` is free text with a check constraint, not an FK, per the live schema (Sprint 165A §B.1) — verify this against the live schema before assuming a foreign key exists.
2. Author `alerts` (no reliable existing file — must be written fresh from Sprint 165A §B.1's column list) and `admin_profiles` (same).
3. `docs/supabase_alerts_source_id.sql` (`alerts.source_id` FK) — after both `alerts` and `alert_sources` exist.
4. `docs/supabase_source_checks.sql` (`source_checks`).
5. `docs/supabase_source_notice_candidates.sql` (`source_notice_candidates`, pre-fingerprint shape).
6. `docs/sql/APPLY_SPRINT_150_STEP_1_ADD_FINGERPRINT_COLUMN_V1.sql`, then `..._STEP_2_...`, then `..._STEP_2B_...`.
7. `docs/supabase_waste_schedule_items.sql` (`waste_schedule_items`) — independent, any point after step 2.
8. Author `automation_identities` (table shape only — no membership rows) fresh from Sprint 165A §B.1/§B.4.
9. Enable RLS on all eight tables, then apply base admin/public policies (no single existing file covers every one — cross-check every policy in Sprint 165A §B.2 individually).
10. `docs/sql/PROPOSED_SCHEDULED_WRITER_RLS_MIGRATION_V1.sql`.
11. `docs/sql/PROPOSED_AUTOMATION_IDENTITIES_GRANT_HARDENING_V1.sql` (optional hardening).
12. `docs/sql/SPRINT_161B_ALERT_SOURCES_RLS_HARDENING.sql`.
13. Re-run the exact `pg_policies`/`pg_indexes`/`list_tables` queries from Sprint 165A §B against the *new* project and diff the output against §B's Production snapshot, line by line, before considering the replay complete.

Steps 2, 8, and parts of 9 have **no existing source file** — this is the concrete, itemized version of §0's finding, not a hand-wave.

---

## 7. Sprint 165C, Phase 1 correction — triggers DO exist

This manifest (§0 above) and Sprint 165A §B.3 both stated that **no triggers** were found in `public`, based on a query against `information_schema.triggers`, and concluded `updated_at` columns are maintained by application code only. Sprint 165C's preflight re-ran the equivalent check directly against `pg_trigger` (authoritative; `information_schema.triggers` can under-report depending on how a prior query was scoped) and found this was **wrong**: four triggers exist live today, all invoking the existing `set_updated_at()` function —

- `alerts.set_alerts_updated_at`
- `alert_sources.alert_sources_set_updated_at`
- `waste_schedule_items.waste_schedule_items_set_updated_at`
- `source_notice_candidates.source_notice_candidates_set_updated_at`

These triggers already exist on Production today and always have — nothing was added by Sprint 165C. This is a correction to a prior audit's finding, not a schema change. `docs/sql/SPRINT_165C_AS_BUILT_SCHEMA_NOT_EXECUTED_V1.sql` (written this sprint) includes all four `CREATE TRIGGER` statements, so an isolated Preview replay reproduces this real behavior instead of silently omitting it, as the provisional order in §6 above would have. The rest of §0's live-introspection re-check (tables, columns, row counts, RLS policies, indexes, functions, extensions, `list_migrations`) found **zero drift** from the Sprint 165A snapshot.
