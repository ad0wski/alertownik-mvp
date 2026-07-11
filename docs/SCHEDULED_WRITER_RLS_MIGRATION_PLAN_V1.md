# Scheduled Writer RLS Migration Plan v1

**Sprint 144 — Live RLS Verification & Least-Privilege Migration Plan v1.**

**Status: verification and migration-planning only. No RLS, schema,
credential, or database change was made in this sprint.** This document
is the canonical technical migration plan; the Obsidian note "Scheduled
Writer RLS Migration Plan v1" is the short decision-level summary.

Builds on `docs/SCHEDULED_WRITER_AUTHORIZATION_AUDIT_V1.md` (Sprint 143 —
authorization matrix, options A–D, dedup audit) and corrects/sharpens its
central recommendation with PostgreSQL's actual policy-combination
semantics, which Sprint 143 did not fully state.

---

## 1. The correction this sprint makes

Sprint 143 recommended adding new, narrow policies for a future technical
account "alongside" the existing broad ones. **That framing is
incomplete in a way that matters.** PostgreSQL RLS policies are
**PERMISSIVE by default**, and when more than one applicable PERMISSIVE
policy exists for a given role/command, Postgres grants access if **any**
of them evaluates true — they combine with **OR**, not AND.

**Concretely:** if `source_notice_candidates` keeps its existing
`with check (auth.role() = 'authenticated')` INSERT policy, and a new
policy is added beside it —
`with check ((auth.jwt() -> 'app_metadata' ->> 'app_role') = 'scheduled_writer')`
— **the new policy adds a second way in; it removes none of the first
policy's access.** Every authenticated user can still insert, exactly as
before. Adding narrow permissive policies next to broad ones achieves
**nothing** for restriction — only for *addition*. This must be designed
around explicitly, not discovered after the fact.

There are exactly two ways to actually restrict access given this:
1. **Replace** the broad permissive policy itself with the narrow
   condition (Strategy A, §4).
2. **Add a RESTRICTIVE policy** (`as restrictive` in `CREATE POLICY`) —
   RESTRICTIVE policies combine with **AND** across all applicable
   restrictive policies, and the final result is
   `(any permissive policy true) AND (every restrictive policy true)`.
   A correctly-written restrictive policy genuinely narrows what the
   existing broad permissive policy allows, without touching or
   removing it (Strategy B, §4).

Both are evaluated below. **Naively adding another permissive policy is
not among them — it was implicitly what Sprint 143's phrasing risked
implying, and this document exists partly to close that gap before any
SQL is written.**

---

## 2. Verified repository state

Unchanged since Sprint 143 — restated here for a self-contained record:

