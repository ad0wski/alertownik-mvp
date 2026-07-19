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
  active:    { dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300", label: "Trwa" },
  upcoming:  { dot: "bg-blue-400",    text: "text-blue-600 dark:text-blue-400",    label: "Nadchodzące" },
  ended:     { dot: "bg-slate-300",   text: "text-slate-400 dark:text-slate-500",   label: "Zakończone" },
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
    badge: "bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 ring-1 ring-blue-200",
    stripe: "border-l-blue-500",
  },
  warning: {
    label: "Uwaga",
    badge: "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200",
    stripe: "border-l-amber-500",
  },
  urgent: {
    label: "Pilne",
    badge: "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 ring-1 ring-red-200",
    stripe: "border-l-red-500",
  },
};

// Same 7-day window as AlertList's "Nowe albo zmienione w tym tygodniu" line —
// the badge and the summary must agree on what counts as fresh.
function isFreshAlert(alert: Alert): boolean {
  const touchedAt = alert.updatedAt || alert.publishedAt;
  if (!touchedAt) return false;
  const days = (Date.now() - new Date(touchedAt).getTime()) / 86_400_000;
  return days >= 0 && days <= 7;
}

export function AlertCard({ alert, isPreview }: { alert: Alert; isPreview?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const severity = severityConfig[alert.severity];
  const isRealLink = Boolean(alert.sourceUrl && alert.sourceUrl !== "#");
  const timeStatus = getAlertTimeStatus(alert.startsAt, alert.endsAt);
  const timeCfg = timeStatus !== "unknown" ? timeStatusConfig[timeStatus] : null;
  const showFreshBadge = timeStatus !== "ended" && isFreshAlert(alert);

  return (
    <article
      className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 shadow-sm hover:shadow-md border-l-4 ${severity.stripe} p-4 sm:p-5 flex flex-col gap-3 transition-all duration-150`}
    >
      {/* Badges */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2.5 py-1">
          {categoryLabels[alert.category]}
        </span>
        <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${severity.badge}`}>
          {severity.label}
        </span>
        {showFreshBadge && (
          <span className="text-xs font-semibold rounded-full px-2.5 py-1 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200">
            Nowe
          </span>
        )}
        {timeCfg && (
          <span className={`inline-flex items-center gap-1 text-xs font-medium ${timeCfg.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${timeCfg.dot} shrink-0`} aria-hidden="true" />
            {timeCfg.label}
          </span>
        )}
      </div>

      {/* Title — links to the detail page for published alerts, so the
          biggest visual element is also the biggest tap target on mobile */}
      <h2 className="text-[15px] sm:text-base font-semibold text-slate-900 dark:text-white leading-snug">
        {isPreview ? (
          alert.title
        ) : (
          <Link
            href={`/alerts/${alert.slug}`}
            className="hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
          >
            {alert.title}
          </Link>
        )}
      </h2>

      {/* Place · date */}
      <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
        {alert.place ? (
          <span className="font-medium text-slate-600 dark:text-slate-400">{alert.place}</span>
        ) : (
          <span className="italic text-slate-400 dark:text-slate-500">Brak informacji o lokalizacji</span>
        )}
        {" · "}
        {formatAlertRange(alert.startsAt, alert.endsAt)}
      </p>

      {/* Source line — trust signal visible without expanding the card */}
      {alert.sourceName && (
        <p className="text-xs text-slate-500 dark:text-slate-400 -mt-1.5">
          Źródło: <span className="font-medium text-slate-600 dark:text-slate-400">{alert.sourceName}</span>
        </p>
      )}

      {/* Action row */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 pt-0.5">
        <button
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          className="min-h-[44px] inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:border-slate-300 transition-colors"
        >
          {expanded ? "Ukryj szczegóły ▲" : "Szczegóły ▼"}
        </button>
        {isPreview ? (
          <span className="text-xs text-slate-400 dark:text-slate-500 italic">
            Podgląd — alert nie jest jeszcze opublikowany w bazie.
          </span>
        ) : (
          <Link
            href={`/alerts/${alert.slug}`}
            className="min-h-[44px] inline-flex items-center gap-1 rounded-lg border border-blue-100 bg-blue-50 dark:bg-blue-500/15 px-4 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 hover:border-blue-200 transition-colors"
          >
            Otwórz alert →
          </Link>
        )}
      </div>

      {/* Expanded details — stacked vertically on mobile */}
      {expanded && (
        <dl className="border-t border-slate-100 dark:border-slate-800 pt-3 mt-1 flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
          <div className="flex flex-col py-3 gap-1">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 pt-0.5">
              Kiedy
            </dt>
            <dd className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              {formatAlertRange(alert.startsAt, alert.endsAt)}
            </dd>
          </div>

          <div className="flex flex-col py-3 gap-1">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 pt-0.5">
              Gdzie
            </dt>
            <dd className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              {alert.place || <span className="italic text-slate-400 dark:text-slate-500">Brak informacji o lokalizacji</span>}
            </dd>
          </div>

          <div className="flex flex-col py-3 gap-1">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 pt-0.5">
              Co się zmienia
            </dt>
            <dd className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              {alert.change || <span className="italic text-slate-400 dark:text-slate-500">Brak szczegółów.</span>}
            </dd>
          </div>

          <div className="flex flex-col py-3 gap-1">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 pt-0.5">
              Co zrobić
            </dt>
            <dd className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              {alert.action || <span className="italic text-slate-400 dark:text-slate-500">Brak zalecanego działania.</span>}
            </dd>
          </div>

          <div className="flex flex-col py-3 gap-1">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 pt-0.5">
              Źródło
            </dt>
            <dd className="text-sm text-slate-700 dark:text-slate-300 flex flex-wrap items-center gap-3 mt-0.5">
              {alert.sourceName && <span>{alert.sourceName}</span>}
              {isRealLink ? (
                <a
                  href={alert.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline"
                >
                  Zobacz źródło →
                </a>
              ) : !alert.sourceName ? (
                <span className="text-xs text-slate-400 dark:text-slate-500">Brak informacji o źródle</span>
              ) : null}
            </dd>
          </div>
        </dl>
      )}
    </article>
  );
}
