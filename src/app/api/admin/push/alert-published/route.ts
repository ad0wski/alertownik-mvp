import { requireAdminSession } from "@/lib/serverAuth";
import { handleAlertPublished } from "@/lib/push/pushApi";
import { getPushServerConfig } from "@/lib/push/pushConfig";
import { fetchPushTransport, supabasePushStore } from "@/lib/push/pushSender";
import { loadAlertForPush } from "@/lib/push/pushRuntime";

// LR-8A — called by Builder right after a successful MANUAL publish.
// Admin session required (bearer token + admin_profiles row); every read
// and write runs as that admin under RLS. Never called by auto-publish.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleAlertPublished(req, {
    config: getPushServerConfig(),
    requireAdmin: (r) => requireAdminSession(r),
    loadAlert: loadAlertForPush,
    storeFor: supabasePushStore,
    transport: fetchPushTransport,
  });
}
