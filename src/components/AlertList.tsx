"use client";

import { useState } from "react";
import { AlertCard } from "@/components/AlertCard";
import { sampleAlerts } from "@/data/sampleAlerts";
import { AlertCategory } from "@/types/alert";

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

  const filtered =
    selected === "all"
      ? sampleAlerts
      : sampleAlerts.filter((a) => a.category === selected);

  return (
    <>
      {/* Category filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {categoryFilters.map((filter) => {
          const isActive = filter.value === selected;
          return (
            <button
              key={filter.value}
              onClick={() => setSelected(filter.value)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
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
      <p className="text-sm text-gray-500 mb-6">
        Wyświetlane alerty:{" "}
        <span className="font-semibold text-gray-700">{filtered.length}</span> z{" "}
        <span className="font-semibold text-gray-700">{sampleAlerts.length}</span>
      </p>

      {/* Alert cards */}
      <section className="flex flex-col gap-4">
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">
            Brak alertów w tej kategorii.
          </p>
        ) : (
          filtered.map((alert) => <AlertCard key={alert.id} alert={alert} />)
        )}
      </section>
    </>
  );
}