| Table | Committed policy | Effective access (per §1's OR rule) |
|---|---|---|
| `alert_sources` | `auth.role() = 'authenticated'` on SELECT/INSERT/UPDATE/DELETE (one policy per command, `docs/supabase_sources_schema.sql`) | Any authenticated session, full CRUD |
| `source_checks` | Same pattern (`docs/supabase_source_checks.sql`) | Any authenticated session, full CRUD |
| `source_notice_candidates` | Same pattern, v2 schema (`docs/sprint132_candidate_persistence_schema_proposal.sql`) | Any authenticated session, full CRUD |
| `alerts` | **Only the public `status = 'published'` SELECT policy is committed** (`docs/supabase/schema-draft.sql`); the admin-write equivalent is a commented-out example in that same file, never uncommitted in any version | **Unknown** — see §3 |

No `GRANT`/`REVOKE` statement exists in any committed SQL file — every
table relies entirely on Supabase's default project-level grants to the
`anon`/`authenticated` Postgres roles plus RLS as the actual restriction
layer. This was assumed in Sprint 143; this sprint's inspection artifact
(§3) includes an explicit `information_schema.role_table_grants` query to
confirm it rather than leave it assumed.

No `app_metadata`, `auth.jwt()`, custom claim, roles table, or Auth Hook
exists anywhere in this codebase or in any committed SQL — confirmed by
a fresh grep this sprint. Sprint 144 designs the first such system; none
exists to inventory.

---

## 3. Live-state verification — status: NOT PERFORMED, tool unavailable

**A safe, read-only, already-authorized mechanism to inspect the live
Supabase project was checked for and does not exist in this session:**
no MCP tool resolved for any Supabase-related query, no `.mcp.json`
granted a Supabase connection, and no `supabase` CLI is on `PATH`. Per
this sprint's explicit instructions, this is stated plainly rather than
worked around — **no credential was requested, none was created, and no
guess is offered in place of verification.**

**Artifact prepared instead:** `docs/sql/INSPECT_LIVE_RLS_READ_ONLY.sql`
— five `SELECT`-only queries against `pg_policies`,
`information_schema.role_table_grants`, `pg_class` (RLS enabled/forced
flags), `information_schema.columns` + `pg_constraint`, and `auth.users`
(id/email/`app_metadata` only — no credential material). Clearly labeled
`READ ONLY — NO DATABASE MODIFICATION`, **not executed** as part of this
sprint. Adam can run it in the Supabase SQL Editor at his convenience;
it is safe to run any number of times and changes nothing.

### Exactly what remains unknown until that artifact is run

1. The precise `USING`/`WITH CHECK` text of whatever policy(ies) grant
   admin write access to `alerts` in production (repository evidence
   proves one exists; its exact shape does not).
2. Whether `alert_sources`, `source_checks`, and `source_notice_candidates`
   live policies exactly match the committed SQL, or whether any
   additional policy was ever added directly in the dashboard without a
   corresponding committed file (the same gap discovered for `alerts`
   could, in principle, exist elsewhere too — unlikely given the other
   three tables' Sprint Log entries all record "ran this exact file,"
   but not literally re-confirmed this sprint).
3. Whether RLS is actually `ENABLED`/`FORCED` on all four tables live
   (every committed file includes `alter table ... enable row level
   security`, so this is expected, not verified this sprint).
4. Whether any existing Auth user already carries an `app_metadata` role
   claim (expected: no, since nothing in the app reads one today — but
   not literally confirmed).
5. The current admin account's exact `auth.users.id` (needed later, for
   the admin-preservation sequence in §6 — not required for this
   sprint's planning, only for a future implementation sprint's first
   step).

**None of these unknowns change this document's recommendation** — the
recommended design (§4, §5) is intentionally conservative regardless of
exactly what `alerts`' live policy says, since the scheduled writer is
given **zero** access to `alerts` under every option evaluated.

---

## 4. Migration strategy comparison

### Strategy A — Replace broad policies with explicit, operation-specific ones

