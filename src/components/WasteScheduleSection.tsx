"use client";

import { useState, useEffect } from "react";
import { getUpcomingWasteScheduleItems } from "@/lib/supabaseWasteWrites";
import {
  WASTE_TYPE_LABELS,
  placeLabel,
  formatScheduleDate,
  relativeDayLabel,
  isWithinDays,
  groupByDate,
  matchesLocationKeywords,
} from "@/lib/wasteSchedule";
import type { WasteScheduleItem } from "@/types/wasteSchedule";

type LoadState = "loading" | "ready" | "table_missing" | "error";

interface Props {
  areaKeywords: string;
}

// "Moja okolica" filter reuses the same free-text keywords the homepage's
// "Moje alerty" panel already saves (src/lib/userPreferences.ts), now
// owned by the parent (OdpadyClient) and passed down as `areaKeywords` so
// the inline AreaPreferenceBar on /odpady can update this list live — no
// new address/area picker, no exact address ever collected. Default is
// "all" (unfiltered), matching AlertList's mode default even when prefs
// exist.
export function WasteScheduleSection({ areaKeywords }: Props) {
  const [items, setItems] = useState<WasteScheduleItem[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showMyArea, setShowMyArea] = useState(false);

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
          Harmonogram odpadów wymaga oficjalnych danych — admin jeszcze nie
          zaimportował terminów z oficjalnego harmonogramu gminy/operatora.
          To nie błąd, tylko brak importu na razie. Przygotowujemy import z
          oficjalnego harmonogramu Gminy Michałowice — najpierw najbliższe
          terminy dla Komorowa. Do tego czasu sprawdź oficjalne źródła
          poniżej.
        </p>
      </div>
    );
  }

  const prefsSet = areaKeywords.trim().length > 0;
  const filteredItems =
    showMyArea && prefsSet
      ? items.filter((i) => matchesLocationKeywords(i, areaKeywords))
      : items;
  const groups = groupByDate(filteredItems);

  // Derived from the actual fetched rows, never hardcoded — so this line
  // can only ever name localities/fractions that genuinely have saved
  // dates (e.g. "Komorów" after the first real import), and disappears
  // with them. The "missing fractions" sentence stays truthful the same
  // way: it only points at whatever is absent from the data.
  const coveredLocalities = [...new Set(items.map((i) => i.locality))];
  const coveredTypeLabels = [
    ...new Set(items.map((i) => WASTE_TYPE_LABELS[i.wasteType] ?? i.wasteType)),
  ];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-500 leading-relaxed">
        Zapisane terminy obejmują:{" "}
        <span className="font-medium text-slate-600">{coveredLocalities.join(", ")}</span>
        {" "}(frakcje: {coveredTypeLabels.join(", ").toLowerCase()}).
        Frakcji, których tu nie widać (np. popiół albo odzież i tekstylia),
        jeszcze nie zaimportowano — sprawdź je w oficjalnym harmonogramie.
        Szczegółowy zakres (np. typ zabudowy) opisuje źródło podlinkowane przy
        każdym terminie.
      </p>
      {prefsSet && (
        <div className="flex items-center gap-2 mb-1">
          <button
            onClick={() => setShowMyArea(false)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              !showMyArea
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
            }`}
          >
            Wszystkie okolice
          </button>
          <button
            onClick={() => setShowMyArea(true)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              showMyArea
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
            }`}
          >
            Moja okolica
          </button>
        </div>
      )}

      {showMyArea && prefsSet && filteredItems.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
          <p className="text-sm font-medium text-slate-700 mb-1">
            Brak terminów dla Twojej okolicy.
          </p>
          <p className="text-sm text-slate-500 leading-relaxed">
            Żaden zapisany termin nie pasuje do Twojej okolicy. Sprawdź
            „Wszystkie okolice" albo zmień okolicę w panelu powyżej.
          </p>
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.date} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
            <p className="text-sm font-semibold text-slate-900 mb-2.5 flex flex-wrap items-center gap-2">
              {relativeDayLabel(group.date)}{" "}
              <span className="text-slate-400 font-normal">— {formatScheduleDate(group.date)}</span>
              {isWithinDays(group.date, 7) && (
                <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                  Ten tydzień
                </span>
              )}
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
        ))
      )}
    </div>
  );
}
