import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RpcCall } from "@/lib/push/pushApi";
import { createRateLimiter } from "@/lib/push/pushApi";
import type { PushAlertRow } from "@/lib/push/pushPolicy";

// LR-8A — real dependencies for the push routes. SERVER-ONLY.

/** Anon-key client used ONLY to call the two SECURITY DEFINER functions.
 *  The anon role has no grant on the push tables themselves. */
export function anonPushRpc(): RpcCall | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return async (fn, args) => {
    const { error } = await client.rpc(fn, args);
    return { error };
  };
}

/** 20 subscribe/unsubscribe calls per 10 minutes per IP and instance. */
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
