"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  getAdminSupabaseAlerts,
  type AdminAlert,
} from "@/lib/getAdminSupabaseAlerts";
import { getAlertTimeStatus } from "@/lib/getAlertTimeStatus";
import {
  getAlertSources,
  getRecentSourceChecks,
  getSourceCandidates,
  type RecentSourceCheck,
} from "@/lib/supabaseSourceWrites";
import { getSourceCandidateNotices } from "@/lib/supabaseCandidateWrites";
import { getUpcomingWasteScheduleItems } from "@/lib/supabaseWasteWrites";
import { looksLikeTestContent } from "@/lib/testContentDetection";
import type { SourceNoticeCandidate } from "@/types/sourceCandidate";
import type { AlertSource } from "@/types/alertSource";
import type { AlertCategory } from "@/types/alert";
import type { Session } from "@supabase/supabase-js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const categoryLabels: Record<AlertCategory, string> = {
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

// v2 status enum (Sprint 132 schema proposal) — needs_review/approved are
// only ever set by future flows (AI verifier / one-click approve).
const CANDIDATE_STATUS_LABELS_PL: Record<SourceNoticeCandidate["status"], string> = {
  pending: "oczekuje",
  needs_review: "do przeglądu",
  approved: "zatwierdzony",
  rejected: "odrzucony",
  converted_to_draft: "przekształcony w draft",
  published: "opublikowany",
  archived: "zarchiwizowany",
};

const CHECK_RESULT_LABELS: Record<string, { label: string; color: string }> = {
  no_changes:     { label: "Brak zmian",                     color: "text-slate-600" },
  found_notice:   { label: "Znaleziono komunikat",           color: "text-blue-600" },
  alert_created:  { label: "Przygotowano alert",             color: "text-emerald-600" },
  needs_followup: { label: "Wymaga późniejszego sprawdzenia", color: "text-amber-600" },
};

// Same 7-day freshness window as AlertCard's "Nowe" badge — the smoke-test
// card asks "is there a fresh alert visible publicly", so both must agree.
function isFreshPublished(a: AdminAlert): boolean {
  if (a.status !== "published") return false;
  const days = (Date.now() - new Date(a.updatedAt).getTime()) / 86_400_000;
  return days >= 0 && days <= 7;
}

function sourceNeedsChecking(lastCheckedAt: string | undefined, isActive: boolean): boolean {
  if (!isActive) return false;
  if (!lastCheckedAt) return true;
  const today = new Date().toISOString().split("T")[0];
  return lastCheckedAt.split("T")[0] !== today;
}

// Sprint 96 — per-source "where is this in the pipeline" label, used by the
// new "Status workflow źródeł" section. Same "today/yesterday/N dni temu"
// granularity as the relative badge already on /admin/sources (Sprint 77),
// reimplemented here in one line rather than imported, since the two pages
// style it slightly differently (a full badge there, a short label here).
function lastCheckedLabel(lastCheckedAt: string | undefined): string {
  if (!lastCheckedAt) return "Nigdy sprawdzone";
  const today = new Date().toISOString().split("T")[0];
  const checkedDate = lastCheckedAt.split("T")[0];
  if (checkedDate === today) return "Sprawdzone dziś";
  const days = Math.max(0, Math.floor((Date.now() - new Date(lastCheckedAt).getTime()) / 86_400_000));
  return days === 1 ? "Sprawdzone wczoraj" : `Sprawdzone ${days} dni temu`;
}

