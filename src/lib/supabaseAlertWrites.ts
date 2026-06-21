import { supabase } from "./supabaseClient";
import type { AlertCategory } from "@/types/alert";
import { normalizeAlertSeverity } from "./normalizeAlert";

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
  sourceId?: string | null;
}

export interface SaveResult {
  ok: boolean;
  error?: string;
  /** id of the inserted/updated alerts row — used by Builder to mark a
   *  source candidate (Sprint 78) as converted with a real alert reference. */
  id?: string;
}

export async function saveAlertDraftToSupabase(
  alert: AlertFormData
): Promise<SaveResult> {
  if (!supabase) {
    return { ok: false, error: "Brak połączenia z Supabase." };
  }

  const severity = normalizeAlertSeverity(alert.severity);
  if (!severity) {
    return { ok: false, error: "Nieprawidłowy poziom ważności alertu." };
  }

  const { data, error } = await supabase
    .from("alerts")
    .upsert(
      {
        slug: alert.slug,
        category: toDbCategory(alert.category),
        severity,
        title: alert.title,
        place: alert.place,
        starts_at: alert.startsAt,
        ends_at: alert.endsAt || null,
        change: alert.change,
        action: alert.action,
        source_name: alert.sourceName,
        source_url: alert.sourceUrl || null,
        source_id: alert.sourceId || null,
        status: "draft",
      },
      { onConflict: "slug" }
    )
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, id: (data?.id as string) || undefined };
}

export async function publishAlertToSupabase(
  alert: AlertFormData
): Promise<SaveResult> {
  if (!supabase) {
    return { ok: false, error: "Brak połączenia z Supabase." };
  }

  const severity = normalizeAlertSeverity(alert.severity);
  if (!severity) {
    return { ok: false, error: "Nieprawidłowy poziom ważności alertu." };
  }

  const { data, error } = await supabase
    .from("alerts")
    .upsert(
      {
        slug: alert.slug,
        category: toDbCategory(alert.category),
        severity,
        title: alert.title,
        place: alert.place,
        starts_at: alert.startsAt,
        ends_at: alert.endsAt || null,
        change: alert.change,
        action: alert.action,
        source_name: alert.sourceName,
        source_url: alert.sourceUrl || null,
        source_id: alert.sourceId || null,
        status: "published",
        published_at: new Date().toISOString(),
      },
      { onConflict: "slug" }
    )
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, id: (data?.id as string) || undefined };
}

export async function publishSupabaseAlert(slug: string): Promise<SaveResult> {
  if (!supabase) return { ok: false, error: "Brak połączenia z Supabase." };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("alerts")
    .update({ status: "published", published_at: now, updated_at: now })
    .eq("slug", slug);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function archiveSupabaseAlert(slug: string): Promise<SaveResult> {
  if (!supabase) return { ok: false, error: "Brak połączenia z Supabase." };

  const { error } = await supabase
    .from("alerts")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("slug", slug);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function restoreSupabaseAlertAsDraft(slug: string): Promise<SaveResult> {
  if (!supabase) return { ok: false, error: "Brak połączenia z Supabase." };

  const { error } = await supabase
    .from("alerts")
    .update({ status: "draft", updated_at: new Date().toISOString() })
    .eq("slug", slug);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function updateSupabaseAlert(
  id: string,
  alert: AlertFormData
): Promise<SaveResult> {
  if (!supabase) {
    return { ok: false, error: "Brak połączenia z Supabase." };
  }

  const severity = normalizeAlertSeverity(alert.severity);
  if (!severity) {
    return { ok: false, error: "Nieprawidłowy poziom ważności alertu." };
  }

  const { error } = await supabase
    .from("alerts")
    .update({
      slug: alert.slug,
      category: toDbCategory(alert.category),
      severity,
      title: alert.title,
      place: alert.place,
      starts_at: alert.startsAt,
      ends_at: alert.endsAt || null,
      change: alert.change,
      action: alert.action,
      source_name: alert.sourceName,
      source_url: alert.sourceUrl || null,
      source_id: alert.sourceId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
