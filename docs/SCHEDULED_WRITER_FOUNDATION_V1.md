# Scheduled Writer Foundation v1

**Sprint 147.** Implements the application code for a scheduled writer —
building on the RLS design applied and verified live in Sprint 146
(`docs/SCHEDULED_WRITER_RLS_DEPLOYMENT_RESULT_V1.md`).

**Status: code exists, is default-disabled at three independent layers,
and cannot write to the database in any environment today.** No
technical Supabase Auth account exists, no credentials exist, and no
row exists in `public.automation_identities` — so even a misconfigured
deployment cannot make this code succeed at writing anything.

---

## D. Architecture

### The route

```
GET /api/cron/write-candidates
```

Route file: `src/app/api/cron/write-candidates/route.ts`
Logic: `src/lib/scheduledWriter.ts`

A **separate** route from the Sprint 142 dry-run endpoint
(`/api/cron/check-sources`, completely unchanged by this sprint).

### Why a separate route, not a write-mode flag on the existing dry-run route

The brief's suggested shape (`check-sources` → dry-run by default →
optional write mode when every gate is enabled) was considered and
rejected in favor of two routes. Reasoning: the dry-run endpoint's
entire safety story rests on a single, simple, statically-checkable
fact — *this route can never write, because it imports nothing that
could* (enforced by its own static-import test since Sprint 142).
Folding a conditional write path into that same file means that
guarantee would no longer hold by inspection alone for every future
reader — someone auditing `check-sources` in isolation would now also
have to reason about the write branch's gating logic to conclude it's
safe. Two routes means each keeps its simplest possible safety argument:
`check-sources` never writes, full stop; `write-candidates` writes only
if three independent gates all hold. The cost is one more file; the
benefit is that neither route's safety argument depends on correctly
reasoning about the other's.

### Data flow (once every gate is someday satisfied)

```
GET /api/cron/write-candidates
  → CRON_SECRET authentication (shared with the dry-run route's auth helper)
  → two kill switches (SCHEDULED_CHECKS_ENABLED + SCHEDULED_WRITES_ENABLED)
  → technical-writer sign-in (SUPABASE_SCHEDULED_WRITER_EMAIL/PASSWORD)
  → server-controlled source allowlist (unchanged, no arbitrary URL)
  → fetch + parse (unchanged, reused from Sprint 138/139/142)
  → three-way dedup classification (new / duplicate / ambiguous)
  → insert non-duplicate ("new") proposals as pending candidates
  → log a source_checks row
  → safe summary response (counts only, published: false)
```

---

## E. Fail-closed gates

Three independent, all-required gates — see `src/lib/scheduledWriter.ts`'s
file header for the full reasoning behind each:

1. **`SCHEDULED_CHECKS_ENABLED = "true"`** — the existing Sprint 142
   switch, reused as a first gate (shared with the dry-run route).
2. **`SCHEDULED_WRITES_ENABLED = "true"`** — a new, separate write-mode
   switch. Enabling dry-run checks never implicitly enables writes, and
   vice versa.
3. **`SUPABASE_SCHEDULED_WRITER_EMAIL` / `SUPABASE_SCHEDULED_WRITER_PASSWORD`**
   — read only server-side; if either is missing, the route returns
   `503` before attempting anything (the response never reveals *which*
   half is missing). If both are set, the route attempts
   `signInWithPassword()` against a fresh, non-persisted Supabase client
   (anon/publishable key only, `persistSession: false`,
   `autoRefreshToken: false`) — if no such account exists (true today),
   this fails and the route returns the same generic `503` before
   fetching a single source page, without distinguishing "credentials
   missing" from "sign-in failed" in a way useful to an attacker probing
   the endpoint.

Even if all three were somehow satisfied, the Sprint 146 RLS design
grants nothing to a session whose `auth.uid()` isn't a row in
`public.automation_identities` — which has zero rows. **RLS remains the
actual database enforcement boundary** regardless of what this
application code does or doesn't check; even a bug in every layer above
would still be stopped at the database.

**None of `SCHEDULED_WRITES_ENABLED`, `SUPABASE_SCHEDULED_WRITER_EMAIL`,
`SUPABASE_SCHEDULED_WRITER_PASSWORD` has a value anywhere as part of
Sprint 147. No `.env.local` or Vercel configuration was touched.**

---

## F. Writer operations

A narrow interface, not a generic Supabase wrapper:

```ts
export interface ScheduledSourceWriter {
  findExistingCandidateTexts(sourceKey: string, registrySourceId: string | null): Promise<string[]>;
  insertPendingCandidate(payload): Promise<
    { ok: true } | { ok: false; reason: "duplicate_prevented_by_database" | "unknown_error" }
  >;
  insertSourceCheck(payload): Promise<{ ok: boolean }>;
}
```

