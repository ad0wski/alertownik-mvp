import type { AutomationErrorCategory, AutomationSeverity } from "@/lib/automationAlerting";
import {
  decideNotificationPolicy,
  buildNotificationEventDetails,
  buildOperationalNotificationFingerprint,
  type NotificationDecision,
  type OperationalNotificationEventType,
} from "@/lib/operationalNotificationPolicy";
import {
  isSafeSummaryValid,
  SAFE_SUMMARY_MAX_LENGTH,
  type OperationalNotificationLedger,
  type ClaimNotificationEventResult,
} from "@/lib/operationalNotificationLedger";
import type { NotificationAdapter, NotificationSendResult } from "@/lib/notificationAdapter";
import { AUTOMATION_ERROR_CATEGORY_LABELS_PL } from "@/lib/automationErrorClassifier";

// Sprint 166F-1 — pure orchestration layer describing the FUTURE flow
// (evaluate → fingerprint → safe content → claim → adapter → finalize),
// none of it wired into the scheduled writer this sprint. Every function
// here takes its collaborators (ledger, adapter) as injected interfaces —
// never constructs a real Supabase client or a real Resend client itself.
// Tests use fakes/mocks exclusively (see
// tests/e2e/operationalNotificationOrchestrator.spec.ts) — zero real
// network call, zero real RPC, zero real Resend connection, matching
// every rule this sprint was scoped under.

export interface EvaluateEligibilityInput {
  category: AutomationErrorCategory;
  attemptsMade: number;
  isAbandonedRun: boolean;
  lastAlertSentAt: string | null;
  now?: Date;
  cooldownMs?: number;
}

export interface EligibilityResult {
  decision: NotificationDecision;
  severity: AutomationSeverity;
  eventType: OperationalNotificationEventType;
}

/** Step 1 — "does this event qualify for a notification". Pure
 *  composition of the already-tested policy + classifier builders; adds
 *  no new decision logic of its own. */
export function evaluateNotificationEligibility(input: EvaluateEligibilityInput): EligibilityResult {
  const details = buildNotificationEventDetails(input.category, input.attemptsMade, input.isAbandonedRun);
  const decision = decideNotificationPolicy({
    category: input.category,
    retry: details.retry,
    isAbandonedRun: input.isAbandonedRun,
    lastAlertSentAt: input.lastAlertSentAt,
    now: input.now,
    cooldownMs: input.cooldownMs,
  });
  return { decision, severity: details.severity, eventType: details.eventType };
}

export interface BuildSafeSummaryInput {
  eventType: OperationalNotificationEventType;
  sourceName: string | null;
  attemptsMade: number;
  maxAttemptsPerRun: number;
}

/** Step 3 — "build safe notification content". Only ever concatenates
 *  closed-vocabulary Polish labels (AUTOMATION_ERROR_CATEGORY_LABELS_PL,
 *  reused rather than re-declared), a source NAME (already public,
 *  admin-visible elsewhere — never a URL), and counts — mirrors
 *  write-candidates' own `${sourcesFailed}/${sourcesChecked} sources
 *  failed` convention. Never accepts or forwards a raw exception message,
 *  stack trace, or provider response. Truncated defensively to
 *  SAFE_SUMMARY_MAX_LENGTH even though no caller-controlled input here
 *  could realistically exceed it (source names are short, labels are
 *  fixed) — belt-and-suspenders against the ledger's own length check. */
export function buildSafeSummary(input: BuildSafeSummaryInput): string {
  // eventType keys that don't correspond to an AutomationErrorCategory
  // label 1:1 get their own short, fixed Polish phrase instead.
  const categoryLabel =
    input.eventType === "abandoned_run"
      ? "porzucone uruchomienie"
      : AUTOMATION_ERROR_CATEGORY_LABELS_PL[input.eventType as keyof typeof AUTOMATION_ERROR_CATEGORY_LABELS_PL] ??
        "nieoczekiwany błąd";

  const parts = [categoryLabel];
  if (input.sourceName) parts.push(`źródło: ${input.sourceName}`);
  if (input.attemptsMade > 0) parts.push(`próby: ${input.attemptsMade}/${input.maxAttemptsPerRun}`);

  const summary = parts.join(" — ");
  return summary.length > SAFE_SUMMARY_MAX_LENGTH ? summary.slice(0, SAFE_SUMMARY_MAX_LENGTH) : summary;
}

