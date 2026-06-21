// Presentation + validation helpers shared between the public components
// (WasteScheduleSection, NextCollectionCard — Sprint 82) and the admin
// workflow (/admin/waste — Sprint 83). Pure functions, no Supabase/React
// dependency, so they're directly unit-testable.

import type { WasteScheduleItem, WasteScheduleItemInput, WasteType } from "@/types/wasteSchedule";

export const WASTE_TYPES: WasteType[] = [
  "mixed", "paper", "plastics_metals", "glass", "bio", "bulky", "other",
];

// Sprint 83 aligned these with the brief's exact suggested wording
// ("tworzywa/metale", "gabaryty") and standard Polish harmonogram
// terminology — a small accuracy fix, not a schema change (these are
// labels only, the underlying `waste_type` DB values are unchanged).
export const WASTE_TYPE_LABELS: Record<WasteType, string> = {
  mixed: "Zmieszane",
  paper: "Papier",
  plastics_metals: "Tworzywa sztuczne i metale",
  glass: "Szkło",
  bio: "Bio",
  bulky: "Gabaryty",
  other: "Inne",
};

export function placeLabel(item: WasteScheduleItem): string {
  return [item.areaName, item.streetGroup].filter(Boolean).join(" — ") || item.locality;
}

// Reuses the exact "Moja okolica" free-text keywords saved by the alerts
// homepage (src/lib/userPreferences.ts) so a resident only ever sets their
// area once — same substring matching as AlertList's matchesMyAlerts(), but
// checked against locality/areaName/streetGroup instead of alert text
// fields. Empty keywords match everything (no filter applied).
export function matchesLocationKeywords(item: WasteScheduleItem, locationKeywords: string): boolean {
  const keywords = locationKeywords
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
  if (keywords.length === 0) return true;

  const fields = [item.locality, item.areaName, item.streetGroup]
    .filter(Boolean)
    .map((f) => (f as string).toLowerCase());
  return keywords.some((kw) => fields.some((f) => f.includes(kw)));
}

export function formatScheduleDate(iso: string): string {
  const d = new Date(iso);
  const label = d.toLocaleDateString("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function groupByDate(
  items: WasteScheduleItem[]
): { date: string; items: WasteScheduleItem[] }[] {
  const groups: { date: string; items: WasteScheduleItem[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.date === item.collectionDate) {
      last.items.push(item);
    } else {
      groups.push({ date: item.collectionDate, items: [item] });
    }
  }
  return groups;
}

// "Dziś"/"Jutro"/"Za N dni" for a date already known to be today or later —
// getUpcomingWasteScheduleItems() only ever returns collection_date >= today,
// so there is no past-date case to handle here.
export function relativeDayLabel(iso: string): string {
  const todayIso = new Date().toISOString().split("T")[0];
  if (iso === todayIso) return "Dziś";

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (iso === tomorrow.toISOString().split("T")[0]) return "Jutro";

  const days = Math.round(
    (new Date(iso).getTime() - new Date(todayIso).getTime()) / 86_400_000
  );
  return `Za ${days} dni`;
}

// The soonest collection date's items, from an already date-ascending-sorted
// list (the shape getUpcomingWasteScheduleItems() returns) — may be more
// than one item if several waste types are collected on the same day.
export function nextCollectionGroup(items: WasteScheduleItem[]): WasteScheduleItem[] {
  if (items.length === 0) return [];
  const soonest = items[0].collectionDate;
  return items.filter((i) => i.collectionDate === soonest);
}

// ── Admin validation (Sprint 83) ─────────────────────────────────────────────
// Shared by the single add/edit form and the bulk JSON import, so the two
// entry paths can't drift out of sync (the same bug class fixed for
// Builder's two alert-import paths back in Sprint 73).

export function validateWasteScheduleInput(input: WasteScheduleItemInput): string[] {
  const errors: string[] = [];

  if (!input.locality?.trim()) {
    errors.push("Lokalizacja jest wymagana.");
  }
  if (!input.wasteType || !WASTE_TYPES.includes(input.wasteType)) {
    errors.push(`Nieprawidłowy rodzaj odpadów (dozwolone: ${WASTE_TYPES.join(", ")}).`);
  }
  if (!input.collectionDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.collectionDate)) {
    errors.push("Data odbioru jest wymagana i musi być w formacie RRRR-MM-DD.");
  } else if (Number.isNaN(new Date(input.collectionDate).getTime())) {
    errors.push("Data odbioru jest nieprawidłowa.");
  }

  return errors;
}

// ISO YYYY-MM-DD strings compare lexicographically the same as
// chronologically, so a plain string comparison is enough here.
export function isPastDate(iso: string): boolean {
  const todayIso = new Date().toISOString().split("T")[0];
  return iso < todayIso;
}

// Exact-match duplicate check (same locality + waste type + date) — not
// fuzzy text matching like the source-candidate dedup heuristic
// (src/lib/candidateWarnings.ts), since a schedule row either is or isn't
// the same entry. A warning, never a block — the admin may legitimately
// want two rows for the same date/type if a source genuinely lists both
// (e.g. a corrected re-announcement).
export function findDuplicateWasteItem(
  input: WasteScheduleItemInput,
  existing: WasteScheduleItem[]
): WasteScheduleItem | null {
  const locality = input.locality.trim().toLowerCase();
  return (
    existing.find(
      (item) =>
        item.locality.trim().toLowerCase() === locality &&
        item.wasteType === input.wasteType &&
        item.collectionDate === input.collectionDate
    ) ?? null
  );
}