**Sprint 149 update:** `findExistingCandidateTexts` also takes the
registry `source_id`, so the dedup comparison pool includes rows an
admin saved manually via "Zapisz jako kandydata" for the same source
(those never set `source_key`, so the original `source_key`-only query
missed them) — no RLS/schema change, since the writer's existing SELECT
policy already grants read access to every row, not just its own.

**Sprint 150A update (proposal — migration NOT applied):**
`insertPendingCandidate`'s result now distinguishes a Postgres
unique-constraint conflict (code `23505`, checked by code not by message
text) from any other insert failure — the future signal that the
proposed partial unique index (`docs/sql/PROPOSED_SPRINT_150_RACE_
CONDITION_MIGRATION_V1.sql`) caught a genuine concurrent-invocation race
loss. `buildPendingCandidateInsert` computes a `content_fingerprint`
(SHA-256 of the SAME `normalizeForCompare` the fuzzy classifier already
uses, now exported from `candidateWarnings.ts`) but only includes it in
the insert payload when `SCHEDULED_WRITER_FINGERPRINT_ENABLED=true` —
defaults off, so this code is safe to ship to any environment today
without the migration existing yet (the column doesn't exist on the live
table until Adam runs it). Schema-first, flag-second — never the
reverse; see `docs/SPRINT_150_RACE_CONDITION_DEPLOYMENT_RUNBOOK_V1.md`.

Exactly three operations exist, matching the three the scheduled
writer's live RLS policies actually allow. No update, no delete, no
arbitrary table access, no raw query execution, no alert access, no
draft/Builder access, no candidate-approval access — none of those have
a method here to call, structurally, not just by policy.

**Every sensitive candidate column is structurally impossible to set to
anything else**, not merely validated: `buildPendingCandidateInsert()`
takes no parameter for `status`, `verification_status`,
`confidence_score`, `risk_level`, `verification_notes`, `checked_at`,
`duplicate_of_alert_id`, `converted_alert_id`, or `ai_draft_json` — there
is no argument through which a caller (including a future bug) could
pass a different value. `buildAutomatedSourceCheckInsert()` restricts
`result` to `'no_changes' | 'found_notice'` at the type level and forces
`related_alert_id` null, `created_by = auth.uid()`.

### A real constraint found and documented, not papered over

`source_checks.source_id` is `NOT NULL`, but the writer has zero access
(not even `SELECT`) to `alert_sources` — it cannot resolve a source's
registry UUID via a database query. Resolved with a small,
human-maintained env-var JSON mapping
(`SCHEDULED_WRITER_SOURCE_REGISTRY_IDS`), not a database read. Until
configured, check-logging for a source is skipped gracefully; candidate
creation is unaffected (its `source_id` is nullable).

### Source scope for a future first write test

The server-controlled allowlist (unchanged — `SAFE_CHECK_SOURCE_IDS`,
no arbitrary URL possible) still contains both safe sources. For a
**future** first live-write test (not performed now, not approved now):
**Gmina Michałowice — komunikaty** is the intended first target
(lowest-risk, per its `risk: low` checklist entry). **WKD remains
dry-run capable but must not be included in that first write test**
unless separately approved later — as of Sprint 148 this is enforced
in code (see F¹ below), not left as an operational note only.

---

## F¹. First-live-write safety caps (Sprint 148)

Added during Sprint 148's Phase 1 audit, which found that Sprint 147's
code, while default-disabled at three independent layers, did **not**
by itself guarantee a small, single-source first write once those gates
were someday satisfied: `writeCandidatesForSource()` had no upper bound
on candidates inserted per call, and the route's source list came from
`resolveCronSources()` unfiltered — a bare call with no `?sourceKey=`
would have resolved **both** safe sources, including WKD. Both gaps are
closed with two new, server-side-only, env-controlled mechanisms —
neither is settable by the caller/query string:

1. **`getMaxCandidatesPerInvocation()`** — reads
   `SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN`; defaults to **`1`** if
   unset or invalid. `writeCandidatesForSource()` stops inserting once
   this many `new`-classified candidates have been inserted in that
   call; every further `new` candidate in the same run is counted in a
   new `cappedSkipped` field (visible in the response) instead of being
   inserted or silently dropped.
2. **`getAllowedWriteSourceIds()`** — reads
   `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS` as a JSON array of source ids,
   filtered through the existing `SAFE_CHECK_SOURCE_IDS` allowlist;
   defaults to **`["michalowice-komunikaty"]`** (Michałowice only) if
   unset, invalid, or the filtered result is empty. The route applies
   this as a filter on top of `resolveCronSources()`'s result — so even
   a bare call with no `?sourceKey=` can never include WKD unless an
   operator deliberately widens this env var later.

Both defaults mean: with no new env var configured at all, a first live
invocation (once the three Sprint 147 gates are also satisfied) can
insert **at most one** candidate, for **Gmina Michałowice — komunikaty**
only. Covered by dedicated tests in `tests/e2e/scheduledWriter.spec.ts`
(cap/allowlist unit behavior) and
`tests/e2e/scheduledWriterRoute.spec.ts` (route-level source filtering,
including the "bare call excludes WKD" case).

