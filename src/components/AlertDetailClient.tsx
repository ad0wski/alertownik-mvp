"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { sampleAlerts } from "@/data/sampleAlerts";
import type { Alert } from "@/types/alert";

const PUBLISHED_KEY = "alertownik-published-alerts";

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
  { label: string; badge: string; accent: string }
> = {
  info: {
    label: "Informacja",
    badge: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
    accent: "border-l-blue-400",
  },
  warning: {
    label: "Uwaga",
    badge: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    accent: "border-l-amber-400",
  },
  critical: {
    label: "Pilne",
    badge: "bg-red-50 text-red-700 ring-1 ring-red-200",
    accent: "border-l-red-500",
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
  if (startDate === endDate && startsAt.includes("T") && endsAt.includes("T")) {
    const [year, month, day] = startDate.split("-");
    return `${day}.${month}.${year}, godz. ${startsAt.split("T")[1]} – ${endsAt.split("T")[1]}`;
  }
  return `${formatDateTime(startsAt)} – ${formatDateTime(endsAt)}`;
}

export function AlertDetailClient({ slug }: { slug: string }) {
  // Lazy initialisers run on the server too, so sample alerts render without flash
  const [alert, setAlert] = useState<Alert | null>(
    () => sampleAlerts.find((a) => a.slug === slug) ?? null
  );
  const [ready, setReady] = useState(
    () => Boolean(sampleAlerts.find((a) => a.slug === slug))
  );

  useEffect(() => {
    const fromSample = sampleAlerts.find((a) => a.slug === slug);
    if (fromSample) {
      setReady(true);
      return;
    }
    // Not a sample alert — check localStorage for locally published alerts
    try {
      const raw = localStorage.getItem(PUBLISHED_KEY);
      const locals: Alert[] = raw ? JSON.parse(raw) : [];
      setAlert(locals.find((a) => a.slug === slug) ?? null);
    } catch {
      setAlert(null);
    }
    setReady(true);
  }, [slug]);

  if (!ready) {
    return <main className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-10" />;
  }

  if (!alert) {
    return (
      <main className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-10">
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
          <p className="text-lg font-semibold text-slate-700 mb-2">
            Nie znaleziono alertu
          </p>
          <p className="text-sm text-slate-400 mb-8">
            Alert mógł zostać usunięty lub link jest nieprawidłowy.
          </p>
          <Link
            href="/"
            className="inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            ← Wróć do listy alertów
          </Link>
        </div>
      </main>
    );
  }

  const severity = severityConfig[alert.severity];
  const isRealLink = Boolean(alert.sourceUrl && alert.sourceUrl !== "#");

  return (
    <main className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-10">
      <Link
        href="/"
        className="inline-block text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors mb-6"
      >
        ← Wróć do listy alertów
      </Link>

      <article
        className={`bg-white rounded-2xl border border-slate-200 shadow-sm border-l-4 ${severity.accent} p-6 flex flex-col gap-4`}
      >
        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500 bg-slate-100 rounded-full px-2.5 py-0.5">
            {categoryLabels[alert.category]}
          </span>
          <span
            className={`text-xs font-semibold rounded-full px-2.5 py-0.5 ${severity.badge}`}
          >
            {severity.label}
          </span>
        </div>

        {/* Title */}
        <h1 className="text-xl font-bold text-slate-900 leading-snug">
          {alert.title}
        </h1>

        {/* Compact line */}
        <p className="text-sm text-slate-500">
          {alert.place} · {formatRange(alert.startsAt, alert.endsAt)}
        </p>

        {/* Detail rows */}
        <dl className="border-t border-slate-100 pt-4 flex flex-col divide-y divide-slate-100">
          <div className="flex flex-col sm:flex-row py-3.5 gap-1 sm:gap-6">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400 sm:w-28 shrink-0 pt-px">
              Kiedy
            </dt>
            <dd className="text-sm text-slate-700 leading-relaxed">
              {formatRange(alert.startsAt, alert.endsAt)}
            </dd>
          </div>

          <div className="flex flex-col sm:flex-row py-3.5 gap-1 sm:gap-6">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400 sm:w-28 shrink-0 pt-px">
              Gdzie
            </dt>
            <dd className="text-sm text-slate-700 leading-relaxed">{alert.place}</dd>
          </div>

          <div className="flex flex-col sm:flex-row py-3.5 gap-1 sm:gap-6">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400 sm:w-28 shrink-0 pt-px">
              Co się zmienia
            </dt>
            <dd className="text-sm text-slate-700 leading-relaxed">{alert.change}</dd>
          </div>

          <div className="flex flex-col sm:flex-row py-3.5 gap-1 sm:gap-6">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400 sm:w-28 shrink-0 pt-px">
              Co zrobić
            </dt>
            <dd className="text-sm text-slate-700 leading-relaxed">{alert.action}</dd>
          </div>

          <div className="flex flex-col sm:flex-row py-3.5 gap-1 sm:gap-6">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400 sm:w-28 shrink-0 pt-px">
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
                <span className="text-xs text-slate-400">
                  Źródło niedostępne
                </span>
              )}
            </dd>
          </div>
        </dl>
      </article>
    </main>
  );
}
