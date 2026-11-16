import { MAX_FETCH_ATTEMPTS, type FetchDiagnosticCode, type RunOutcome } from "@/lib/scheduledWriterRunSafety";
import type { AutomationErrorCategory } from "@/lib/automationAlerting";
import { categoryFromDiagnostic, categoryFromRunOutcome } from "@/lib/automationErrorClassifier";
import { isAbandonedRunOutcome, type OperationalNotificationEventType } from "@/lib/operationalNotificationPolicy";
import { OPERATIONAL_NOTIFICATION_EVENT_TYPE_LABELS_PL } from "@/lib/operationalNotificationAdminView";
import { SAFE_SUMMARY_MAX_LENGTH } from "@/lib/operationalNotificationLedger";

// Sprint 166G-1 — pure builders turning the scheduled writer's own final,
// already-closed RunOutcome into safe inputs for the notification policy.
// No I/O, no Supabase import, no extra database read — everything here is
// derived only from values the route already has in scope at its
// history.closeRun() call sites (see
// docs/SPRINT_166G_RUNTIME_LEDGER_INTEGRATION_AUDIT_AND_DESIGN_V1.md §B/§D).

export interface RunLevelNotificationCategoryInput {
  category: AutomationErrorCategory;
  isAbandonedRun: boolean;
}

/** Composes the already-existing, already-tested categoryFromRunOutcome +
 *  isAbandonedRunOutcome — never re-derives the abandoned/lock_held
 *  distinction ad hoc. isAbandonedRun=true is what lets the policy layer
 *  notify on an abandoned run instead of silently suppressing it as a mere
 *  still-open lock (see operationalNotificationPolicy.ts's own
 *  decideNotificationCategory: `if (input.isAbandonedRun) return "notify"`). */
export function buildRunLevelNotificationCategoryInput(outcome: RunOutcome): RunLevelNotificationCategoryInput {
  return {
    category: categoryFromRunOutcome(outcome),
    isAbandonedRun: isAbandonedRunOutcome(outcome),
  };
}

// ── POST-RELEASE-3B — classify a failed run from its real per-source cause.
//
// Before this change every partial/total failure collapsed to
// "unexpected_error"/critical via categoryFromRunOutcome, so a single
// source timeout (the 2026-11-16 06:21 UTC Production incident) was
// mailed as "nieoczekiwany błąd". categoryFromRunOutcome itself is left
// unchanged on purpose — it also feeds the shipped admin run-history
// display (runHistoryStatus.ts), which has no per-source data to refine it.

/** One failed source as the write-candidates route already reports it
 *  (its per-source `outcome` and optional `diagnostic`). */
export interface RunSourceFailure {
  outcome: string;
  diagnostic?: string;
}

const KNOWN_FETCH_DIAGNOSTICS: ReadonlySet<string> = new Set<FetchDiagnosticCode>([
  "http_4xx",
  "http_5xx",
  "non_html_content_type",
  "network_error",
  "timeout_10s",
  "parse_exception",
]);

function isFetchDiagnosticCode(value: string | undefined): value is FetchDiagnosticCode {
  return value !== undefined && KNOWN_FETCH_DIAGNOSTICS.has(value);
}

/** Exported for tests. Unknown shapes fail closed to "unexpected_error"
 *  (critical) — never guessed to be transient. */
export function categoryForFailedSource(failure: RunSourceFailure): AutomationErrorCategory {
  switch (failure.outcome) {
    case "fetch_error":
    case "timeout":
      return isFetchDiagnosticCode(failure.diagnostic) ? categoryFromDiagnostic(failure.diagnostic) : "unexpected_error";
    case "parse_error":
      return "permanent_fetch";
    case "write_error":
      // The route's per-source catch-all reports an exception it could not
      // attribute as write_error + diagnostic "unexpected_error".
      return failure.diagnostic === "unexpected_error" ? "unexpected_error" : "write_error";
    default:
      return "unexpected_error";
  }
}

/** Most serious first — a run is only "transient" when EVERY failed
 *  source was transient. */
const FAILURE_CATEGORY_PRIORITY: readonly AutomationErrorCategory[] = [
  "unexpected_error",
  "write_error",
  "permanent_fetch",
  "transient_fetch",
];

export interface RunLevelNotificationInput extends RunLevelNotificationCategoryInput {
  /** Fetch attempts already spent inside this run. For transient_fetch this
   *  is MAX_FETCH_ATTEMPTS: fetchAndParseProposals only ever returns a
   *  transient failure after its bounded in-run retry is exhausted, so the
   *  policy must not treat it as "retry still pending". */
  attemptsMade: number;
}

export function buildRunLevelNotificationInput(
  outcome: RunOutcome,
  sourceFailures: readonly RunSourceFailure[] = []
): RunLevelNotificationInput {
  const base = buildRunLevelNotificationCategoryInput(outcome);
  if ((outcome !== "partial_failure" && outcome !== "total_failure") || sourceFailures.length === 0) {
    return { ...base, attemptsMade: 0 };
  }
  const categories = new Set(sourceFailures.map(categoryForFailedSource));
  const category = FAILURE_CATEGORY_PRIORITY.find((c) => categories.has(c)) ?? "unexpected_error";
  return {
    category,
    isAbandonedRun: base.isAbandonedRun,
    attemptsMade: category === "transient_fetch" ? MAX_FETCH_ATTEMPTS : 0,
  };
}

export interface RunLevelSafeSummaryInput {
  eventType: OperationalNotificationEventType;
  sourcesFailed: number;
  sourcesChecked: number;
}

/** Only ever concatenates a closed-vocabulary Polish label
 *  (OPERATIONAL_NOTIFICATION_EVENT_TYPE_LABELS_PL, reused, never
 *  re-declared) and two counts — mirrors the write-candidates route's own
 *  existing `${sourcesFailed}/${sourcesChecked} sources failed` run-history
 *  errorSummary convention. Never accepts or forwards a raw exception
 *  message, URL, or stack trace. Truncated defensively to
 *  SAFE_SUMMARY_MAX_LENGTH even though no input here could realistically
 *  exceed it. */
export function buildRunLevelSafeSummary(input: RunLevelSafeSummaryInput): string {
  const label = OPERATIONAL_NOTIFICATION_EVENT_TYPE_LABELS_PL[input.eventType] ?? "nieoczekiwany błąd";
  const summary = `${label} — ${input.sourcesFailed}/${input.sourcesChecked} źródeł nieudanych`;
  return summary.length > SAFE_SUMMARY_MAX_LENGTH ? summary.slice(0, SAFE_SUMMARY_MAX_LENGTH) : summary;
}
