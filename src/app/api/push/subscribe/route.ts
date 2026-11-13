import { handleSubscribe } from "@/lib/push/pushApi";
import { getPushServerConfig } from "@/lib/push/pushConfig";
import { gatewayPushRpc, publicPushRateLimit } from "@/lib/push/pushRuntime";

// LR-8A — POST only. No GET: subscriptions can never be listed from here.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleSubscribe(req, {
    config: getPushServerConfig(),
    rpc: gatewayPushRpc(),
    allowRequest: publicPushRateLimit,
  });
}
