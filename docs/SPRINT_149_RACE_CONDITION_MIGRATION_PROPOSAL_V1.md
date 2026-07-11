# Sprint 149 — Race Condition Migration Proposal v1 (NOT APPLIED)

**Status: PROPOSAL ONLY. No SQL in this document has been run. No
schema, RLS, or migration change has been made as part of Sprint 149.**
This file exists so the known, honestly-documented gap below can be
closed later, with Adam's explicit approval, in a dedicated sprint — not
now.

---

## The gap, stated precisely

`writeCandidatesForSource()` (`src/lib/scheduledWriter.ts`) follows this
sequence for every invocation:

1. `SELECT` existing candidate texts for the source (`findExistingCandidateTexts`).
2. In application memory, classify each newly-fetched proposal as
   `new` / `duplicate` / `ambiguous` against that snapshot.
3. `INSERT` any proposal classified `new` (up to the per-invocation cap).

There is **no unique constraint** on `source_notice_candidates` covering
source + content (confirmed against the live schema — see
`docs/supabase_source_notice_candidates.sql` /
`docs/sprint132_candidate_persistence_schema_proposal.sql`: only a plain
btree index on `source_key`, nothing enforcing uniqueness), **no
`SELECT ... FOR UPDATE`**, **no advisory lock**, and **no transaction**
wrapping steps 1–3 together.

**Concrete failure scenario:** two overlapping invocations of
`GET /api/cron/write-candidates?sourceKey=michalowice-komunikaty` (e.g. a
manual test running at the same moment a future cron tick fires, or any
retry/double-click of a manual trigger) each independently:
- run step 1 before the other's step 3 has committed, so neither sees the
  other's about-to-be-inserted row,
- classify the same genuinely-new notice as `new` (correctly, given what
  each one can see),
- each insert their own copy.

Result: **two candidate rows for the same notice.** Each invocation's own
`maxCandidatesToInsert` cap (default 1) does not help — the cap limits
insertions *within* one invocation, not *across* invocations. This is a
true TOCTOU (time-of-check-to-time-of-use) race, not a hypothetical one.

**This is not currently mitigated, and Sprint 149 does not claim
otherwise.** Sprint 149's idempotency hardening (widening the comparison
pool to include admin-saved candidates via `source_id`) reduces a
*different* gap — a blind spot in what one invocation compares against —
and does nothing for the concurrent-invocation case above.

---

## Why this wasn't fixed in Sprint 149

Every option that would close it completely requires exactly the kind of
change Sprint 149 was explicitly told not to make:

| Option | Why it closes the gap | Why it's out of scope now |
|---|---|---|
| Unique index on `(source_key, <content fingerprint>)` | DB rejects the second insert outright, race-proof | Needs a new deterministic fingerprint column (e.g. a hash) — schema change |
| `SELECT ... FOR UPDATE` / advisory lock (`pg_advisory_xact_lock`) keyed by source | Serializes concurrent invocations for the same source | Needs a Postgres function or RPC the writer's narrow RLS role doesn't have today — schema/RLS change |
| A `source_key` + `detected_at` (or content hash) unique constraint enforced via `ON CONFLICT DO NOTHING` | Idempotent insert, race-proof, no read-then-write window at all | Same as above — needs a matching column to conflict on, doesn't exist yet |
| Application-level distributed lock (e.g. Redis) | Would work but adds a new dependency/service | Against "no new package/service" defaults, disproportionate for one source |

None of these can be done "within the existing schema" as Sprint 149's
brief required — closing this gap for real means a migration.

## Practical exposure today (why this is low-urgency, not ignorable)

- The only way to trigger overlap right now is a **manual** double-call
  (no cron exists — confirmed: no `vercel.json`, no scheduled trigger
  anywhere in this repo).
- Overlap requires the same secret (`CRON_SECRET`) and the same
  `SCHEDULED_WRITES_ENABLED=true` window, both server-side and manually
  operated by Adam — the realistic trigger is an accidental double-click
  or a retried `curl`/PowerShell call, not an attacker.
- The worst outcome is a **duplicate `pending` candidate**, never a
  duplicate *alert* (publishing still requires a human, unconditionally,
  regardless of this gap) — an admin reviewing the queue would see two
  near-identical pending cards and simply reject one.

This exposure profile is exactly why it's reasonable to leave it
documented-but-unfixed until Adam decides to activate a real schedule —
at which point concurrent/overlapping invocations become a genuine
possibility (two ticks close together, a retry overlapping a scheduled
run) rather than an operator mistake, and closing this gap should be a
**prerequisite for schedule activation**, not a nice-to-have after.

---

## Recommended fix (for future, separate approval)

**Smallest option that fully closes the gap:** add a nullable
`content_fingerprint text` column to `source_notice_candidates`
(deterministic hash of the normalized text, using the exact same
normalization already live in `src/lib/candidateWarnings.ts`
`normalizeForCompare`), plus a **partial unique index**:

```sql
-- ILLUSTRATIVE ONLY — NOT FOR EXECUTION IN THIS SPRINT.
alter table public.source_notice_candidates
  add column content_fingerprint text;

create unique index concurrently
  source_notice_candidates_source_fingerprint_uniq
  on public.source_notice_candidates (source_key, content_fingerprint)
  where source_key is not null and content_fingerprint is not null;
```

Then the writer's insert becomes `.upsert(..., { onConflict:
"source_key,content_fingerprint", ignoreDuplicates: true })` (or a plain
insert wrapped to swallow the specific unique-violation error code) —
race-proof at the database level, no advisory lock needed, no RPC
needed, and the partial index (`where source_key is not null`) means it
never constrains admin-manual candidate rows (which never set
`source_key`), so existing behavior for that path is untouched.

This is a genuine schema change and requires its own SQL file, its own
RLS review (confirming the existing `WITH CHECK` on the scheduled-writer
INSERT policy still holds unchanged — it does, since this only adds a
column and an index, never touches the policy's boolean conditions), and
Adam's explicit approval — **not requested or assumed here.**

## What this proposal is NOT asking for right now

- No SQL in this file should be run.
- No column, index, or constraint has been added.
- No RLS policy has been touched.
- This is a plan to review later, ideally right before (or as part of)
  the decision to activate a first real Vercel Cron schedule — see
  `docs/SPRINT_149_FIRST_SCHEDULE_READINESS_V1.md`, which lists closing
  this gap as a recommended (not yet mandatory-blocking) precondition.
