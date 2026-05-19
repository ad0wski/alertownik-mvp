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
      <div className="flex flex-wrap gap-2 mb-5">
        {categoryFilters.map((filter) => {
          const isActive = filter.value === selected;
          return (
            <button
              key={filter.value}
              onClick={() => setSelected(filter.value)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                isActive
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:text-gray-900"
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      {/* Counter */}
      <p className="text-xs text-gray-400 mb-5">
        {filtered.length === allAlerts.length ? (
          <>Wszystkie alerty: <span className="font-semibold">{allAlerts.length}</span></>
        ) : (
          <>Wyświetlane: <span className="font-semibold text-gray-600">{filtered.length}</span> z {allAlerts.length}</>
        )}
      </p>

      {/* Alert cards */}
      <section className="flex flex-col gap-4">
        {filtered.length === 0 ? (
          <div className="text-center py-14">
            <p className="text-sm font-medium text-gray-500">
              Brak alertów w tej kategorii.
            </p>
            <p className="text-sm text-gray-400 mt-1">
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
