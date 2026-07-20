# Sprint 165A — Isolated Preview Environment: Design and Preflight v1

**Status:** design and audit only, branch `sprint-165a-isolated-preview-environment-design-and-preflight-v1`, not merged to `main`. No Supabase project was created. No SQL was executed. No data was copied. No Vercel environment variable was added, edited, or removed. No automation was run.

**Trigger:** Sprint 164C's read-only audit confirmed Vercel Preview and Production share one Supabase project — `NEXT_PUBLIC_SUPABASE_URL` is a single value scoped to both. Adam accepted that as a documented characteristic for now (Option A), revisitable later. This sprint is that revisit: a full design for a genuinely isolated Preview database, so that a future canary run (or any Preview testing) can no longer touch Production data by construction, not by discipline alone.

---

## A. Preflight

- `git fetch origin` run exactly once.
- Branch: `main`. `main` = `origin/main` = `aaf36e2`.
- `git status -sb` showed no changes outside `.vscode/` (untracked, expected).
- Preflight passed — proceeded to audit and design. No pull/reset/checkout was needed.

---

## B. Audit of current architecture

### B.1 — Supabase tables (`public` schema, live, verified via read-only `list_tables`)

| Table | Rows (at audit time) | RLS enabled | Purpose |
|---|---|---|---|
| `alert_categories` | 0 | Yes | Category reference list (slug, name) |
| `alert_sources` | 0 | Yes | Source registry (name, url, category, source_type, is_active, notes) |
| `alerts` | 3 | Yes | The public-facing alert content (draft/published/archived) |
| `admin_profiles` | 0 | Yes | Admin membership — `user_id` FK to `auth.users`, no other columns |
| `source_checks` | 2 | Yes | Manual + scheduled-writer check-history log |
| `waste_schedule_items` | 40 | Yes | Waste collection schedule reference data |
| `source_notice_candidates` | 2 | Yes | Candidate notices (admin-saved or scheduled-writer-created), reviewed into drafts |
| `automation_identities` | 1 | Yes | Membership-only table naming which `auth.users` row(s) are the scheduled-writer technical account |

All eight tables have RLS enabled — no table in this schema is unprotected.

### B.2 — RLS policies (verified via read-only `pg_policies` query)

- **Public (`anon`) read-only:** `alert_categories` (all rows), `alert_sources` (all rows), `alerts` (`status = 'published'` only), `waste_schedule_items` (all rows).
- **Admin (`admin_profiles` membership) full CRUD:** `alert_sources`, `alerts`, `source_checks`, `source_notice_candidates`.
- **`waste_schedule_items` write access:** any `authenticated` user (`auth.role() = 'authenticated'`) — broader than the `admin_profiles`-gated tables; a known, pre-existing pattern, not something this sprint changes.
- **Scheduled writer (`automation_identities` membership) — narrow, additive-only:**
  - `source_checks`: INSERT only, `WITH CHECK` forces `result` to `no_changes`/`found_notice`, `related_alert_id IS NULL`, `created_by = auth.uid()`.
  - `source_notice_candidates`: INSERT only, `WITH CHECK` forces `status='pending'`, `verification_status='unverified'`, and every review/verification/publish-adjacent column to `NULL`. Also SELECT (read own + all candidates, needed for in-app dedup).
  - No UPDATE, DELETE, or access to `alerts` or `alert_sources` at all for this identity.
- **`admin_profiles` / `automation_identities`:** each account may only read its own membership row.

This is the exact policy shape that must be reproduced (not merely approximated) on an isolated Preview project.

### B.3 — Functions, triggers, indexes, migrations

