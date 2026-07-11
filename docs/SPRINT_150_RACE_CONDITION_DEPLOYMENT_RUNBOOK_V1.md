# Sprint 150A — Race Condition Deployment Runbook v1

**Status: PACKAGE PREPARED, NOT EXECUTED.** No SQL in this package has
been run against any database. No RLS has been changed. No Vercel
environment variable has been set. No cron activated. This document
exists so that, WHEN Adam approves, every step is already reviewed,
ordered, and reversible — not so that it happens automatically.

---

## 1. The problem this closes

Documented in `docs/SPRINT_149_RACE_CONDITION_MIGRATION_PROPOSAL_V1.md`:
two concurrent invocations of `GET /api/cron/write-candidates` can each
independently read the candidate table before the other's insert
commits, both classify the same genuinely-new notice as "new," and both
insert — producing a duplicate `pending` candidate. No unique
constraint, lock, or transaction currently prevents this.

## 2. Real data model audit (what actually exists, not assumed)

Confirmed against the live schema definitions in `docs/sprint132_
candidate_persistence_schema_proposal.sql` (v2, the schema actually
applied) and the RLS migration actually deployed
(`docs/sql/PROPOSED_SCHEDULED_WRITER_RLS_MIGRATION_V1.sql`):

| Column | Exists? | Usable for identity? |
|---|---|---|
| `source_id` | yes, nullable uuid | Yes, but shared across every notice from one source — not a per-notice identifier |
| `source_key` | yes, nullable text | Yes — but only ever set by the writer's own insert (`buildPendingCandidateInsert`); admin-manual candidates never set it |
| `source_url` | yes, not null text | No — the source's homepage URL, identical for every notice from that source |
| `source_item_url` | **does not exist** | N/A |
| `candidate_url` | yes, nullable text | Exists in schema but **the writer never populates it** — `CheckProposal` (`src/lib/sourceCheck.ts`) has no URL field at all; the parser doesn't currently extract per-notice permalinks |
| `title` / `excerpt` / `raw_text` | yes | Yes — the only real content signal available today |
| `raw_payload` (jsonb) | yes, nullable | Not populated by the writer today |
| `content_fingerprint` / hash | **does not exist** | Proposed by this package |
| `created_at` / `detected_at` | yes | Timing only, not identity |
| `status` | yes | Lifecycle, not identity |

**Normalization today:** `src/lib/candidateWarnings.ts`
`normalizeForCompare()` — lowercase, Polish-diacritic fold (`ą→a` …
`ż→z`), all non-alphanumeric → space, whitespace collapsed. Used
identically by the in-memory fuzzy classifier
(`classifyCandidateAgainstExisting`) both before comparison and (as of
this package) before computing the fingerprint that would eventually be
sent to the database — **one function, one definition, reused, never
reimplemented.** Not yet reused in any test-side mock inconsistently
either — the new tests import the real function.

**Existing duplicates:** unknown from the repo alone — requires a live
database read. See §4 (Duplicate Preflight) — **not yet run this
session.**

**Would a unique index on raw, unnormalized text work?** No — three
concrete reasons: (1) not robust to case/whitespace variance between two
independently-fetched copies of the same page, (2) `raw_text` has no
length cap and could exceed typical btree index row-size limits for an
unusually long notice, (3) doesn't match the ALREADY-established
definition of "duplicate" the app uses (word-overlap-based, not literal
string equality) — using literal raw text would silently diverge from
what the rest of the app already calls a duplicate.

## 3. Variant comparison