const DAILY_WORKFLOW_STEPS: { label: string; note: string; href?: string }[] = [
  { label: "Sprawdź źródła priorytetowe",  note: "Zacznij od źródeł oznaczonych „Do sprawdzenia”.", href: "/admin/sources" },
  { label: "Przejrzyj treść źródła",       note: "Użyj „Sprawdź stronę”, by pobrać podgląd i kandydatów na komunikaty.", href: "/admin/sources" },
  { label: "Wygeneruj draft AI (opcjonalnie)", note: "Z karty źródła albo w AI Helperze — jeśli komunikat jest na to gotowy.", href: "/ai-helper" },
  { label: "Edytuj w Kreatorze",           note: "Popraw daty, lokalizację i treść przed publikacją.", href: "/builder" },
  { label: "Zatwierdź i opublikuj ręcznie", note: "AI nigdy nie publikuje samodzielnie — to zawsze robi admin." },
  { label: "Sprawdź alert publicznie",     note: "Zerknij na stronę główną, żeby zobaczyć to, co zobaczy mieszkaniec.", href: "/" },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [session, setSession]           = useState<Session | null>(null);
  const [authLoading, setAuthLoading]   = useState(true);

  const [alerts, setAlerts]             = useState<AdminAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError]   = useState<string | null>(null);

  const [sourcesToCheck, setSourcesToCheck]   = useState(0);
  const [sourcesLoading, setSourcesLoading]   = useState(false);
  const [recentChecks, setRecentChecks]       = useState<RecentSourceCheck[]>([]);
  const [pendingCandidates, setPendingCandidates] = useState(0);

  // Sprint 96 — per-source operational status ("Status workflow źródeł").
  // All three are derived from data this page already fetches elsewhere
  // (or, for alert counts, the same direct query /admin/sources already
  // runs) — no new tables, no new Supabase functions.
  const [activeSources, setActiveSources] = useState<AlertSource[]>([]);
  const [sourceAlertCounts, setSourceAlertCounts] = useState<Record<string, number>>({});
  const [sourceCandidateCounts, setSourceCandidateCounts] = useState<Record<string, number>>({});

  // Persistent candidates (Sprint 78) — undefined while loading, null if the
  // migration hasn't been run yet (table missing), array once loaded.
  const [persistentNotices, setPersistentNotices] = useState<SourceNoticeCandidate[] | null>(null);

  // Waste schedule (Sprint 80/81) — null while loading or if the migration
  // hasn't been run yet (table missing), a count once loaded.
  const [wasteScheduleCount, setWasteScheduleCount] = useState<number | null>(null);
  const [wasteScheduleEnabled, setWasteScheduleEnabled] = useState(false);

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
    getAdminSupabaseAlerts().then(({ alerts: loaded, error }) => {
      setAlerts(loaded);
      setAlertsError(error);
      setAlertsLoading(false);
    });

    // Load sources-to-check count, recent check history, and pending candidates
    setSourcesLoading(true);
    Promise.all([
      getAlertSources(),
      getRecentSourceChecks(3),
      getSourceCandidates(100),
      getSourceCandidateNotices(),
      getUpcomingWasteScheduleItems(200),
      supabase
        ? supabase.from("alerts").select("source_id").not("source_id", "is", null)
        : Promise.resolve({ data: null }),
    ]).then(([sourcesResult, checksResult, candidatesResult, noticesResult, wasteResult, alertSourceRows]) => {
      const count = sourcesResult.sources.filter((s) =>
        sourceNeedsChecking(s.lastCheckedAt, s.isActive)
      ).length;
      setSourcesToCheck(count);
      setRecentChecks(checksResult.checks);
      setPendingCandidates(
        candidatesResult.candidates.filter((c) => !c.relatedAlertId).length
      );
      setPersistentNotices(noticesResult.tableMissing ? null : noticesResult.candidates);
      setWasteScheduleEnabled(!wasteResult.tableMissing);
      setWasteScheduleCount(wasteResult.tableMissing ? null : wasteResult.items.length);

      // Sprint 96 — per-source operational status, combining counts already
      // available from the calls above (no extra Supabase round-trips besides
      // the one direct alerts query, mirroring /admin/sources' loadAlertCounts).
      setActiveSources(sourcesResult.sources.filter((s) => s.isActive));

      const candidateCounts: Record<string, number> = {};
      for (const c of candidatesResult.candidates) {
        if (c.relatedAlertId) continue;
        candidateCounts[c.sourceId] = (candidateCounts[c.sourceId] ?? 0) + 1;
      }
      if (!noticesResult.tableMissing) {
        for (const n of noticesResult.candidates) {
          if (n.status !== "pending" || !n.sourceId) continue;
          candidateCounts[n.sourceId] = (candidateCounts[n.sourceId] ?? 0) + 1;
        }
      }
      setSourceCandidateCounts(candidateCounts);

      const alertCounts: Record<string, number> = {};
      const rows = (alertSourceRows as { data: { source_id: string }[] | null }).data;
      for (const row of rows ?? []) {
        alertCounts[row.source_id] = (alertCounts[row.source_id] ?? 0) + 1;
      }
      setSourceAlertCounts(alertCounts);

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

  // Sprint 98 — "Before sending beta link" checklist, data-driven where
  // possible instead of a static reminder list, reusing data this page
  // already fetches (no new queries). Minimums are a judgment call, not a
  // hard rule — see docs/admin-clickthrough-runbook.md / Public Beta
  // Readiness in Obsidian for the fuller reasoning.
  const publishedCategorySet = new Set(
    alerts.filter((a) => a.status === "published").map((a) => a.category)
  );
  const publishedCategoryCount = publishedCategorySet.size;
  // Sprint 103 — name the gap, not just the count, so "what to source
  // next" is a glance, not a guess (feeds Real Data Admin Checklist).
  const missingCategoryLabels = (Object.entries(categoryLabels) as [AlertCategory, string][])
    .filter(([key]) => !publishedCategorySet.has(key))
    .map(([, label]) => label);
  const MIN_RECOMMENDED_ALERTS = 5;
  const MIN_RECOMMENDED_CATEGORIES = 3;

  const recent = [...alerts]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);

  const draftAlerts = alerts
    .filter((a) => a.status === "draft")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);

  const suspiciousPublished = alerts.filter(
    (a) => a.status === "published" && looksLikeTestContent(a.title || "")
  );

  // Sprint 117 — inputs for the "Co teraz?" task cards, derived from the
  // alerts already fetched above (no new queries). "Ended but still
  // published" is the cleanup queue: archive, never delete.
  const endedPublished = alerts.filter(
    (a) => a.status === "published" && getAlertTimeStatus(a.startsAt, a.endsAt) === "ended"
  );
  const publishedMissingSource = alerts.filter(
    (a) => a.status === "published" && !(a.sourceUrl ?? "").trim()
  );
  const freshPublishedCount = alerts.filter(isFreshPublished).length;

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
    { href: "/admin/queue",   title: "Kolejka kandydatów",  desc: "Przejrzyj znalezione komunikaty czekające na decyzję.", border: "border-purple-200 hover:border-purple-300" },
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
          Przegląd alertów, źródeł do sprawdzenia i ostatnich działań.
        </p>
      </div>

      {/* ── "Co teraz?" — task cards (Sprint 117) ──────────────────────── */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-slate-800 mb-1">Co teraz?</h2>
        <p className="text-xs text-slate-400 mb-4">
          Zadania w kolejności — liczby pochodzą z bazy, nie z pamięci.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

          {/* 1 — Draft from Source (primary) */}
          <div className="sm:col-span-2 rounded-2xl border border-blue-200 bg-blue-50 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-blue-900 mb-1">
              1. Utwórz alert ze źródła
            </h3>
            <p className="text-sm text-blue-800 leading-relaxed mb-3">
              Wklej link i treść komunikatu. Alertownik przygotuje szkic.
              Publikacja wymaga ręcznego zatwierdzenia.
            </p>
            <Link
              href="/admin/new-alert"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Nowy alert ze źródła →
            </Link>
          </div>

          {/* 2 — Verify drafts */}
          <div className={`rounded-2xl border shadow-sm p-5 bg-white ${draftCount > 0 ? "border-amber-200" : "border-slate-200"}`}>
            <h3 className="text-sm font-semibold text-slate-800 mb-1">
              2. Sprawdź drafty{!alertsLoading && draftCount > 0 && ` (${draftCount})`}
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed mb-3">
              Zweryfikuj źródło i opublikuj tylko prawdziwe komunikaty.
              Brak linku do źródła = nie publikuj.
            </p>
            <Link
              href="/builder?tab=alerts&status=draft"
              className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
            >
              Otwórz listę draftów →
            </Link>
          </div>

          {/* 3 — Cleanup */}
          <div className={`rounded-2xl border shadow-sm p-5 bg-white ${endedPublished.length > 0 ? "border-amber-200" : "border-slate-200"}`}>
            <h3 className="text-sm font-semibold text-slate-800 mb-1">
              3. Posprzątaj stare alerty{!alertsLoading && endedPublished.length > 0 && ` (${endedPublished.length})`}
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed mb-3">
              {!alertsLoading && endedPublished.length > 0
                ? `${endedPublished.length === 1 ? "1 opublikowany alert już się zakończył" : `${endedPublished.length} opublikowane alerty już się zakończyły`} — zarchiwizuj je w Kreatorze.`
                : "Brak zakończonych alertów do archiwizacji."}{" "}
              Zawsze archiwizuj zamiast usuwać — archiwum można przywrócić.
            </p>
            <Link
              href="/builder?tab=alerts&status=published"
              className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
            >
              Otwórz opublikowane →
            </Link>
          </div>

          {/* 4 — Smoke test readiness */}
          <div className="rounded-2xl border border-slate-200 shadow-sm p-5 bg-white">
            <h3 className="text-sm font-semibold text-slate-800 mb-2">
              4. Wyślij smoke test
            </h3>
            <ul className="text-sm text-slate-600 space-y-1 mb-3">
              <li className="flex items-start gap-2">
                <span className={freshPublishedCount > 0 ? "text-emerald-600" : "text-amber-600"}>
                  {freshPublishedCount > 0 ? "✓" : "○"}
                </span>
                <span>Świeży alert widoczny publicznie</span>
              </li>
              <li className="flex items-start gap-2">
                <span className={endedPublished.length === 0 ? "text-emerald-600" : "text-amber-600"}>
                  {endedPublished.length === 0 ? "✓" : "○"}
                </span>
                <span>Stare alerty zarchiwizowane</span>
              </li>
              <li className="flex items-start gap-2">
                <span className={publishedMissingSource.length === 0 ? "text-emerald-600" : "text-amber-600"}>
                  {publishedMissingSource.length === 0 ? "✓" : "○"}
                </span>
                <span>Każdy opublikowany alert ma link do źródła</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-slate-400">○</span>
                <span>Widok na telefonie sprawdzony ręcznie</span>
              </li>
            </ul>
            <Link
              href="/"
              className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
            >
              Zobacz stronę jak mieszkaniec →
            </Link>
          </div>

          {/* 5 — Data expansion (Sprint 121 — smoke-test feedback: the
              bottleneck is data coverage, not UI; priority order from the
              first real tester response) */}
          <div className="sm:col-span-2 rounded-2xl border border-emerald-200 bg-emerald-50 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-emerald-900 mb-1">
              5. Uzupełnij dane: odpady / prąd / woda / remonty
            </h3>
            <p className="text-sm text-emerald-800 leading-relaxed mb-3">
              Feedback ze smoke testu: aplikacja jest zrozumiała i przydatna,
              ale brakuje danych. Priorytety: terminy odbioru odpadów
              {wasteScheduleCount !== null && ` (obecnie: ${wasteScheduleCount} terminów)`},
              planowane wyłączenia prądu (PGE), przerwy w dostawie wody i
              ciepłej wody, remonty dróg.
              {!alertsLoading && missingCategoryLabels.length > 0 && (
                <> Kategorie bez opublikowanego alertu: {missingCategoryLabels.join(", ")}.</>
              )}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <Link
                href="/admin/waste"
                className="text-sm font-medium text-emerald-700 hover:text-emerald-900 hover:underline"
              >
                Importuj harmonogram odpadów →
              </Link>
              <Link
                href="/admin/sources"
                className="text-sm font-medium text-emerald-700 hover:text-emerald-900 hover:underline"
              >
                Sprawdź źródła (PGE, gmina, Pruszków) →
              </Link>
            </div>
          </div>

          {/* 6 — Source Checker Dashboard v1 (Sprint 129 — static checklist
              of official sources on /admin/sources; manual, source-first) */}
          <div className="sm:col-span-2 rounded-2xl border border-blue-200 bg-white shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-1">
              6. Sprawdź źródła
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed mb-3">
              Lista oficjalnych źródeł do ręcznego sprawdzania. Jeśli znajdziesz
              komunikat, utwórz szkic przez Draft from Source.
            </p>
            <Link
              href="/admin/sources#checklista"
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors"
            >
              Przejdź do źródeł →
            </Link>
          </div>

          {/* 7 — PGE planned outages manual check (Sprint 126 — the next
              data category after waste got its first positive signal;
              manual browser check only, no scraping/automation) */}
          <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-white shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-1">
              7. Sprawdź PGE / prąd
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed mb-3">
              PGE Dystrybucja to oficjalne źródło planowanych wyłączeń prądu —
              gmina Michałowice sama odsyła tam mieszkańców. Sprawdź ręcznie w
              przeglądarce miejscowości: Komorów, Nowa Wieś, Granica,
              Michałowice, Reguły, Pruszków. Znalezione wyłączenie przepisz
              przez „Nowy alert ze źródła" (draft) i opublikuj dopiero po
              zweryfikowaniu szczegółów w komunikacie PGE.
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <a
                href="https://pgedystrybucja.pl/wylaczenia/planowane-wylaczenia"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
              >
                Planowane wyłączenia PGE →
              </a>
              <Link
                href="/admin/new-alert"
                className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
              >
                Nowy alert ze źródła →
              </Link>
              <Link
                href="/admin/sources"
                className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
              >
                Zaloguj check w Źródłach →
              </Link>
            </div>
          </div>

          {/* Future: AI verifier */}
          <div className="sm:col-span-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
            <h3 className="text-sm font-semibold text-slate-500 mb-1">
              Następny etap: AI verifier (jeszcze nie wdrożony)
            </h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              W przyszłości AI sprawdzi źródło, datę, obszar i ryzyko, zanim
              zaproponuje publikację. Decyzja o publikacji pozostanie zawsze
              po stronie człowieka.
            </p>
            <p className="text-sm text-slate-500 leading-relaxed mt-2">
              Automatyzacja będzie działać przez kolejkę kandydatów
              (candidate queue) — najpierw bez autopublish.
            </p>
          </div>
        </div>
      </section>

      {alertsError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 mb-6">
          <p className="text-sm font-medium text-red-700">
            Nie udało się pobrać alertów z Supabase. Statystyki i listy poniżej mogą być niepełne.
          </p>
          <p className="text-xs text-red-500 mt-1 font-mono">{alertsError}</p>
        </div>
      )}

      {/* ── Pre-launch content hygiene ────────────────────────────────── */}
      <section className="mb-8">
        <div
          className={`rounded-2xl border shadow-sm p-5 ${
            suspiciousPublished.length > 0
              ? "border-red-300 bg-red-50"
              : "border-slate-200 bg-white"
          }`}
        >
          <h2
            className={`text-base font-semibold mb-1 ${
              suspiciousPublished.length > 0 ? "text-red-800" : "text-slate-800"
            }`}
          >
            Przed wysłaniem linku testerom
          </h2>

          {!alertsLoading && suspiciousPublished.length > 0 ? (
            <>
              <p className="text-sm font-medium text-red-700 mt-2 mb-2">
                {suspiciousPublished.length === 1
                  ? "Wykryto 1 opublikowany alert, który wygląda na dane testowe:"
                  : `Wykryto ${suspiciousPublished.length} opublikowane alerty, które wyglądają na dane testowe:`}
              </p>
              <ul className="text-sm text-red-700 space-y-1 mb-3 list-disc list-inside">
                {suspiciousPublished.map((a) => (
                  <li key={a.id}>
                    „{a.title || "Bez tytułu"}" ({categoryLabels[a.category] ?? a.category})
                    {" — "}
                    <Link
                      href={`/builder?edit=${a.slug}`}
                      className="font-medium underline hover:text-red-900"
                    >
                      otwórz w Kreatorze, by zarchiwizować
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-red-600 mb-3">
                Wykryte po słowach w tytule (np. „test", „AAAAAA", „placeholder") — to
                tylko podejrzenie, zweryfikuj ręcznie przed decyzją.
              </p>
            </>
          ) : (
            <p className="text-sm text-emerald-700 font-medium mt-2 mb-3">
              Nie wykryto opublikowanych alertów z podejrzanymi tytułami (test/placeholder).
            </p>
          )}

          <ul className="text-sm text-slate-600 space-y-1.5 list-disc list-inside">
            <li>Zarchiwizuj wszystkie alerty testowe (status → Zarchiwizowany) — nie usuwaj danych.</li>
            <li>Nie publikuj alertów z tytułami typu „test", „AAAAAA" albo innym placeholderem.</li>
            <li>Upewnij się, że publiczne alerty są aktualne albo jasno oznaczone jako pilotażowe/demo.</li>
            <li>
              Sprawdź publiczną listę w oknie incognito albo wylogowany —{" "}
              <Link href="/" className="font-medium text-blue-600 hover:underline">
                zobacz stronę główną
              </Link>{" "}
              tak, jak zobaczy ją tester.
            </li>
          </ul>

          {/* Sprint 98 — data-driven checklist for sending the link to a
              wider, less-curated group, reusing data already loaded above
              (no new queries). Mobile/feedback-mailto can't be checked
              from data, so those stay as explicit manual reminders. */}
          <details className="border-t border-slate-100 mt-4 pt-4 group">
            <summary className="text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer select-none hover:text-slate-700 mb-2.5">
              Pełna checklista przed wysłaniem do szerszej grupy
              <span className="ml-1 font-normal normal-case text-slate-400">(rozwiń)</span>
            </summary>
            <ul className="text-sm text-slate-600 space-y-1.5">
              <li className="flex items-start gap-2">
                <span className={publishedCount >= MIN_RECOMMENDED_ALERTS && publishedCategoryCount >= MIN_RECOMMENDED_CATEGORIES ? "text-emerald-600" : "text-amber-600"}>
                  {publishedCount >= MIN_RECOMMENDED_ALERTS && publishedCategoryCount >= MIN_RECOMMENDED_CATEGORIES ? "✓" : "○"}
                </span>
                <span>
                  <span className="font-medium text-slate-800">{publishedCount}</span> opublikowanych
                  alertów w <span className="font-medium text-slate-800">{publishedCategoryCount}/6</span>{" "}
                  kategoriach (rekomendowane minimum: {MIN_RECOMMENDED_ALERTS} alertów w {MIN_RECOMMENDED_CATEGORIES}+ kategoriach).
                  {missingCategoryLabels.length > 0 && (
                    <> Brakuje: {missingCategoryLabels.join(", ")}.</>
                  )}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className={sourcesToCheck === 0 ? "text-emerald-600" : "text-amber-600"}>
                  {sourcesToCheck === 0 ? "✓" : "○"}
                </span>
                <span>
                  {sourcesToCheck === 0
                    ? "Wszystkie aktywne źródła sprawdzone dziś."
                    : `${sourcesToCheck} aktywnych źródeł nie sprawdzonych dziś — `}
                  {sourcesToCheck > 0 && (
                    <Link href="/admin/sources" className="font-medium text-blue-600 hover:underline">
                      sprawdź teraz →
                    </Link>
                  )}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-slate-400">○</span>
                <span>
                  Harmonogram odpadów:{" "}
                  {!wasteScheduleEnabled
                    ? "migracja nie uruchomiona — to nie błąd, /odpady pokazuje uczciwy stan „w przygotowaniu”."
                    : wasteScheduleCount === 0
                      ? "tabela włączona, ale 0 terminów — /odpady pokaże uczciwy puste-stan, nie błąd."
                      : `${wasteScheduleCount} zapisanych terminów.`}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-slate-400">○</span>
                <span>
                  Sprawdź ręcznie, że link feedbackowy (mailto) otwiera się poprawnie na telefonie —{" "}
                  <Link href="/about#feedback" className="font-medium text-blue-600 hover:underline">
                    zobacz na /about
                  </Link>.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-slate-400">○</span>
                <span>Sprawdź wygląd na telefonie (np. w trybie incognito) — homepage, /odpady, /about.</span>
              </li>
            </ul>

            {/* Sprint 99 — items the dashboard genuinely can't check from
                data (deployment health, login, secrets, the test suite) —
                explicit manual reminders instead of silently omitting them. */}
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-4 mb-2.5">
              Dodatkowo przed wysłaniem (Sprint 99)
            </p>
            <ul className="text-sm text-slate-600 space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-slate-400">○</span>
                <span>
                  Otwórz żywy adres na Vercelu (nie tylko localhost) i sprawdź, że strona się ładuje.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-slate-400">○</span>
                <span>Zaloguj się ponownie na koncie admina — sprawdź, że logowanie wciąż działa.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-slate-400">○</span>
                <span>
                  Sprawdź, że żaden klucz/sekret (Supabase service_role, ANTHROPIC_API_KEY) nie trafił do
                  kodu albo commita — tylko zmienne środowiskowe na Vercelu.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-slate-400">○</span>
                <span>
                  Uruchom <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">npm run check</span>{" "}
                  i <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">npm run test:e2e</span> — oba muszą przejść.
                </span>
              </li>
            </ul>
          </details>
        </div>
      </section>

      {/* ── Daily operations checklist ────────────────────────────────── */}
      <section className="mb-8">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-base font-semibold text-slate-800 mb-3">
            Codzienny workflow admina
          </h2>
          <p className="text-sm text-slate-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-4 leading-relaxed">
            <span className="font-semibold text-blue-800">Szybki start:</span>{" "}
            masz link z komunikatem? Użyj{" "}
            <Link href="/admin/new-alert" className="font-medium text-blue-700 hover:underline">
              Nowy alert ze źródła
            </Link>{" "}
            — wklejasz treść, dostajesz szkic, zapisujesz draft i publikujesz
            po weryfikacji w{" "}
            <Link href="/builder" className="font-medium text-blue-700 hover:underline">
              Kreatorze
            </Link>
            . Nie musisz znać kroków na pamięć — pełna lista jest pod spodem.
          </p>
          <details>
            <summary className="text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer select-none hover:text-slate-700 mb-3">
              Pełna lista kroków
              <span className="ml-1 font-normal normal-case text-slate-400">(rozwiń)</span>
            </summary>
          <ol className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {DAILY_WORKFLOW_STEPS.map((step, i) => (
              <li key={step.label} className="flex items-start gap-2.5">
                <span className="shrink-0 w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  {step.href ? (
                    <Link href={step.href} className="text-sm font-medium text-blue-700 hover:text-blue-900 hover:underline">
                      {step.label}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium text-slate-800">{step.label}</span>
                  )}
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{step.note}</p>
                </div>
              </li>
            ))}
          </ol>
          </details>
        </div>
      </section>

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

      {/* ── Drafts needing attention ──────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Wymaga uwagi</h2>

        {alertsLoading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse">
            <div className="h-4 w-48 bg-slate-100 rounded" />
          </div>
        ) : draftAlerts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-sm text-emerald-700 font-medium">
              Brak draftów czekających na dokończenie.
            </p>
          </div>
        ) : (
          <div
            className={`bg-white rounded-2xl border shadow-sm p-5 ${
              draftAlerts.length > 0 ? "border-amber-200" : "border-slate-200"
            }`}
          >
            <p className="text-sm text-amber-700 font-medium mb-3">
              {draftAlerts.length === 1
                ? "1 draft czeka na dokończenie"
                : `${draftAlerts.length} drafty czekają na dokończenie`}
            </p>
            <div className="flex flex-col gap-2.5">
              {draftAlerts.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 first:border-0 first:pt-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {a.title || "Bez tytułu"}
                    </p>
                    <p className="text-xs text-slate-400">
                      {categoryLabels[a.category] ?? a.category} · zmieniono {formatDate(a.updatedAt)}
                    </p>
                  </div>
                  <Link
                    href={`/builder?edit=${a.slug}`}
                    className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100 transition-colors"
                  >
                    Dokończ w kreatorze
                  </Link>
                </div>
              ))}
            </div>
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

      {/* ── Candidate queue (Sprint 131) ───────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-slate-800 mb-1">Kolejka kandydatów</h2>
        <p className="text-xs text-slate-400 mb-4 leading-relaxed">
          Tu będą trafiały komunikaty znalezione przez automatyzację. Najpierw
          sprawdzimy je ręcznie, potem dodamy AI verifier.
        </p>

        {sourcesLoading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse">
            <div className="h-8 w-12 bg-slate-100 rounded mb-2" />
            <div className="h-3 w-48 bg-slate-100 rounded" />
          </div>
        ) : (
          <div
            className={`bg-white rounded-2xl border shadow-sm p-5 flex flex-col sm:flex-row sm:items-center gap-4 ${
              pendingCandidates > 0 ? "border-purple-200" : "border-slate-200"
            }`}
          >
            <div className="flex-1">
              <p className={`text-3xl font-bold ${pendingCandidates > 0 ? "text-purple-600" : "text-emerald-600"}`}>
                {pendingCandidates}
              </p>
              <p className="text-sm text-slate-500 mt-1 leading-snug">
                {pendingCandidates > 0
                  ? "komunikatów czeka na przygotowanie alertu"
                  : "Brak kandydatów czekających na decyzję"}
              </p>
            </div>
            <div className="flex flex-col items-start gap-1.5 shrink-0">
              <Link
                href="/admin/queue"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
              >
                Otwórz kolejkę →
              </Link>
              <div className="flex flex-wrap gap-x-3">
                <Link
                  href="/admin/sources"
                  className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
                >
                  Sprawdź źródła →
                </Link>
                <Link
                  href="/admin/new-alert"
                  className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
                >
                  Draft from Source →
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Sprint 92: the waste-schedule section below already tells the
            admin explicitly when its migration hasn't run — this section
            silently rendered nothing in that case instead, which hid a
            real, long-standing blocker (11+ sprints as of Sprint 90) from
            the one place an admin would otherwise see it. */}
        {!sourcesLoading && persistentNotices === null && (
          <div className="mt-3 bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-sm font-medium text-slate-700 mb-1">
              Supabase nie widzi tabeli kandydatów.
            </p>
            <p className="text-sm text-slate-500 leading-relaxed">
              Migracja{" "}
              <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                docs/sprint132_candidate_persistence_schema_proposal.sql
              </span>{" "}
              została zatwierdzona i uruchomiona (Sprint 133) — jeśli ten komunikat
              pojawia się tuż po migracji, odśwież stronę za chwilę (cache schematu
              PostgREST). W nowym środowisku uruchom migrację ręcznie w SQL Editorze.
              Do tego czasu kandydaci są widoczni tylko w starszym widoku w{" "}
              <Link href="/admin/queue" className="font-medium text-blue-600 hover:underline">
                Kandydatach
              </Link>.
            </p>
          </div>
        )}

        {/* Persistent candidates (Sprint 78) — only rendered once the
            source_notice_candidates migration has actually been run. */}
        {!sourcesLoading && persistentNotices && (
          <div className="mt-3 bg-slate-50 rounded-2xl border border-slate-200 p-5">
            <p className="text-sm font-medium text-slate-700 mb-2">
              Trwali kandydaci: {persistentNotices.filter((n) => n.status === "pending").length} oczekujących
            </p>
            {(() => {
              const recent = [...persistentNotices]
                .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))
                .slice(0, 3);
              const recentlyConverted = persistentNotices
                .filter((n) => n.status === "converted_to_draft" || n.status === "published")
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                .slice(0, 2);
              if (recent.length === 0) {
                return <p className="text-sm text-slate-400">Brak zapisanych kandydatów jeszcze.</p>;
              }
              return (
                <div className="space-y-1.5">
                  {recent.map((n) => (
                    <p key={n.id} className="text-xs text-slate-600 truncate">
                      <span className="font-medium text-slate-800">{n.title}</span>
                      {" — "}{n.sourceName}
                      {" · "}
                      <span className="text-slate-400">{CANDIDATE_STATUS_LABELS_PL[n.status]}</span>
                    </p>
                  ))}
                  {recentlyConverted.length > 0 && (
                    <p className="text-xs text-emerald-700 pt-1">
                      Ostatnio wykorzystane: {recentlyConverted.map((n) => n.title).join(", ")}
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </section>

      {/* ── Per-source operational status (Sprint 96) ─────────────────── */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-slate-800 mb-1">Status workflow źródeł</h2>
        <p className="text-xs text-slate-400 mb-4 leading-relaxed">
          Cały pipeline w jednym miejscu: źródło → sprawdzenie → kandydaci → alerty.
          Liczby pochodzą z danych już wczytanych powyżej — bez nowych zapytań.
        </p>

        {sourcesLoading ? (
          <div className="flex flex-col gap-2">
            {[1, 2].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse h-16" />
            ))}
          </div>
        ) : activeSources.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-sm font-medium text-slate-700 mb-1">Brak aktywnych źródeł.</p>
            <p className="text-sm text-slate-500 leading-relaxed">
              Dodaj pierwsze źródło w{" "}
              <Link href="/admin/sources" className="font-medium text-blue-600 hover:underline">
                Źródłach
              </Link>{" "}
              — bez źródła pipeline źródło→kandydat→alert nie ma od czego zacząć.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {[...activeSources]
              .sort((a, b) => (a.lastCheckedAt ?? "").localeCompare(b.lastCheckedAt ?? ""))
              .map((s) => {
                const candidateCount = sourceCandidateCounts[s.id] ?? 0;
                const alertCount = sourceAlertCounts[s.id] ?? 0;
                return (
                  <div
                    key={s.id}
                    className="bg-white rounded-xl border border-slate-200 p-3.5 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900 truncate">{s.name}</span>
                        <span className="text-xs text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
                          {categoryLabels[s.category] ?? s.category}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        {lastCheckedLabel(s.lastCheckedAt)}
                        {" · "}
                        {candidateCount > 0 ? (
                          <span className="text-purple-600 font-medium">{candidateCount} kandydat(ów)</span>
                        ) : (
                          "0 kandydatów"
                        )}
                        {" · "}
                        {alertCount} {alertCount === 1 ? "alert" : "alertów"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                      <Link
                        href="/admin/sources"
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                      >
                        Sprawdź źródło →
                      </Link>
                      {candidateCount > 0 && (
                        <Link
                          href={`/admin/queue?source=${s.id}`}
                          className="rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100 transition-colors"
                        >
                          Przejrzyj kandydatów →
                        </Link>
                      )}
                      <Link
                        href="/builder"
                        className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
                      >
                        Kreator →
                      </Link>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </section>

      {/* ── Waste schedule status (Sprint 80/81) ──────────────────────── */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Harmonogram odpadów</h2>

        {sourcesLoading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse">
            <div className="h-4 w-48 bg-slate-100 rounded" />
          </div>
        ) : !wasteScheduleEnabled ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-sm font-medium text-slate-700 mb-1">
              Tabela harmonogramu nie jest jeszcze włączona.
            </p>
            <p className="text-sm text-slate-500 leading-relaxed">
              Uruchom migrację z{" "}
              <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                docs/supabase_waste_schedule_items.sql
              </span>{" "}
              w Supabase SQL Editor, żeby zacząć dodawać terminy odbioru.{" "}
              <Link href="/odpady" className="font-medium text-blue-600 hover:underline">
                Zobacz publiczną stronę „Odpady" →
              </Link>
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <p className={`text-3xl font-bold ${wasteScheduleCount === 0 ? "text-amber-600" : "text-emerald-600"}`}>
                {wasteScheduleCount}
              </p>
              <p className="text-sm text-slate-500 mt-1 leading-snug">
                {wasteScheduleCount === 0
                  ? "nadchodzących terminów zapisanych — harmonogram jest pusty"
                  : "nadchodzących terminów odbioru zapisanych"}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <Link
                href="/admin/waste"
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Zarządzaj terminami →
              </Link>
              <Link
                href="/odpady"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
              >
                Zobacz publiczną stronę →
              </Link>
            </div>
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

      {/* ── Pilot feedback & observations ───────────────────────────────── */}
      <section className="mt-8">
        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5">
          <h2 className="text-base font-semibold text-slate-800 mb-1">
            Pilotaż — feedback i obserwacje
          </h2>
          <p className="text-sm text-slate-500 mb-3 leading-relaxed">
            Feedback od mieszkańców i testerów przychodzi mailem (link „Napisz do
            nas” / „Chcę testować” na stronie{" "}
            <Link href="/about" className="font-medium text-blue-600 hover:underline">
              O projekcie
            </Link>
            ) — nie ma jeszcze panelu zgłoszeń w aplikacji. Dla każdego zgłoszenia:
          </p>
          <ol className="text-sm text-slate-600 space-y-1.5 list-decimal list-inside">
            <li>zapisz je w tablicy Pilot Feedback Board (Obsidian),</li>
            <li>oznacz priorytet: krytyczne / ważne / później / ignorować,</li>
            <li>krytyczne błędy napraw przed wysłaniem linku kolejnym testerom,</li>
            <li>większe wnioski przenieś do Roadmap / Decisions, żeby wpłynęły na kolejny sprint.</li>
          </ol>
        </div>
      </section>

    </main>
  );
}
