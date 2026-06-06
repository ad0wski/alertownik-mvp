"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert } from "@/types/alert";
import { formatAlertRange } from "@/lib/formatAlertDate";
import { getAlertTimeStatus, type AlertTimeStatus } from "@/lib/getAlertTimeStatus";

const timeStatusConfig: Record<
  Exclude<AlertTimeStatus, "unknown">,
  { dot: string; text: string; label: string }
> = {
  active:    { dot: "bg-emerald-500", text: "text-emerald-700", label: "Trwa" },
  upcoming:  { dot: "bg-blue-400",    text: "text-blue-600",    label: "Nadchodzące" },
  ended:     { dot: "bg-slate-300",   text: "text-slate-400",   label: "Zakończone" },
};

const categoryLabels: Record<Alert["category"], string> = {
  transport: "Transport",
  water: "Woda",
  power: "Prąd",
  waste: "Odpady",
  roads: "Drogi",
  municipal: "Komunikaty",
};

const severityConfig: Record<
  Alert["severity"],
  { label: string; badge: string; stripe: string }
> = {
  info: {
    label: "Informacja",
    badge: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
    stripe: "border-l-blue-500",
  },
  warning: {
    label: "Uwaga",
    badge: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    stripe: "border-l-amber-500",
  },
  urgent: {
    label: "Pilne",
    badge: "bg-red-50 text-red-700 ring-1 ring-red-200",
    stripe: "border-l-red-500",
  },
};

export function AlertCard({ alert, isPreview }: { alert: Alert; isPreview?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const severity = severityConfig[alert.severity];
  const isRealLink = Boolean(alert.sourceUrl && alert.sourceUrl !== "#");
  const timeStatus = getAlertTimeStatus(alert.startsAt, alert.endsAt);
  const timeCfg = timeStatus !== "unknown" ? timeStatusConfig[timeStatus] : null;

  return (
    <article
      className={`bg-white rounded-2xl border border-slate-200 hover:border-slate-300 shadow-sm hover:shadow-md border-l-4 ${severity.stripe} p-4 sm:p-5 flex flex-col gap-3 transition-all duration-150`}
    >
      {/* Badges */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-600 bg-slate-100 rounded-full px-2.5 py-1">
          {categoryLabels[alert.category]}
        </span>
        <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${severity.badge}`}>
          {severity.label}
        </span>
        {timeCfg && (
          <span className={`inline-flex items-center gap-1 text-xs font-medium ${timeCfg.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${timeCfg.dot} shrink-0`} aria-hidden="true" />
            {timeCfg.label}
          </span>
        )}
      </div>

      {/* Title */}
      <h2 className="text-[15px] sm:text-base font-semibold text-slate-900 leading-snug">
        {alert.title}
      </h2>

      {/* Place · date */}
      <p className="text-sm text-slate-500 leading-relaxed">
        <span className="font-medium text-slate-600">{alert.place}</span>
        {" · "}
        {formatAlertRange(alert.startsAt, alert.endsAt)}
      </p>

      {/* Action row */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 pt-0.5">
        <button
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 sm:py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
        >
          {expanded ? "Ukryj szczegóły ▲" : "Szczegóły ▼"}
        </button>
        {isPreview ? (
          <span className="text-xs text-slate-400 italic">
            Podgląd — alert nie jest jeszcze opublikowany w bazie.
          </span>
        ) : (
          <Link
            href={`/alerts/${alert.slug}`}
            className="inline-flex items-center gap-1 rounded-lg border border-blue-100 bg-blue-50 px-4 py-2.5 sm:py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 hover:border-blue-200 transition-colors"
          >
            Otwórz alert →
          </Link>
        )}
      </div>

      {/* Expanded details — stacked vertically on mobile */}
      {expanded && (
        <dl className="border-t border-slate-100 pt-3 mt-1 flex flex-col divide-y divide-slate-100">
          <div className="flex flex-col py-3 gap-1">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400 pt-0.5">
              Kiedy
            </dt>
            <dd className="text-sm text-slate-700 leading-relaxed">
              {formatAlertRange(alert.startsAt, alert.endsAt)}
            </dd>
          </div>

          <div className="flex flex-col py-3 gap-1">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400 pt-0.5">
              Gdzie
            </dt>
            <dd className="text-sm text-slate-700 leading-relaxed">{alert.place}</dd>
          </div>

          <div className="flex flex-col py-3 gap-1">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400 pt-0.5">
              Co się zmienia
            </dt>
            <dd className="text-sm text-slate-700 leading-relaxed">{alert.change}</dd>
          </div>

          <div className="flex flex-col py-3 gap-1">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400 pt-0.5">
              Co zrobić
            </dt>
            <dd className="text-sm text-slate-700 leading-relaxed">{alert.action}</dd>
          </div>

          <div className="flex flex-col py-3 gap-1">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400 pt-0.5">
              Źródło
            </dt>
            <dd className="text-sm text-slate-700 flex flex-wrap items-center gap-3 mt-0.5">
              {alert.sourceName && <span>{alert.sourceName}</span>}
              {isRealLink ? (
                <a
                  href={alert.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                >
                  Zobacz źródło →
                </a>
              ) : !alert.sourceName ? (
                <span className="text-xs text-slate-400">Brak informacji o źródle</span>
              ) : null}
            </dd>
          </div>
        </dl>
      )}
    </article>
  );
}
