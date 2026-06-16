import { supabase } from "@/lib/supabaseClient";
import type { Alert, AlertCategory } from "@/types/alert";

const SELECT_FIELDS =
  "id, slug, category, severity, title, place, starts_at, ends_at, change, action, source_name, source_url, source_id, published_at, updated_at";

// The Supabase table stores "announcement" where the app uses "municipal"
// (same mapping as getAdminSupabaseAlerts.ts — must stay in sync).
function toAppCategory(dbCategory: string): AlertCategory {
  if (dbCategory === "announcement") return "municipal";
  return dbCategory as AlertCategory;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): Alert {
  return {
    id: String(row.id),
    slug: row.slug,
    category: toAppCategory(row.category),
    severity: row.severity,
    title: row.title,
    place: row.place,
    startsAt: row.starts_at,
    endsAt: row.ends_at ?? undefined,
    change: row.change,
    action: row.action,
    sourceName: row.source_name,
    sourceUrl: row.source_url ?? undefined,
    sourceId: row.source_id ?? null,
    publishedAt: row.published_at ?? null,
    updatedAt: row.updated_at ?? undefined,
  };
}

export interface SupabaseAlertsResult {
  alerts: Alert[];
  error: string | null;
}

export async function getSupabaseAlerts(): Promise<SupabaseAlertsResult> {
  if (!supabase) {
    return { alerts: [], error: "Brak połączenia z Supabase." };
  }

  try {
    const { data, error } = await supabase
      .from("alerts")
      .select(SELECT_FIELDS)
      .eq("status", "published")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Alertownik] Błąd Supabase:", error.message);
      return { alerts: [], error: error.message };
    }

    return { alerts: (data ?? []).map(mapRow), error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Nieznany błąd.";
    console.error("[Alertownik] Nie udało się pobrać alertów z bazy danych:", err);
    return { alerts: [], error: msg };
  }
}

export async function getSupabaseAlertBySlug(slug: string): Promise<Alert | null> {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("alerts")
      .select(SELECT_FIELDS)
      .eq("status", "published")
      .eq("slug", slug)
      .single();

    if (error || !data) return null;

    return mapRow(data);
  } catch {
    return null;
  }
}
