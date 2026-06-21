// Presentation helpers shared between WasteScheduleSection and
// NextCollectionCard (Sprint 82) — pure functions, no Supabase/React
// dependency, so they're directly unit-testable.

import type { WasteScheduleItem, WasteType } from "@/types/wasteSchedule";

export const WASTE_TYPE_LABELS: Record<WasteType, string> = {
  mixed: "Zmieszane",
  paper: "Papier",
  plastics_metals: "Plastik i metal",
  glass: "Szkło",
  bio: "Bio",
  bulky: "Wielkogabarytowe",
  other: "Inne",
};

export function placeLabel(item: WasteScheduleItem): string {
  return [item.areaName, item.streetGroup].filter(Boolean).join(" — ") || item.locality;
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
