import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RpcCall } from "@/lib/push/pushApi";
import { createRateLimiter } from "@/lib/push/pushApi";
import type { PushAlertRow } from "@/lib/push/pushPolicy";

// LR-8A — real dependencies for the push routes. SERVER-ONLY.

/** Minimum length of PUSH_GATEWAY_TOKEN (the SQL functions check ≥ 32 too). */
export const MIN_GATEWAY_TOKEN_LENGTH = 32;

/**
 * LR-8A.1 — wraps the two SECURITY DEFINER functions so every call carries
 * the server-only gateway token. Without the token the functions refuse
 * (42501), so the public anon key alone cannot subscribe or unsubscribe;
 * the token never reaches the browser (no NEXT_PUBLIC_ prefix, used only
 * here, in route handlers).
 */
export function createGatewayRpc(client: SupabaseClient, token: string): RpcCall {
  return async (fn, args) => {
    const { error } = await client.rpc(fn, { p_token: token, ...args });
    return { error: error ? { code: error.code, message: error.message } : null };
  };
}

/** Anon-key client + gateway token, or null when either is not configured
 *  (the route then answers 503 — fail closed). */
export function gatewayPushRpc(env: Record<string, string | undefined> = process.env): RpcCall | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const token = env.PUSH_GATEWAY_TOKEN;
  if (!url || !key || !token || token.length < MIN_GATEWAY_TOKEN_LENGTH) return null;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return createGatewayRpc(client, token);
}

/** 20 subscribe/unsubscribe calls per 10 minutes per IP and instance. The
 *  SQL function adds a global ceiling of 60 new subscriptions per minute. */
export const publicPushRateLimit = createRateLimiter(20, 10 * 60 * 1000);

export async function loadAlertForPush(client: SupabaseClient, slug: string): Promise<PushAlertRow | null> {
  const { data, error } = await client
    .from("alerts")
    .select("id, slug, title, place, category, status, starts_at, ends_at")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error("alert_read_failed");
  return (data as PushAlertRow | null) ?? null;
}
