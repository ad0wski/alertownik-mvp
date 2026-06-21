import { supabase } from "./supabaseClient";
import type { WasteScheduleItem, WasteType } from "@/types/wasteSchedule";

// Read-only access to the proposed `waste_schedule_items` table (Sprint 80,
// waste_type list revised Sprint 81 — see
// docs/supabase_waste_schedule_items.sql). That migration is NOT applied
// automatically — this module detects a missing table and returns a calm,
// explanatory result instead of throwing, so the public `/odpady` page (and
// the admin dashboard's status card) keep working whether or not the
// migration has been run yet. Same pattern as
// src/lib/supabaseCandidateWrites.ts (Sprint 78).
//
// Deliberately read-only: there is no insert/update/delete function here.
// Unlike the read path, an admin write/entry UI is gated on the table
// actually existing — see Decisions.md (Sprint 81) for why.

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
