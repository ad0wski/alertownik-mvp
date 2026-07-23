// Sprint 166D-1 — Operational Monitoring & Alerting: shared vocabulary.
//
// Pure types only — no Supabase import, no fetch, no env var reads. See
// docs/SPRINT_166D_OPERATIONAL_MONITORING_ALERTING_AUDIT_AND_DESIGN_V1.md
// §C.1-2 for the full design rationale. Every field here is either a
// closed-set literal, a count, or a public source id/name already exposed
// elsewhere in the admin UI (matching automationStatus.ts's existing
// "nothing here could become a secret" guarantee) — no field could ever
// carry a token, password, or credential value.

/** A single closed vocabulary every existing outcome/diagnostic literal in
 *  this codebase maps onto (see automationErrorClassifier.ts) — never a
 *  new failure mode invented ahead of the code that would produce it. */
export type AutomationErrorCategory =
  | "transient_fetch"
  | "permanent_fetch"
  | "write_error"
  | "lock_held"
  | "environment_guard_blocked"
  | "credentials_not_configured"
  | "kill_switch_disabled"
  | "unexpected_error"
  | "none";

export type AutomationSeverity = "info" | "warning" | "critical";

/** Describes attempts already made within ONE completed invocation of
 *  write-candidates (the existing bounded retry in
 *  src/lib/scheduledSourceFetch.ts), never a promise about a future
 *  invocation — no cron exists yet, so `nextScheduledRunKnown` is always
 *  `false` today. This field exists now, honestly false, so the type
 *  never needs a breaking shape change once a real schedule exists. */
export interface RetryState {
  attemptsMade: number;
  maxAttemptsPerRun: number;
  /** True only if this outcome's category is retryable AND a second
   *  attempt was already made within the same invocation — never a
   *  cross-invocation promise. */
  willRetryWithinRun: boolean;
  nextScheduledRunKnown: false;
}

export type AdminActionReason =
  | "permanent_failure"
  | "stuck_lock"
  | "consecutive_failures"
  | "credentials_missing"
  | null;

export interface AdminActionRequired {
  required: boolean;
  reason: AdminActionReason;
}

/** This sprint's real notification adapter (notificationAdapter.ts) only
 *  ever produces "disabled" or "no_adapter_configured" — "sent" and
 *  "send_failed" are specified now so a future real adapter does not
 *  require a type change to this union. */
export type NotificationStatus =
  | "disabled"
  | "no_adapter_configured"
  | "suppressed_by_cooldown"
  | "sent"
  | "send_failed";

export interface AutomationHealthEvent {
  category: AutomationErrorCategory;
  severity: AutomationSeverity;
  retry: RetryState;
  adminAction: AdminActionRequired;
  notificationStatus: NotificationStatus;
}
