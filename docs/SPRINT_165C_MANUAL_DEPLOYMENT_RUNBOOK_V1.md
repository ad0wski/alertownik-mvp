# Sprint 165C — Isolated Preview Manual Deployment Runbook v1 (planning only)

**Status:** this runbook was written during Sprint 165B, describing work for a **future, not-yet-started** sprint. Nothing in this document has been executed. It exists so that when Sprint 165C actually begins, every step, actor, and STOP point is already decided and reviewable, rather than improvised.

Prerequisite reading: `docs/SPRINT_165A_ISOLATED_PREVIEW_ENVIRONMENT_DESIGN_V1.md` (architecture), `docs/sql/SPRINT_165B_ISOLATED_PREVIEW_SCHEMA_REPLAY_MANIFEST_V1.md` (schema plan), `docs/sql/SPRINT_165B_ISOLATED_PREVIEW_SYNTHETIC_SEED_NOT_EXECUTED_V1.sql` (seed plan), `docs/SPRINT_165B_ISOLATED_PREVIEW_CODE_SAFETY_PACKAGE_V1.md` (code already in place: environment badge, `SUPABASE_ENVIRONMENT_TAG` guard).

---

## Actor legend

- **[Claude Code]** — local repo work: reading files, writing SQL/docs, running `npm run check`/tests. No dashboard access.
- **[Claude in Chrome]** — browser automation against Vercel/Supabase dashboards, under the same rules as every prior sprint in this project (never clicks Reveal/Copy/Rotate/Edit on a secret; never types a secret value; asks before any destructive or write action).
- **[Adam — manual]** — steps only a human can or should do: generating secret values, clicking a final "Create Project" confirmation, deciding cost/plan tradeoffs.

---

## 1. What Claude Code will do

1. Re-run the exact read-only introspection queries from Sprint 165A §B against the *current* Production database (schema may have drifted since Sprint 165A) and diff the result against that document — confirming the schema-replay manifest's assumptions still hold before ansyone runs a single CREATE statement.
2. If the diff reveals drift, update `docs/sql/SPRINT_165B_ISOLATED_PREVIEW_SCHEMA_REPLAY_MANIFEST_V1.md` accordingly — this is a documentation update, not a live-database change.
3. Author the single, authoritative "as-built" schema+RLS SQL file the manifest's §0 recommends, generated directly from the fresh introspection output, for Adam's line-by-line review — written to a new file, never executed by Claude.
4. After Adam confirms the new Supabase project's connection details are set in a *local-only* scratch location Claude never reads (see §3, item 2), verify (read-only, via the Supabase MCP tool, exactly as used throughout Sprints 164C/165A) that the new project's schema/RLS/indexes match the as-built file, once Adam has applied it himself.

## 2. What Claude in Chrome will do (only after each STOP point in §14 is cleared)

1. Navigate to Vercel's Environment Variables settings for `alertownik-mvp` and add the new Preview-scoped variables (§8) — names only entered by Claude; values pasted in by Adam directly into the browser field, never typed or read back by Claude (same pattern already used successfully in the Sprint 148/150 cleanups, inverted: adding instead of deleting).
2. Confirm (names/scope only, never values) that the new variables show the correct Preview scope and that no Production-scoped row was touched — same inspection method as every prior Vercel session in this project.
3. Trigger a Preview deployment the normal way (a branch push), never via a manual "Redeploy" click on an unrelated existing deployment.
4. Once deployed, navigate to the Preview URL, confirm the environment badge (§C of the code-safety package) reads `PREVIEW`.

## 3. What Adam must manually approve or perform (Claude cannot do these)