Drop each existing `auth.role() = 'authenticated'` policy per table/
command; create new policies whose condition directly encodes the
intended role check (e.g., `(auth.jwt() -> 'app_metadata' ->> 'app_role') = 'admin'`
for full admin CRUD, a separate narrower policy for
`scheduled_writer`'s single allowed INSERT shape per table).

- **Clarity:** Highest — reading the policy list for a table tells you
  exactly who can do what; no mental OR/AND composition required.
- **Least privilege:** Fully achieved — there is no leftover broad grant
  to reason about or accidentally rely on.
- **Migration risk:** Real but manageable — every `DROP POLICY` +
  `CREATE POLICY` pair for a table should run inside one transaction
  (`BEGIN ... COMMIT`), so a failure partway through rolls back to the
  exact prior state automatically, never leaving a table with neither
  the old nor the new policy.
- **Rollback:** Straightforward — the original `CREATE POLICY` statements
  already exist, verbatim, in the currently-committed SQL files
  (`docs/supabase_sources_schema.sql`, `docs/supabase_source_checks.sql`,
  `docs/sprint132_candidate_persistence_schema_proposal.sql`); restoring
  prior behavior is re-running those exact files (all already written
  with `drop policy if exists` guards, so they're safely idempotent).
- **Impact on current admin:** The critical risk in this strategy — if
  the admin's session doesn't carry the new required claim *before* the
  switch happens, the admin is locked out the instant the old policy is
  dropped. This is why §6 sequences claim assignment and session refresh
  strictly *before* policy replacement, with an explicit verification
  step in between.
- **Future multi-admin support:** Excellent — every future admin account
  needs only the same `app_role = 'admin'` claim; no policy edit is
  needed to add or remove an admin.

### Strategy B — Keep existing permissive policies, add a RESTRICTIVE policy

Leave every existing `auth.role() = 'authenticated'` policy untouched;
add one new policy per table, declared `as restrictive`, whose condition
requires a recognized role claim (e.g.,
`(auth.jwt() -> 'app_metadata' ->> 'app_role') in ('admin', 'scheduled_writer')`).
Combined effect: `(existing permissive: any authenticated) AND (new
restrictive: has a recognized role)` — genuinely narrower than today,
without rewriting the original policies.

- **Policy combination behavior:** Requires the added policy be
  `RESTRICTIVE`, not `PERMISSIVE` — this is the one detail that makes or
  breaks this strategy; a mistake here (declaring it permissive by habit,
  since `CREATE POLICY` defaults to permissive if `AS RESTRICTIVE` is
  omitted) would silently accomplish nothing, per §1.
- **Risk of accidental access:** Non-trivial — because the "real" access
  logic is now split across two policies whose interaction has to be
  understood together, a future change to either one (e.g., someone adds
  yet another permissive policy for an unrelated feature, unaware a
  restrictive policy elsewhere assumed only the original permissive
  policy existed) is easier to get subtly wrong than under Strategy A's
  single-policy-per-role model.
- **Requirement for applicable permissive policies:** A restrictive
  policy alone grants nothing — if the underlying permissive policy set
  were ever removed without removing the restrictive one too, every
  request would be denied (fails closed, at least, which is the safer
  failure direction — but still a maintenance trap).
- **Debugging complexity:** Higher than Strategy A — "why can't X do Y"
  requires checking both layers, not one.
- **Long-term maintainability:** Weaker than Strategy A for exactly the
  reasons above; every table permanently carries two policies per
  command whose combination must be understood together, indefinitely.

### Recommendation: Strategy A as the final state; Strategy B as an optional, low-risk rehearsal step

**Primary: Strategy A.** Best long-term clarity, genuine least privilege
with no leftover broad grant, and the best multi-admin story. The
migration-risk concern (admin lockout) is fully addressed by sequencing
(§6), not by choosing a different strategy.

**Optional interim step, not a permanent alternative:** because Strategy
B's rollback is a single `DROP POLICY` (removing only the newly-added
restrictive policy, instantly reverting to the exact pre-migration broad
state with zero risk to the original policies), it can safely be used as
a **rehearsal**: add the restrictive policy first, verify the admin's
claim and session work correctly against it in practice, and *then*
proceed to Strategy A's cleaner replacement once confidence is high. This
is a sequencing choice for whoever implements Sprint (future), not a
competing permanent design — the end state this document recommends is
Strategy A either way.

---

## 5. Authorization-source evaluation

### 5.1 `auth.jwt() -> 'app_metadata'` role claim — recommended

- A Supabase Auth user's `app_metadata` is settable **only** via the
  Admin API or dashboard — never by the authenticated user themselves via
  the normal client SDK. This is precisely why it's safe to use for
  authorization and `user_metadata` is not: `user_metadata` **is**
  editable by the account holder via `supabase.auth.updateUser()`, so a
  policy trusting it would let any authenticated user grant themselves
  any role by editing their own profile. **`user_metadata` must never be
  used for authorization, full stop.**
- `app_metadata` is embedded in the JWT at token issuance (sign-in, or a
  refresh-token exchange) — no Auth Hook is required for it to appear in
  `auth.jwt()`; this is Supabase's default behavior.
- **JWT staleness — role changes require a session/token refresh:**
  changing a user's `app_metadata` does **not** retroactively update a
  JWT that browser already holds and cached. The change takes effect the
  next time that session's token is reissued — either an explicit
  sign-out/sign-in, or supabase-js's automatic background refresh
  (refresh tokens are exchanged for a new access token periodically,
  well before the current one expires; the newly-issued token always
  reflects current `app_metadata` at that moment, since Supabase reads it
  fresh from `auth.users` at every issuance, never from a stale cache).
  For the **admin**, this matters — see §6's explicit refresh step. For
  the **scheduled writer**, it does not matter at all: per Sprint
  141/142's design, it calls `signInWithPassword()` fresh on every single
  invocation (no persisted session), so every JWT it ever holds is
  brand-new and automatically reflects whatever `app_metadata` is current
  at that moment.
- **Assignment**: a one-time Admin API/dashboard action per account —
  admin's account gets `{"app_role": "admin"}`, the future technical
  account gets `{"app_role": "scheduled_writer"}`.
- **Revocation**: clear or change the claim via the same mechanism —
  takes effect on that account's next token refresh, same staleness
  caveat as above (a forced sign-out is the deterministic way to make a
  revocation take effect immediately for a human session; the writer's
  stateless sign-in-per-run means revocation is effectively immediate for
  it — its very next invocation simply won't get the old role anymore).
- **Rotation**: rotating the account's *password* does not affect its
  `app_metadata` at all — the two are independent; rotating one never
  requires touching the other.

### 5.2 `auth.uid()`-based policies

Functionally equivalent security to 5.1 for exactly one admin + one
writer (hardcode each UUID directly into the relevant policy
conditions). Simpler to reason about for a fixed, small set of accounts;
**does not scale** to multiple admins without repeating a growing OR-list
of UUIDs inside every policy, and adding/removing an account requires an
actual policy edit (a migration) rather than an `app_metadata` update.
Given "future multi-admin support" is an explicit evaluation criterion
and this project's own `BACKEND_DECISION.md` already anticipated growing
past a single admin eventually, 5.1 is preferred — but 5.2 remains a
perfectly valid, slightly simpler fallback if Adam prefers to avoid
touching `app_metadata` machinery for now.

### 5.3 A small authorization/roles table

A `public.app_roles(user_id uuid, role text)` table, joined via a
subquery inside each policy (`exists (select 1 from app_roles where
user_id = auth.uid() and role = 'admin')`). **Genuine advantage over
5.1**: role changes take effect immediately on the very next request —
no JWT/refresh staleness at all, since the policy queries the table live
every time. **Disadvantages that make it more than this project needs
right now**: it's a new table (schema surface), it adds a subquery to
every single RLS check on every covered table (minor but nonzero
overhead), and it creates its own bootstrapping question — the table
itself needs RLS policies governing who may read/write *it*, which is a
second authorization system to get right, not a simplification. **Not
recommended now**; worth revisiting if the project ever needs more than
two roles or roles that must change without any refresh delay being
acceptable.

### 5.4 Custom Access Token Auth Hook

Lets a Postgres function inject arbitrary claims into the JWT at
issuance time, computed dynamically (e.g., pulled live from a roles
table). Combines 5.1's "claim lives in the JWT" performance with 5.3's
"always current" property — at the cost of configuring and maintaining
an actual Auth Hook (a project-level Supabase setting, one more piece of
infrastructure to test and reason about). **Not recommended now** — this
is the natural escalation path *if* the project later needs many roles,
frequent reassignment, or zero tolerance for refresh-timing delay; none
of those apply to "one admin, one writer, roles that almost never
change."

### Recommendation

**`auth.jwt() -> 'app_metadata'` (5.1)**, exactly as Sprint 143 already
leaned toward — this sprint confirms it against the fuller comparison the
brief requested and finds no reason to prefer 5.2–5.4 for the current,
small scope. Revisit 5.3/5.4 only if role count or reassignment frequency
grows meaningfully.

---

## 6. Target permission matrix (unchanged from Sprint 143, restated with the corrected mechanism)

| Table | Admin (`app_role = 'admin'`) | Scheduled writer (`app_role = 'scheduled_writer'`) |
|---|---|---|
| `alert_sources` | SELECT, INSERT, UPDATE, DELETE (full CRUD, unchanged from today) | **No access of any kind** |
| `source_checks` | SELECT, INSERT, UPDATE, DELETE (unchanged) | **INSERT only.** SELECT is not required for correctness (the writer can always append a new check row regardless of history) — recommend omitting it initially; revisit only if a future "skip, already checked today" optimization is wanted. No UPDATE/DELETE — append-only log semantics, enforced at the database, not just by convention |
| `source_notice_candidates` | SELECT, INSERT, UPDATE, DELETE (unchanged) | **SELECT** (required — replicates the existing dedup heuristic against recent candidates for the source being checked) **+ INSERT only**, and the INSERT policy's `WITH CHECK` clause must itself enforce `status = 'pending'` (e.g. `with check (app_role_claim = 'scheduled_writer' and status = 'pending')`) — this is what stops a compromised writer credential from inserting a candidate with `status = 'approved'` directly, a gap Sprint 143 named but this plan is the first to close at the policy level. **No UPDATE, no DELETE** — the writer never touches a row after creating it; every status transition remains human/verifier-triggered exclusively |
| `alerts` | SELECT (all statuses, for the admin dashboard — exact live policy TBD per §3), INSERT/UPDATE/DELETE (unchanged, exact live policy TBD per §3) | **Zero access of any kind — no SELECT, no INSERT, no UPDATE, no DELETE.** This is the actual autopublish-prevention boundary and does not depend on resolving §3's `alerts` unknown |
| Draft/Builder-adjacent writes (all go through `alerts`, no separate table) | Unchanged | **No access** — implied by the `alerts` row above; stated separately because it's the operational meaning that matters ("the writer cannot create a draft") even though there's no distinct "drafts" table in this schema (a draft is just `alerts.status = 'draft'`) |
| `auth.users` / any Supabase Auth-internal table | N/A (never accessed via the app's Data API) | **No access** — the writer authenticates *as* a row in this system; it never queries it |

---

## 7. Admin preservation sequence

Ordered to guarantee the admin is never locked out, even for an instant:

1. **Verify the current admin identity.** Run §3's inspection artifact
   (`select id, email, ... from auth.users`) — confirm exactly one
   account exists (expected, per this project's documented
   single-admin-account design in `docs/BACKEND_DECISION.md`) and record
   its `id`.
2. **Assign trusted admin authorization metadata.** Via the Supabase
   dashboard or Admin API (never SQL, never scripted, never MCP), set
   that account's `app_metadata` to `{"app_role": "admin"}`.
3. **Refresh/re-authenticate the admin session.** Explicit sign-out then
   sign-in in the browser — the deterministic way to guarantee the new
   JWT carries the claim, rather than waiting for an automatic background
   refresh whose exact timing isn't worth relying on for this one-time
   cutover.
4. **Verify the admin claim before changing any policy.** Confirm the
   fresh session's JWT actually contains `app_metadata.app_role = "admin"`
   — e.g. via Supabase's own token-inspection tooling, or a temporary,
   read-only `select auth.jwt()`-style check run *as that session* — before
   touching a single policy. This is the step that catches a typo'd or
   malformed claim before it can cause a lockout.
5. **Apply role-aware policies.** Only once step 4 is confirmed: execute
   the approved migration (Strategy A, §4) inside one transaction per
   table, replacing the broad policy with the explicit `app_role`-checked
   ones.
6. **Test admin SELECT/INSERT/UPDATE/DELETE immediately.** In the same
   sitting: view sources, add/edit a source, log a check result,
   view/approve a candidate, save a Builder draft, publish — one exercise
   of every operation the live app actually depends on, before the
   session ends.
7. **Rollback, if step 6 reveals anything broken.** Re-run the original,
   already-committed `CREATE POLICY` files
   (`docs/supabase_sources_schema.sql`, `docs/supabase_source_checks.sql`,
   `docs/sprint132_candidate_persistence_schema_proposal.sql`, plus
   whatever the live `alerts` policy turns out to be per §3) — they are
   already idempotent (`drop policy if exists` + `create policy`), so
   re-running them restores the exact prior state with no new file
   needed.
8. **No extended broad-access window.** Because metadata assignment
   (step 2) and session refresh (step 3) both happen *before* policy
   replacement (step 5), and step 5 is atomic per table, there is no
   period where some authenticated sessions have broad access and others
   don't — the only two accounts that will ever exist at that point (the
   one admin, and — once created in a later, separately-approved sprint —
   one scheduled writer) both already carry their correct claim before
   the switch, so nothing is ever left in an ambiguous state.

---

## 8. Scheduled-writer onboarding sequence (design only — not executed)

1. Create a dedicated technical Supabase Auth account (dashboard, manual,
   a future, separately-approved sprint — never scripted, never via MCP).
2. Assign `app_metadata` = `{"app_role": "scheduled_writer"}` via the
   same Admin API/dashboard mechanism as the admin.
3. Generate a strong, unique password **outside this repository** (e.g. a
   password manager, or `openssl rand -base64 32` run in a terminal, its
   output never pasted into any file Claude Code or this session can
   read) — never typed into chat, never committed, never logged.
4. Store the credentials only in Vercel's server-only environment
   variables (never `NEXT_PUBLIC_`-prefixed) — a distinct, later,
   explicitly-approved action (approval gate item 6/7, §10).
5. Never expose them to client code — enforced the same way this
   codebase already enforces it for `ANTHROPIC_API_KEY`: read only inside
   a route handler, never imported by a client component.
6. Sign in server-side: the writer route calls
   `supabase.auth.signInWithPassword()` with the anon key + these
   credentials, fresh, on every invocation — no persisted session, same
   stateless pattern the Sprint 142 dry-run endpoint already established.
7. Verify the resulting JWT's role metadata — a one-time manual check
   (not an automated production check) confirming the session actually
   carries `app_metadata.app_role = "scheduled_writer"` before any real
   write path depends on it.
8. Test allowed operations explicitly: SELECT on
   `source_notice_candidates` (dedup read), INSERT on
   `source_notice_candidates` (with `status = 'pending'`), INSERT on
   `source_checks`.
9. Test forbidden operations explicitly, confirming each is **denied by
   the database**, not merely "the app doesn't call it": UPDATE a
   candidate, DELETE a candidate, INSERT/UPDATE/DELETE on `alerts`, any
   draft-equivalent write, any publish-equivalent write. Each attempt
   should come back as a Postgres/PostgREST permission error.
10. Revoke/delete any test data created during steps 8–9 safely,
    manually, by Adam — consistent with this project's standing rule that
    no modifying SQL runs automatically or via any automated tool.

**None of the above was performed in Sprint 144.**

---

## 9. Rollback and failure planning

| Failure scenario | Rollback / mitigation |
|---|---|
| Admin loses access after policy replacement | Re-run the original, already-committed `CREATE POLICY` files (idempotent) — restores prior broad-access state immediately |
| The technical writer's policy proves broader than intended (e.g. an authoring mistake grants it something extra) | If using Strategy B's rehearsal step: `DROP` the one added restrictive policy — instant, zero-risk revert. If already on Strategy A's final state: `DROP` the specific over-broad policy and re-`CREATE` it correctly, or temporarily re-apply the original broad policy as an emergency stopgap while the fix is prepared |
| Need to stop all scheduled activity instantly, for any reason | `SCHEDULED_CHECKS_ENABLED` remains unset/false — unaffected by anything in this document, still the fastest disable, faster than any RLS change |
| Technical account itself needs to be shut off | Disable or delete the Supabase Auth user in the dashboard — every policy keyed to its `auth.uid()` or `app_metadata` claim denies instantly, no migration needed |
| Password needs rotating (suspected leak or routine hygiene) | Change the account's password in Supabase Auth + update the one corresponding Vercel environment variable — no SQL involved, independent of the RLS layer |
| `app_role` claim needs removing without deleting the account | Clear/change the claim via dashboard/Admin API — same instant effect as revocation for that specific permission, account itself stays intact for later re-enabling |
| `CRON_SECRET` needs rotating | Regenerate the value, update the one Vercel environment variable — entirely independent of the database/RLS layer; this secret only gates the HTTP endpoint |
| Need to fully undo the entire migration | Re-run every original committed policy file, in any order (each is independently idempotent) — no combined "undo everything" script needs to be pre-built, since the originals already are one |

---

## 10. Test matrix

| Actor | Table | Operation | Expected result |
|---|---|---|---|
| Admin (`app_role = 'admin'`) | `alert_sources`, `source_checks`, `source_notice_candidates` | SELECT/INSERT/UPDATE/DELETE | Allowed (unchanged from today) |
| Admin | `alerts` | SELECT (all statuses)/INSERT/UPDATE/DELETE | Allowed (unchanged from today — exact policy TBD per §3, but the *outcome* must not change) |
| Scheduled writer | `source_notice_candidates` | SELECT | Allowed |
| Scheduled writer | `source_notice_candidates` | INSERT with `status = 'pending'` | Allowed |
| Scheduled writer | `source_notice_candidates` | INSERT with any other `status` | **Denied** |
| Scheduled writer | `source_notice_candidates` | UPDATE (any row, any column) | **Denied** |
| Scheduled writer | `source_notice_candidates` | DELETE | **Denied** |
| Scheduled writer | `source_checks` | INSERT | Allowed |
| Scheduled writer | `source_checks` | SELECT/UPDATE/DELETE | **Denied** (SELECT deliberately omitted per §6's minimal grant) |
| Scheduled writer | `alert_sources` | SELECT/INSERT/UPDATE/DELETE | **Denied** (no access granted at all) |
| Scheduled writer | `alerts` | SELECT/INSERT/UPDATE/DELETE | **Denied**, unconditionally |
| Anonymous (public) | `alerts` | SELECT `status = 'published'` | Allowed (unchanged) |
| Anonymous (public) | every other table/operation | anything | **Denied** (unchanged) |
| Any authenticated session with no recognized `app_role` claim | any table, any write | anything | **Denied** — this is the actual proof the migration worked; today this same session would succeed |

---

## 11. Approval gate — explicit, separate items

Cron activation is deliberately **not** included below — it remains a
distinct, later approval, per this sprint's own instructions.

1. Applying RLS/policy changes (the Strategy A replacement in §4/§6).
2. Replacing/restricting the current broad `auth.role() = 'authenticated'`
   policies specifically (a sub-decision of item 1, called out separately
   since it's the change with the highest admin-lockout risk).
3. Assigning the admin account its `app_role = 'admin'` authorization
   metadata (§7, step 2).
4. Creating a technical Supabase Auth account (§8, step 1).
5. Assigning that account's `app_role = 'scheduled_writer'` authorization
   metadata (§8, step 2).
6. Creating the server-only environment credentials for that account
   (§8, steps 3–4).
7. Adding those credentials to Vercel's environment variables (§8,
   step 4, the Vercel-specific part).
8. Enabling server-side database writes in the writer route (i.e.
   Sprint 145's implementation work — building on this plan).

**Cron activation (`SCHEDULED_CHECKS_ENABLED=true`, wiring an actual
scheduler) is a separate, later approval, not bundled with any of the
above.**

**None of items 1–8 were approved or implemented in Sprint 144.**

---

## 12. Explicit confirmations

- **No RLS policy was changed, dropped, or created.**
- **No schema change or migration file was created.**
- **No SQL was executed** — `docs/sql/INSPECT_LIVE_RLS_READ_ONLY.sql`
  contains `SELECT` statements only and was not run.
- **No technical Supabase Auth account was created.**
- **No password was generated or stored.**
- **No `app_metadata` was read, set, or changed on any account.**
- **No server-side Supabase authenticated session was added** —
  `src/lib/supabaseClient.ts` is unchanged.
- **No `service_role` or other privileged Supabase credential was
  added.**
- **No environment variable value was added or changed** — `CRON_SECRET`
  and `SCHEDULED_CHECKS_ENABLED` remain unset everywhere.
- **No cron configuration exists and none was activated.**
- **No autopublish exists or is proposed at any stage of this plan.**