| | A: unique index on existing columns (raw) | B: app-computed fingerprint + unique index | C: SQL-side generated/expression fingerprint | D: advisory lock / RPC |
|---|---|---|---|---|
| Effectiveness vs. concurrent insert | Low — misses case/whitespace variance | **High** — exact match on the same normalization the app already trusts | High, if the two normalization implementations stay in sync | High for serialization, but doesn't by itself prevent the duplicate insert — must be paired with B anyway |
| Matches existing normalization | No | **Yes — reuses `normalizeForCompare` verbatim** | Only if a second, separately-written SQL expression is kept in sync forever | N/A |
| Impact on existing data | None (plain index) | None — new nullable column, no backfill required (partial index scoped to non-null fingerprint) | Heavier — a `GENERATED` column computes for every existing row at ALTER time | None |
| Impact on RLS | None | **None — confirmed by inspection, not assumed (see migration file header)** | None | Requires a new RPC function + grant — a real RLS/access-surface change |
| Impact on writer code | Minimal (conflict handling only) | Moderate (compute + send fingerprint, handle conflict) | Minimal (DB computes it) | Larger — would need the read-classify-insert sequence wrapped in one DB call |
| Rollback ease | Trivial | **Trivial — drop index + column, both purely additive** | Trivial for the column, but a `GENERATED` column drop can be heavier | Requires dropping a function + revoking a grant |
| Risk of false "duplicate" | None beyond normal text equality | Very low (SHA-256 collision) | Same as B if kept in sync | N/A |
| Risk of missing a real duplicate | **Higher** (no normalization) | Low, but non-zero: two independently-fetched copies of volatile page content could differ post-normalization (accepted, documented residual limit) | Same as B, plus silent drift risk if the two implementations diverge over time | N/A (doesn't address content matching at all) |
| Schema change required | Index only | **New nullable column + partial unique index** | New generated column + partial unique index (heavier ALTER) | New function + grant (bigger, novel surface) |
| Concrete rejection reason | Misses whitespace/case variance in the one scenario that matters most (two independent parses) | — | The Polish diacritic map already has a documented special case for "ł" (no Unicode NFD decomposition) — a generic SQL-side `unaccent`/`translate` re-implementation is exactly the kind of thing likely to mishandle that one character differently from the JS map, with no shared test to catch the drift | No Postgres RPC function exists anywhere in this project today for the scheduled writer; creating one is explicitly a bigger, more novel change than a plain index, previously rejected in the Sprint 149 proposal for the same reason |

### Recommended: **Variant B**

Smallest mechanism that actually closes the race, with the least new
surface: one nullable column, one partial unique index, zero RLS change,
a single normalization function reused (not reimplemented), and a fully
reversible rollback.

## 4. Duplicate preflight (run before any migration decision)

`docs/sql/VERIFY_SOURCE_NOTICE_CANDIDATE_DUPLICATES_READ_ONLY_V1.sql` —
SELECT-only, scoped to writer-created rows (`source_key is not null`),
groups by a best-effort normalized text, reports `SAFE TO MIGRATE` or
`DUPLICATES REQUIRE REVIEW` with the specific colliding row ids. **Not
run this session** (no live database access from this environment) —
Adam must run this and review the result before proceeding, even though
(see the file's own header) the migration technically cannot fail
because of historical data given the partial-index scoping.

## 5. Deploy order — schema-first, then flag, never the reverse

This is not optional ordering — deploying the code change before the
schema change would send `content_fingerprint` to a column that doesn't
exist yet and fail every single insert. The code in this package
defaults the feature OFF specifically so it is safe to merge/deploy at
any time without waiting for the migration — but the migration must
still come first in practice, before the flag is ever turned on:

1. **Duplicate preflight** (§4) — Adam runs, reviews.
2. **Schema migration** — Adam runs
   `docs/sql/PROPOSED_SPRINT_150_RACE_CONDITION_MIGRATION_V1.sql`, Step 1
   then Step 2 as two separate SQL Editor executions (see the file's own
   transaction note — `CREATE INDEX CONCURRENTLY` cannot run inside a
   transaction block).
3. **Migration verification** — Adam runs
   `docs/sql/VERIFY_SPRINT_150_RACE_CONDITION_MIGRATION_READ_ONLY_V1.sql`,
   confirms all of checks #1–#3 PASS.
4. **Code already deployed, flag still off** — the application code in
   this package (already merged as part of Sprint 150A) has been running
   in every environment this whole time with zero behavior change,
   because `SCHEDULED_WRITER_FINGERPRINT_ENABLED` defaults unset.
5. **Flag activation** (separate approval, Vercel env change — NOT part
   of this package) — Adam sets `SCHEDULED_WRITER_FINGERPRINT_ENABLED=true`
   in the same Preview-only scope as the other scheduled-writer
   variables, only after step 3 passes.
6. **One controlled test** (separate approval, mirroring the Sprint 148
   runbook's own pattern) — a single manual call to confirm
   `content_fingerprint` is now populated on the new candidate and the
   unique index exists as expected. Concurrency itself (two literally
   simultaneous calls) is impractical to demonstrate safely by hand —
   the concurrency tests in this package
   (`tests/e2e/scheduledWriterConcurrency.spec.ts`) are the verification
   for that specific property; the live controlled test only needs to
   confirm the fingerprint column round-trips correctly.

## 6. Rollback

`docs/sql/ROLLBACK_SPRINT_150_RACE_CONDITION_MIGRATION_V1.sql` — drop the
index (Step 1, immediate/emergency), optionally drop the column (Step
2), and set `SCHEDULED_WRITER_FINGERPRINT_ENABLED=false` (or remove it)
in Vercel. Fully reversible: the column is purely additive and read by
nothing except the writer's own insert path.

## 7. What remains explicitly unapproved by this package

- Running any of the SQL files above.
- Any RLS policy change (confirmed not needed for this specific
  migration — see the migration file's own header for the exact
  reasoning; if that reasoning is ever found to be wrong once tested
  live, that is itself a stop-and-escalate condition, not something to
  route around).
- Any Vercel environment change, including turning on
  `SCHEDULED_WRITER_FINGERPRINT_ENABLED`.
- Any Production change.
- Any cron activation.
- Any further live write beyond the one already verified in Sprint 148.
- Extending the writer to WKD.
- Autopublish.

## 8. Related

`docs/SPRINT_149_RACE_CONDITION_MIGRATION_PROPOSAL_V1.md` (superseded in
detail by this file, kept for history) ·
`docs/SPRINT_149_FIRST_SCHEDULE_READINESS_V1.md` (updated separately
with the new gate this package introduces) ·
`docs/SCHEDULED_WRITER_FOUNDATION_V1.md` §F.
