import { handleUnsubscribe } from "@/lib/push/pushApi";
import { getPushServerConfig } from "@/lib/push/pushConfig";
import { anonPushRpc, publicPushRateLimit } from "@/lib/push/pushRuntime";

// LR-8A — POST only. Works even when the kill switch is off, so a visitor
// can always remove their subscription.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleUnsubscribe(req, {
    config: getPushServerConfig(),
    rpc: anonPushRpc(),
    allowRequest: publicPushRateLimit,
  });
}
