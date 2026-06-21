"use client";

import { useState, useEffect } from "react";
import { getUpcomingWasteScheduleItems } from "@/lib/supabaseWasteWrites";
import { WASTE_TYPE_LABELS, placeLabel, formatScheduleDate, groupByDate } from "@/lib/wasteSchedule";
import type { WasteScheduleItem } from "@/types/wasteSchedule";

type LoadState = "loading" | "ready" | "table_missing" | "error";

export function WasteScheduleSection() {
  const [items, setItems] = useState<WasteScheduleItem[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    getUpcomingWasteScheduleItems().then((result) => {
      if (result.tableMissing) {
        setState("table_missing");
        return;
      }
      if (result.error) {
        setErrorMsg(result.error);
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
        <div className="h-4 w-40 bg-slate-100 rounded mb-3" />
        <div className="h-3 w-full bg-slate-100 rounded mb-2" />
        <div className="h-3 w-2/3 bg-slate-100 rounded" />
      </div>
    );
  }

  if (state === "table_missing") {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
        <p className="text-sm font-medium text-slate-700 mb-1">
          Harmonogram nie jest jeszcze włączony.
        </p>
        <p className="text-sm text-slate-500 leading-relaxed">
          Ta sekcja pokaże najbliższe terminy odbioru odpadów, gdy admin
          uzupełni je z oficjalnych źródeł. Do tego czasu sprawdź linki
          poniżej.
        </p>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
        <p className="text-sm font-medium text-red-700">
          Nie udało się pobrać harmonogramu.
        </p>
        {errorMsg && <p className="text-xs text-red-500 mt-1 font-mono">{errorMsg}</p>}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
        <p className="text-sm font-medium text-slate-700 mb-1">
          Brak zapisanych terminów.
        </p>
        <p className="text-sm text-slate-500 leading-relaxed">
          Harmonogram jest pusty — admin jeszcze nie uzupełnił terminów dla
          żadnej okolicy. Sprawdź oficjalne źródła poniżej, dopóki nie
          pojawią się tu pierwsze daty.
        </p>
      </div>
    );
  }

  const groups = groupByDate(items);

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <div key={group.date} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
          <p className="text-sm font-semibold text-slate-900 mb-2.5">
            {formatScheduleDate(group.date)}
          </p>
          <div className="flex flex-col gap-2">
            {group.items.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-0.5 text-xs">
                  {WASTE_TYPE_LABELS[item.wasteType] ?? item.wasteType}
                </span>
                <span className="text-slate-600">{placeLabel(item)}</span>
                {item.sourceUrl && (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    Źródło: {item.sourceName || "zobacz"} →
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
