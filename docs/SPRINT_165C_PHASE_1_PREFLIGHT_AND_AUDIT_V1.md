# Sprint 165C, Phase 1 — Isolated Preview Supabase Infrastructure: Preflight, Audit, Manual Gate 1

**Status:** preflight, documentation audit, live re-verification, and preparation only. Branch `sprint-165c-isolated-preview-supabase-infrastructure-v1`, not merged to `main`. **No Supabase project was created. No SQL was executed. No Vercel environment variable was changed. No Supabase Auth account was created. No secret was set, opened, or copied. No write-candidates run. No SCHEDULED_CHECKS_ENABLED/SCHEDULED_WRITES_ENABLED activation. No Redeploy. No merge to `main`. Sprint 166 was not started.**

---

## 1. Preflight (Stage A) — result

- `git fetch origin` run exactly once.
- Before branching: `main` = `origin/main` = `58d525d` (Sprint 165B-2's final commit). Working tree had only the expected untracked `.vscode/` — no other changes.
- Branch created from clean `main`: `sprint-165c-isolated-preview-supabase-infrastructure-v1`.
- No pull/reset/rebase/force-push performed.

**Preflight: PASSED.**

---

## 2. Documentation and code audit (Stage B) — result

Read in full: `SPRINT_165A_ISOLATED_PREVIEW_ENVIRONMENT_DESIGN_V1.md`, `SPRINT_165B_ISOLATED_PREVIEW_CODE_SAFETY_PACKAGE_V1.md`, `SPRINT_165C_MANUAL_DEPLOYMENT_RUNBOOK_V1.md`, `README.md`, `docs/ROADMAP.md`, `docs/LIMITATIONS.md`, the full `docs/sql/` directory listing, `src/lib/environmentIdentity.ts`, `src/lib/databaseEnvironmentGuard.ts`, `src/app/api/cron/write-candidates/route.ts`.

**Code matches documentation exactly.** `environmentIdentity.ts`, `databaseEnvironmentGuard.ts`, and `write-candidates/route.ts` are unchanged since Sprint 165B-2 and behave exactly as documented — Layer 0 (four-signal guard) runs first, generic error message, no I/O, no leak of any signal.

### 2.1 — Live re-verification against Production (read-only, via Supabase MCP)

Sprint 165A's original audit was re-run in full against the *current* live Production database, per the Sprint 165C runbook's own §1 instruction to check for drift before trusting the manifest:

| Check | Result |
|---|---|
| Tables (`list_tables`, verbose) | **Zero drift.** Same 8 tables, same columns, same row counts (0/0/3/0/2/40/2/1) as Sprint 165A's snapshot. |
| RLS policies (`pg_policies`) | **Zero drift.** Every policy's `roles`/`cmd`/`qual`/`with_check` matches Sprint 165A §B.2 exactly, including the still-unresolved `alert_sources` public-read policy (`qual: true`, all rows) — confirming the manifest's caution that `PROPOSED_ALERT_SOURCES_PUBLIC_READ_CLEANUP_V1.sql` was **not** applied and must not be assumed applied. |
| Indexes (`pg_indexes`) | **Zero drift.** Same set, including the Sprint 150 partial unique index. |
| Functions (`pg_proc`) | **Zero drift.** Same two: `rls_auto_enable`, `set_updated_at`. |
| Extensions (`list_extensions`) | **Zero drift.** `pgcrypto`, `plpgsql`, `uuid-ossp`, `pg_stat_statements`, `supabase_vault` installed; `pg_cron` still **not** installed. |
| Migrations (`list_migrations`) | Still empty — no formal migration history tracked, as before. |

### 2.2 — Correction found: triggers DO exist (Sprint 165A/165B were wrong)

Sprint 165A §B.3 and the Sprint 165B schema replay manifest both stated **no triggers exist** in `public`, based on a query against `information_schema.triggers`, and concluded `updated_at` is application-maintained only. This Phase 1 preflight queried `pg_trigger` directly (authoritative) and found this claim was **incorrect**: four triggers exist live today, all invoking the existing `set_updated_at()` function —

- `alerts.set_alerts_updated_at`
- `alert_sources.alert_sources_set_updated_at`
- `waste_schedule_items.waste_schedule_items_set_updated_at`
- `source_notice_candidates.source_notice_candidates_set_updated_at`

These triggers already exist on Production today and always have — this is a correction to a prior audit's finding, not a schema change, and not something this sprint introduced. It has been recorded as an addendum in `docs/sql/SPRINT_165B_ISOLATED_PREVIEW_SCHEMA_REPLAY_MANIFEST_V1.md` §7 (following the same non-destructive addendum convention used for the Sprint 165B-2 correction), rather than silently rewriting the earlier sprint's record.

**Why this matters for isolation:** had the Preview replay followed the old (wrong) "no triggers" belief, `updated_at` would silently fail to auto-maintain on the new Preview project for these four tables — a real, if minor, behavioral divergence from Production that could have gone unnoticed until some future admin or test relied on it.

### 2.3 — Deliverable produced to close this gap

`docs/sql/SPRINT_165C_AS_BUILT_SCHEMA_NOT_EXECUTED_V1.sql` — a new, single, authoritative "as-built" schema+RLS+trigger+function file, generated directly from this session's live introspection (not from replaying the historical `docs/sql/` trail), exactly as the manifest's §0 recommended for "a future sprint." Clearly marked `NOT EXECUTED` throughout. Includes all four `CREATE TRIGGER` statements omitted from every prior planning document. This is now the file Adam would review and run in Stage D.1.3 of the manual runbook, superseding the "provisional safe order" cross-check in the manifest's §6 (which remains useful only as a secondary cross-check, per the manifest's own framing).

