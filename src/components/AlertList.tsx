"use client";

import { useState, useEffect } from "react";
import { AlertCard } from "@/components/AlertCard";
import { sampleAlerts } from "@/data/sampleAlerts";
import { getSupabaseAlerts } from "@/lib/getSupabaseAlerts";
import type { Alert, AlertCategory } from "@/types/alert";

const PUBLISHED_KEY = "alertownik-published-alerts";

type FilterValue = AlertCategory | "all";

const categoryFilters: { label: string; value: FilterValue }[] = [
  { label: "Wszystkie", value: "all" },
  { label: "Transport", value: "transport" },
  { label: "Woda", value: "water" },
  { label: "Prąd", value: "power" },
  { label: "Odpady", value: "waste" },
  { label: "Drogi", value: "roads" },
  { label: "Komunikaty", value: "municipal" },
];

export function AlertList() {
  const [selected, setSelected] = useState<FilterValue>("all");
  const [localAlerts, setLocalAlerts] = useState<Alert[]>([]);
  const [supabaseAlerts, setSupabaseAlerts] = useState<Alert[]>([]);
  const [supabaseError, setSupabaseError] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PUBLISHED_KEY);
      if (raw) setLocalAlerts(JSON.parse(raw) as Alert[]);
    } catch {
      // localStorage unavailable or corrupt — show only sample alerts
    }
  }, []);

  useEffect(() => {
    getSupabaseAlerts()
      .then(setSupabaseAlerts)
      .catch(() => setSupabaseError(true));
  }, []);

  const allAlerts = [...supabaseAlerts, ...localAlerts, ...sampleAlerts];

  const filtered =
    selected === "all"
      ? allAlerts
      : allAlerts.filter((a) => a.category === selected);

  return (
    <>
      {/* Category filters — scrolls horizontally on mobile, wraps on desktop */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 mb-5">
        <div className="flex gap-2 min-w-max sm:min-w-0 sm:flex-wrap pb-1 sm:pb-0">
          {categoryFilters.map((filter) => {
            const isActive = filter.value === selected;
            return (
              <button
                key={filter.value}
                onClick={() => setSelected(filter.value)}
                className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors whitespace-nowrap ${
                  isActive
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-900"
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Supabase error — shown only when the server fetch fails; sample alerts still visible */}
      {supabaseError && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
          Nie udało się załadować alertów z serwera. Wyświetlam dostępne dane lokalne.
        </p>
      )}

      {/* Counter */}
      <p className="text-sm text-slate-500 mb-5">
        {filtered.length === allAlerts.length ? (
          <>
            Wszystkich alertów:{" "}
            <span className="font-semibold text-slate-700">{allAlerts.length}</span>
          </>
        ) : (
          <>
            Wyświetlane:{" "}
            <span className="font-semibold text-slate-700">{filtered.length}</span>{" "}
            z {allAlerts.length}
          </>
        )}
      </p>

      {/* Alert cards */}
      <section className="flex flex-col gap-4">
        {filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
            <p className="text-base font-semibold text-slate-600">
              Brak alertów w tej kategorii.
            </p>
            <p className="text-sm text-slate-400 mt-2">
              Spróbuj wybrać inną kategorię albo wróć później.
            </p>
          </div>
        ) : (
          filtered.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))
        )}
      </section>
    </>
  );
}
