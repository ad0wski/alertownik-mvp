import type { SupabaseClient } from "@supabase/supabase-js";
import { buildWebPushRequest, type PushHttpRequest, type VapidKeys } from "@/lib/push/webPushRequest";
import {
  buildPushPayload,
  evaluatePushEligibility,
  isAllowedPushEndpoint,
  type PushAlertRow,
  type PushEligibility,
} from "@/lib/push/pushPolicy";

// LR-8A — fan-out of one manually published alert to matching
// subscriptions. Side effect only: the alert is already published by the
// time this runs, and nothing here can change that.
//
// Idempotency: a delivery row (alert_id, subscription_id) is CLAIMED with
// a unique-constraint insert BEFORE anything is sent. A retry, a double
// click or two admin tabs racing all hit the same constraint, so each
// subscription gets at most one notification per alert. The trade-off is
// deliberate: a send that failed after its claim is not retried
// automatically (at-most-once beats a duplicate push).

export interface PushSubscriptionRecord {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  locality: string;
}

export type DeliveryStatus = "sent" | "failed" | "gone";

export interface PushStore {
  listEnabledSubscriptions(localities: string[]): Promise<PushSubscriptionRecord[]>;
  /** true = newly claimed (may send); false = already claimed earlier. */
  claimDelivery(alertId: string, subscriptionId: string): Promise<boolean>;
  finishDelivery(alertId: string, subscriptionId: string, status: DeliveryStatus, httpStatus: number | null): Promise<void>;
  disableSubscription(subscriptionId: string, reason: "gone"): Promise<void>;
}

export type PushTransport = (request: PushHttpRequest) => Promise<{ status: number }>;

export interface SendSummary {
  eligibility: PushEligibility;
  matched: number;
  sent: number;
  failed: number;
  gone: number;
  alreadyDelivered: number;
}

/** Hard cap per call: the pilot area is small; a bigger number means
 *  something is wrong and should be looked at, not blasted. */
export const MAX_SUBSCRIPTIONS_PER_SEND = 5000;
const CONCURRENCY = 8;

export async function sendAlertPush(
  alert: PushAlertRow,
  deps: { store: PushStore; transport: PushTransport; vapid: VapidKeys & { subject: string } }
): Promise<SendSummary> {
  const eligibility = evaluatePushEligibility(alert);
  const summary: SendSummary = { eligibility, matched: 0, sent: 0, failed: 0, gone: 0, alreadyDelivered: 0 };
  if (!eligibility.eligible) return summary;

  const subscriptions = (await deps.store.listEnabledSubscriptions(eligibility.localities))
    .filter((s) => eligibility.localities.includes(s.locality))
    .slice(0, MAX_SUBSCRIPTIONS_PER_SEND);
  summary.matched = subscriptions.length;
  const payload = JSON.stringify(buildPushPayload(alert));

  const queue = [...subscriptions];
  async function worker() {
    for (let sub = queue.shift(); sub; sub = queue.shift()) {
      let claimed: boolean;
      try {
        claimed = await deps.store.claimDelivery(alert.id, sub.id);
      } catch {
        // Could not record the claim → do not send (no unrecorded pushes).
        summary.failed++;
        continue;
      }
      if (!claimed) {
        summary.alreadyDelivered++;
        continue;
      }
      let status: DeliveryStatus = "failed";
      let httpStatus: number | null = null;
      try {
        // Re-checked at send time: a row could predate the SQL allowlist.
        if (!isAllowedPushEndpoint(sub.endpoint)) throw new Error("endpoint_not_allowed");
        const request = buildWebPushRequest(sub, payload, deps.vapid, { topic: alert.slug.slice(0, 32) });
        const res = await deps.transport(request);
        httpStatus = res.status;
        if (res.status >= 200 && res.status < 300) status = "sent";
        else if (res.status === 404 || res.status === 410) status = "gone";
      } catch {
        status = "failed";
      }
      if (status === "gone") {
        summary.gone++;
        await deps.store.disableSubscription(sub.id, "gone").catch(() => undefined);
      } else if (status === "sent") summary.sent++;
      else summary.failed++;
      await deps.store.finishDelivery(alert.id, sub.id, status, httpStatus).catch(() => undefined);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  return summary;
}

/** Real transport: no redirects (a redirect would leave the allowlisted
 *  push host), bounded time, response body ignored. */
export const fetchPushTransport: PushTransport = async (request) => {
  const res = await fetch(request.url, {
    method: "POST",
    headers: request.headers,
    body: new Uint8Array(request.body),
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  return { status: res.status };
};

/** Store backed by the admin's own RLS-scoped Supabase client (the same
 *  client requireAdminSession returns) — no service_role anywhere. */
export function supabasePushStore(client: SupabaseClient): PushStore {
  return {
    async listEnabledSubscriptions(localities) {
      const { data, error } = await client
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth, locality")
        .eq("enabled", true)
        .in("locality", localities)
        .limit(MAX_SUBSCRIPTIONS_PER_SEND);
      if (error) throw new Error("push_subscriptions_read_failed");
      return (data ?? []) as PushSubscriptionRecord[];
    },
    async claimDelivery(alertId, subscriptionId) {
      const { error } = await client
        .from("push_deliveries")
        .insert({ alert_id: alertId, subscription_id: subscriptionId, status: "claimed" });
      if (!error) return true;
      if (error.code === "23505") return false; // unique_violation — already claimed
      throw new Error("push_delivery_claim_failed");
    },
    async finishDelivery(alertId, subscriptionId, status, httpStatus) {
      await client
        .from("push_deliveries")
        .update({ status, http_status: httpStatus, updated_at: new Date().toISOString() })
        .eq("alert_id", alertId)
        .eq("subscription_id", subscriptionId);
    },
    async disableSubscription(subscriptionId, reason) {
      await client
        .from("push_subscriptions")
        .update({ enabled: false, disabled_reason: reason, disabled_at: new Date().toISOString() })
        .eq("id", subscriptionId);
    },
  };
}