export interface ClaimEventForSendingInput {
  environmentTag: string;
  scopeKey: string;
  eventType: OperationalNotificationEventType;
  severity: AutomationSeverity;
  scheduledWriterRunId: string | null;
  sourceId: string | null;
  safeSummary: string | null;
  // No cooldownSeconds — the ledger's cooldown is a fixed, non-writer-
  // configurable constant (NOTIFICATION_COOLDOWN_SECONDS). See
  // operationalNotificationLedger.ts for the full rationale.
  staleClaimAfterSeconds?: number;
}

/** Step 4 — "claim the persistent event before sending". Builds the
 *  fingerprint and delegates entirely to the injected ledger's atomic
 *  claim() — this function performs no I/O of its own and never
 *  constructs a ledger implementation. Returns null for safeSummary if
 *  the caller passed one exceeding the length cap, rather than silently
 *  truncating at this layer (buildSafeSummary already guarantees the cap
 *  — a violation here would indicate a caller bypassed it, which should
 *  fail loudly in tests, not be silently repaired). */
export async function claimEventForSending(
  ledger: OperationalNotificationLedger,
  input: ClaimEventForSendingInput
): Promise<ClaimNotificationEventResult> {
  if (!isSafeSummaryValid(input.safeSummary)) {
    throw new Error("safeSummary exceeds the maximum allowed length");
  }
  const fingerprint = buildOperationalNotificationFingerprint(input.environmentTag, input.scopeKey, input.eventType);
  return ledger.claim({
    environmentTag: input.environmentTag,
    channel: "email",
    eventType: input.eventType,
    severity: input.severity,
    fingerprint,
    scheduledWriterRunId: input.scheduledWriterRunId,
    sourceId: input.sourceId,
    safeSummary: input.safeSummary,
    staleClaimAfterSeconds: input.staleClaimAfterSeconds ?? 300,
  });
}

/** Step 5 — "the future adapter call". Deliberately the thinnest possible
 *  wrapper: takes an already-constructed NotificationAdapter (this
 *  sprint's tests always inject a fake — see notificationAdapter.ts's own
 *  createNoopNotificationAdapter/createMisconfiguredNotificationAdapter,
 *  neither of which performs I/O) and an already-built notification —
 *  this function does not decide WHETHER to send (that's step 1/4), only
 *  performs the call once a caller has already decided to. No route in
 *  this sprint calls this with a real Resend-backed adapter. */
export async function sendViaAdapter(
  adapter: NotificationAdapter,
  notification: { subject: string; textBody: string; fingerprint: string }
): Promise<NotificationSendResult> {
  return adapter.send(notification);
}

export interface FinalizeSendResultInput {
  eventId: string;
  sendResult: NotificationSendResult;
}

/** Step 6 — "record the outcome". Maps NotificationSendResult's own
 *  closed vocabulary onto the ledger's finish() status/providerStatus —
 *  never invents a new mapping the ledger's own closed sets don't already
 *  allow. "disabled" and "no_adapter_configured" both map to "abandoned"
 *  (the send never genuinely happened) rather than "failed" — an
 *  admin reading the ledger should never confuse "the feature is off" for
 *  "we tried to send and the provider rejected it". */
export async function finalizeOperationalNotificationEvent(
  ledger: OperationalNotificationLedger,
  input: FinalizeSendResultInput
): Promise<{ ok: boolean }> {
  const { status, providerStatus, sentAt } = mapSendResultToFinish(input.sendResult);
  return ledger.finish({ eventId: input.eventId, status, providerStatus, sentAt });
}

function mapSendResultToFinish(sendResult: NotificationSendResult): {
  status: "sent" | "failed" | "abandoned";
  providerStatus: string | null;
  sentAt: string | null;
} {
  switch (sendResult.status) {
    case "sent":
      return { status: "sent", providerStatus: "sent", sentAt: new Date().toISOString() };
    case "send_failed":
      return { status: "failed", providerStatus: null, sentAt: null };
    case "disabled":
    case "no_adapter_configured":
    case "suppressed_by_cooldown":
      return { status: "abandoned", providerStatus: null, sentAt: null };
    default:
      return { status: "abandoned", providerStatus: null, sentAt: null };
  }
}
