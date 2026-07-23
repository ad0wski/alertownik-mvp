import { classifyFetchFailure, type FetchDiagnosticCode, type RunOutcome } from "@/lib/scheduledWriterRunSafety";
import {
  type AutomationErrorCategory,
  type AutomationSeverity,
  type RetryState,
  type AdminActionRequired,
  type AutomationHealthEvent,
} from "@/lib/automationAlerting";

// Sprint 166D-1 — deterministic classifier. Pure function, no I/O, no
// randomness, no clock read (a caller supplies consecutiveFailures — this
// module never counts anything itself). See
// docs/SPRINT_166D_OPERATIONAL_MONITORING_ALERTING_AUDIT_AND_DESIGN_V1.md
// §C.1-2 and §C.7 for the design rationale.

const CONSECUTIVE_FAILURES_ADMIN_ACTION_THRESHOLD = 3;

// ── Shared Polish label maps (Sprint 166D-2B) — single source of truth so
// operationalHealthStatus.ts and runHistoryStatus.ts never define their
// own, possibly-drifted copy of the same closed-vocabulary labels. ──

export const AUTOMATION_ERROR_CATEGORY_LABELS_PL: Record<AutomationErrorCategory, string> = {
  transient_fetch: "chwilowy błąd pobierania",
  permanent_fetch: "trwały błąd pobierania",
  write_error: "błąd zapisu",
  lock_held: "poprzednie uruchomienie wciąż trwa",
  environment_guard_blocked: "zablokowane przez zabezpieczenie środowiska",
  credentials_not_configured: "brak skonfigurowanych danych logowania",
  kill_switch_disabled: "automatyzacja wyłączona",
  unexpected_error: "nieoczekiwany błąd",
  none: "brak błędu",
};

export const AUTOMATION_SEVERITY_LABELS_PL: Record<AutomationSeverity, string> = {
  info: "informacja",
  warning: "ostrzeżenie",
  critical: "krytyczne",
};

/** Per-source outcome literals already produced by
 *  GET /api/cron/write-candidates (see that route's per-source `outcome`
 *  field) — never a new vocabulary, mirrors the existing convention in
 *  scheduledWriterRunSafety.ts's own doc comment for FetchDiagnosticCode. */
export type SourceRunOutcome =
  | "success"
  | "no_proposals"
  | "fetch_error"
  | "timeout"
  | "write_error";

export function categoryFromDiagnostic(diagnostic: FetchDiagnosticCode): AutomationErrorCategory {
  return classifyFetchFailure(diagnostic) === "transient" ? "transient_fetch" : "permanent_fetch";
}

export function categoryFromSourceOutcome(
  outcome: SourceRunOutcome,
  diagnostic?: FetchDiagnosticCode
): AutomationErrorCategory {
  switch (outcome) {
    case "success":
    case "no_proposals":
      return "none";
    case "write_error":
      return "write_error";
    case "fetch_error":
    case "timeout":
      return diagnostic ? categoryFromDiagnostic(diagnostic) : "transient_fetch";
    default:
      return "unexpected_error";
  }
}

/** Mirrors the route's own top-level RunOutcome (never a per-source
 *  value) for the cases that don't map onto a single source at all. */
export function categoryFromRunOutcome(outcome: RunOutcome): AutomationErrorCategory {
  switch (outcome) {
    case "success":
      return "none";
    case "partial_failure":
    case "total_failure":
      return "unexpected_error";
    case "skipped_kill_switch":
      return "kill_switch_disabled";
    case "skipped_lock_held":
      return "lock_held";
    case "abandoned":
      return "lock_held";
    default:
      return "unexpected_error";
  }
}

export function severityForCategory(category: AutomationErrorCategory): AutomationSeverity {
  switch (category) {
    case "none":
    case "kill_switch_disabled":
      return "info";
    case "transient_fetch":
      return "warning";
    case "permanent_fetch":
    case "write_error":
    case "lock_held":
    case "environment_guard_blocked":
    case "credentials_not_configured":
    case "unexpected_error":
      return "critical";
    default:
      return "critical";
  }
}

export function buildRetryState(category: AutomationErrorCategory, attemptsMade: number): RetryState {
  const maxAttemptsPerRun = 2; // mirrors MAX_FETCH_ATTEMPTS (scheduledWriterRunSafety.ts)
  const isRetryableCategory = category === "transient_fetch";
  return {
    attemptsMade,
    maxAttemptsPerRun,
    willRetryWithinRun: isRetryableCategory && attemptsMade < maxAttemptsPerRun,
    nextScheduledRunKnown: false,
  };
}

export function buildAdminActionRequired(
  category: AutomationErrorCategory,
  consecutiveFailures: number
): AdminActionRequired {
  if (category === "permanent_fetch" || category === "write_error" || category === "unexpected_error") {
    return { required: true, reason: "permanent_failure" };
  }
  if (category === "lock_held" && consecutiveFailures >= CONSECUTIVE_FAILURES_ADMIN_ACTION_THRESHOLD) {
    return { required: true, reason: "stuck_lock" };
  }
  if (category === "credentials_not_configured") {
    return { required: true, reason: "credentials_missing" };
  }
  if (consecutiveFailures >= CONSECUTIVE_FAILURES_ADMIN_ACTION_THRESHOLD) {
    return { required: true, reason: "consecutive_failures" };
  }
  return { required: false, reason: null };
}

export interface ClassifyAutomationEventInput {
  category: AutomationErrorCategory;
  attemptsMade: number;
  consecutiveFailures: number;
  /** This sprint's real notification adapter always reports "disabled" —
   *  callers that haven't wired a real adapter yet should pass that
   *  value explicitly rather than this module guessing it. */
  notificationStatus: AutomationHealthEvent["notificationStatus"];
}

/** Composes the smaller pure builders above into one event — the single
 *  entry point a future admin-panel formatter or route would call. */
export function classifyAutomationEvent(input: ClassifyAutomationEventInput): AutomationHealthEvent {
  return {
    category: input.category,
    severity: severityForCategory(input.category),
    retry: buildRetryState(input.category, input.attemptsMade),
    adminAction: buildAdminActionRequired(input.category, input.consecutiveFailures),
    notificationStatus: input.notificationStatus,
  };
}
