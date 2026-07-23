import type { OperationalNotificationEventType, NotificationDecision } from "@/lib/operationalNotificationPolicy";
import type { AutomationSeverity } from "@/lib/automationAlerting";
import type { ResendErrorCategory } from "@/lib/resendNotificationAdapter";

// Sprint 166F-1 — pure specification of the persistent
// public.operational_notification_events ledger and the two atomic RPCs
// that will be its only write path (see
// docs/sql/PROPOSED_SPRINT_166F_OPERATIONAL_NOTIFICATION_LEDGER_V1.sql —
// NOT YET EXECUTED against any Supabase project). Nothing in this file
// imports Supabase, performs I/O, or is wired into any live route this
// sprint — it exists so the same validation the future SQL functions
// enforce can be reviewed and tested here in isolation first, exactly
// mirroring scheduledWriterRunSafety.ts's own "specification, not yet
// live enforcement" pattern.

export type OperationalNotificationChannel = "email";

export const ALLOWED_NOTIFICATION_CHANNELS: ReadonlySet<string> = new Set(["email"]);

export const ALLOWED_NOTIFICATION_EVENT_TYPES: ReadonlySet<string> = new Set([
  "run_success",
  "abandoned_run",
  "lock_held",
  "transient_fetch",
  "permanent_fetch",
  "write_error",
  "credentials_not_configured",
  "environment_guard_blocked",
  "kill_switch_disabled",
  "unexpected_error",
] satisfies OperationalNotificationEventType[]);

export const ALLOWED_NOTIFICATION_SEVERITIES: ReadonlySet<string> = new Set([
  "info",
  "warning",
  "critical",
] satisfies AutomationSeverity[]);

export type OperationalNotificationStatus = "claimed" | "sent" | "failed" | "suppressed" | "abandoned";

export const ALLOWED_NOTIFICATION_STATUSES: ReadonlySet<string> = new Set([
  "claimed",
  "sent",
  "failed",
  "suppressed",
  "abandoned",
] satisfies OperationalNotificationStatus[]);

/** Closed set matching NotificationDecision's own suppress_* literals —
 *  a row's suppressed_reason (when status = 'suppressed') must always be
 *  one of these, never a free-text explanation. */
export const ALLOWED_SUPPRESSED_REASONS: ReadonlySet<string> = new Set([
  "suppress_retry_pending",
  "suppress_lock_held",
  "suppress_duplicate",
  "suppress_cooldown",
  "suppress_success",
  "suppress_not_actionable",
] satisfies Exclude<NotificationDecision, "notify" | "fail_closed">[]);

/** Reuses ResendErrorCategory's exact vocabulary (never a parallel,
 *  possibly-drifted list) plus "sent" for the one success case. */
export const ALLOWED_PROVIDER_STATUSES: ReadonlySet<string> = new Set([
  "sent",
  "validation_error",
  "auth_error",
  "rate_limited",
  "transient_error",
  "unknown_error",
] satisfies (ResendErrorCategory | "sent")[]);

/** Same cap as scheduled_writer_runs.error_summary / close_scheduled_writer_run's
 *  own p_error_summary check — one shared constant, not two that could drift. */
export const SAFE_SUMMARY_MAX_LENGTH = 200;

/** Mirrors open_scheduled_writer_run's own [300, 86400]-second bounds
 *  check on p_stale_after_seconds — the claim RPC applies the identical
 *  bounds to its own stale-claim housekeeping window. */
export const NOTIFICATION_STALE_CLAIM_AFTER_SECONDS_MIN = 300;
export const NOTIFICATION_STALE_CLAIM_AFTER_SECONDS_MAX = 86400;

/** Deliberately generous bounds for the cooldown parameter — must cover
 *  everything from a short "avoid double-claim inside one process crash
 *  loop" window up to multi-day suppression for a chronically-flapping
 *  source. See design doc §D's own "open design question" callout: this
 *  is a genuine parameter, not a hard-coded constant, because different
 *  event types may reasonably want different cooldowns. */
export const NOTIFICATION_COOLDOWN_SECONDS_MIN = 60;
export const NOTIFICATION_COOLDOWN_SECONDS_MAX = 30 * 24 * 60 * 60;

