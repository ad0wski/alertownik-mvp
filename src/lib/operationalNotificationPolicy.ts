import type { AutomationErrorCategory, AutomationSeverity, RetryState } from "@/lib/automationAlerting";
import type { RunOutcome } from "@/lib/scheduledWriterRunSafety";
import { severityForCategory, buildRetryState } from "@/lib/automationErrorClassifier";
import { isWithinCooldown, DEFAULT_ALERT_COOLDOWN_MS } from "@/lib/alertDeduplication";

// Sprint 166F-1 — deterministic notification policy. Pure, no I/O, no
// Supabase import, no fetch, no Resend call. See
// docs/SPRINT_166F_OPERATIONAL_ALERT_LEDGER_AUDIT_AND_DESIGN_V1.md §B for
// the full design rationale, including the deliberate distinction between
// an abandoned run (§A gap) and a genuinely still-open lock.

/** Closed decision vocabulary — every possible outcome of the policy, and
 *  nothing else. `fail_closed` is the deliberate default for any input
 *  this switch does not recognize — never a guess, never "notify anyway
 *  just in case" (which would risk spamming on a case nobody reviewed),
 *  and never a silent suppress either (which would risk hiding a real
 *  problem this policy simply wasn't taught about yet). */
export type NotificationDecision =
  | "notify"
  | "suppress_retry_pending"
  | "suppress_lock_held"
  | "suppress_duplicate"
  | "suppress_cooldown"
  | "suppress_success"
  | "suppress_not_actionable"
  | "fail_closed";

/** One-to-one with every AutomationErrorCategory, plus "abandoned_run" —
 *  the one case this sprint's audit found was NOT already distinguishable
 *  from "lock_held" (see design doc §A gap). Never reuse
 *  AutomationErrorCategory alone as the ledger's event_type: doing so
 *  would silently collapse abandoned-run alerts back into the
 *  lock_held suppression path this type exists to avoid. */
export type OperationalNotificationEventType =
  | "run_success"
  | "abandoned_run"
  | "lock_held"
  | "transient_fetch"
  | "permanent_fetch"
  | "write_error"
  | "credentials_not_configured"
  | "environment_guard_blocked"
  | "kill_switch_disabled"
  | "unexpected_error";

// Sprint 166F-2A — canonical, single source of truth for "was this run
// abandoned" (Etap 2). automationErrorClassifier.categoryFromRunOutcome
// is LIVE and already wired into runHistoryStatus.ts (the shipped
// /admin/sources run-history display) and pinned by
// tests/e2e/automationErrorClassifier.spec.ts's own existing assertion
// that categoryFromRunOutcome("abandoned") === "lock_held" — changing
// that function's return value would be a live regression to an already-
// shipped admin panel, not a safe change to make as a side effect of this
// sprint. Instead, this function is the ONE place that must be called
// against the raw RunOutcome, BEFORE any caller passes that outcome
// through categoryFromRunOutcome (which is exactly where the distinction
// is lost — its whole contract is "collapse every RunOutcome onto one of
// the existing AutomationErrorCategory values", and there is no
// AutomationErrorCategory value reserved for "abandoned" specifically).
//
// Every future caller wiring this policy to a real run outcome (not yet
// done this sprint — see docs/SPRINT_166F_OPERATIONAL_ALERT_LEDGER_AUDIT_AND_DESIGN_V1.md
// §A gap and §Etap 2) MUST derive its isAbandonedRun input from THIS
// function, never by re-deriving it ad hoc from category alone (which
// cannot distinguish the two cases at all) or from categoryFromRunOutcome's
// output (which has already discarded the distinction).
export function isAbandonedRunOutcome(outcome: RunOutcome): boolean {
  return outcome === "abandoned";
}

export function eventTypeFor(category: AutomationErrorCategory, isAbandonedRun: boolean): OperationalNotificationEventType {
  if (isAbandonedRun) return "abandoned_run";
  switch (category) {
    case "none":
      return "run_success";
    case "lock_held":
      return "lock_held";
    case "transient_fetch":
      return "transient_fetch";
    case "permanent_fetch":
      return "permanent_fetch";
    case "write_error":
      return "write_error";
    case "credentials_not_configured":
      return "credentials_not_configured";
    case "environment_guard_blocked":
      return "environment_guard_blocked";
    case "kill_switch_disabled":
      return "kill_switch_disabled";
    case "unexpected_error":
      return "unexpected_error";
    default:
      return "unexpected_error";
  }
}

