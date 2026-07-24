import type { RunOutcome } from "@/lib/scheduledWriterRunSafety";
import type { AutomationErrorCategory } from "@/lib/automationAlerting";
import { categoryFromRunOutcome } from "@/lib/automationErrorClassifier";
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
