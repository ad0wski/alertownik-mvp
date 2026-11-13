import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { SELECT_FIELDS, mapRow } from "@/lib/getSupabaseAlerts";
import { sampleAlerts } from "@/data/sampleAlerts";
import type { Alert } from "@/types/alert";

// FINAL-2 — server-side read of ONE public alert for /alerts/[slug]:
// metadata (title/description/Open Graph), a real HTTP 404 for missing or
// archived alerts, and server-rendered content. Same access as the public
// list: anon key, RLS lets through status = 'published' only.
//
// cache() dedupes the read between generateMetadata and the page itself.

export type PublicAlertLookup =
  | { kind: "found"; alert: Alert }
  | { kind: "not_found" }
  | { kind: "unavailable" }; // Supabase not configured / unreachable — never a false 404

export const getPublicAlertServer = cache(async (slug: string): Promise<PublicAlertLookup> => {
  // Slugs are lowercase URL segments; anything else cannot exist.
  if (!/^[a-z0-9][a-z0-9-]{0,159}$/.test(slug)) return { kind: "not_found" };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (url && key) {
    try {
      const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await client
        .from("alerts")
        .select(SELECT_FIELDS)
        .eq("status", "published")
        .eq("slug", slug)
        .maybeSingle();
      if (!error && data) return { kind: "found", alert: mapRow(data) };
      if (error) return { kind: "unavailable" };
    } catch {
      return { kind: "unavailable" };
    }
  }

  // Local development convenience only (no .env.local yet / sample slugs in
  // e2e tests). Never in production: a guessed sample slug must not render
  // fabricated content as a real alert.
  if (process.env.NODE_ENV !== "production") {
    const sample = sampleAlerts.find((a) => a.slug === slug);
    if (sample) return { kind: "found", alert: sample };
  }
  if (!url || !key) return { kind: "unavailable" };
  return { kind: "not_found" };
});
