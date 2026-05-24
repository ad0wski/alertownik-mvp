"use client";

import { useState, useEffect } from "react";
import { AlertCard } from "@/components/AlertCard";
import { getSupabaseAlerts } from "@/lib/getSupabaseAlerts";
import type { Alert, AlertCategory } from "@/types/alert";

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
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    getSupabaseAlerts()
      .then((data) => setAlerts(data))
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }, []);

  const filtered =
    selected === "all"
      ? alerts
      : alerts.filter((a) => a.category === selected);

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

      {/* Fetch error notice — Supabase unreachable */}
      {fetchError && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
          Nie udało się połączyć z serwerem. Spróbuj odświeżyć stronę za chwilę.
        </p>
      )}

      {/* Loading skeleton — shown while Supabase fetch is in progress */}
      {loading ? (
        <div className="flex flex-col gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white rounded-2xl border border-slate-200 border-l-4 border-l-slate-200 p-4 sm:p-5 animate-pulse"
            >
              <div className="flex gap-2 mb-3">
                <div className="h-5 w-16 bg-slate-100 rounded-full" />
                <div className="h-5 w-12 bg-slate-100 rounded-full" />
              </div>
              <div className="h-4 bg-slate-100 rounded w-3/4 mb-2" />
              <div className="h-3 bg-slate-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Alert counter — only shown when there is at least one alert */}
          {alerts.length > 0 && (
            <p className="text-sm text-slate-500 mb-5">
              {filtered.length === alerts.length ? (
                <>
                  Wszystkich alertów:{" "}
                  <span className="font-semibold text-slate-700">{alerts.length}</span>
                </>
              ) : (
                <>
                  Wyświetlane:{" "}
                  <span className="font-semibold text-slate-700">{filtered.length}</span>{" "}
                  z {alerts.length}
                </>
              )}
            </p>
          )}

          {/* Alert cards */}
          <section className="flex flex-col gap-4">
            {filtered.length === 0 ? (
              selected === "all" ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
                  <p className="text-base font-semibold text-slate-600">
                    Brak aktualnych alertów.
                  </p>
                  <p className="text-sm text-slate-400 mt-2">
                    Gdy pojawią się nowe komunikaty, zobaczysz je tutaj.
                  </p>
                </div>
              ) : (
                <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
                  <p className="text-base font-semibold text-slate-600">
                    Brak alertów w tej kategorii.
                  </p>
                  <p className="text-sm text-slate-400 mt-2">
                    Spróbuj wybrać inną kategorię albo wróć później.
                  </p>
                </div>
              )
            ) : (
              filtered.map((alert) => (
                <AlertCard key={alert.id} alert={alert} />
              ))
            )}
          </section>
        </>
      )}
    </>
  );
}
