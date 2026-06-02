"use client";

import { useState, useEffect } from "react";
import { AlertCard } from "@/components/AlertCard";
import { getSupabaseAlerts } from "@/lib/getSupabaseAlerts";
import { getAlertTimeStatus } from "@/lib/getAlertTimeStatus";
import type { Alert, AlertCategory } from "@/types/alert";

const STATUS_ORDER = { active: 0, upcoming: 1, ended: 2, unknown: 3 } as const;

function sortAlerts(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => {
    const sa = getAlertTimeStatus(a.startsAt, a.endsAt);
    const sb = getAlertTimeStatus(b.startsAt, b.endsAt);
    const diff = STATUS_ORDER[sa] - STATUS_ORDER[sb];
    if (diff !== 0) return diff;
    // active: newest start first
    if (sa === "active") return b.startsAt.localeCompare(a.startsAt);
    // upcoming: nearest start first
    if (sa === "upcoming") return a.startsAt.localeCompare(b.startsAt);
    // ended: most recently ended first
    if (sa === "ended") {
      const endA = a.endsAt ?? a.startsAt;
      const endB = b.endsAt ?? b.startsAt;
      return endB.localeCompare(endA);
    }
    return 0;
  });
}

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

// Polish category labels used when searching by category name (e.g. "woda", "prąd")
const categoryLabels: Record<AlertCategory, string> = {
  transport: "transport",
  water: "woda",
  power: "prąd",
  waste: "odpady",
  roads: "drogi",
  municipal: "komunikaty",
};

function matchesSearch(alert: Alert, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  return (
    alert.title.toLowerCase().includes(q) ||
    alert.place.toLowerCase().includes(q) ||
    alert.change.toLowerCase().includes(q) ||
    alert.action.toLowerCase().includes(q) ||
    categoryLabels[alert.category].includes(q)
  );
}

export function AlertList() {
  const [selected, setSelected] = useState<FilterValue>("all");
  const [query, setQuery] = useState("");
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    getSupabaseAlerts()
      .then((data) => setAlerts(sortAlerts(data)))
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }, []);

  // Step 1: category filter
  const byCategory =
    selected === "all"
      ? alerts
      : alerts.filter((a) => a.category === selected);

  // Step 2: text search on top of the category-filtered list
  const filtered = byCategory.filter((a) => matchesSearch(a, query));

  const hasQuery = query.trim().length > 0;
  const hasActiveFilters = hasQuery || selected !== "all";

  return (
    <>
      {/* Search input */}
      <div className="relative mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Szukaj po miejscowości, ulicy albo tytule..."
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 pr-20 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
        />
        {hasQuery && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-medium text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Wyczyść wyszukiwanie"
          >
            Wyczyść
          </button>
        )}
      </div>

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
          {/* Alert counter */}
          {alerts.length > 0 && (
            <p className="text-sm text-slate-500 mb-5">
              {hasQuery ? (
                <>
                  Znaleziono alertów:{" "}
                  <span className="font-semibold text-slate-700">{filtered.length}</span>
                </>
              ) : filtered.length === alerts.length ? (
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
              hasActiveFilters ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
                  <p className="text-base font-semibold text-slate-600">
                    Brak alertów spełniających wybrane kryteria.
                  </p>
                  <p className="text-sm text-slate-400 mt-2">
                    Spróbuj zmienić kategorię albo wpisać inną lokalizację.
                  </p>
                </div>
              ) : (
                <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
                  <p className="text-base font-semibold text-slate-600">
                    Brak aktualnych alertów.
                  </p>
                  <p className="text-sm text-slate-400 mt-2">
                    Gdy pojawią się nowe komunikaty, zobaczysz je tutaj.
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
