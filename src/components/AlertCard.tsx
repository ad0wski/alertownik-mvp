"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert } from "@/types/alert";

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
  critical: {
    label: "Pilne",
    badge: "bg-red-50 text-red-700 ring-1 ring-red-200",
    stripe: "border-l-red-500",
  },
};

function formatDateTime(iso: string): string {
  if (iso.includes("T")) {
    const [datePart, timePart] = iso.split("T");
    const [year, month, day] = datePart.split("-");
    return `${day}.${month}.${year}, godz. ${timePart}`;
  }
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}

function formatRange(startsAt: string, endsAt?: string): string {
  if (!endsAt) return formatDateTime(startsAt);

  const startDate = startsAt.split("T")[0];
  const endDate = endsAt.split("T")[0];

  // Same day with times → "21.05.2026, godz. 09:00 – 14:00"
  if (startDate === endDate && startsAt.includes("T") && endsAt.includes("T")) {
    const [year, month, day] = startDate.split("-");
    return `${day}.${month}.${year}, godz. ${startsAt.split("T")[1]} – ${endsAt.split("T")[1]}`;
  }

  return `${formatDateTime(startsAt)} – ${formatDateTime(endsAt)}`;
}

export function AlertCard({ alert, isPreview }: { alert: Alert; isPreview?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const severity = severityConfig[alert.severity];
  const isRealLink = Boolean(alert.sourceUrl && alert.sourceUrl !== "#");

  return (
    <article
      className={`bg-white rounded-2xl border border-slate-200 hover:border-slate-300 shadow-sm hover:shadow-md border-l-4 ${severity.stripe} p-5 flex flex-col gap-3 transition-all duration-150`}
    >
      {/* Badges */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-600 bg-slate-100 rounded-full px-2.5 py-0.5">
          {categoryLabels[alert.category]}
        </span>
        <span className={`text-xs font-semibold rounded-full px-2.5 py-0.5 ${severity.badge}`}>
          {severity.label}
        </span>
      </div>

      {/* Title */}
      <h2 className="text-base font-semibold text-slate-900 leading-snug">
        {alert.title}
      </h2>

      {/* Place · date */}
      <p className="text-sm text-slate-500">
        {alert.place} · {formatRange(alert.startsAt, alert.endsAt)}
      </p>

      {/* Action row */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
        >
          {expanded ? "Ukryj szczegóły ▲" : "Szczegóły ▼"}
        </button>
        {isPreview ? (
          <span className="text-xs text-slate-400 italic">
            Podgląd roboczy — alert nie ma jeszcze własnej strony.
          </span>
        ) : (
          <Link
            href={`/alerts/${alert.slug}`}
            className="inline-flex items-center gap-1 rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 hover:border-blue-200 transition-colors"
          >
            Otwórz alert →
          </Link>
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <dl className="border-t border-slate-100 pt-3 mt-1 flex flex-col divide-y divide-slate-100">
          <div className="flex flex-col sm:flex-row py-3 gap-1 sm:gap-6">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400 sm:w-28 shrink-0 pt-0.5">
              Kiedy
            </dt>
            <dd className="text-sm text-slate-700 leading-relaxed">
              {formatRange(alert.startsAt, alert.endsAt)}
            </dd>
          </div>

          <div className="flex flex-col sm:flex-row py-3 gap-1 sm:gap-6">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400 sm:w-28 shrink-0 pt-0.5">
              Gdzie
            </dt>
            <dd className="text-sm text-slate-700 leading-relaxed">{alert.place}</dd>
          </div>

          <div className="flex flex-col sm:flex-row py-3 gap-1 sm:gap-6">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400 sm:w-28 shrink-0 pt-0.5">
              Co się zmienia
            </dt>
            <dd className="text-sm text-slate-700 leading-relaxed">{alert.change}</dd>
          </div>

          <div className="flex flex-col sm:flex-row py-3 gap-1 sm:gap-6">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400 sm:w-28 shrink-0 pt-0.5">
              Co zrobić
            </dt>
            <dd className="text-sm text-slate-700 leading-relaxed">{alert.action}</dd>
          </div>

          <div className="flex flex-col sm:flex-row py-3 gap-1 sm:gap-6">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400 sm:w-28 shrink-0 pt-0.5">
              Źródło
            </dt>
            <dd className="text-sm text-slate-700 flex flex-wrap items-center gap-3">
              <span>{alert.sourceName}</span>
              {isRealLink ? (
                <a
                  href={alert.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                >
                  Zobacz źródło →
                </a>
              ) : (
                <span className="text-xs text-slate-400">Źródło niedostępne</span>
              )}
            </dd>
          </div>
        </dl>
      )}
    </article>
  );
}
