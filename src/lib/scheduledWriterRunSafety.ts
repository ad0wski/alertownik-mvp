// Sprint 166C — Automatic Source Monitoring: run-safety primitives.
//
// Pure, testable functions only — no Supabase import, no fetch, no timers
// started here. Three independent concerns, each usable on its own:
//   1. classifyFetchFailure — transient vs. permanent, so retry logic
//      (wired separately, in the route) never retries a failure that
//      could never succeed on a second attempt.
//   2. Run-lock decision — pure function deciding whether an existing
//      lock row should block a new invocation; storage (a table) and
//      wiring into the live route are deliberately NOT part of this
//      sprint's change — see docs/SPRINT_166C_AUTOMATIC_SOURCE_MONITORING_AUDIT_AND_DESIGN_V1.md §D.
//   3. Run-history insert shaping — mirrors the existing
//      buildAutomatedSourceCheckInsert pattern (src/lib/scheduledWriter.ts):
//      only ever produces the exact row shape a future
//      `scheduled_writer_runs` table would accept, never a generic object
//      a caller could widen.
//
// Nothing in this file is wired into any live route this sprint. It exists
// so the decision logic can be reviewed and tested in isolation before any
// future session wires it into GET /api/cron/write-candidates.

// ── 1. Transient vs. permanent fetch failure classification ──────────────────

/** Matches the diagnostic codes already produced by
 *  GET /api/cron/write-candidates's fetchAndParseProposals (and the
 *  dry-run's own equivalent in src/lib/cronCheckSources.ts) — never a new
 *  vocabulary, so classification stays meaningful against the exact
 *  values those routes already emit. */
export type FetchDiagnosticCode =
  | "http_4xx"
  | "http_5xx"
  | "non_html_content_type"
  | "network_error"
  | "timeout_10s"
  | "parse_exception";

export type FetchFailureClass = "transient" | "permanent";

/** A second attempt of the exact same request can plausibly succeed for a
 *  transient failure (a momentary timeout, a 5xx, a generic network
 *  blip) — but never for a permanent one (a 4xx means the resource
 *  genuinely isn't there or isn't allowed; a non-HTML content type or a
 *  parse exception means the page's *shape* is wrong, which a retry of
 *  the same request cannot change). Getting this classification wrong in
 *  the "too generous" direction would retry a 404 forever in spirit (even
 *  bounded to one retry, it would still waste a request and a few seconds
 *  for zero chance of success) — so this list is deliberately narrow. */
const TRANSIENT_DIAGNOSTICS: ReadonlySet<FetchDiagnosticCode> = new Set([
  "http_5xx",
  "network_error",
  "timeout_10s",
]);

export function classifyFetchFailure(diagnostic: FetchDiagnosticCode): FetchFailureClass {
  return TRANSIENT_DIAGNOSTICS.has(diagnostic) ? "transient" : "permanent";
}

// ── Bounded retry policy — constants, not a loop ─────────────────────────────
//
// Exactly one retry, ever, per source per invocation. Never exponential
// backoff without a hard ceiling, never a second retry after the retry
// itself fails — a second transient failure is reported honestly as a
// failure, not retried again. The delay is short and fixed on purpose:
// this route already runs inside Vercel's own function-timeout budget, so
// an unbounded or long backoff would risk the retry itself timing out the
// whole invocation.

export const MAX_FETCH_ATTEMPTS = 2;
export const RETRY_DELAY_MS = 2_000;

// ── 2. Run-lock decision (pure — storage/wiring deliberately out of scope) ───

export interface RunLockRow {
  startedAt: string;
  finishedAt: string | null;
}

/** How long an in-progress run is trusted to genuinely still be running
 *  before a new invocation is allowed to proceed anyway (a stuck/crashed
 *  invocation must never permanently wedge every future run). Deliberately
 *  generous relative to this route's realistic single-source runtime
 *  (a handful of seconds) — see design doc §C Stage 2. */
export const RUN_LOCK_STALE_AFTER_MS = 5 * 60 * 1000;

/** Returns true if `lock` should block a new invocation from proceeding.
 *  A lock with a `finishedAt` never blocks (the run it recorded is over).
 *  A lock with no `finishedAt` blocks only while still within the
 *  stale-after window — past that, it is treated as abandoned (e.g. the
 *  function crashed or was terminated) rather than an eternal wedge. */
export function isRunLockHeld(
  lock: RunLockRow | null,
  now: Date = new Date(),
  staleAfterMs: number = RUN_LOCK_STALE_AFTER_MS
): boolean {
  if (!lock) return false;
  if (lock.finishedAt) return false;
  const startedAtMs = new Date(lock.startedAt).getTime();
  if (!Number.isFinite(startedAtMs)) return false;
  return now.getTime() - startedAtMs < staleAfterMs;
}

