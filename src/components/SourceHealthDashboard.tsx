"use client";

import type { AlertCategory } from "@/types/alert";
import type { SourceCheckResult } from "@/types/alertSource";
import {
  summarizeSourceHealth,
  HEALTH_STATUS_LABELS,
  HEALTH_BADGE_MANUAL,
  HEALTH_BADGE_NO_CRON,
  HEALTH_DASHBOARD_DISCLAIMER,
  HEALTH_API_SUPPORT_NOTE,
  HEALTH_ERROR_FALLBACK_NOTE,
  HEALTH_API_SUPPORTED_LABEL,
  HEALTH_MANUAL_ONLY_LABEL,
  RECENT_CANDIDATE_DAYS,
  type SourceHealthRow,
  type SourceHealthStatus,
} from "@/lib/sourceHealth";

// Sprint 137 — Source Health Dashboard v1 (admin-only, rendered on
// /admin/sources above the checklist). Read-only view over data the page
// already loads; triggers nothing, fetches nothing, writes nothing. All
// status/copy logic lives in src/lib/sourceHealth.ts where tests pin it.

const categoryLabels: Record<AlertCategory, string> = {
  transport: "Transport",
  water:     "Woda",
  power:     "Prąd",
  waste:     "Odpady",
  roads:     "Drogi",
  municipal: "Komunikaty",
};

const statusBadgeClass: Record<SourceHealthStatus, string> = {
  checked_recently: "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200",
  stale:            "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200",
  never_checked:    "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200",
  unregistered:     "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 ring-1 ring-slate-200",
};

const resultLabels: Record<SourceCheckResult, string> = {
  no_changes:     "brak zmian",
  found_notice:   "znaleziono komunikat",
  alert_created:  "przygotowano alert",
  needs_followup: "wymaga późniejszego sprawdzenia",
};

function formatCheckedAt(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", {
    day:      "numeric",
    month:    "short",
    year:     "numeric",
    hour:     "2-digit",
    minute:   "2-digit",
    timeZone: "Europe/Warsaw",
  });
}

export function SourceHealthDashboard({ rows }: { rows: SourceHealthRow[] }) {
  const summary = summarizeSourceHealth(rows);

  return (
    <section
      id="zdrowie-zrodel"
      className="mb-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-4 sm:p-5"
    >
      <details open>
        <summary className="cursor-pointer select-none">
          <span className="text-base font-semibold text-slate-800 dark:text-slate-100">
            Zdrowie źródeł
          </span>
          <span className="ml-2 inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 ring-1 ring-slate-200">
            {HEALTH_BADGE_MANUAL}
          </span>
          <span className="ml-1.5 inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 ring-1 ring-purple-200">
            {HEALTH_BADGE_NO_CRON}
          </span>
        </summary>

        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mt-2 mb-3">
          {HEALTH_DASHBOARD_DISCLAIMER}
        </p>

        {/* Summary chips */}
        <div className="flex flex-wrap gap-2 mb-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-full px-2.5 py-1">
            Źródła oficjalne: <span className="font-semibold text-slate-800 dark:text-slate-100">{summary.total}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-full px-2.5 py-1">
            Z checkiem przez aplikację: <span className="font-semibold">{summary.apiSupported}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 rounded-full px-2.5 py-1">
            Sprawdzone niedawno: <span className="font-semibold">{summary.checkedRecently}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 rounded-full px-2.5 py-1">
            Wymagają uwagi: <span className="font-semibold">{summary.needsAttention}</span>
          </span>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-1.5">
          {HEALTH_API_SUPPORT_NOTE}
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed mb-3">
          {HEALTH_ERROR_FALLBACK_NOTE}
        </p>

        {/* Per-source health rows */}
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.checklistId}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 p-3"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 mr-1">
                  {row.name}
                </span>
                <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 ring-1 ring-slate-200">
                  {categoryLabels[row.category]}
                </span>
                {row.apiSupported ? (
                  <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 ring-1 ring-purple-200">
                    {HEALTH_API_SUPPORTED_LABEL}
                  </span>
                ) : (
                  <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 ring-1 ring-slate-200">
                    {HEALTH_MANUAL_ONLY_LABEL}
                  </span>
                )}
                <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ${statusBadgeClass[row.status]}`}>
                  {HEALTH_STATUS_LABELS[row.status]}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1.5">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {row.lastCheckAt ? (
                    <>
                      Ostatni check: {formatCheckedAt(row.lastCheckAt)}
                      {row.lastCheckResult && (
                        <> · {resultLabels[row.lastCheckResult]}</>
                      )}
                    </>
                  ) : row.status === "unregistered" ? (
                    "Bez wpisu w rejestrze poniżej — historia checków niedostępna"
                  ) : (
                    "Jeszcze nie sprawdzano"
                  )}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Kandydaci ({RECENT_CANDIDATE_DAYS} dni):{" "}
                  <span className={row.recentCandidateCount > 0 ? "font-semibold text-purple-700" : "text-slate-400 dark:text-slate-500"}>
                    {row.recentCandidateCount}
                  </span>
                </span>
                <a
                  href={row.officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline"
                >
                  Otwórz źródło ↗
                </a>
              </div>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
