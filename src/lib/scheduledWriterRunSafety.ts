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

// ── 3. Run-history insert shaping (proposed table, not yet migrated) ────────
//
// Mirrors buildAutomatedSourceCheckInsert's safety pattern exactly (see
// src/lib/scheduledWriter.ts): the caller supplies only measured facts
// about a completed run; every RLS-sensitive/derived field a caller could
// otherwise abuse is fixed here, not parameterized. See
// docs/sql/PROPOSED_SPRINT_166C_RUN_HISTORY_MIGRATION_V1.sql for the
// (not yet applied) table this shape targets.

export type RunOutcome =
  | "success"
  | "partial_failure"
  | "total_failure"
  | "skipped_kill_switch"
  | "skipped_lock_held";

export type RunTrigger = "cron" | "manual";

export interface RunHistoryInput {
  startedAt: string;
  finishedAt: string;
  trigger: RunTrigger;
  environmentTag: string;
  sourcesChecked: number;
  sourcesFailed: number;
  candidatesInserted: number;
  duplicatesSkipped: number;
  ambiguousCandidates: number;
  cappedSkipped: number;
  duplicatesPreventedByDatabase: number;
  outcome: RunOutcome;
  /** Short, non-sensitive text only — never a raw exception message or
   *  stack trace, matching the existing diagnostic-code convention used
   *  throughout src/lib/cronCheckSources.ts and the write route. */
  errorSummary: string | null;
}

export function buildRunHistoryInsert(input: RunHistoryInput) {
  return {
    started_at: input.startedAt,
    finished_at: input.finishedAt,
    trigger: input.trigger,
    environment_tag: input.environmentTag,
    sources_checked: input.sourcesChecked,
    sources_failed: input.sourcesFailed,
    candidates_inserted: input.candidatesInserted,
    duplicates_skipped: input.duplicatesSkipped,
    ambiguous_candidates: input.ambiguousCandidates,
    capped_skipped: input.cappedSkipped,
    duplicates_prevented_by_database: input.duplicatesPreventedByDatabase,
    outcome: input.outcome,
    error_summary: input.errorSummary,
  } as const;
}

/** Narrow interface a future route would depend on — INSERT only, matching
 *  the proposed RLS design (§C Stage 1): the scheduled-writer identity
 *  never gets SELECT/UPDATE/DELETE on its own run-history rows, exactly
 *  like every other table it can write to. Not implemented against a real
 *  Supabase client this sprint — see ScheduledSourceWriter in
 *  src/lib/scheduledWriter.ts for the equivalent, already-live pattern
 *  this interface deliberately mirrors. */
export interface RunHistoryWriter {
  insertRun(payload: ReturnType<typeof buildRunHistoryInsert>): Promise<{ ok: boolean }>;
}
