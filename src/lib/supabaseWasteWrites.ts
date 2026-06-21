import { supabase } from "./supabaseClient";
import type { WasteScheduleItem, WasteScheduleItemInput, WasteType } from "@/types/wasteSchedule";

// Access to the `waste_schedule_items` table (Sprint 80, waste_type list
// revised Sprint 81, RLS-limitation documented Sprint 82, migration
// actually applied + write functions added Sprint 83 — see
// docs/supabase_waste_schedule_items.sql). The missing-table detection
// below is kept even though the table now exists (confirmed live Sprint
// 83) — same defensive pattern as src/lib/supabaseCandidateWrites.ts
// (Sprint 78), cheap insurance against a future environment where the
// migration genuinely hasn't run yet (e.g. a fresh Supabase project).

interface SupabaseErrorLike {
  code?: string;
  message?: string;
}

function isMissingTableError(error: SupabaseErrorLike | null): boolean {
  if (!error) return false;
  // Postgres: 42P01 = undefined_table. PostgREST: PGRST205 = table not in
  // its schema cache (the common case right after a migration hasn't run
  // yet, or ran but the cache wasn't reloaded).
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return /relation .* does not exist|could not find the table/i.test(error.message ?? "");
}

export interface WasteScheduleResult {
  items: WasteScheduleItem[];
  error?: string;
  tableMissing?: boolean;
}

function rowToWasteScheduleItem(row: Record<string, unknown>): WasteScheduleItem {
  return {
    id: row.id as string,
    locality: row.locality as string,
    areaName: (row.area_name as string) || undefined,
    streetGroup: (row.street_group as string) || undefined,
    wasteType: row.waste_type as WasteType,
    collectionDate: row.collection_date as string,
    sourceName: (row.source_name as string) || undefined,
    sourceUrl: (row.source_url as string) || undefined,
    notes: (row.notes as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// Upcoming items only (collection_date >= today), soonest first — the only
// query shape the public page needs. `limit` caps how many future dates are
// shown at once; locality filtering happens client-side once there's real
// data to filter (no locality picker exists yet — see Ideas.md).
export async function getUpcomingWasteScheduleItems(limit = 50): Promise<WasteScheduleResult> {
  if (!supabase) return { items: [], error: "Brak połączenia z Supabase." };

  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("waste_schedule_items")
    .select("*")
    .gte("collection_date", today)
    .order("collection_date", { ascending: true })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) {
      return { items: [], tableMissing: true };
    }
    console.error("[Alertownik] getUpcomingWasteScheduleItems error:", error.message);
    return { items: [], error: error.message };
  }

  return { items: (data ?? []).map(rowToWasteScheduleItem) };
}

// ── Admin (Sprint 83) ────────────────────────────────────────────────────────

// All items, past and future — the admin list needs to show (and flag)
// outdated entries too, unlike the public "upcoming only" view above.
export async function getAllWasteScheduleItems(limit = 500): Promise<WasteScheduleResult> {
  if (!supabase) return { items: [], error: "Brak połączenia z Supabase." };

  const { data, error } = await supabase
    .from("waste_schedule_items")
    .select("*")
    .order("collection_date", { ascending: true })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) {
      return { items: [], tableMissing: true };
    }
    console.error("[Alertownik] getAllWasteScheduleItems error:", error.message);
    return { items: [], error: error.message };
  }

  return { items: (data ?? []).map(rowToWasteScheduleItem) };
}

export interface WasteScheduleSaveResult {
  ok: boolean;
  error?: string;
  tableMissing?: boolean;
}

function toRow(input: WasteScheduleItemInput) {
  return {
    locality: input.locality.trim(),
    area_name: input.areaName?.trim() || null,
    street_group: input.streetGroup?.trim() || null,
    waste_type: input.wasteType,
    collection_date: input.collectionDate,
    source_name: input.sourceName?.trim() || null,
    source_url: input.sourceUrl?.trim() || null,
    notes: input.notes?.trim() || null,
  };
}

// Single insert reuses the bulk path with a one-element array — keeps the
// add form and the JSON import on exactly one insert code path, the same
// "don't let two entry points drift apart" reasoning as
// validateWasteScheduleInput (src/lib/wasteSchedule.ts).
export async function createWasteScheduleItems(
  inputs: WasteScheduleItemInput[]
): Promise<WasteScheduleSaveResult> {
  if (!supabase) return { ok: false, error: "Brak połączenia z Supabase." };
  if (inputs.length === 0) return { ok: false, error: "Brak wierszy do zapisania." };

  const { error } = await supabase
    .from("waste_schedule_items")
    .insert(inputs.map(toRow));

  if (error) {
    if (isMissingTableError(error)) {
      return { ok: false, tableMissing: true, error: "Tabela nie istnieje." };
    }
    console.error("[Alertownik] createWasteScheduleItems error:", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function updateWasteScheduleItem(
  id: string,
  input: WasteScheduleItemInput
): Promise<WasteScheduleSaveResult> {
  if (!supabase) return { ok: false, error: "Brak połączenia z Supabase." };

  const { error } = await supabase
    .from("waste_schedule_items")
    .update(toRow(input))
    .eq("id", id);

  if (error) {
    console.error("[Alertownik] updateWasteScheduleItem error:", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function deleteWasteScheduleItem(id: string): Promise<WasteScheduleSaveResult> {
  if (!supabase) return { ok: false, error: "Brak połączenia z Supabase." };

  const { error } = await supabase
    .from("waste_schedule_items")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[Alertownik] deleteWasteScheduleItem error:", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