1. The go/no-go decision to create a new Supabase project at all (cost/plan implications on Adam's own Supabase account).
2. Actually clicking "New Project" in the Supabase dashboard and choosing the project's region/plan.
3. Generating the new project's values: its own auto-generated URL and anon key (Supabase generates these; Adam copies them into Vercel's fields himself), a fresh, random `CRON_SECRET`, a fresh, strong password for the test scheduled-writer account, and the value `preview` for the new `SUPABASE_ENVIRONMENT_TAG` variable on the Preview scope.
4. Creating the two new Supabase Auth accounts (test admin, test scheduled-writer) directly in the new project's Authentication tab — new email addresses invented for this purpose, never reused from Production.
5. Running the as-built schema/RLS SQL file (from §1 above) in the new project's SQL editor himself, reviewing each statement as he goes.
6. Inserting the `admin_profiles` and `automation_identities` membership rows for the two new test accounts — a one-line `insert` each, run by Adam, referencing the `auth.users` id Supabase shows him after account creation.
7. Running the synthetic seed file (`SPRINT_165B_ISOLATED_PREVIEW_SYNTHETIC_SEED_NOT_EXECUTED_V1.sql`) in the new project's SQL editor.
8. The final decision on whether local `.env.local` should also move to point at the new Preview project, or keep pointing at Production for local development — an open tradeoff Sprint 165A deliberately left unresolved.
9. The separate, later go/no-go for ever setting `SCHEDULED_CHECKS_ENABLED`/`SCHEDULED_WRITES_ENABLED` to `true` on the new Preview environment — out of scope for Sprint 165C entirely, a later sprint's decision.

---

## 4. How to create the separate Supabase Preview project

1. [Adam] Log into the Supabase dashboard, click "New Project."
2. [Adam] Choose an organization/plan and a project name that clearly signals its purpose, e.g. `alertownik-preview` — never a name resembling the Production project's name closely enough to invite confusion.
3. [Adam] Wait for provisioning to complete, then copy the project's URL and anon/publishable key from Settings → API — **never** the service_role key, which this application has never used and never will.
4. [Claude in Chrome, once Adam confirms the project exists] Visually confirm (project name/id only, never opening any key) that this is a distinct project from Production's, by comparing project names/ids side by side in the Supabase dashboard's project switcher.

## 5. How to safely run the schema replay

1. [Adam] Open the new project's SQL editor.
2. [Adam] Paste and run the as-built schema/RLS file from §1, statement block by statement block if preferred, reviewing output after each block.
3. [Claude Code, read-only, after Adam confirms completion] Run the same `list_tables`/`pg_policies`/`pg_indexes`/`pg_proc` introspection queries against the new project (via the Supabase MCP tool, pointed at the new project only after Adam has added it or swapped MCP configuration — a local, non-secret-exposing config step) and diff against the as-built file's intent.
4. STOP here (see §14) if the diff shows any unexpected difference — do not proceed to account creation until resolved.

## 6. How to create the test admin account

1. [Adam] In the new project's Authentication → Users tab, click "Add user," enter a fresh, invented email (e.g. `preview-test-admin@example.invalid`) and a fresh, strong, randomly generated password.
2. [Adam] Copy the resulting `auth.users` id.
3. [Adam] In the SQL editor, run `insert into admin_profiles (user_id) values ('<that id>');`.
4. [Claude Code, read-only] Verify, via the MCP tool, that exactly one `admin_profiles` row exists and it matches the id Adam reports — never displaying the email or password back.

## 7. How to create the separate scheduled-writer account

1. [Adam] Same account-creation flow as §6, a **different** fresh email (e.g. `preview-test-writer@example.invalid`) and a **different** fresh, strong password — never reused from the test admin account, never from any real Production credential.
2. [Adam] In the SQL editor, run `insert into automation_identities (user_id) values ('<that id>');` — **never** also inserting this id into `admin_profiles`, preserving the existing project rule that these are two structurally separate roles.
3. [Claude Code, read-only] Verify exactly one `automation_identities` row exists, matching the id Adam reports, and that it is a *different* id from the test admin's.

## 8. How to configure only the Preview scope in Vercel

