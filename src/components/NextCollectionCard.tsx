"use client";

import { useState, useEffect } from "react";
import { getUpcomingWasteScheduleItems } from "@/lib/supabaseWasteWrites";
import {
  WASTE_TYPE_LABELS,
  placeLabel,
  formatScheduleDate,
  relativeDayLabel,
  nextCollectionGroup,
} from "@/lib/wasteSchedule";
import type { WasteScheduleItem } from "@/types/wasteSchedule";

type LoadState = "loading" | "ready" | "table_missing" | "error";

// "Najbliższy odbiór" — a single-glance highlight of the soonest upcoming
// collection date(s), distinct from WasteScheduleSection's full
// grouped-by-date list below it. Shares the same data-access function and
// presentation helpers; fetches independently (small dataset, simpler than
// lifting shared state up for two components on one page).
export function NextCollectionCard() {
  const [items, setItems] = useState<WasteScheduleItem[]>([]);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    getUpcomingWasteScheduleItems(10).then((result) => {
      if (result.tableMissing) {
        setState("table_missing");
        return;
      }
      if (result.error) {
        setState("error");
        return;
      }
      setItems(result.items);
      setState("ready");
    });
  }, []);

  if (state === "loading") {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 animate-pulse">
        <div className="h-3 w-24 bg-slate-100 rounded mb-3" />
        <div className="h-5 w-2/3 bg-slate-100 rounded" />
      </div>
    );
  }

  if (state === "table_missing" || state === "error") {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
          Najbliższy odbiór
        </p>
        <p className="text-sm text-slate-500 leading-relaxed">
          Funkcja jeszcze nie jest włączona — pojawi się tu, gdy admin uzupełni
          harmonogram.
        </p>
      </div>
    );
  }

  const group = nextCollectionGroup(items);

  if (group.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
          Najbliższy odbiór
        </p>
        <p className="text-sm text-slate-500 leading-relaxed">
          Brak zaplanowanych terminów — harmonogram jest jeszcze pusty.
        </p>
      </div>
    );
  }

  const first = group[0];

  return (
    <div className="bg-blue-50 rounded-2xl border border-blue-200 shadow-sm p-4 sm:p-5">
      <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1.5">
        Najbliższy odbiór
      </p>
      <p className="text-base font-bold text-slate-900 mb-0.5">
        {relativeDayLabel(first.collectionDate)} — {formatScheduleDate(first.collectionDate)}
      </p>
      <div className="flex flex-wrap items-center gap-2 mt-2">
        {group.map((item) => (
          <span
            key={item.id}
            className="text-xs font-medium text-blue-700 bg-white border border-blue-200 rounded-full px-2.5 py-0.5"
          >
            {WASTE_TYPE_LABELS[item.wasteType] ?? item.wasteType}
          </span>
        ))}
      </div>
      <p className="text-sm text-slate-600 mt-2">{placeLabel(first)}</p>
      {first.sourceUrl && (
        <a
          href={first.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
        >
          Źródło: {first.sourceName || "zobacz"} →
        </a>
      )}
    </div>
  );
}
