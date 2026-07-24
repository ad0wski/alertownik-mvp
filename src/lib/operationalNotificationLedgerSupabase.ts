import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OperationalNotificationLedger,
  ClaimNotificationEventInput,
  ClaimNotificationEventResult,
  FinishNotificationEventInput,
} from "@/lib/operationalNotificationLedger";

// Sprint 166G-1 — the first real, RPC-backed implementation of
// OperationalNotificationLedger, targeting
// docs/sql/PROPOSED_SPRINT_166F_OPERATIONAL_NOTIFICATION_LEDGER_V1.sql
// (live in alertownik-preview only; not yet applied to Production). Mirrors
// createSupabaseScheduledWriterHistory (scheduledWriterHistory.ts) exactly:
// .rpc() only, never .from(table).insert()/.update()/.select() directly —
// both functions are SECURITY DEFINER and re-check automation_identities
// membership internally, so this file never needs (and is never granted)
// direct table access. Never constructs or accepts a service_role client —
// `client` here is always the same signed-in scheduled-writer session
// already used for run-history, since the ledger RPCs check auth.uid()
// against the exact same automation_identities table. Never logs its
// input, the raw RPC error, or any row it reads back.

/** claim() throws a generic Error (no message detail, no cause) on any
 *  RPC-level error or a missing/malformed result row — this interface has
 *  no "fail_closed" result variant, so an unexpected failure is realized
 *  as a thrown exception, exactly like this codebase's other
 *  "raise for anything unrecognized, never guess" conventions (see
 *  docs/SPRINT_166F_OPERATIONAL_ALERT_LEDGER_AUDIT_AND_DESIGN_V1.md §H.6).
 *  Callers (operationalNotificationOrchestrator.ts's
 *  attemptOperationalNotification) are responsible for catching this and
 *  never propagating it to the writer's own response. */
function toClaimResult(row: { claimed: boolean; event_id: string | null; suppressed_reason: string | null }): ClaimNotificationEventResult {
  if (row.claimed && row.event_id) {
    return { claimed: true, eventId: row.event_id };
  }
  if (row.suppressed_reason === "suppress_cooldown" || row.suppressed_reason === "suppress_duplicate") {
    return { claimed: false, suppressedReason: row.suppressed_reason };
  }
  throw new Error("operational_notification_claim_unrecognized_result");
}

export function createSupabaseOperationalNotificationLedger(client: SupabaseClient): OperationalNotificationLedger {
  return {
    async claim(input: ClaimNotificationEventInput): Promise<ClaimNotificationEventResult> {
      const { data, error } = await client.rpc("claim_operational_notification_event", {
        p_environment_tag: input.environmentTag,
        p_channel: input.channel,
        p_event_type: input.eventType,
        p_severity: input.severity,
        p_fingerprint: input.fingerprint,
        p_scheduled_writer_run_id: input.scheduledWriterRunId,
        p_source_id: input.sourceId,
        p_safe_summary: input.safeSummary,
        p_stale_claim_after_seconds: input.staleClaimAfterSeconds,
      });
      if (error || !Array.isArray(data) || data.length === 0) {
        throw new Error("operational_notification_claim_failed");
      }
      return toClaimResult(data[0]);
    },
    async finish(input: FinishNotificationEventInput): Promise<{ ok: boolean }> {
      const { data, error } = await client.rpc("finish_operational_notification_event", {
        p_id: input.eventId,
        p_status: input.status,
        p_provider_status: input.providerStatus,
        p_sent_at: input.sentAt,
      });
      // Mirrors closeRun's own convention (scheduledWriterHistory.ts):
      // an RPC-level error collapses to { ok: false }, never thrown — a
      // genuine network-level throw from client.rpc() itself still
      // propagates naturally, uncaught here.
      return { ok: !error && data === true };
    },
  };
}
