import { supabase } from "@/lib/supabaseClient";
import type { Alert } from "@/types/alert";

const SELECT_FIELDS =
  "id, slug, category, severity, title, place, starts_at, ends_at, change, action, source_name, source_url, source_id, published_at, updated_at";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): Alert {
  return {
    id: String(row.id),
    slug: row.slug,
    category: row.category,
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

export async function getSupabaseAlerts(): Promise<Alert[]> {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("alerts")
      .select(SELECT_FIELDS)
      .eq("status", "published")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Alertownik] Błąd Supabase:", error.message);
      return [];
    }

    return (data ?? []).map(mapRow);
  } catch (err) {
    console.error("[Alertownik] Nie udało się pobrać alertów z bazy danych:", err);
    return [];
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
