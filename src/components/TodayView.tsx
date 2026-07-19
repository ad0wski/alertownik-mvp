"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { AlertCard } from "@/components/AlertCard";
import { BetaStatusCard } from "@/components/BetaStatusCard";
import { NextCollectionCard } from "@/components/NextCollectionCard";
import { getSupabaseAlerts } from "@/lib/getSupabaseAlerts";
import { getAlertTimeStatus } from "@/lib/getAlertTimeStatus";
import { loadPreferences } from "@/lib/userPreferences";
import type { Alert } from "@/types/alert";

const SEVERITY_RANK: Record<Alert["severity"], number> = { urgent: 0, warning: 1, info: 2 };

// Sprint 163 — the new "/" content: a short, app-like "Dzisiaj" view
// instead of the full scrollable alert list (that full list moved to
// /alerty, unchanged, via AlertList). Uses only data this app already
// fetches elsewhere (getSupabaseAlerts, the waste schedule via
// NextCollectionCard, the same localStorage area preference) — no new
// backend, no new query, no invented counters or forecasts.
export function TodayView() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [areaKeywords, setAreaKeywords] = useState("");
  const [prefsReady, setPrefsReady] = useState(false);

  useEffect(() => {
    getSupabaseAlerts()
      .then(({ alerts: data }) => setAlerts(data))
      .finally(() => setLoading(false));

    setAreaKeywords(loadPreferences().locationKeywords);
    setPrefsReady(true);
  }, []);

  const activeAlerts = useMemo(
    () => alerts.filter((a) => getAlertTimeStatus(a.startsAt, a.endsAt) === "active"),
    [alerts]
  );

  // The single most important thing to show: the most severe currently
  // active alert (urgent beats warning beats info). Ties keep the existing
  // Supabase order (created_at desc), same as everywhere else in the app.
  const mostImportant = useMemo(() => {
    if (activeAlerts.length === 0) return null;
    return [...activeAlerts].sort(
      (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    )[0];
  }, [activeAlerts]);

  const summaryAlerts = useMemo(
    () => activeAlerts.filter((a) => a.id !== mostImportant?.id).slice(0, 3),
    [activeAlerts, mostImportant]
  );

  const areaLabel = areaKeywords.trim() || "Wszystkie okolice";

  return (
    <main className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-3 sm:py-10 flex flex-col gap-3">
      {/* 1. Compact header — locality + entry point to the existing area settings on /alerty */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          Dzisiaj
        </h1>
        <Link
          href="/alerty"
          className="inline-flex items-center gap-1.5 min-h-[44px] rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-3.5 pr-2.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
        >
          <span className="truncate max-w-[9rem]">{areaLabel}</span>
          <span className="text-blue-600 dark:text-blue-400 font-semibold">Zmień</span>
        </Link>
      </div>

      {/* 2. Most important state */}
      {loading ? (
        <div
          className="h-28 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 animate-pulse"
          aria-hidden="true"
        />
      ) : mostImportant ? (
        <AlertCard alert={mostImportant} />
      ) : (
        <div className="text-center py-8 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <p className="text-base font-semibold text-slate-600 dark:text-slate-400">
            Brak pilnych alertów w tej chwili.
          </p>
        </div>
      )}

      {/* 3. Next waste collection */}
      {prefsReady && <NextCollectionCard areaKeywords={areaKeywords} />}

      {/* 4. Short summary of other active alerts */}
      {!loading && summaryAlerts.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Inne aktualne alerty
          </p>
          {summaryAlerts.map((a) => (
            <AlertCard key={a.id} alert={a} />
          ))}
        </div>
      )}
      {!loading && (
        <Link
          href="/alerty"
          className="flex items-center justify-center min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
        >
          Zobacz wszystkie alerty →
        </Link>
      )}

      {/* 5. Compact pilot notice — full detail stays on /about, nothing new claimed here */}
      <BetaStatusCard />
    </main>
  );
}
