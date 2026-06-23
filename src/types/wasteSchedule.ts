// Mirrors docs/supabase_waste_schedule_items.sql (proposed Sprint 80,
// waste_type list revised Sprint 81, migration applied Sprint 83 — see
// src/lib/supabaseWasteWrites.ts for the missing-table fallback the app
// still keeps in case a future environment hasn't run it yet).

export type WasteType =
  | "mixed"
  | "paper"
  | "plastics_metals"
  | "glass"
  | "bio"
  | "bulky"
  | "other";

export interface WasteScheduleItem {
  id: string;
  locality: string;
  areaName?: string;
  streetGroup?: string;
  wasteType: WasteType;
  collectionDate: string; // ISO date, e.g. "2026-07-03"
  sourceName?: string;
  sourceUrl?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// Admin create/update input — same shape minus the server-assigned fields.
export interface WasteScheduleItemInput {
  locality: string;
  areaName?: string;
  streetGroup?: string;
  wasteType: WasteType;
  collectionDate: string;
  sourceName?: string;
  sourceUrl?: string;
  notes?: string;
}
