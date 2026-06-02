import { supabase } from "@/lib/supabaseClient";
import type { AlertCategory, AlertSeverity } from "@/types/alert";

export type AlertStatus = "draft" | "published" | "archived";

export interface AdminAlert {
  id: string;
  slug: string;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  place: string;
  startsAt: string;
  endsAt?: string;
  change: string;
  action: string;
  sourceName: string;
  sourceUrl?: string;
  sourceId?: string | null;
  status: AlertStatus;
  updatedAt: string;
}

export interface AdminAlertsResult {
  alerts: AdminAlert[];
  error: string | null;
}

const ADMIN_SELECT =
  "id, slug, category, severity, title, place, starts_at, ends_at, change, action, source_name, source_url, source_id, status, updated_at, created_at";

// The Supabase table stores "announcement" where the app uses "municipal"
function toAppCategory(dbCategory: string): AlertCategory {
  if (dbCategory === "announcement") return "municipal";
  return dbCategory as AlertCategory;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAdminRow(row: any): AdminAlert {
  return {
    id: String(row.id),
    slug: row.slug,
    category: toAppCategory(row.category),
    severity: row.severity as AlertSeverity,
    title: row.title,
    place: row.place,
    startsAt: row.starts_at,
    endsAt: row.ends_at ?? undefined,
    change: row.change,
    action: row.action,
    sourceName: row.source_name,
    sourceUrl: row.source_url ?? undefined,
    sourceId: row.source_id ?? null,
    status: row.status as AlertStatus,
    // fall back to created_at when updated_at is not set
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  };
}

export async function getAdminSupabaseAlerts(): Promise<AdminAlertsResult> {
  if (!supabase) {
    return { alerts: [], error: "Brak połączenia z Supabase." };
  }

  try {
    // Order by created_at — safe fallback that always exists in the alerts table
    const { data, error } = await supabase
      .from("alerts")
      .select(ADMIN_SELECT)
      .in("status", ["draft", "published", "archived"])
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Alertownik] Błąd pobierania alertów (admin):", error.message);
      return { alerts: [], error: error.message };
    }

    return { alerts: (data ?? []).map(mapAdminRow), error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Nieznany błąd.";
    console.error("[Alertownik] Nie udało się pobrać alertów z bazy danych:", err);
    return { alerts: [], error: msg };
  }
}