- Functions in `public`: `rls_auto_enable`, `set_updated_at` (no arguments found on either via `pg_proc`).
- Triggers: **none found** in `information_schema.triggers` for `public` — `updated_at` columns exist on `alert_sources`, `alerts`, `waste_schedule_items`, `source_notice_candidates` but are not currently trigger-maintained at the database level (application code sets them, or they rely on defaults only at insert time). This is a fact to carry into the isolated schema unchanged, not a bug to fix as part of this sprint.
- Indexes: standard primary keys plus targeted secondary indexes (`alerts_source_id_idx`, `source_checks_source_id_idx`/`checked_at_idx`/`result_idx`, `source_notice_candidates_status_detected_idx`/`detected_at_idx`/`source_key_idx`/`source_id_idx`, `waste_schedule_items_locality_date_idx`/`collection_date_idx`) and one **partial unique index** — `source_notice_candidates_writer_fingerprint_uniq` on `(source_key, content_fingerprint)` where both are non-null — the Sprint 150 race-condition-closure constraint.
- No formal Supabase migration history is tracked (`list_migrations` returned empty) — the actual source of truth for schema history is the sequence of hand-written SQL files under `docs/sql/`, applied manually by Adam. An isolated Preview project must be built by replaying the **relevant subset** of those files in order, not by any automatic migration-replay tool.
- Extensions actually installed (vs. merely available): `pgcrypto`, `plpgsql`, `uuid-ossp`, `pg_stat_statements`, `supabase_vault` — all standard Supabase project defaults. `pg_cron` is **not** installed — no database-side cron exists; the only scheduled execution is Vercel's own `crons` array (see B.6). This matters for isolation: nothing inside Postgres itself needs to be re-armed.

### B.4 — Accounts and roles

| Identity | Mechanism | Grants |
|---|---|---|
| Admin | Any `auth.users` row that also has a matching `public.admin_profiles` row | Full CRUD on `alerts`, `alert_sources`, `source_checks`, `source_notice_candidates`; read/write `waste_schedule_items` (broader `authenticated`-role policy) |
| Scheduled writer | A single `auth.users` row (email/password) that also has a matching `public.automation_identities` row | INSERT-only on `source_checks` and `source_notice_candidates` under the narrow `WITH CHECK` constraints in B.2; SELECT on `source_notice_candidates` only |
| Public (resident) | No account — `anon` key | Read-only on published alerts, sources, categories, waste schedule |

`automation_identities` is explicitly documented (via its own SQL comment, confirmed live) as insertable **only by direct SQL/dashboard action by a human operator** — no application code path can write to it. This must be preserved on the isolated project: the future Preview scheduled-writer account is created the same manual way, never scripted.

No `service_role` key is used anywhere in `src/` (confirmed by repo-wide search — the three matches found are all comments *documenting* the rule, not usages).

### B.5 — Environment variables (Supabase- and automation-related)

| Variable | Read by | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `supabaseClient.ts`, `serverAuth.ts`, `scheduledWriter.ts` | Project URL — public by Next.js convention (`NEXT_PUBLIC_` prefix), but still the single value currently shared between Preview and Production |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | same three files | Anon/publishable key — never the service_role key anywhere |
| `SCHEDULED_CHECKS_ENABLED` | `check-sources`, `check-michalowice`, `write-candidates` routes | Kill switch 1 of 3 (dry-run + write gate) |
| `SCHEDULED_WRITES_ENABLED` | `write-candidates` route | Kill switch 2 of 3 (write-only gate, independent of switch 1) |
| `CRON_SECRET` | all three cron routes | Bearer-token auth for cron-triggered requests |
| `SUPABASE_SCHEDULED_WRITER_EMAIL` / `_PASSWORD` | `scheduledWriter.ts` | Kill switch 3 of 3 — technical account credentials, server-only |
| `SCHEDULED_WRITER_FINGERPRINT_ENABLED` | `scheduledWriter.ts` | Enables the Sprint 150 content-fingerprint column/constraint usage — must stay OFF until the matching migration is confirmed live on whichever database it targets |
| `SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN` | `scheduledWriter.ts` | Per-invocation insert cap, default 1 |
| `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS` | `scheduledWriter.ts` | Write-source allowlist, default Michałowice-only |
| `SCHEDULED_WRITER_SOURCE_REGISTRY_IDS` | `scheduledWriter.ts` | JSON map of `sourceKey → alert_sources.id`, since the writer has no SELECT on `alert_sources` |
| `ANTHROPIC_API_KEY` | `api/ai/draft-alert` | Not Supabase-related, but server-only and worth noting: never touches the database directly, only produces a draft the admin loads into Builder |

