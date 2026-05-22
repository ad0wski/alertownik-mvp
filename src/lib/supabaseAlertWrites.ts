import { supabase } from "./supabaseClient";
import type { AlertCategory } from "@/types/alert";

// The Supabase table uses "announcement" where the app uses "municipal"
function toDbCategory(category: AlertCategory): string {
  return category === "municipal" ? "announcement" : category;
}

export interface AlertFormData {
  slug: string;
  category: AlertCategory;
  severity: string;
  title: string;
  place: string;
  startsAt: string;
  endsAt?: string;
  change: string;
  action: string;
  sourceName: string;
  sourceUrl?: string;
}

export interface SaveResult {
  ok: boolean;
  error?: string;
}

export async function saveAlertDraftToSupabase(
  alert: AlertFormData
): Promise<SaveResult> {
  if (!supabase) {
    return { ok: false, error: "Brak połączenia z Supabase." };
  }

  const { error } = await supabase
    .from("alerts")
    .upsert(
      {
        slug: alert.slug,
        category: toDbCategory(alert.category),
        severity: alert.severity,
        title: alert.title,
        place: alert.place,
        starts_at: alert.startsAt,
        ends_at: alert.endsAt || null,
        change: alert.change,
        action: alert.action,
        source_name: alert.sourceName,
        source_url: alert.sourceUrl || null,
        status: "draft",
      },
      { onConflict: "slug" }
    );

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function publishAlertToSupabase(
  alert: AlertFormData
): Promise<SaveResult> {
  if (!supabase) {
    return { ok: false, error: "Brak połączenia z Supabase." };
  }

  const { error } = await supabase
    .from("alerts")
    .upsert(
      {
        slug: alert.slug,
        category: toDbCategory(alert.category),
        severity: alert.severity,
        title: alert.title,
        place: alert.place,
        starts_at: alert.startsAt,
        ends_at: alert.endsAt || null,
        change: alert.change,
        action: alert.action,
        source_name: alert.sourceName,
        source_url: alert.sourceUrl || null,
        status: "published",
        published_at: new Date().toISOString(),
      },
      { onConflict: "slug" }
    );

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
