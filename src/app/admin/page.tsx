"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  getAdminSupabaseAlerts,
  type AdminAlert,
} from "@/lib/getAdminSupabaseAlerts";
import { getAlertSources, getRecentSourceChecks, type RecentSourceCheck } from "@/lib/supabaseSourceWrites";
import type { Session } from "@supabase/supabase-js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const categoryLabels: Record<string, string> = {
  transport: "Transport",
  water:     "Woda",
  power:     "Prąd",
  waste:     "Odpady",
  roads:     "Drogi",
  municipal: "Komunikaty",
};

function statusBadgeClass(status: AdminAlert["status"]): string {
  if (status === "published")
    return "inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700";
  if (status === "archived")
    return "inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700";
  return "inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600";
}

function statusLabel(status: AdminAlert["status"]): string {
  if (status === "published") return "Opublikowany";
  if (status === "archived")  return "Zarchiwizowany";
  return "Draft";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", {
    day:    "2-digit",
    month:  "2-digit",
    year:   "numeric",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

const CHECK_RESULT_LABELS: Record<string, { label: string; color: string }> = {
  no_changes:     { label: "Brak zmian",                     color: "text-slate-600" },
  found_notice:   { label: "Znaleziono komunikat",           color: "text-blue-600" },
  alert_created:  { label: "Przygotowano alert",             color: "text-emerald-600" },
  needs_followup: { label: "Wymaga późniejszego sprawdzenia", color: "text-amber-600" },
};

function sourceNeedsChecking(lastCheckedAt: string | undefined, isActive: boolean): boolean {
  if (!isActive) return false;
  if (!lastCheckedAt) return true;
  const today = new Date().toISOString().split("T")[0];
  return lastCheckedAt.split("T")[0] !== today;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [session, setSession]           = useState<Session | null>(null);
  const [authLoading, setAuthLoading]   = useState(true);

  const [alerts, setAlerts]             = useState<AdminAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);

  const [sourcesToCheck, setSourcesToCheck]   = useState(0);
  const [sourcesLoading, setSourcesLoading]   = useState(false);
  const [recentChecks, setRecentChecks]       = useState<RecentSourceCheck[]>([]);

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => setSession(newSession)
    );

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;

    // Load alerts
    setAlertsLoading(true);
    getAdminSupabaseAlerts().then(({ alerts: loaded }) => {
      setAlerts(loaded);
      setAlertsLoading(false);
    });

    // Load sources-to-check count and recent check history
    setSourcesLoading(true);
    Promise.all([
      getAlertSources(),
      getRecentSourceChecks(3),
    ]).then(([sourcesResult, checksResult]) => {
      const count = sourcesResult.sources.filter((s) =>
        sourceNeedsChecking(s.lastCheckedAt, s.isActive)
      ).length;
      setSourcesToCheck(count);
      setRecentChecks(checksResult.checks);
      setSourcesLoading(false);
    });
  }, [session]);

  // ── Auth states ───────────────────────────────────────────────────────────

  if (authLoading) {
    return <main className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-10" />;
  }

  if (!session) {
    return (
      <main className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-10">
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
          <p className="text-lg font-semibold text-slate-700 mb-2">
            Panel admina jest dostępny po zalogowaniu.
          </p>
          <p className="text-sm text-slate-400 mb-8">
            Zaloguj się, aby zobaczyć statystyki i zarządzać alertami.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Przejdź do logowania →
          </Link>
        </div>
      </main>
    );
  }

  // ── Stats ────────────────────────────────────────────────────────────────

  const total          = alerts.length;
  const publishedCount = alerts.filter((a) => a.status === "published").length;
  const draftCount     = alerts.filter((a) => a.status === "draft").length;
  const archivedCount  = alerts.filter((a) => a.status === "archived").length;

  const recent = [...alerts]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);

  const stats = [
    { label: "Wszystkie alerty", value: total,          color: "text-slate-900" },
    { label: "Opublikowane",     value: publishedCount, color: "text-emerald-700" },
    { label: "Drafty",           value: draftCount,     color: "text-slate-700" },
    { label: "Zarchiwizowane",   value: archivedCount,  color: "text-amber-700" },
  ];

  const quickActions = [
    { href: "/builder",       title: "Kreator alertu",      desc: "Twórz, edytuj i publikuj alerty w Supabase.",    border: "border-amber-200 hover:border-amber-300" },
    { href: "/ai-helper",     title: "AI Helper",           desc: "Przygotuj treść alertu z pomocą AI.",             border: "border-purple-200 hover:border-purple-300" },
    { href: "/admin/sources", title: "Źródła",              desc: "Zarządzaj źródłami komunikatów.",                border: "border-slate-200 hover:border-slate-300" },
    { href: "/",              title: "Publiczna lista alertów", desc: "Sprawdź co widzą mieszkańcy.",               border: "border-blue-200 hover:border-blue-300" },
  ];

  return (
    <main className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-10">

      {/* Page header */}
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-2.5 mb-1">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Panel admina</h1>
          <span className="inline-flex items-center text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
            Admin
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500 leading-relaxed">
          Szybki podgląd alertów i narzędzi roboczych Alertownika.
        </p>
      </div>

      {/* ── Alert stats cards ──────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Statystyki alertów</h2>

        {alertsLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 animate-pulse">
                <div className="h-7 w-10 bg-slate-100 rounded mb-2" />
                <div className="h-3 w-20 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {stats.map((s) => (
              <div key={s.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-500 mt-1 leading-snug">{s.label}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Sources to check ──────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Źródła do sprawdzenia</h2>

        {sourcesLoading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse space-y-3">
            <div className="h-8 w-12 bg-slate-100 rounded" />
            <div className="h-3 w-48 bg-slate-100 rounded" />
            <div className="h-px bg-slate-100 my-2" />
            <div className="h-3 w-40 bg-slate-100 rounded" />
            <div className="h-3 w-52 bg-slate-100 rounded" />
          </div>
        ) : (
          <div
            className={`bg-white rounded-2xl border shadow-sm p-5 ${
              sourcesToCheck > 0 ? "border-amber-200" : "border-slate-200"
            }`}
          >
            {/* Count row */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-0">
              <div className="flex-1">
                <p
                  className={`text-3xl font-bold ${
                    sourcesToCheck > 0 ? "text-amber-600" : "text-emerald-600"
                  }`}
                >
                  {sourcesToCheck}
                </p>
                <p className="text-sm text-slate-500 mt-1 leading-snug">
                  {sourcesToCheck > 0
                    ? "aktywnych źródeł nie sprawdzonych dziś"
                    : "Wszystkie aktywne źródła sprawdzone dziś"}
                </p>
              </div>
              <Link
                href="/admin/sources"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors shrink-0"
              >
                Przejdź do źródeł →
              </Link>
            </div>

            {/* Recent checks */}
            {recentChecks.length > 0 && (
              <>
                <div className="border-t border-slate-100 my-4" />
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2.5">
                  Ostatnie sprawdzenia
                </p>
                <div className="flex flex-col gap-2">
                  {recentChecks.map((check) => {
                    const cfg = CHECK_RESULT_LABELS[check.result] ?? { label: check.result, color: "text-slate-600" };
                    return (
                      <div key={check.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                        <span className="font-medium text-slate-800 shrink-0">{check.sourceName}</span>
                        <span className={`text-xs font-medium shrink-0 ${cfg.color}`}>{cfg.label}</span>
                        <span className="text-xs text-slate-400 shrink-0">
                          {new Date(check.checkedAt).toLocaleString("pl-PL", {
                            day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                          })}
                        </span>
                        {check.notes && (
                          <span className="text-xs text-slate-500 truncate">— {check.notes}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* ── Recent alerts ─────────────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Ostatnio zmienione alerty</h2>

        {alertsLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 animate-pulse">
                <div className="flex gap-2 mb-2">
                  <div className="h-5 w-20 bg-slate-100 rounded-full" />
                  <div className="h-5 w-14 bg-slate-100 rounded-full" />
                </div>
                <div className="h-4 w-2/3 bg-slate-100 rounded mb-2" />
                <div className="h-3 w-1/3 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        ) : recent.length === 0 ? (
          <p className="text-sm text-slate-400">Brak alertów w Supabase.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {recent.map((a) => (
              <div
                key={a.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={statusBadgeClass(a.status)}>{statusLabel(a.status)}</span>
                    <span className="text-xs text-slate-400">{categoryLabels[a.category] ?? a.category}</span>
                    {a.sourceName && (
                      <span className="text-xs text-slate-400">· {a.sourceName}</span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {a.title || "Bez tytułu"}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    zmieniono {formatDate(a.updatedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <Link
                    href={`/builder?edit=${a.slug}`}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                  >
                    Edytuj w kreatorze
                  </Link>
                  {a.status === "published" && (
                    <a
                      href={`/alerts/${a.slug}`}
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
                    >
                      Otwórz alert
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Quick actions ──────────────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold text-slate-800 mb-4">Szybkie akcje</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={`bg-white rounded-2xl border shadow-sm p-5 flex flex-col gap-1.5 transition-all hover:shadow-md ${action.border}`}
            >
              <p className="text-sm font-semibold text-slate-900">{action.title}</p>
              <p className="text-xs text-slate-500 leading-relaxed">{action.desc}</p>
              <p className="text-xs font-medium text-blue-600 mt-1">Przejdź →</p>
            </Link>
          ))}
        </div>
      </section>

    </main>
  );
}