None of these are `NEXT_PUBLIC_`-prefixed except the two Supabase connection values, which is intentional and unchanged by this design.

### B.6 — API routes and cron surfaces capable of writing

| Route | Write-capable? | Current activation state |
|---|---|---|
| `GET /api/cron/write-candidates` | **Yes** — the only write-capable automation route. Triple-gated (B.5). | Not wired into `vercel.json`. `SCHEDULED_WRITES_ENABLED` has no Production value at all (confirmed in the Sprint 148/150 cleanup audits) — currently unreachable in every environment. |
| `GET /api/cron/check-sources` | No — dry-run only, no Supabase import at all (enforced by its own static-import test) | Not wired into `vercel.json`; reachable ad hoc with a valid `CRON_SECRET` + `SCHEDULED_CHECKS_ENABLED=true` |
| `GET /api/cron/check-michalowice` | No — same dry-run helper as above, hardcoded to one source | **This is the one route Production's `vercel.json` actually schedules** — daily at 05:00 UTC. Zero database writes regardless. |
| `POST /api/sources/check`, `POST /api/sources/fetch-preview` | No — SSRF-guarded fetch only, admin-session-gated, no Supabase write | Live, admin-only |
| `POST /api/ai/draft-alert` | No — calls Anthropic only, returns JSON to the browser; the admin's own later "Zapisz/Opublikuj" click is what writes to Supabase, via `supabaseAlertWrites.ts`/`supabaseCandidateWrites.ts` under the admin's own session | Live, admin-only |
| `GET /api/admin/link-health`, `GET /api/admin/automation-status` | No — read/compute only | Live, admin-only |

The actual current writers of Supabase data are therefore: (1) the browser, under an authenticated admin session (Builder, source registry, candidate review actions — `supabaseAlertWrites.ts`, `supabaseSourceWrites.ts`, `supabaseCandidateWrites.ts`, `supabaseWasteWrites.ts`), and (2) `write-candidates`, which is currently unreachable everywhere.

### B.7 — Storage, Realtime, Edge Functions

Repo-wide search found **zero** usage of `supabase.storage`, `.channel(` (Realtime), or `supabase.functions.invoke` anywhere in `src/`. The app uses only the Postgres/PostgREST surface (`from(...)`) and Supabase Auth (`auth.signInWithPassword`, `auth.getUser`). An isolated Preview project needs no Storage buckets, no Realtime configuration, and no Edge Functions — this simplifies the rebuild considerably.

### B.8 — Minimal test data needed for an isolated Preview

To exercise every current feature without any real resident or production data:

