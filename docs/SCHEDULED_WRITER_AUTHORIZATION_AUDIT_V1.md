# Scheduled Writer Authorization Audit v1

**Sprint 143 — RLS & Server Writer Authorization Audit / Persistence
Security Gate.**

**Status: audit and decision-preparation only. No code, schema, RLS, or
credential changes were made in this sprint.** This document is the
canonical technical reference for the authorization design a future
scheduled writer must use; the Obsidian note "Scheduled Writer
Authorization Audit v1" is the short decision-level summary.

Builds directly on `docs/SCHEDULED_CHECKS_ARCHITECTURE_V1.md` (Sprint
141, scheduler/credential-strategy comparison) and
`docs/PROTECTED_CRON_DRY_RUN_ENDPOINT_V1.md` (Sprint 142, the dry-run
endpoint that surfaced this sprint's central question: *"a technical
account solves authentication, but is it actually least-privilege?"*).

---

## 1. Why this sprint exists

Sprint 141 recommended a dedicated Supabase Auth **technical account**
over `service_role`, reasoning that it avoids a key that bypasses RLS
entirely. Sprint 142's documentation flagged the unresolved gap plainly:
*a technical account only solves who is calling — it says nothing about
what that caller is allowed to do.* This sprint answers that question with
actual repository evidence instead of assumption, before any credential or
account is created.

---

## 2. Evidence sources inspected

- `docs/sprint132_candidate_persistence_schema_proposal.sql` (v2
  `source_notice_candidates` — the live schema, per Sprint Log: applied by
  Adam in Sprint 133).
- `docs/supabase_source_notice_candidates.sql` (v1 — superseded, never
  applied; kept for history).
- `docs/supabase_source_checks.sql` (`source_checks`).
- `docs/supabase_sources_schema.sql` (`alert_sources`, Sprint 42 — the
  schema actually in use; supersedes the `alert_sources` table shape in
  `docs/supabase/schema-draft.sql`).
- `docs/supabase/schema-draft.sql` (Sprint 18 draft — `alerts`,
  `alert_categories`; **admin write policies for `alerts` are commented
  out in this file** — see §4).
- `docs/supabase_alerts_source_id.sql` (adds `alerts.source_id`, no RLS
  content).
- `docs/SUPABASE_SETUP_CHECKLIST.md` (documents enabling RLS and the
  public-read-published policy; does not document an `alerts` admin-write
  policy either).
- `src/lib/supabaseClient.ts`, `src/lib/supabaseCandidateWrites.ts`,
  `src/lib/supabaseSourceWrites.ts`, `src/lib/supabaseAlertWrites.ts`,
  `src/lib/getAdminSupabaseAlerts.ts`, `src/lib/getSupabaseAlerts.ts` (all
  application code that reads/writes these tables).
- `src/lib/candidateVerifier.ts`, `src/lib/candidateReviewActions.ts`,
  `src/lib/candidateWarnings.ts` (verifier + review-action + dedup logic
  — confirmed pure/client-side, no direct DB access of their own; the
  verifier's *persistence* goes through
  `supabaseCandidateWrites.saveCandidateVerification()`).
- `src/components/AuthGate.tsx` (confirms: this is a client-side
  *rendering* gate only — it hides admin UI from a logged-out browser, it
  is not and cannot be a database-level authorization boundary; RLS is the
  only real boundary).
- `src/app/api/cron/check-sources/route.ts`,
  `src/lib/cronCheckSources.ts` (Sprint 142 — confirmed zero database
  access, unchanged this sprint).
- Environment variable names referenced anywhere in `src/` (grepped by
  name only, no values read or displayed):
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `ANTHROPIC_API_KEY`, `CRON_SECRET`, `SCHEDULED_CHECKS_ENABLED`,
  `NODE_ENV`. **No `SUPABASE_SERVICE_ROLE_KEY` and no technical-account
  credential name exists anywhere in the repository.**
- Confirmed exactly **one** `createClient(...)` call in the entire
  codebase (`src/lib/supabaseClient.ts`), using the anon/publishable key —
  no second, privileged client exists.

---

## 3. Authorization matrix (repository evidence only)

| Table | Op | Current policy (as committed) | Role allowed | Any authenticated user? | Admin browser depends on it? | Future scheduled writer needs it? | Broader than necessary? | Risk if a technical-account credential holding this were compromised |
|---|---|---|---|---|---|---|---|---|
| `alert_sources` | SELECT | `using (auth.role() = 'authenticated')` | any authenticated | **Yes** | Yes (registry list, dedup source-id matching) | Optional (see §5 — can be avoided) | No, if writer only reads to resolve `source_id` | Low — reveals registry rows (names/URLs already public in the checklist code) |
| `alert_sources` | INSERT/UPDATE/DELETE | `using (auth.role() = 'authenticated')` | any authenticated | **Yes** | Yes (admin CRUD on `/admin/sources`) | **No** | **Yes** — writer has zero need to create/edit/delete sources | Medium — could silently retarget a source's URL, poisoning future checks |
| `source_checks` | SELECT | `using (auth.role() = 'authenticated')` | any authenticated | **Yes** | Yes (history panel) | Optional (§5 — "already checked today" optimization only) | No, if scoped to append-only use | Low — check-history rows aren't sensitive |
| `source_checks` | INSERT | `with check (auth.role() = 'authenticated')` | any authenticated | **Yes** | Yes (log a check result) | **Yes — core purpose** | No | Low — worst case, fabricated log rows (still visible/auditable) |
| `source_checks` | UPDATE/DELETE | `using (auth.role() = 'authenticated')` | any authenticated | **Yes** | Not currently exercised by any UI action found in the repo | **No** | **Yes** — writer should never rewrite or erase check history | Medium — a compromised writer could cover its own tracks by editing/deleting past check rows |
| `source_notice_candidates` | SELECT | `using (auth.role() = 'authenticated')` | any authenticated | **Yes** | Yes (queue reads all statuses) | **Yes** — needed to replicate the existing dedup check server-side (see §7) | No, if the writer only needs to read recent rows for its own source | Low–medium — candidate content isn't public but isn't highly sensitive either |
| `source_notice_candidates` | INSERT | `with check (auth.role() = 'authenticated')` | any authenticated | **Yes** | Yes (save-as-candidate) | **Yes — core purpose**, but only ever `status = 'pending'` | No, for insert itself; **yes** in the sense that the policy doesn't force `status = 'pending'` — nothing stops an INSERT with a different status today | Medium — a compromised writer *could* insert a candidate with `status = 'approved'` or worse directly, since the DB itself doesn't enforce "inserts must be pending" — only application code does |
| `source_notice_candidates` | UPDATE | `using (auth.role() = 'authenticated')` | any authenticated | **Yes** | Yes (status transitions, verifier persistence) | **No** — the writer only ever inserts; status changes are exclusively human/verifier-triggered | **Yes** | **High** — this is the actual review pipeline; a compromised writer with UPDATE could approve/reject/convert candidates, skipping human review entirely |
| `source_notice_candidates` | DELETE | `using (auth.role() = 'authenticated')` | any authenticated | **Yes** | Not currently exercised by any UI action found in the repo | **No** | **Yes** | Medium — could erase evidence of what a source actually said |
| `alerts` | SELECT (published) | `using (status = 'published')` | **anon + authenticated** (public policy, no role restriction in the `using` clause) | Yes (incidentally — this policy isn't role-gated at all) | Public homepage needs this; admin also needs all-status SELECT (see below) | **No** | N/A — this is the intended public policy | N/A — this is the deliberate public-read boundary |
| `alerts` | SELECT (all statuses, for admin) | **⚠️ Not found in any committed SQL file.** `getAdminSupabaseAlerts.ts` reads `alerts` without a status filter and this works in production, so an admin all-status SELECT policy must exist live — its exact definition is **not in the repository**. | **Unknown from repo evidence** | Presumed yes, unverified | Yes | **No** | Cannot assess — see §4 | Cannot assess — see §4 |
| `alerts` | INSERT/UPDATE/DELETE | **⚠️ Not found in any committed SQL file.** `docs/supabase/schema-draft.sql` has the equivalent admin-write policy **commented out** (`-- create policy "Admin full access to alerts"...`). `src/lib/supabaseAlertWrites.ts` performs upsert/publish/archive/delete operations that work in production, so *some* write-enabling policy exists live — its exact definition is **not in the repository**. | **Unknown from repo evidence** | Presumed yes, unverified | Yes (Builder's entire save/publish/archive flow) | **Must remain impossible — this is the hard boundary this sprint exists to protect** | Cannot assess — see §4 | Cannot assess — see §4 |

**Bottom line pattern:** every table this sprint can fully verify from
committed SQL uses the identical broad policy —
`auth.role() = 'authenticated'` grants full CRUD to *any* signed-in
session, admin or not, human or automated, with no row-level distinction
and no operation-shape distinction (e.g. nothing in the database itself
prevents an authenticated INSERT from setting a status other than
`pending`). This confirms Sprint 142's flagged concern with actual
evidence: a technical account, on its own, inherits this exact same broad
access — it is a different *identity*, not a different *privilege level*,
unless new, narrower policies are added specifically for it.

---

## 4. Unresolved: live state of `alerts` write policy cannot be confirmed from the repository

**This must be stated explicitly, not assumed:** no file in this
repository defines the RLS policy that currently allows admin
INSERT/UPDATE/DELETE (and all-status SELECT) on `alerts` in production.
The only `alerts`-related policy committed anywhere
(`docs/supabase/schema-draft.sql`) is the **public** `status = 'published'`
SELECT policy — the admin-write equivalent in that same file is left as a
commented-out example, never uncommented in any committed version. Since
`src/lib/supabaseAlertWrites.ts` and `src/lib/getAdminSupabaseAlerts.ts`
demonstrably work against the live database, an admin-write/all-status-
read policy **must** exist live — it was evidently added directly in the
Supabase dashboard at some point outside of any file this audit can read.

**What this means for this sprint's conclusions:**
- Every finding above about `alert_sources`, `source_checks`, and
  `source_notice_candidates` is based on SQL files that this project's
  own convention treats as the source of truth (each carries an explicit
  "run this file" instruction and a matching Sprint Log entry recording
  that Adam ran it) — confidence in those three tables' policies is
  **high**.
- Confidence in the *exact* current `alerts` policy is **low** — it is
  known to exist and known to work, but its precise `USING`/`WITH CHECK`
  expression cannot be verified from this repository.
- **This does not change any Sprint 143 conclusion**, because the
  recommendation is that the scheduled writer receive **zero** access to
  `alerts` under any option — the exact shape of the existing admin
  policy on `alerts` doesn't matter for that conclusion, since the writer
  should never be a party to it regardless of what it says.

### Read-only inspection artifact (NOT executed, NOT a migration)

The following query would resolve this gap authoritatively if Adam runs
it manually in the Supabase SQL Editor. It is provided here **only as a
report artifact** — it is read-only (queries the Postgres catalog view
`pg_policies`, and `information_schema` for grants), performs no writes,
and this sprint does not execute it, schedule it, or turn it into a
migration:

```sql
-- Read-only: lists every RLS policy on the four tables this audit covers.
-- Safe to run in the Supabase SQL Editor at any time — reads catalog
-- metadata only, changes nothing.
select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual        as using_expression,
  with_check  as with_check_expression
from pg_policies
where schemaname = 'public'
  and tablename in ('alerts', 'alert_sources', 'source_checks', 'source_notice_candidates')
order by tablename, cmd;

-- Read-only: confirms which Postgres roles hold table-level GRANTs
-- (RLS policies only apply on top of an underlying GRANT — Supabase's
-- default project setup grants broadly to `authenticated`/`anon`, but
-- confirming this explicitly closes the loop on the audit).
select
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('alerts', 'alert_sources', 'source_checks', 'source_notice_candidates')
order by table_name, grantee, privilege_type;
```

**Before Sprint 144 implements anything**, running these two queries and
attaching the result to that sprint's preflight is recommended — not
mandatory to *this* sprint's conclusions, but it removes the one
"presumed, not confirmed" gap in an otherwise fully-evidenced audit.

---

## 5. Minimum required permissions for the future scheduled writer

Determined by working backward from what the writer's own job actually
is (fetch → parse → dedup-check → insert pending candidate → log check)
— not from what's convenient to grant.

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `source_notice_candidates` | **Yes** — required to replicate the existing dedup heuristic (§7) against recent candidates for the source being checked | **Yes** — its core purpose, and only ever `status = 'pending'` | **No** | **No** |
| `source_checks` | Optional — not required for correctness; would only enable a "skip, already checked today" optimization. Recommend omitting initially (§9) | **Yes** — its core purpose, append-only | **No** | **No** |
| `alert_sources` | Optional — only needed to attach `source_id` to a new candidate via the existing `findMatchingRegistrySource()` logic. **Recommend omitting initially**: a candidate with `source_id = null` is already an accepted, handled case in existing code (`sourceCheck.ts`'s own comment: *"no match → null, history logging simply unavailable"*) | **No** | **No** | **No** |
| `alerts` | **No** | **No** | **No** | **No** |

**Explicit non-negotiables** (the writer must never be able to, under any
implementation option):
- Publish an alert, or change any alert's `status`.
- Create, update, or delete any row in `alerts`.
- Modify `alert_sources` (source configuration is an admin-only decision).
- Change a candidate's status after a human (or the verifier) has looked
  at it — the writer only ever creates new `pending` rows; it never
  transitions an existing one.
- Create a Builder draft, or touch anything Builder's publish action
  touches.

This is enforced by the recommended design at the RLS layer (§6), not
merely by "the application code doesn't call that function" — the
distinction matters precisely because §3 found that today's policies
don't stop an authenticated caller from doing any of this at the database
level; only convention does.

---

## 6. Evaluated authorization options

### Option A — Technical account + `auth.uid()`-scoped RLS

A dedicated Supabase Auth user is created; new, narrower RLS policies are
added (alongside or replacing the existing broad ones) that check
`auth.uid() = '<technical-account-uuid>'` for the writer's specific
operations (insert-only on the two tables in §5).

- **Least privilege:** Good — the new policies grant exactly INSERT (and
  SELECT where needed) to one specific, known identity; nothing broader.
- **RLS changes required:** Yes — new policies keyed to a hardcoded UUID.
- **Technical-user lifecycle:** One Supabase Auth user, created once via
  the dashboard (never automated/scripted — an explicit approval-gated
  action). `auth.uid()` never changes for that user's lifetime, so
  **rotating its password never requires a migration** — only the
  initial policy creation does.
- **Password/session secret handling:** One credential (email+password),
  stored only as a server environment variable, used to call
  `signInWithPassword()` fresh on each invocation — no persisted session,
  nothing to keep alive between cron runs.
- **Session refresh:** Not applicable — each invocation authenticates from
  scratch; there is no long-lived session to refresh.
- **Revocation:** Delete or disable the Supabase Auth user (or simply
  rotate its password so the stored credential stops working) — every
  policy referencing that `auth.uid()` denies instantly, with no
  additional migration needed.
- **Credential rotation:** Change the account's password in Supabase Auth
  + update the one environment variable — no SQL, no policy change.
- **Admin-browser compatibility:** Fully preserved — this option is purely
  additive; existing admin policies are untouched.
- **Implementation complexity:** Medium — one migration (new policies),
  one dashboard action (create the user), one new environment variable.

### Option B — Technical account + trusted `app_metadata` claim + `auth.jwt()`

Same technical account, but instead of hardcoding its UUID into policies,
its Supabase Auth `app_metadata` is set to something like
`{"role": "scheduled_writer"}` (an admin/service-level action — a
project's `app_metadata` is only settable via the Admin API or dashboard,
never by the user themselves, which is exactly why the rule below
excludes `user_metadata`). Policies then check
`(auth.jwt() -> 'app_metadata' ->> 'role') = 'scheduled_writer'` instead
of a specific UUID.

**`user_metadata` must never be used for authorization** — unlike
`app_metadata`, `user_metadata` is directly editable by the account
holder itself via the client SDK, so a compromised or merely
misconfigured technical-account session could grant itself a role by
editing its own `user_metadata`. This option only works with
`app_metadata`.

- **Least privilege:** Equally good as Option A — the writer still only
  gets exactly what its claim-gated policies allow.
- **Role management:** Better than A for **more than one** future
  automated identity — every future automation account just needs the
  same claim; policies don't need a new hardcoded UUID per account.
- **JWT refresh/staleness:** Not a practical concern for a stateless cron
  invocation that signs in fresh every run — the freshly-issued token
  always reflects the account's current `app_metadata`. Would matter more
  for a long-lived session, which this design deliberately avoids.
- **Auth Hook / metadata requirements:** No custom Auth Hook is required —
  `app_metadata` is included in the JWT by Supabase's default token
  issuance; it only requires the one-time admin-API/dashboard action to
  set the claim on the technical account.
- **Policy complexity:** Marginally higher to read than a bare UUID
  comparison, but scales flatly instead of linearly as more automated
  identities are added later.
- **Future scalability:** **Better than Option A** — this is the
  deciding factor between A and B, since the roadmap explicitly
  anticipates more automation (an eventual AI verifier route, possibly
  more source-check identities) that would otherwise each need their own
  UUID-keyed policy under Option A.

### Option C — Server-only `service_role` client, narrow application-layer writer module

A second Supabase client is constructed server-side with the
`service_role` key, wrapped in a deliberately narrow module that only
ever performs the two specific inserts this writer needs.

- **RLS bypass:** Total — `service_role` ignores every RLS policy on
  every table in the project, not just the two this writer touches.
- **Blast radius:** The largest of any option by a wide margin. Even a
  perfectly-written, narrowly-scoped application module around the key
  does not change what the *key itself* is capable of if it leaks through
  any other channel (a logging mistake, a dependency compromise, a
  misconfigured error handler) — the module's discipline only helps if
  the key never leaves that module, which is a much stronger assumption
  than "this policy denies it at the database."
  **Note the asymmetry with Options A/B**: under A or B, a *leaked
  session token* (short-lived, scoped to exactly the granted operations)
  is a meaningfully smaller incident than a *leaked service_role key*
  (permanent until rotated, unlimited scope) — this is the actual reason
  Sprint 141 already leaned away from this option, and this sprint's
  evidence (§3's confirmation that even the *existing* broad policies are
  narrower than `service_role`'s total bypass) reinforces rather than
  changes that conclusion.
- **Secret exposure risk:** Highest of any option — a single static key,
  not a rotatable session.
- **Rotation:** Simple mechanically (regenerate in the Supabase dashboard)
  but every minute the old key remains valid post-suspected-leak is a
  window of total database exposure, not scoped exposure.
- **Server-only module boundaries / accidental client import:** Achievable
  with discipline (this codebase already has a working precedent —
  `ANTHROPIC_API_KEY` is read only inside route handlers, never in a
  client component) — but this mitigates *accidental* exposure, not
  exposure via a compromised dependency or a bug in the route itself.
- **Operational simplicity:** Highest of any option — no new RLS, no new
  policies, no claims.
- **Verdict:** Simplicity does not outweigh blast radius here, especially
  since Options A/B achieve the same functional outcome (an automated
  process can insert two kinds of rows) at genuinely lower risk. **Not
  recommended as primary; documented only as an explicit fallback-of-
  last-resort** if A and B both prove infeasible for a reason this audit
  did not anticipate.

### Option D — Narrowly-scoped RPC / `SECURITY DEFINER` function

A Postgres function (e.g. `insert_scheduled_candidate(...)`) owned by a
role with direct table privileges, called via Supabase's RPC interface.
The function body can enforce shape/validation beyond what an RLS
boolean policy expresses (e.g., hard-code `status = 'pending'` inside the
function regardless of what's passed in, reject if a matching pending
candidate already exists for the source, validate `source_key` against
the allowlist server-side again as defense in depth).

- **Does it genuinely reduce permissions?** Only if paired with revoking
  *direct* table INSERT from the calling identity — otherwise the RPC is
  an additional, redundant path alongside direct access that's still
  possible, not a replacement for it. This means Option D is not
  standalone: it must be layered on top of Option A or B (a scoped
  identity first), then combined with revoking that identity's direct
  `INSERT` grant so the function becomes the *only* path.
- **Would direct table access also need to be removed?** Yes — see above.
- **Migration complexity:** Higher than A/B alone — a new function
  definition, a `SECURITY DEFINER` ownership decision, and a `REVOKE` on
  top of whatever `GRANT`/policy A or B already added.
- **Auditing:** Better than plain INSERT in one respect — the function's
  body is a single, readable choke point for every validation rule, easier
  to review than "trust the RLS policy plus trust the client app."
- **Idempotency:** Could be improved *inside* the function (e.g. an
  `ON CONFLICT DO NOTHING` against a future deterministic fingerprint
  column, see §7) — but this benefit depends on schema support that
  doesn't exist yet, not on the RPC wrapper itself.
- **Misuse risk:** Low, given the narrow signature — but only if the
  function's own input validation is kept in sync with the app's
  allowlist as sources are added, which is one more place that logic has
  to be duplicated/kept correct.
- **Verdict:** A genuinely stronger design, but not justified **yet** for
  a writer doing exactly two simple, already-narrow inserts. Recommended
  as a **future hardening candidate** (naturally fits Sprint 147's
  hardening scope) once real operational experience shows what additional
  server-side validation would actually help — not something to build
  speculatively now.

---

## 7. Deduplication and idempotency audit

**Finding: deduplication today is advisory only, and entirely
client-side.** `findSimilarText()` (`src/lib/candidateWarnings.ts`) is a
word-overlap heuristic (`textSimilarity()`, threshold `0.6`) — not exact
matching, not a hash, not a database constraint. It runs in the admin's
browser, at the moment of saving a candidate
(`SourceCard.saveAsCandidate()` in `src/app/admin/sources/page.tsx`),
against `existingCandidateTexts`/`alertTitles` the browser already has
loaded — and even then, a match only triggers a `confirm()` dialog asking
the admin whether to save anyway. **Nothing in the schema prevents two
near-identical (or even byte-identical) candidate rows from existing.**
There is no unique index, no content-hash column, and no
`(source_id, normalized_title)` uniqueness constraint anywhere in
`docs/sprint132_candidate_persistence_schema_proposal.sql`.

**What the scheduled writer would need to replicate even this
approximate protection:** a `SELECT` on `source_notice_candidates`
(§5 — already identified as required), scoped to recent rows for the
source currently being checked, run through the same `findSimilarText()`
heuristic before every insert.

**Whether reliable automatic idempotency can be guaranteed with the
current schema: no — stated plainly, not worked around.** The heuristic
is fuzzy by design (word-overlap over a threshold), so a source
rephrasing its own listing slightly between two scheduled runs could
produce a "different enough" text that skips past the threshold and
inserts a genuine duplicate. This is a real, known limitation, not a
theoretical one — the same heuristic already ships today for the
manual/browser flow and is understood there as "flags obvious
resemblance, not precise enough to auto-merge or auto-discard" (its own
code comment).

**Options for later, not implemented, not schema-changed this sprint:**
1. **Add a deterministic fingerprint column** (e.g.
   `content_fingerprint` = a stable hash of `source_key` + normalized
   title, or + a truncated normalized excerpt) with a unique index —
   this **is a schema change**, explicitly out of scope for this sprint,
   and would need its own approval gate, likely proposed alongside
   Sprint 145's real-write implementation.
2. **Tighten the existing heuristic** (raise the similarity threshold,
   narrow the comparison window to "same source, last N days") as a
   schema-free partial mitigation — reduces but does not eliminate the
   risk.
3. **Prefer over-inclusion to silent loss**: if a borderline case can't be
   confidently deduplicated, insert it as `pending` anyway rather than
   silently skipping a possibly-real notice — an occasional duplicate a
   human dismisses in the queue in a few seconds is a far smaller cost
   than a missed notice. This sprint recommends this posture as the
   working default for Sprint 145, without implementing it.

**This sprint does not implement any workaround** — no dedup logic was
added to any writer, because no writer exists yet.

---

## 8. Recommendation

1. **Primary: Option B** — dedicated Supabase Auth technical account,
   authorized via a trusted `app_metadata` claim checked with
   `auth.jwt()` in new, narrow RLS policies scoped to exactly the
   operations in §5.
2. **Fallback: Option A** — the same technical account, but with
   `auth.uid()`-scoped policies instead of a claim. Functionally
   equivalent security for a single writer; choose this if Adam prefers
   to avoid the one extra `app_metadata`-setting step and does not
   anticipate more automated identities soon.
3. **Why B over A:** both achieve equal least-privilege for *this*
   writer; B is the only one of the two that doesn't need a new
   hardcoded-UUID policy for every *future* automated identity — and the
   roadmap already anticipates more automation (verifier persistence,
   possibly more sources) that would otherwise each require their own
   Option-A-style policy.
4. **Why C is rejected as primary:** blast radius. `service_role` bypasses
   RLS on every table, not just the two this writer needs — a strictly
   worse failure mode than a leaked, narrowly-scoped session under A/B,
   for no operational benefit A/B don't already provide.
5. **Why D is deferred, not rejected:** it's a genuine improvement
   (validation moves server-side, single audit point) but requires a
   scoped identity (A or B) to already exist as a prerequisite, and isn't
   justified yet for two simple, already-narrow insert operations.
   Recommended as a Sprint 147 hardening candidate once real usage
   informs what additional server-side validation is actually worth
   adding.

### This recommendation explicitly requires (all gated, none done this sprint)

- A dedicated Supabase Auth **technical account** (dashboard action).
- **Environment secrets**: the account's credentials, stored server-only.
- **RLS migration**: new, narrow policies for the two tables in §5 (either
  additive alongside the existing broad ones, or — better long-term but a
  larger change — replacing the blanket
  `auth.role() = 'authenticated'` policies with per-operation, per-role
  ones; this sprint does not decide which, and recommends starting
  additive to minimize risk of breaking the existing admin browser flow).
- **No GRANT changes**: Supabase's default project setup already grants
  table-level access to the `authenticated` Postgres role; RLS policies
  are the actual restriction layer, not table GRANTs.
- **Auth `app_metadata` / custom claim**: yes, for the primary
  recommendation (Option B). Not needed for the Option A fallback.
- **RPC / `SECURITY DEFINER` function**: no, not for the initial
  implementation — deferred (§6, Option D).

### Rotation and revocation plan

- **Rotation**: change the technical account's password in Supabase Auth,
  update the one corresponding environment variable. No SQL, no policy
  change, no downtime beyond the next scheduled invocation picking up the
  new credential.
- **Revocation** (immediate): disable or delete the technical account in
  Supabase Auth — every policy referencing it (by `auth.uid()` or by its
  `app_metadata` claim) denies instantly. No migration needed to revoke.
- **Kill switch**: unchanged from Sprint 142 — `SCHEDULED_CHECKS_ENABLED`
  must literally equal `"true"` or the endpoint no-ops before even
  attempting authentication, independent of whether the writer's
  credential is otherwise valid. This remains the fastest, code-level
  disable, faster than any credential rotation.

### How admin-browser behavior stays working

Both A and B are additive by design: they introduce new, narrow policies
for the technical account's specific operations without removing or
altering the existing broad `auth.role() = 'authenticated'` policies the
admin browser already relies on for every table it currently touches.
Nothing about the human admin's session, login flow, or existing
CRUD capabilities changes.

### How public users remain unable to write

Unchanged and unaffected by this design: no policy proposed here grants
anything to the `anon` role. Public users continue to have exactly the
one existing `alerts` read-published policy and nothing else, on any
table, under any option evaluated.

### How the future cron route remains unable to publish

Enforced at two independent layers, not just one:
- **Application layer** (already true today, per Sprint 142's static
  import audit): the cron route imports no publish-capable helper at all.
- **Database layer** (new, once Sprint 144+ implements it): the
  technical account's RLS policies grant **zero** access of any kind to
  `alerts` (§5) — even if a future bug caused the route to attempt an
  `alerts` write, the database itself would reject it, independent of
  what the application code does or doesn't call.

---

## 9. Approval gate — explicit, itemized, before any implementation

Adam must approve each of the following **separately** — this is not one
combined "yes, proceed with automation" decision:

1. **Database/RLS changes**: the new, narrow policies described in §6/§8
   (which option — B primary or A fallback — and whether additive or
   replacing the existing broad policies).
2. **Technical-account creation**: creating the Supabase Auth user itself,
   a dashboard action, done manually by Adam (never scripted, never via
   MCP, per the project's standing MCP rules).
3. **Environment secrets**: the account's credentials (and, separately,
   confirming `CRON_SECRET`'s actual value — still unset from Sprint 142).
4. **Vercel environment-variable changes**: adding the above secrets to
   the Vercel project, and separately, setting
   `SCHEDULED_CHECKS_ENABLED=true` when the time comes (a distinct,
   later decision from creating the account).
5. **Server-side database writes**: implementing the actual insert code
   in a new or extended writer module (Sprint 145 scope).
6. **Future cron activation**: wiring an actual scheduler (Vercel Cron or
   the external-scheduler fallback from Sprint 141) to the route —
   explicitly a **later, separate** decision from all of the above, not
   bundled with them.

**None of these six items were approved, decided upon, or implemented in
Sprint 143.** This document exists so that when Adam does approve them,
each can be approved (or deferred) individually and knowingly.

---

## 10. Roadmap (144–147)

- **Sprint 144** — Implement the approved authorization design from §8
  (once Adam has approved gate items 1–3 above): the technical account,
  its `app_metadata` claim (or `auth.uid()` policies if the fallback is
  chosen), and the new narrow RLS policies. **No scheduler activation.
  No autopublish. No writer code yet** — this sprint proves the
  authorization design works (e.g. by having the technical account sign
  in and perform a single manual test insert/read, reviewed then
  reverted/cleaned up by Adam) before any application code depends on it.
- **Sprint 145** — Build the actual server-side writer module (fetch →
  parse → §7's dedup check → conditional insert of a `pending` candidate
  → `source_checks` log insert), invoked manually (protected endpoint,
  same auth model as Sprint 142) with an explicit dry-run/write-mode
  toggle. **Still no active schedule. Still no autopublish.**
- **Sprint 146** — First real schedule, exactly one low-risk source
  (`michalowice-komunikaty`, already flagged `risk: low` on the
  checklist). Monitoring/failure visibility, kill switch re-verified
  working. **Still no autopublish.**
- **Sprint 147** — Hardening: idempotency (revisit §7's fingerprint-
  column option if real duplicate volume warrants the schema change by
  then), timeout/retry policy tuned on real data, per-source isolation
  stress-tested, Option D (§6) reconsidered if warranted, operational
  runbook written. **Still no autopublish** — that remains its own,
  much later, narrowly-scoped decision (A7 in the Automation
  Implementation Plan).

**This is one sprint later than the 142→145 sequence Sprint 141
originally proposed** — Sprint 141's plan assumed the authorization
question would be a quick decision; Sprint 142's dry-run work and this
sprint's audit found it deserves its own dedicated implementation sprint
rather than being folded into "Sprint 143: writes" as originally
sketched. This costs one sprint, not several — mobile/PWA (originally
anchored around Sprint 150) does not need to move: the automation track
and the mobile/PWA track are independent tracks that interleave (per the
Automation Implementation Plan's own standing rule — data/beta/mobile
sprints are never displaced by automation sprints), so a one-sprint
extension here has no compounding effect on the mobile/PWA phase or on
onboarding/personalization, both of which remain planned around that
same phase, unaffected by this document.

---

## 11. Explicit confirmations

- **No automated database write exists.** No writer module, no insert
  code, no new persistence path was created.
- **No Supabase technical account was created.** No dashboard action was
  taken as part of this sprint.
- **No server-side Supabase session was added.** `src/lib/
  supabaseClient.ts` is unchanged; still exactly one anon-key client.
- **No `service_role` or other privileged Supabase credential was
  added.**
- **No environment variable value was added** — `CRON_SECRET` and
  `SCHEDULED_CHECKS_ENABLED` remain unset everywhere, exactly as after
  Sprint 142.
- **No schema, migration, or RLS change was made.** Every SQL snippet in
  this document is either a citation of an existing committed file or an
  explicitly-labeled, non-executed read-only artifact (§4).
- **No autopublish exists or is proposed at any stage of the roadmap in
  §10.**
- **No external AI was added or changed.**