---

## G. Deduplication behavior and limitations

The current schema has **no guaranteed unique fingerprint** for a
notice — no content hash, no unique index on source+title. This is a
known, pre-existing limitation
(`docs/SCHEDULED_WRITER_AUTHORIZATION_AUDIT_V1.md` §7), not fixed by
this module, and **this document does not claim perfect idempotency.**

`classifyCandidateAgainstExisting()` reuses the exact word-overlap
heuristic (`textSimilarity`, `src/lib/candidateWarnings.ts`) the
existing browser flow already relies on, but with **two thresholds
instead of one**, producing three outcomes instead of a binary
skip/insert:

| Score range | Classification | Behavior |
|---|---|---|
| `>= 0.9` (`DUPLICATE_CONFIDENCE_THRESHOLD`) | `duplicate` | Skipped silently — genuinely the same notice already known. |
| `0.6`–`0.9` (`AMBIGUOUS_SIMILARITY_THRESHOLD` up to the confidence threshold) | `ambiguous` | **Not inserted** — but also not silently discarded: counted and reported distinctly in the run's response (`ambiguousCandidates`), so a human or a future run gets the chance to resolve it. |
| `< 0.6` | `new` | Inserted as a `pending` candidate. |

This does not guarantee no duplicates will ever be inserted (a source
rephrasing its own listing slightly between runs could still score below
the confident-duplicate threshold), and does not guarantee no genuinely
new notice is ever classified as ambiguous. It guarantees the module
never *silently* resolves an uncertain case either way — an ambiguous
result is always visible in the response, never quietly inserted, never
quietly dropped without a trace.

---

## H. Server-only and credential safety

`src/lib/scheduledWriter.ts` is server-only by Next.js's module
boundary: no Client Component in this repository imports it, and Next.js
never bundles a module into the client build unless a Client Component
imports it. This is the same pattern this project already uses for its
other server-only secret (`ANTHROPIC_API_KEY`, read only inside
`src/app/api/ai/draft-alert/route.ts`) — not the `server-only` npm
package, which is not a dependency of this project and was not added
(adding a package requires explicit confirmation per this project's
standing rule; the guarantee it would provide is one Next.js's existing
module boundary already provides here, so the addition would have no
marginal safety benefit for this specific case). Enforced by test, not
just convention:
`tests/e2e/scheduledWriterRoute.spec.ts`'s server-only-boundary suite
walks every `.ts(x)`/`.js(x)` file in `src/`, finds every file starting
with `"use client"`, and asserts none of them references
`scheduledWriter` or the writer credential env var names.

Credential handling:
- No technical-account password is ever returned or logged — the sign-in
  function reads `data.user.id` from the Supabase Auth response and
  discards everything else; `data.session.access_token`/`refresh_token`
  are never read at all, let alone logged or returned.
- No auth access token is ever returned or logged.
- No refresh token is persisted anywhere — `persistSession: false`,
  `autoRefreshToken: false` on the ephemeral client construction.
- No session is written to browser storage (there is no browser
  involved at all — this runs entirely server-side, per invocation).
- No `service_role` key, no Supabase secret/privileged key, anywhere in
  this module or route.

---

## I. What this sprint deliberately does NOT do

- No technical Supabase Auth account created.
- No real credentials generated or stored anywhere.
- No value set for `SCHEDULED_WRITES_ENABLED`,
  `SUPABASE_SCHEDULED_WRITER_EMAIL`, `SUPABASE_SCHEDULED_WRITER_PASSWORD`,
  or `SCHEDULED_WRITER_SOURCE_REGISTRY_IDS` in any environment.
- No row added to `public.automation_identities`.
- No Vercel environment variable changed. No `.env.local` change.
- No cron trigger, `vercel.json`, or scheduler activation.
- No SQL executed against the live database.
- No change to `alerts`, `admin_profiles`, or `alert_sources`.
- No autopublish path — this route's only possible writes are `pending`
  candidates and check-history rows, exactly as designed and verified in
  Sprint 146. No import of any alert-publishing, Builder/draft, or
  candidate-approval helper exists anywhere in this route or module
  (enforced by a static-import test).

## Next activation gate (Sprint 148)

Not approved, not scheduled. Would require, each separately: creating
the technical Supabase Auth account (manual, dashboard-only), adding it
to `public.automation_identities` (manual SQL, reviewed), generating real
credentials (never entering this repository), adding them to Vercel as
environment variables, configuring `SCHEDULED_WRITER_SOURCE_REGISTRY_IDS`,
and finally setting `SCHEDULED_WRITES_ENABLED=true`. The two Sprint 148
caps (`SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN`,
`SCHEDULED_WRITER_ALLOWED_SOURCE_IDS`) are safe to leave unset for a
first test — their defaults already enforce "at most one candidate, for
Michałowice only" without any further configuration. Cron activation and
autopublish remain distinct, later, unapproved decisions on top of all
of the above.