- 2–4 `alert_categories` rows matching the existing category set already hardcoded in the app's category constants (transport/water/power/waste/roads/municipal).
- 2–3 `alert_sources` rows, **including one with `id`/name matching `michalowice-komunikaty`'s real official URL pattern** (needed to exercise the canary write path end-to-end later), plus one inactive source (to exercise the "inactive source" UI states) and one with no `url` (nullable field — exercise that path too).
- 4–6 `alerts` rows spanning `draft`/`published`/`archived` status, at least one of each `severity`, and at least one already-expired (`ends_at` in the past) and one upcoming (`starts_at` in the future) to exercise the "Dzisiaj" time-status logic.
- 1 `admin_profiles` row bound to a dedicated **test admin** Supabase Auth account (new email, invented password — never the real Production admin's credentials).
- 1 `automation_identities` row bound to a dedicated **test scheduled-writer** Supabase Auth account (separate from the admin account above, separate again from any future real Production scheduled-writer account).
- A handful of `source_checks` and `source_notice_candidates` rows (mix of admin-created and writer-created, mix of `pending`/`approved`/`rejected`/`converted_to_draft` statuses) to exercise the `/admin/queue`-style review flows.
- 4–6 `waste_schedule_items` rows covering at least two localities and two waste types, so the waste-schedule UI has something to render.

All of the above is **synthetic** — no row is a copy of any real Production row. Every value (names, dates, text) should be obviously fake/placeholder so nobody mistakes Preview content for real municipal data.

---

## C. Isolation architecture (recommended design)

1. **Separate Supabase project, Preview-only.** A new, independent Supabase project (own org project, own database, own Auth user pool) used exclusively by Vercel's Preview environment. Production keeps its existing project untouched.
2. **Separate URL + publishable key.** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` become **environment-scoped** in Vercel: one pair scoped to Production only (unchanged values), a second, genuinely different pair scoped to Preview only (all Preview branches, not a specific branch name — avoiding the exact "orphaned branch-scoped variable" pattern just cleaned up in Sprints 148/150).
3. **Separate test admin account.** A newly created Supabase Auth user on the *Preview project only*, with a fresh `admin_profiles` row. Credentials generated fresh — never reused from Production, never typed by Claude into any form (see §D.4).
4. **Separate scheduled-writer account.** Same pattern as the admin account: new Auth user on the Preview project, new `automation_identities` row, inserted by Adam directly via SQL/dashboard — never by application code, matching the existing documented rule for the real account.
5. **Schema + RLS reproduced, not copied byte-for-byte from a dump.** Rebuilt from the authoritative `docs/sql/` files in their historical apply order (the same files that built Production), so the Preview schema is a *faithful replay of intent*, not a raw `pg_dump` of a system that might carry Production-only artifacts. A consolidated "apply in this order" file list is §D's first Claude Code deliverable.
6. **Minimal synthetic dataset only** — per §B.8, hand-authored, never derived from a Production export.
7. **Vercel environment variable separation:**
   - **Production:** every existing variable stays exactly as-is — zero changes, zero rotation, as a matter of this sprint's scope.
   - **Preview (all branches, environment-scoped, not branch-scoped):** new `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` pointing at the new project; separate `SUPABASE_SCHEDULED_WRITER_EMAIL`/`_PASSWORD` for the Preview scheduled-writer; a Preview-only `CRON_SECRET` (never equal to Production's); `SCHEDULED_CHECKS_ENABLED`/`SCHEDULED_WRITES_ENABLED` left OFF by default, to be turned on deliberately only for a future canary rehearsal.
   - **Development/local:** `.env.local` continues to point wherever Adam currently points it (today, apparently also Production — worth Adam explicitly deciding whether local dev should also move to the Preview project once it exists; flagged as an open decision in §E, not resolved by this design).
8. **Accidental-cross-pointing guard.** Two independent structural protections, not just naming discipline:
   - A same-project check: at boot (or on first Supabase call per request), compare the configured `NEXT_PUBLIC_SUPABASE_URL` host against a small allowlist of "known Production host(s)" baked into a non-secret constant; if the running environment believes itself to be Preview (see item 9) but the URL host matches the Production allowlist, fail closed before any write path executes.
   - Reuse of the *existing* three-gate pattern (`scheduledWriter.ts`) for any future write route — the new guard from item 9 becomes a **fourth** independent gate, additive to, not a replacement for, checks 1–3 already in place.
9. **Visible environment identifier in the admin panel.** A small, always-visible badge (e.g. in `AppHeader`/admin layout) reading `PRODUCTION`/`PREVIEW`/`DEVELOPMENT`, derived from Vercel's own `VERCEL_ENV` system environment variable (`production`/`preview`/`development` — already provided automatically by Vercel, requires no new secret, nothing to configure by hand, cannot be spoofed by a client since it's read server-side and passed down as already-resolved text). No environment currently exposes this today (confirmed: no existing usage of `VERCEL_ENV` or any environment badge concept in the codebase) — this is new UI, scoped narrowly to a label, not a new capability.
10. **Fail-closed write guard.** A new, small server-side helper (parallel to `isWriteModeEnabled`/`getScheduledWriterCredentials`) that:
    - reads `VERCEL_ENV` and the configured Supabase URL host,
    - computes whether they are a *known-safe pairing* (Production URL + `production` env, or Preview-project URL + `preview`/`development` env),
    - returns `false` for any unrecognized or mismatched pairing, and
    - is added as an **additional**, independent condition alongside the existing three write gates in `write-candidates` — never a replacement for any of them. A mismatch here blocks the write even if all three existing gates are somehow satisfied.
11. **Rollback plan without touching Production data.** Because Preview's project is entirely separate, "rollback" for Preview is simply: delete/reset the Preview Supabase project (or its rows) and/or point Preview's Vercel env vars back at nothing (unconfigured, which every current code path already treats as a safe no-op — `supabaseClient.ts` returns `null`, `requireAdminSession` fails closed). This never requires touching a single Production row, policy, or credential. Documented explicitly so a future rollback never has to reason from scratch about blast radius.

---

## D. Future execution order (not performed in this sprint)

### D.1 — Claude Code (local repo work)

1. Draft the exact ordered list of `docs/sql/` files (plus any new ones needed to reconstruct current schema state, e.g. the Sprint 150 fingerprint column/index) that together reconstruct the live schema+RLS, for Adam to run against the new project — never run by Claude directly against any live database beyond the existing read-only inspection pattern.
2. Write a new, isolated-Preview-specific seed SQL file with the synthetic dataset from §B.8 — clearly named, clearly marked "safe to re-run, contains no real data."
3. Implement the `VERCEL_ENV`-based environment badge component and the fail-closed pairing guard (§C.9–10) as ordinary, testable application code — same review/test bar as any other sprint.
4. Update `getScheduledWriterCredentials`/`write-candidates` (and any equivalent future write route) to call the new pairing guard as an additional gate.
5. Write/extend automated tests (unit tests for the guard's decision table; e2e static-import-style tests if applicable) so the new gate's fail-closed behavior is verified the same way the existing three gates already are.
6. Run `npm run check` and `npm run test:e2e` after any code change, per this project's standing rule.

### D.2 — Claude in Chrome (Vercel/Supabase dashboard work, once approved)

1. Create the new Supabase project (Preview-only) — **requires Adam's explicit go-ahead in-session**, not implied by this design doc.
2. Run the ordered SQL files from D.1 against the new project's SQL editor, one at a time, with Adam able to inspect each step.
3. Create the two new Supabase Auth accounts (test admin, test scheduled-writer) directly in the new project's dashboard.
4. Insert the `admin_profiles`/`automation_identities` rows for those two accounts.
5. In Vercel, add the new Preview-scoped environment variables (§C.7) — never touching any Production-scoped variable in the same session without a separate, explicit confirmation.
6. Trigger a Preview deployment (a normal PR/branch push — not a manual "Redeploy" click on an unrelated deployment) to pick up the new variables.

### D.3 — Requires Adam's manual approval (cannot proceed on Claude's own judgment)

- The decision to create the new Supabase project at all (cost/plan implications on Adam's Supabase account).
- The exact new Preview `CRON_SECRET` and scheduled-writer password values (generated by Adam, never by Claude, never typed into chat).
- Whether local `.env.local` should also move to point at the new Preview project, or keep pointing at Production for local development (an open trade-off, not a default this design presumes).
- The final go/no-go to flip any of `SCHEDULED_CHECKS_ENABLED`/`SCHEDULED_WRITES_ENABLED` to `true` on the new Preview environment for the first rehearsal run — a separate, later, explicitly-scoped sprint (165B or later), not this one.

### D.4 — Secrets Claude must never see or handle

- The new Preview project's database password, service_role key (never used by this app, but never to be viewed regardless), or `CRON_SECRET` value.
- The test admin's and test scheduled-writer's actual passwords — Claude may specify that they must be freshly generated and strong, but must never generate, type, paste, or store the literal value anywhere (chat, file, commit).
- Any existing Production secret value, for comparison or otherwise.

### D.5 — STOP points after each risky step

- **After project creation**, before running any SQL — confirm project id/URL with Adam, confirm it is NOT the Production project, before proceeding.
- **After schema/RLS replay**, before creating any Auth account — confirm (read-only) that RLS matches §B.2 exactly via the same `pg_policies` query style used in this audit, on the *new* project.
- **After creating test accounts**, before inserting `admin_profiles`/`automation_identities` rows — confirm the account ids and emails with Adam so there is no ambiguity about which account is being granted which role.
- **After Vercel variable changes**, before any deployment — confirm the variable scope shows the new project's Preview-only rows and that no Production-scoped row was touched, using the same names/scope-only inspection method already used in the Sprint 148/150 cleanups.
- **Before the first-ever write attempt** against the new Preview database (even a manual admin click) — confirm the environment badge (§C.9) reads `PREVIEW` and the pairing guard (§C.10) passes, as a live smoke test, before treating the new environment as ready.

---

## E. Acceptance tests (to design in detail and implement in a future sprint, not this one)

1. **Preview write does not change Production:** insert a synthetic candidate via the Preview-configured `write-candidates` route (or the Builder UI, signed in as the Preview test admin) and confirm, via a read-only Production query, that Production's `source_notice_candidates`/`alerts` row counts and `updated_at` timestamps are unchanged.
2. **Production write does not change Preview:** the inverse — a real (or simulated, off-hours) admin action on Production is confirmed absent from a Preview read-only query.
3. **Public alerts on Production stay unchanged:** a full row-count and content diff of `alerts WHERE status='published'` on Production, taken immediately before and after any Preview-environment testing session, must be identical.
4. **Preview test admin cannot reach Production:** attempt to sign the Preview test admin's session token into a request against the *Production* Supabase URL and confirm it is rejected (different Auth user pool entirely — this should fail structurally, not just by policy).
5. **Preview scheduled-writer cannot reach Production:** same test as #4, for the scheduled-writer account.
6. **Kill-switch-off stops every write:** with `SCHEDULED_WRITES_ENABLED` unset/false on Preview, confirm `write-candidates` returns its existing 503 and creates zero rows — reusing the exact assertion style already in this project's existing test suite for the three current gates, extended to cover the new pairing guard.
7. **Max one candidate per canary run:** reuse the existing `DEFAULT_MAX_CANDIDATES_PER_INVOCATION = 1` test coverage, re-run against the Preview project once seeded, to confirm the cap holds against real (not faked) Postgrest responses, not just the in-memory fake writer.
8. **Nothing auto-publishes:** confirm, by code inspection *and* a live check, that no code path — Preview or Production — can move a row's `status` to `published` without an authenticated admin's explicit Builder action; `write-candidates` and its Preview equivalent must be re-confirmed to never import any publish/draft-conversion helper (extending the existing static-import test pattern to the isolated environment's route wiring, if any diverges).

---

## F. Documentation

This document. Plus a short pointer added to `README.md`, `docs/ROADMAP.md`, and `docs/LIMITATIONS.md` (§"Michałowice Candidate Automation") recording that the shared-database limitation now has a concrete, reviewed isolation design — still not built.

---

## G. Explicit non-actions (this sprint)

Per the sprint's own scope boundary, none of the following were performed: creating a Supabase project, running SQL (beyond the pre-existing read-only inspection queries already permitted by this project's MCP rules), copying Production data, opening or copying any secret value, changing any Vercel environment variable, triggering Redeploy, running any cron, calling `write-candidates`, creating a candidate, changing RLS, publishing/editing/archiving any alert, or starting Sprint 165B.
