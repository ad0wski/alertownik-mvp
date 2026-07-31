"use client";

import { useState, useEffect, useMemo } from "react";
import { getUpcomingWasteScheduleItems } from "@/lib/supabaseWasteWrites";
import {
  WASTE_TYPE_LABELS,
  placeLabel,
  formatScheduleDate,
  relativeDayLabel,
  nextCollectionGroup,
  matchesLocationKeywords,
} from "@/lib/wasteSchedule";
import type { WasteScheduleItem } from "@/types/wasteSchedule";

type LoadState = "loading" | "ready" | "table_missing" | "error";

interface Props {
  areaKeywords: string;
}

// "Najbliższy odbiór" — a single-glance highlight of the soonest upcoming
// collection date(s), distinct from WasteScheduleSection's full
// grouped-by-date list below it. Shares the same data-access function and
// presentation helpers; fetches independently (small dataset, simpler than
// lifting shared state up for two components on one page).
//
// `areaKeywords` is owned by the parent (OdpadyClient) rather than read
// from localStorage here directly, so the inline area editor on /odpady
// (AreaPreferenceBar) updates this card live instead of needing a page
// reload. When set, this card prefers a match in that area over the
// global soonest date, since "next for me" is the card's whole purpose —
// falling back to the global soonest date if nothing in the saved area is
// upcoming yet, rather than showing an empty card.
export function NextCollectionCard({ areaKeywords }: Props) {
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

  const { displayItems, isMyAreaMatch } = useMemo(() => {
    if (areaKeywords.trim()) {
      const myArea = items.filter((i) => matchesLocationKeywords(i, areaKeywords));
      if (myArea.length > 0) {
        return { displayItems: myArea, isMyAreaMatch: true };
      }
    }
    return { displayItems: items, isMyAreaMatch: false };
  }, [items, areaKeywords]);

  if (state === "loading") {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5 animate-pulse">
        <div className="h-3 w-24 bg-slate-100 dark:bg-slate-800 rounded mb-3" />
        <div className="h-5 w-2/3 bg-slate-100 dark:bg-slate-800 rounded" />
      </div>
    );
  }

  if (state === "table_missing" || state === "error") {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
          Najbliższy odbiór
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          Funkcja jeszcze nie jest włączona — pojawi się tu, gdy admin uzupełni
          harmonogram.
        </p>
      </div>
    );
  }

  const group = nextCollectionGroup(displayItems);

  if (group.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
          Najbliższy odbiór
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          Brak zaplanowanych terminów — harmonogram jest jeszcze pusty.
        </p>
      </div>
    );
  }

  const first = group[0];
  const hasAreaPreference = areaKeywords.trim().length > 0;

  return (
    <div className="bg-blue-50 dark:bg-blue-500/15 rounded-2xl border border-blue-200 dark:border-blue-500/30 shadow-sm p-4 sm:p-5">
      <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1.5">
        Najbliższy odbiór{isMyAreaMatch && " — Twoja okolica"}
      </p>
      <p className="text-base font-bold text-slate-900 dark:text-white mb-0.5">
        {relativeDayLabel(first.collectionDate)} — {formatScheduleDate(first.collectionDate)}
      </p>
      <div className="flex flex-wrap items-center gap-2 mt-2">
        {group.map((item) => (
          <span
            key={item.id}
            className="text-xs font-medium text-blue-700 dark:text-blue-300 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-500/30 rounded-full px-2.5 py-0.5"
          >
            {WASTE_TYPE_LABELS[item.wasteType] ?? item.wasteType}
          </span>
        ))}
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">{placeLabel(first)}</p>
      {first.sourceUrl && (
        <a
          href={first.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline"
        >
          Źródło: {first.sourceName || "zobacz"} →
        </a>
      )}
      {hasAreaPreference && !isMyAreaMatch && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
          Brak terminów dla Twojej okolicy — pokazujemy najbliższy ogólny termin.
        </p>
      )}
      {!hasAreaPreference && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
          Ustaw swoją okolicę powyżej, aby spersonalizować to przypomnienie.
        </p>
      )}
    </div>
  );
}
