"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { sampleAlerts } from "@/data/sampleAlerts";
import { getSupabaseAlertBySlug } from "@/lib/getSupabaseAlerts";
import { formatAlertRange, formatAlertDateTime } from "@/lib/formatAlertDate";
import { getAlertTimeStatus, type AlertTimeStatus } from "@/lib/getAlertTimeStatus";
import { buildAlertReportMailto } from "@/lib/feedbackMailto";
import type { Alert } from "@/types/alert";

const timeStatusConfig: Record<
  Exclude<AlertTimeStatus, "unknown">,
  { dot: string; text: string; label: string }
> = {
  active:    { dot: "bg-emerald-500", text: "text-emerald-700", label: "Trwa" },
  upcoming:  { dot: "bg-blue-400",    text: "text-blue-600",    label: "Nadchodzące" },
  ended:     { dot: "bg-slate-300",   text: "text-slate-400",   label: "Zakończone" },
};

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
  urgent: {
    label: "Pilne",
    badge: "bg-red-50 text-red-700 ring-1 ring-red-200",
    accent: "border-l-red-500",
  },
};

export function AlertDetailClient({ slug }: { slug: string }) {
  const [alert, setAlert] = useState<Alert | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // 1. Supabase — primary source of truth for public alerts
    getSupabaseAlertBySlug(slug).then((found) => {
      if (found) {
        setAlert(found);
        setReady(true);
        return;
      }

      // 2. localStorage — supports Builder local-publish workflow
      try {
        const raw = localStorage.getItem(PUBLISHED_KEY);
        const locals: Alert[] = raw ? JSON.parse(raw) : [];
        const localAlert = locals.find((a) => a.slug === slug);
        if (localAlert) {
          setAlert(localAlert);
          setReady(true);
          return;
        }
      } catch {
        // localStorage unavailable
      }

      // 3. Sample alerts — local dev convenience only (e.g. no .env.local configured
      // yet). Gated out of production so a guessed/old sample slug can never render
      // fabricated content as if it were a real published alert.
      const sample =
        process.env.NODE_ENV !== "production"
          ? sampleAlerts.find((a) => a.slug === slug) ?? null
          : null;
      setAlert(sample);
      setReady(true);
    });
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
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            ← Wróć do listy alertów
          </Link>
        </div>
      </main>
    );
  }

  const severity = severityConfig[alert.severity];
  const isRealLink = Boolean(alert.sourceUrl && alert.sourceUrl !== "#");
  const timeStatus = getAlertTimeStatus(alert.startsAt, alert.endsAt);
  const timeCfg = timeStatus !== "unknown" ? timeStatusConfig[timeStatus] : null;

  return (
    <main className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-10">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-700 transition-colors mb-5 sm:mb-6 group"
      >
        <span className="group-hover:-translate-x-0.5 transition-transform inline-block">←</span>
        Wróć do listy alertów
      </Link>

      <article
        className={`bg-white rounded-2xl border border-slate-200 shadow-md border-l-4 ${severity.accent} p-4 sm:p-6 flex flex-col gap-4`}
      >
        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500 bg-slate-100 rounded-full px-2.5 py-1">
            {categoryLabels[alert.category]}
          </span>
          <span
            className={`text-xs font-semibold rounded-full px-2.5 py-1 ${severity.badge}`}
          >
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
        <h1 className="text-lg sm:text-xl font-bold text-slate-900 leading-snug">
          {alert.title}
        </h1>

        {/* Compact line */}
        <p className="text-sm text-slate-500 leading-relaxed">
          {alert.place ? (
            <span className="font-medium text-slate-600">{alert.place}</span>
          ) : (
            <span className="italic text-slate-400">Brak informacji o lokalizacji</span>
          )}
          {" · "}
          {formatAlertRange(alert.startsAt, alert.endsAt)}
        </p>

        {/* Detail rows — always stacked vertically for clean mobile reading */}
        <dl className="border-t border-slate-100 pt-4 flex flex-col divide-y divide-slate-100">
          <div className="flex flex-col py-3 gap-1">
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Kiedy
            </dt>
            <dd className="text-sm text-slate-700 leading-relaxed">
              {formatAlertRange(alert.startsAt, alert.endsAt)}
            </dd>
          </div>

          <div className="flex flex-col py-3 gap-1">
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Gdzie
            </dt>
            <dd className="text-sm text-slate-700 leading-relaxed">
              {alert.place || <span className="italic text-slate-400">Brak informacji o lokalizacji</span>}
            </dd>
          </div>

          <div className="flex flex-col py-3 gap-1">
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Co się zmienia
            </dt>
            <dd className="text-sm text-slate-700 leading-relaxed">
              {alert.change || <span className="italic text-slate-400">Brak szczegółów.</span>}
            </dd>
          </div>

          <div className="flex flex-col py-3 gap-1">
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Co zrobić
            </dt>
            <dd className="text-sm text-slate-700 leading-relaxed">
              {alert.action || <span className="italic text-slate-400">Brak zalecanego działania.</span>}
            </dd>
          </div>

          <div className="flex flex-col py-3 gap-1">
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
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

          {(alert.publishedAt || alert.updatedAt) && (
            <div className="flex flex-col py-3 gap-1">
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Ostatnia weryfikacja przez admina
              </dt>
              <dd className="text-sm text-slate-700 leading-relaxed">
                {alert.updatedAt
                  ? `ostatnio sprawdzono/zmieniono ${formatAlertDateTime(alert.updatedAt)}`
                  : `opublikowano ${formatAlertDateTime(alert.publishedAt as string)}`}
              </dd>
            </div>
          )}
        </dl>

        <div className="text-xs text-slate-400 leading-relaxed border-t border-slate-100 pt-3 mt-1">
          <p className="flex flex-wrap items-center gap-1.5 mb-1.5">
            <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
              ✓ Zatwierdzone ręcznie przez administratora
            </span>
            <span className="text-slate-300">·</span>
            <span>Wczesny pilotaż — szczegóły na stronie O projekcie</span>
          </p>
          <p>
            Alertownik pomaga szybko zorientować się w sytuacji, ale nie zastępuje
            oficjalnych komunikatów — w razie wątpliwości sprawdź źródło powyżej.
          </p>
          <a
            href={buildAlertReportMailto(alert.title)}
            className="inline-block mt-1.5 font-medium text-slate-500 hover:text-blue-700 hover:underline"
          >
            Ten alert jest nieaktualny albo błędny? Zgłoś →
          </a>
        </div>
      </article>
    </main>
  );
}