1. [Claude in Chrome] Navigate to Vercel → `alertownik-mvp` → Settings → Environment Variables.
2. [Claude in Chrome] Add each of the following as a **new row**, scope set to **Preview only** (all Preview branches — not a specific branch name, avoiding the exact branch-scoped-orphan pattern cleaned up in Sprints 148/150): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SCHEDULED_WRITER_EMAIL`, `SUPABASE_SCHEDULED_WRITER_PASSWORD`, `CRON_SECRET`, `SUPABASE_ENVIRONMENT_TAG` (value: `preview`), `SUPABASE_EXPECTED_PROJECT_REF` (value: the new Preview project's own project ref — the same value Adam already has from creating the project in §4, never something Claude derives or is told).
3. [Adam] Pastes every value directly into Vercel's own input field — Claude never sees, types, or relays any of these values.
4. [Claude in Chrome, names/scope only] Confirm the new rows show scope "Preview" (not "Production," not "Production and Preview") and that the existing Production-scoped rows for the same variable names are unchanged in count and scope.
5. **Do not forget `SUPABASE_EXPECTED_PROJECT_REF`.** Sprint 165B-2 added this as a fourth, independent signal the guard requires (`src/lib/databaseEnvironmentGuard.ts`) — without it, `checkDatabaseEnvironmentGuard()` blocks with `expected_project_ref_not_configured` even once `SUPABASE_ENVIRONMENT_TAG` and every kill switch are correctly set.

## 9. How to guarantee Production is never touched

- Every step in §8 is additive (new rows), never an edit of an existing Production-scoped row — the same discipline already proven in the Sprint 148/150 cleanups, applied in reverse.
- Before touching anything, re-confirm (names/scope only) that Production's `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` still show their pre-existing values unchanged — a before/after row-count and scope check, not a value comparison (values are never opened).
- No step in this runbook ever clicks "Redeploy" on any existing deployment, and no step ever modifies `vercel.json`.

## 10. How to run the synthetic seed

1. [Adam] Open the new project's SQL editor, paste `SPRINT_165B_ISOLATED_PREVIEW_SYNTHETIC_SEED_NOT_EXECUTED_V1.sql`, run it.
2. [Claude Code, read-only] Verify row counts on each affected table match the file's expected inserts (7 alerts, 3 sources, etc.) via the MCP tool.

## 11. How to check the badge and the guard

1. [Claude in Chrome] Load the new Preview deployment's `/login` and sign in as the test admin (Adam provides the password directly into the browser field — never told to Claude).
2. [Claude in Chrome] Confirm the `EnvironmentBadge` reads `PREVIEW` on `/admin` and at least one other admin page.
3. [Claude Code, read-only via a temporary diagnostic call Adam runs, not automated] Confirm `checkDatabaseEnvironmentGuard()` now returns `{ ok: true }` in the Preview environment (VERCEL_ENV=preview, SUPABASE_ENVIRONMENT_TAG=preview) — this does not itself trigger a write, since `SCHEDULED_CHECKS_ENABLED`/`SCHEDULED_WRITES_ENABLED` remain unset.

## 12. How to prove isolation in both directions

1. Insert one more synthetic candidate via the Preview test admin's Builder session; immediately after, run a read-only query against **Production** confirming its `source_notice_candidates` row count and every row's `updated_at` are unchanged.
2. Immediately after any real (or simulated, off-hours) Production admin action, run a read-only query against the **Preview** project confirming it has no matching new row.
3. Attempt to use the Preview test admin's session token against a request targeting the **Production** Supabase URL and confirm Supabase Auth rejects it (different Auth user pool entirely).
4. Repeat step 3 for the Preview test scheduled-writer account.

## 13. How to roll back

Because the Preview project is entirely separate, rollback never touches Production:

1. In Vercel, remove the Preview-scoped variables added in §8 (or simply leave them — every current code path already treats an unconfigured/misconfigured pairing as fail-closed, per the guard in `databaseEnvironmentGuard.ts`).
2. Optionally, delete the new Supabase project entirely from the Supabase dashboard — a single Adam-only action, irreversible for that project, but by construction incapable of affecting Production (different project id, different everything).
3. No Production row, policy, credential, or deployment is ever touched by either rollback step.

## 14. STOP points

- **Before creating the project** — Adam has not yet explicitly said "yes, create it" in-session.
- **Before running any SQL** — the fresh-introspection diff (§5 step 3/4) has not been confirmed clean.
- **Before creating any Auth account** — the schema/RLS verification (§5) has not passed.
- **Before touching any secret** — a value has been asked of Claude to generate, view, or relay, rather than Adam entering it directly.
- **Before any Vercel env change** — the exact scope (Preview-only, not Production, not "Production and Preview") is not unambiguous in the UI.
- **Before the first write attempt of any kind** — the badge does not read `PREVIEW`, or `checkDatabaseEnvironmentGuard()` does not return `{ ok: true }`, in the new environment.

If any STOP point is reached, halt immediately, report exactly which step and what the UI/output showed, and wait for Adam's explicit resolution before continuing — the same convention already used successfully in every prior sprint's release/cleanup gates.
