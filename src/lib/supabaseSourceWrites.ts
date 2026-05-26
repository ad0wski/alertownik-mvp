import { supabase } from "./supabaseClient";
import type { AlertSource, AlertSourceInput } from "@/types/alertSource";
import type { AlertCategory } from "@/types/alert";

export interface SourcesResult {
  sources: AlertSource[];
  error?: string;
}

export interface SaveResult {
  ok: boolean;
  error?: string;
}

function rowToAlertSource(row: Record<string, unknown>): AlertSource {
  return {
    id: row.id as string,
    name: row.name as string,
    url: row.url as string,
    category: row.category as AlertCategory,
    sourceType: row.source_type as AlertSource["sourceType"],
    isActive: row.is_active as boolean,
    notes: (row.notes as string) || undefined,
    lastCheckedAt: (row.last_checked_at as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function getAlertSources(): Promise<SourcesResult> {
  if (!supabase) {
    return { sources: [], error: "Brak połączenia z Supabase." };
  }

  const { data, error } = await supabase
    .from("alert_sources")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Alertownik] getAlertSources error:", error.message);
    return { sources: [], error: error.message };
  }

  return { sources: (data ?? []).map(rowToAlertSource) };
}

export async function createAlertSource(input: AlertSourceInput): Promise<SaveResult> {
  if (!supabase) {
    return { ok: false, error: "Brak połączenia z Supabase." };
  }

  const { error } = await supabase.from("alert_sources").insert({
    name: input.name.trim(),
    url: input.url.trim(),
    category: input.category,
    source_type: input.sourceType,
    notes: input.notes?.trim() || null,
  });

  if (error) {
    console.error("[Alertownik] createAlertSource error:", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function updateAlertSource(
  id: string,
  input: AlertSourceInput
): Promise<SaveResult> {
  if (!supabase) {
    return { ok: false, error: "Brak połączenia z Supabase." };
  }

  const { error } = await supabase
    .from("alert_sources")
    .update({
      name: input.name.trim(),
      url: input.url.trim(),
      category: input.category,
      source_type: input.sourceType,
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("[Alertownik] updateAlertSource error:", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function deleteAlertSource(id: string): Promise<SaveResult> {
  if (!supabase) {
    return { ok: false, error: "Brak połączenia z Supabase." };
  }

  const { error } = await supabase
    .from("alert_sources")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[Alertownik] deleteAlertSource error:", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function toggleAlertSourceActive(
  id: string,
  isActive: boolean
): Promise<SaveResult> {
  if (!supabase) {
    return { ok: false, error: "Brak połączenia z Supabase." };
  }

  const { error } = await supabase
    .from("alert_sources")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("[Alertownik] toggleAlertSourceActive error:", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