**Schema replay completeness: was incomplete (missing triggers) before this phase; now complete and re-verified against zero-drift live introspection.**

---

## 3. Browser read-only audit (Stage D) — result

Performed via Claude in Chrome. No destructive or state-changing action was taken — no Create/New Project, Run SQL, Save, Add Variable, Edit, Rotate, Delete, Redeploy, Reveal, or Copy-to-clipboard was clicked.

### 3.1 — Vercel (`alertownik-mvp` → Settings → Environment Variables)

Exactly **5** project variables exist, total, across every environment:

| Variable | Scope |
|---|---|
| `SCHEDULED_CHECKS_ENABLED` | Production only |
| `CRON_SECRET` | Production only |
| `NEXT_PUBLIC_SUPABASE_URL` | **Production and Preview** (shared — confirms Sprint 164C's finding still holds, unchanged) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Production and Preview |
| `ANTHROPIC_API_KEY` | Production and Preview |

No `SCHEDULED_WRITES_ENABLED`, no `SUPABASE_SCHEDULED_WRITER_EMAIL`/`_PASSWORD`, no `SUPABASE_ENVIRONMENT_TAG`, no `SUPABASE_EXPECTED_PROJECT_REF` exist anywhere — confirming the guard still blocks every environment today, as documented. No orphaned branch-scoped variables were visible in this listing (the 13 found in Sprint 164C's cleanup were on stale branches and are not shown in the project-wide default view; not re-audited this session since out of this phase's scope).

No values were opened, revealed, or copied at any point.

### 3.2 — Supabase (project dashboard, after Adam signed in manually)

- Confirmed single project, ref `puhcjyffosgohbmxrczb`, name `alertownik-mvp` — the same project Vercel's shared `NEXT_PUBLIC_SUPABASE_URL` points at for both Production and Preview.
- **Region:** West Europe (London).
- **Plan:** the General settings page's "Custom domains are a Pro Plan add-on / Upgrade to Pro" prompt indicates the current plan is **Free tier**. (Billing → Subscription page did not finish rendering during this session and was not force-reloaded further — this is the one incomplete item in this audit, non-blocking; Adam can confirm the exact plan name directly when convenient.)
- **Organization:** single org, single member (`ak.jurkowski@gmail.com`, Owner) — no other collaborators to consider for access scoping.
- No SQL was run in the SQL editor (several pre-existing private saved queries were visible in the sidebar from prior sessions — not opened, not run).

**Incident note:** during sign-in, one screenshot briefly displayed the account password in plaintext (the browser's own show-password toggle had been left on by the user's typing flow, not by any Claude action). The value was not recorded, repeated, or stored anywhere in this conversation, in memory, or in any file, and is not reproduced here. No action is needed from Adam as a result of this beyond awareness; flagging per this project's transparency norms.

---

## 4. Schema replay completeness — final assessment

| Area | Status |
|---|---|
| Tables (8) | Complete — all columns/constraints captured in the as-built file |
| RLS policies (23 across 8 tables) | Complete — every live policy reproduced verbatim |
| Indexes (17, incl. 1 partial unique) | Complete |
| Triggers (4) | **Now complete** — the Sprint 165A/165B gap (§2.2 above) is closed |
| Functions (2) | Complete — `set_updated_at` (wired via triggers) and `rls_auto_enable` (parity-only, not wired to an event trigger by the as-built file — a judgment call left to Adam, documented inline) |
| Extensions | No action needed — `pgcrypto`/`plpgsql`/`uuid-ossp`/`pg_stat_statements`/`supabase_vault` are standard defaults on any new Supabase project |
| Auth accounts (test admin, test scheduled-writer) | Not created — per Adam-only manual step, unchanged from the existing runbook |
| Synthetic seed data | Already prepared (Sprint 165B), re-reviewed this session, no changes needed — still accurate against the zero-drift schema |

**Recommended region and plan for the new Preview project:**
- **Region:** West Europe (London) — matching Production, to avoid introducing cross-region latency as a confound when comparing Preview/Production behavior, and because the app's target users (Polish residents) are best served from the same region Production already uses.
- **Plan:** Free tier is sufficient to start — this is a low-traffic, synthetic-data-only Preview environment with no compute/storage demands beyond the existing Production's own (modest) footprint. Adam should confirm current Free-tier usage against Supabase's project-count/pause-after-inactivity limits before committing, since Free-tier projects auto-pause after a period of inactivity — relevant for a Preview project that may sit idle between test sessions.

---

## 5. Required variables (names only — no values)

| Variable | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Preview only (new value) | New project's own URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Preview only (new value) | New project's own anon key |
| `SUPABASE_SCHEDULED_WRITER_EMAIL` | Preview only | New test scheduled-writer account email |
| `SUPABASE_SCHEDULED_WRITER_PASSWORD` | Preview only | New test scheduled-writer account password |
| `CRON_SECRET` | Preview only (new value, never equal to Production's) | Bearer auth for cron routes |
| `SUPABASE_ENVIRONMENT_TAG` | Preview only, value `preview` | Guard signal 2 |
| `SUPABASE_EXPECTED_PROJECT_REF` | Preview only, value = new project's ref | Guard signal 4 — **easy to forget**, guard blocks with `expected_project_ref_not_configured` without it |

No Production-scoped variable needs to change. `SCHEDULED_CHECKS_ENABLED`/`SCHEDULED_WRITES_ENABLED` are explicitly **not** part of this list — those stay unset on Preview until a separate, later, explicitly-scoped activation decision.

---

## 6. Project creation plan (step by step, not performed)

1. [Adam] Supabase dashboard → New Project → name clearly distinct from `alertownik-mvp` (e.g. `alertownik-preview`) → region **West Europe (London)** → plan **Free** (or Adam's preference).
2. [Adam] Copy the new project's URL + anon/publishable key from Settings → API (never service_role).
3. [Claude in Chrome] Visually confirm, by project name/ref only, that the new project is distinct from `puhcjyffosgohbmxrczb`.
4. [Adam] Open the new project's SQL editor, run `docs/sql/SPRINT_165C_AS_BUILT_SCHEMA_NOT_EXECUTED_V1.sql` (§4 of this doc), statement block by statement block.
5. [Claude Code, read-only] Re-run the same introspection queries against the new project (once Adam confirms MCP is pointed at it) and diff line-by-line against this session's Production snapshot. **STOP if any unexpected difference.**
6. [Adam] Create the two Supabase Auth accounts (test admin, test scheduled-writer) directly in the dashboard; insert the matching `admin_profiles`/`automation_identities` rows via SQL.
7. [Claude Code, read-only] Verify exactly one row of each exists, ids match what Adam reports, no email/password ever displayed back.
8. [Adam] Run the existing synthetic seed file (`SPRINT_165B_ISOLATED_PREVIEW_SYNTHETIC_SEED_NOT_EXECUTED_V1.sql`), unchanged, still accurate.
9. [Claude in Chrome] Add the 7 Preview-scoped Vercel variables from §5 (names only; Adam pastes every value).
10. [Claude in Chrome] Trigger a normal Preview deployment (branch push), confirm the `EnvironmentBadge` reads `PREVIEW`.
11. Prove isolation both directions (§12 of the existing runbook) before ever treating the new environment as ready.

This is unchanged in substance from the existing `SPRINT_165C_MANUAL_DEPLOYMENT_RUNBOOK_V1.md` — this phase's contribution is closing the schema-completeness gap (§2.2–2.3) and reconfirming every assumption still holds against a live, zero-drift re-check.

---

## 7. Rollback

Unchanged from the existing runbook §13: because the new project is entirely separate, rollback never touches Production — remove the Preview-scoped Vercel variables (or leave them; every code path already fails closed on an unconfigured/mismatched pairing) and/or delete the new Supabase project. No Production row, policy, credential, or deployment is ever affected.

---

## 8. Cost

Not independently observable this session — the Supabase Billing/Subscription page did not finish rendering (see §3.2). The General settings page's plan-upsell prompt indicates the org is currently on Supabase's Free tier. A new Preview project would either consume a second slot under the same Free-tier allowance (if the org's plan permits multiple Free projects) or require a paid add-on — this distinction was not resolved this session and is one of the items requiring Adam's manual decision below.

---

## 9. Points requiring Adam's manual decision

1. Go/no-go to actually create the new Supabase project (cost/plan implications not fully resolved — see §8).
2. Confirm current org's exact plan name (Billing page didn't finish loading this session).
3. The new project's name, region (recommended: West Europe/London), and plan (recommended: Free, pending #1/#2).
4. Generating and entering every secret value (`CRON_SECRET`, scheduled-writer password, project URL/key) directly into Vercel/Supabase — never through Claude.
5. Creating both Supabase Auth accounts and their membership rows.
6. Running the as-built schema file and the synthetic seed file.
7. Whether local `.env.local` should also move to the new Preview project (open tradeoff, unresolved since Sprint 165A).
8. The later, separate go/no-go for ever setting `SCHEDULED_CHECKS_ENABLED`/`SCHEDULED_WRITES_ENABLED` on Preview.

---

## 10. Isolation progress (approximate)

| Component | Status |
|---|---|
| Architecture design | ✅ 100% (Sprint 165A) |
| Code (badge, guard, route wiring, tests) | ✅ 100% (Sprint 165B/165B-2) |
| Schema/RLS/trigger replay readiness | ✅ 100% as of this phase (was ~90% — missing triggers — now closed) |
| Synthetic seed data | ✅ 100% (Sprint 165B, re-verified accurate this phase) |
| Live re-verification against current Production (no drift) | ✅ 100% (this phase) |
| Actual infrastructure (new project, accounts, Vercel vars) | ❌ 0% — not started, gated on Adam's go-ahead |

**Overall: preparation is complete and re-verified. Nothing about execution has changed — the new project still does not exist.**

---

## 11. Tests (Stage E)

- `npm run check` (typecheck + lint + build): **passed, zero errors.**
- `git diff --check`: **clean.**
- `npm run test:e2e`: **679 passed, 1 failed.** The one failure, `themeSystem.spec.ts` → "clicking Jasny overrides a dark system preference," is the same pre-existing, already-confirmed flake documented in Sprint 165B-2 (unrelated to theme code, not touched by this phase) — no file this phase changed is implicated.
- `npm run test:pwa`: **17 passed, 0 failed.**

---

## 12. Verdict

**SPRINT 165C PREPARATION READY — MANUAL GATE 1**

No Supabase project was created. No SQL was executed. No Vercel variable was changed. Sprint 166 was not started. Waiting for Adam's explicit, literal go-ahead before any infrastructure-creating action.