function isNonNegativeFiniteInteger(value: number | null | undefined): boolean {
  return value !== null && value !== undefined && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

export function isStaleClaimAfterSecondsValid(value: number | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (!Number.isFinite(value)) return false;
  return (
    value >= NOTIFICATION_STALE_CLAIM_AFTER_SECONDS_MIN && value <= NOTIFICATION_STALE_CLAIM_AFTER_SECONDS_MAX
  );
}

export function isCooldownSecondsValid(value: number | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (!Number.isFinite(value)) return false;
  return value >= NOTIFICATION_COOLDOWN_SECONDS_MIN && value <= NOTIFICATION_COOLDOWN_SECONDS_MAX;
}

export function isSafeSummaryValid(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  return value.length <= SAFE_SUMMARY_MAX_LENGTH;
}

export interface ClaimNotificationEventInput {
  environmentTag: string;
  channel: OperationalNotificationChannel;
  eventType: OperationalNotificationEventType;
  severity: AutomationSeverity;
  fingerprint: string;
  scheduledWriterRunId: string | null;
  sourceId: string | null;
  safeSummary: string | null;
  cooldownSeconds: number;
  staleClaimAfterSeconds: number;
}

/** Mirrors the future claim_operational_notification_event() SQL
 *  function's own validation, executed before it would touch any row —
 *  identical spirit to isCloseRunInputValid. Never validates fingerprint
 *  or sourceId shape beyond "non-empty string" — those are opaque,
 *  caller-derived identifiers, not enum values. */
export function isClaimNotificationEventInputValid(input: ClaimNotificationEventInput): boolean {
  if (!ALLOWED_NOTIFICATION_CHANNELS.has(input.channel)) return false;
  if (!ALLOWED_NOTIFICATION_EVENT_TYPES.has(input.eventType)) return false;
  if (!ALLOWED_NOTIFICATION_SEVERITIES.has(input.severity)) return false;
  if (!input.environmentTag || input.environmentTag.length === 0) return false;
  if (!input.fingerprint || input.fingerprint.length === 0) return false;
  if (!isSafeSummaryValid(input.safeSummary)) return false;
  if (!isCooldownSecondsValid(input.cooldownSeconds)) return false;
  if (!isStaleClaimAfterSecondsValid(input.staleClaimAfterSeconds)) return false;
  return true;
}

export type ClaimNotificationEventResult =
  | { claimed: true; eventId: string }
  | { claimed: false; suppressedReason: "suppress_cooldown" | "suppress_duplicate" };

export interface FinishNotificationEventInput {
  eventId: string;
  status: Extract<OperationalNotificationStatus, "sent" | "failed" | "abandoned">;
  providerStatus: string | null;
  sentAt: string | null;
}

/** Mirrors the future finish_operational_notification_event() SQL
 *  function's own validation. status is deliberately restricted to the
 *  three terminal-from-claimed values — "claimed" and "suppressed" are
 *  never valid arguments here: "claimed" is the RPC's own starting state
 *  (never a finish target) and "suppressed" rows are never claimed in the
 *  first place (see ClaimNotificationEventResult — a suppressed outcome
 *  never returns an eventId to finalize). */
export function isFinishNotificationEventInputValid(input: FinishNotificationEventInput): boolean {
  if (!input.eventId || input.eventId.length === 0) return false;
  if (input.status !== "sent" && input.status !== "failed" && input.status !== "abandoned") return false;
  if (input.providerStatus !== null && !ALLOWED_PROVIDER_STATUSES.has(input.providerStatus)) return false;
  if (input.status === "sent" && !input.sentAt) return false;
  return true;
}

/** Narrow interface the real route/orchestrator will depend on (see a
 *  future createSupabaseOperationalNotificationLedger implementation,
 *  not part of this sprint) — every operation goes through a
 *  SECURITY DEFINER RPC that re-checks automation_identities membership
 *  itself, never a direct table INSERT/UPDATE/SELECT. Mirrors
 *  RunHistoryWriter's own shape and safety contract exactly. */
export interface OperationalNotificationLedger {
  claim(input: ClaimNotificationEventInput): Promise<ClaimNotificationEventResult>;
  finish(input: FinishNotificationEventInput): Promise<{ ok: boolean }>;
}

export function isNonNegativeAttemptCount(value: number | null | undefined): boolean {
  return isNonNegativeFiniteInteger(value);
}