// ── 3. Run-history insert/update shaping ─────────────────────────────────────
//
// Matches the live public.scheduled_writer_runs table exactly (migrated
// to alertownik-preview — see
// docs/sql/PROPOSED_SPRINT_166C_RUN_HISTORY_MIGRATION_V1.sql). Two
// separate builders, matching the table's real two-phase lifecycle:
// OPEN at the start of a run (finished_at/outcome left null — this open
// row IS the lock signal), CLOSE exactly once at the end (an UPDATE, per
// the table's own scheduled_writer_runs_writer_close RLS policy, which
// only allows updating a row that is still open).
//
// The caller supplies only measured facts; every RLS-sensitive/derived
// field is fixed here, not parameterized — mirrors
// buildAutomatedSourceCheckInsert's existing safety pattern
// (src/lib/scheduledWriter.ts).
//
// IMPORTANT — id is generated by the CALLER (crypto.randomUUID()), never
// read back via INSERT ... RETURNING: the writer identity's RLS grants
// INSERT and UPDATE only, no SELECT, and Postgres RLS filters RETURNING
// output through SELECT policies — without one, RETURNING would come
// back empty even though the row was written. Generating the id
// ourselves sidesteps that entirely; the same id is used for the later
// closing UPDATE's WHERE clause.

export type RunOutcome =
  | "success"
  | "partial_failure"
  | "total_failure"
  | "skipped_kill_switch"
  | "skipped_lock_held";

export type RunTrigger = "cron" | "manual";

export interface RunHistoryOpenInput {
  id: string;
  startedAt: string;
  trigger: RunTrigger;
  environmentTag: string;
}

export function buildRunHistoryOpenInsert(input: RunHistoryOpenInput) {
  return {
    id: input.id,
    started_at: input.startedAt,
    trigger: input.trigger,
    environment_tag: input.environmentTag,
  } as const;
}

export interface RunHistoryCloseInput {
  finishedAt: string;
  outcome: RunOutcome;
  sourcesChecked: number;
  sourcesFailed: number;
  candidatesInserted: number;
  duplicatesSkipped: number;
  ambiguousCandidates: number;
  cappedSkipped: number;
  duplicatesPreventedByDatabase: number;
  /** Short, non-sensitive text only — never a raw exception message or
   *  stack trace, matching the existing diagnostic-code convention used
   *  throughout src/lib/cronCheckSources.ts and the write route. */
  errorSummary: string | null;
}

export function buildRunHistoryCloseUpdate(input: RunHistoryCloseInput) {
  return {
    finished_at: input.finishedAt,
    outcome: input.outcome,
    sources_checked: input.sourcesChecked,
    sources_failed: input.sourcesFailed,
    candidates_inserted: input.candidatesInserted,
    duplicates_skipped: input.duplicatesSkipped,
    ambiguous_candidates: input.ambiguousCandidates,
    capped_skipped: input.cappedSkipped,
    duplicates_prevented_by_database: input.duplicatesPreventedByDatabase,
    error_summary: input.errorSummary,
  } as const;
}

/** Narrow interface the real route depends on (see
 *  src/lib/scheduledWriterHistory.ts for the live Supabase-backed
 *  implementation) — matches exactly what the migrated RLS allows the
 *  writer identity to do: open a run, close only its own still-open run,
 *  and best-effort look for an existing lock (see findActiveLock's own
 *  doc comment for why this last one is currently a structural no-op
 *  against the live database). Never SELECT/UPDATE/DELETE on any other
 *  row, never any access beyond this one table. */
export interface RunHistoryWriter {
  openRun(payload: ReturnType<typeof buildRunHistoryOpenInsert>): Promise<{ ok: boolean }>;
  closeRun(id: string, payload: ReturnType<typeof buildRunHistoryCloseUpdate>): Promise<{ ok: boolean }>;
  /** Best-effort concurrency check — see
   *  docs/SPRINT_166C_AUTOMATIC_SOURCE_MONITORING_AUDIT_AND_DESIGN_V1.md
   *  §D "Known gap": the migrated RLS grants the writer identity INSERT
   *  and UPDATE only, no SELECT, on scheduled_writer_runs — so a live
   *  call to this method can never actually see a prior open row and
   *  will always resolve to null (no lock detected) until a follow-up,
   *  NOT YET EXECUTED, single additional SELECT policy (scoped to
   *  `finished_at is null`, mirroring the existing UPDATE policy's own
   *  USING clause) is proposed and approved. isRunLockHeld()'s own logic
   *  is fully correct and tested against a fake writer regardless — this
   *  gap is specifically about live wiring, not the decision logic. */
  findActiveLock(): Promise<RunLockRow | null>;
}