export interface NotificationCategoryInput {
  category: AutomationErrorCategory;
  retry: RetryState;
  /** True only for the specific case where this event represents a run
   *  auto-closed by open_scheduled_writer_run()'s own stale-lock
   *  housekeeping (outcome: "abandoned") — never true for a genuinely
   *  still-open, non-stale lock. See design doc §A gap: the existing
   *  categoryFromRunOutcome() maps "abandoned" to the "lock_held"
   *  category, which is exactly the ambiguity this flag exists to
   *  resolve at the policy layer without changing that classifier. */
  isAbandonedRun: boolean;
}

/** Step 1 of the full policy (see decideNotificationPolicy below for the
 *  cooldown/duplicate-aware wrapper). Pure, no I/O, no clock read — never
 *  decides suppress_duplicate or suppress_cooldown itself, since neither
 *  can be known without the persisted store (§D of the design doc). */
export function decideNotificationCategory(input: NotificationCategoryInput): NotificationDecision {
  if (input.isAbandonedRun) return "notify";

  switch (input.category) {
    case "none":
      return "suppress_success";
    case "lock_held":
      return "suppress_lock_held";
    case "transient_fetch":
      return input.retry.willRetryWithinRun ? "suppress_retry_pending" : "notify";
    case "permanent_fetch":
    case "write_error":
    case "unexpected_error":
      return "notify";
    case "credentials_not_configured":
    case "environment_guard_blocked":
      return "notify";
    case "kill_switch_disabled":
      return "suppress_not_actionable";
    default:
      return "fail_closed";
  }
}

export interface NotificationPolicyInput extends NotificationCategoryInput {
  /** null when this fingerprint has never alerted before — isWithinCooldown
   *  already treats that as "never suppress", unchanged. */
  lastAlertSentAt: string | null;
  now?: Date;
  cooldownMs?: number;
}

/** Full policy: category-based decision first (never overridden by
 *  cooldown when the category-based decision is itself a suppression —
 *  there is no reason to also claim a fingerprint for an event that was
 *  never going to notify), then cooldown only when the category-based
 *  step said "notify". Duplicate-claim suppression (suppress_duplicate)
 *  is NOT decided here — it can only be known by the database's own
 *  unique-index conflict at claim time (see §D/§F of the design doc) and
 *  is applied by the future orchestrator, never guessed at in pure code. */
export function decideNotificationPolicy(input: NotificationPolicyInput): NotificationDecision {
  const categoryDecision = decideNotificationCategory(input);
  if (categoryDecision !== "notify") return categoryDecision;

  const cooldownMs = input.cooldownMs ?? DEFAULT_ALERT_COOLDOWN_MS;
  if (isWithinCooldown(input.lastAlertSentAt, input.now, cooldownMs)) {
    return "suppress_cooldown";
  }
  return "notify";
}

/** Generalizes alertDeduplication.ts's existing buildAlertFingerprint to
 *  accept an OperationalNotificationEventType instead of an
 *  AutomationErrorCategory (so "abandoned_run" gets its own fingerprint
 *  scope, distinct from "lock_held" — see the eventType rationale above)
 *  and a generic scopeKey rather than always a sourceKey — run-level
 *  events (abandoned_run, lock_held, credentials_not_configured,
 *  environment_guard_blocked, kill_switch_disabled) have no single source
 *  to key on, so callers pass the literal "run" for those. Deterministic,
 *  plain string composition — same convention as buildAlertFingerprint,
 *  compared for equality only, never stored or transmitted as a security
 *  token. */
export function buildOperationalNotificationFingerprint(
  environmentTag: string,
  scopeKey: string,
  eventType: OperationalNotificationEventType
): string {
  return `${environmentTag}:${scopeKey}:${eventType}`;
}

export interface NotificationEventDetails {
  severity: AutomationSeverity;
  retry: RetryState;
  eventType: OperationalNotificationEventType;
}

/** Composes the smaller builders (all reused, none reimplemented) into
 *  the full set of derived fields a future ledger claim would persist
 *  alongside the decision itself. */
export function buildNotificationEventDetails(
  category: AutomationErrorCategory,
  attemptsMade: number,
  isAbandonedRun: boolean
): NotificationEventDetails {
  return {
    severity: severityForCategory(category),
    retry: buildRetryState(category, attemptsMade),
    eventType: eventTypeFor(category, isAbandonedRun),
  };
}
