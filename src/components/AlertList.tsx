"use client";

import { useState, useEffect } from "react";
import { AlertCard } from "@/components/AlertCard";
import { sampleAlerts } from "@/data/sampleAlerts";
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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PUBLISHED_KEY);
      if (raw) setLocalAlerts(JSON.parse(raw) as Alert[]);
    } catch {
      // localStorage unavailable or corrupt — show only sample alerts
    }
  }, []);

  const allAlerts = [...localAlerts, ...sampleAlerts];

  const filtered =
    selected === "all"
      ? allAlerts
      : allAlerts.filter((a) => a.category === selected);

  return (
    <>
      {/* Category filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {categoryFilters.map((filter) => {
          const isActive = filter.value === selected;
          return (
            <button
              key={filter.value}
              onClick={() => setSelected(filter.value)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
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

      {/* Counter */}
      <p className="text-sm text-slate-500 mb-6">
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
              Brak alertów w tej kategorii
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
