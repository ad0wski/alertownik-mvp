"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import {
  getSourceCandidates,
  getSourceChecks,
  getAlertSources,
  type SourceCandidate,
} from "@/lib/supabaseSourceWrites";
import {
  getSourceCandidateNotices,
  updateCandidateStatus,
} from "@/lib/supabaseCandidateWrites";
import { getAdminSupabaseAlerts, type AdminAlert } from "@/lib/getAdminSupabaseAlerts";
import { getCandidateWarnings, trimAtWord } from "@/lib/candidateWarnings";
import type { SourceCheck } from "@/types/alertSource";
import type { SourceNoticeCandidate, SourceCandidateStatus } from "@/types/sourceCandidate";
import type { AlertCategory } from "@/types/alert";

// ── Constants — same sessionStorage contracts already used by /admin/sources
// and /ai-helper, so this page is just another producer/consumer, not a new
// handoff mechanism. ─────────────────────────────────────────────────────────

const PENDING_SOURCE_KEY = "alertownik_pending_source_for_ai";
const AI_PENDING_KEY = "alertownik_pending_ai_alert_json";
const AI_PENDING_SOURCE_ID_KEY = "alertownik_pending_alert_source_id";
// Sprint 78 — carries a persistent candidate's id through AI Helper to
// Builder, so Builder can mark it "converted" once an alert is saved.
const PENDING_CANDIDATE_ID_KEY = "alertownik_pending_candidate_notice_id";

const categoryLabels: Record<AlertCategory, string> = {
  transport: "Transport",
  water: "Woda",
  power: "Prąd",
  waste: "Odpady",
  roads: "Drogi",
  municipal: "Komunikaty",
};

const resultLabels: Record<string, { label: string; color: string }> = {
  found_notice: { label: "Znaleziono komunikat", color: "text-blue-600 bg-blue-50 border-blue-200" },
  needs_followup: { label: "Wymaga późniejszego sprawdzenia", color: "text-amber-600 bg-amber-50 border-amber-200" },
};

const CANDIDATE_STATUS_LABELS: Record<SourceCandidateStatus, string> = {
  pending: "Oczekujące",
  ignored: "Zignorowane",
  converted: "Wykorzystane",
  archived: "Zarchiwizowane",
};

const POLISH_MAP: Record<string, string> = {
  ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z",
  Ą: "a", Ć: "c", Ę: "e", Ł: "l", Ń: "n", Ó: "o", Ś: "s", Ź: "z", Ż: "z",
};

function toSlug(text: string): string {
  const slug = text
    .split("")
    .map((c) => POLISH_MAP[c] ?? c)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "kandydat";
}

function formatCheckedAt(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function draftTitleFromCandidate(c: SourceCandidate): string {
  const fromNotes = c.notes?.trim() ? trimAtWord(c.notes.trim(), 80) : "";
  return fromNotes || `${c.sourceName} — do uzupełnienia`;
}

// ── Page content (auth-gated) ──────────────────────────────────────────────────

function QueueContent() {
  const router = useRouter();

  // Legacy (source_checks-derived) view — unchanged since Sprint 74/75.
  const [candidates, setCandidates] = useState<SourceCandidate[]>([]);
  const [allChecks, setAllChecks] = useState<SourceCheck[]>([]);

  // Persistent (source_notice_candidates) view — new in Sprint 78.
  const [notices, setNotices] = useState<SourceNoticeCandidate[]>([]);
  const [noticesError, setNoticesError] = useState<string | null>(null);
  const [noticesTableMissing, setNoticesTableMissing] = useState(false);
  const [noticeStatusFilter, setNoticeStatusFilter] = useState<SourceCandidateStatus>("pending");
  const [noticeActionId, setNoticeActionId] = useState<string | null>(null);
  const [sourceCategoryById, setSourceCategoryById] = useState<Record<string, AlertCategory>>({});

  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);
  // Same window.location.search pattern builder.tsx already uses for its
  // ?edit= param — avoids the Suspense-boundary requirement of useSearchParams().
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);

  async function loadPersistentNotices() {
    const result = await getSourceCandidateNotices();
    setNotices(result.candidates);
    setNoticesError(result.tableMissing ? null : result.error ?? null);
    setNoticesTableMissing(Boolean(result.tableMissing));
  }

  useEffect(() => {
    setSourceFilter(new URLSearchParams(window.location.search).get("source"));

    Promise.all([
      getSourceCandidates(100),
      getAdminSupabaseAlerts(),
      getSourceChecks(),
      getAlertSources(),
    ]).then(([candidatesResult, alertsResult, checksResult, sourcesResult]) => {
      setCandidates(candidatesResult.candidates);
      setError(candidatesResult.error ?? null);
      setAlerts(alertsResult.alerts);
      setAllChecks(checksResult.checks);
      const catById: Record<string, AlertCategory> = {};
      for (const s of sourcesResult.sources) catById[s.id] = s.category;
      setSourceCategoryById(catById);
      setLoading(false);
    });

    loadPersistentNotices();
  }, []);

  function clearSourceFilter() {
    setSourceFilter(null);
    router.push("/admin/queue");
  }

  function alertFor(id?: string | null): AdminAlert | null {
    if (!id) return null;
    return alerts.find((a) => a.id === id) ?? null;
  }

  // Lightweight, schema-free duplicate/stale detection — see
  // src/lib/candidateWarnings.ts. Compares against the chronologically
  // previous check of the same source (allChecks is already sorted
  // checked_at desc by getSourceChecks()) and against known alert titles.
  function warningsFor(c: SourceCandidate): string[] {
    const sourceHistory = allChecks.filter((chk) => chk.sourceId === c.sourceId);
    const idx = sourceHistory.findIndex((chk) => chk.id === c.id);
    const previousCheckNotes = idx >= 0 ? sourceHistory[idx + 1]?.notes : undefined;

    return getCandidateWarnings(
      { sourceUrl: c.sourceUrl, notes: c.notes },
      { previousCheckNotes, alertTitles: alerts.map((a) => a.title) }
    );
  }

  function sendToAiHelper(c: SourceCandidate) {
    sessionStorage.setItem(
      PENDING_SOURCE_KEY,
      JSON.stringify({
        sourceName: c.sourceName,
        sourceUrl: c.sourceUrl,
        suggestedCategory: c.sourceCategory,
        sourceId: c.sourceId,
        checkNotes: c.notes ?? "",
      })
    );
    setSentId(c.id);
    router.push("/ai-helper");
  }

  function createBuilderDraft(c: SourceCandidate) {
    const title = draftTitleFromCandidate(c);
    const draft = {
      category: c.sourceCategory,
      severity: "info",
      title,
      slug: `${toSlug(title)}-${Date.now()}`,
      place: "",
      startsAt: new Date().toISOString().slice(0, 10),
      endsAt: null,
      change: c.notes || "",
      action: "",
      sourceName: c.sourceName,
      sourceUrl: c.sourceUrl || null,
    };
    sessionStorage.setItem(AI_PENDING_KEY, JSON.stringify(draft));
    sessionStorage.setItem(AI_PENDING_SOURCE_ID_KEY, c.sourceId);
    setSentId(c.id);
    router.push("/builder");
  }

  // ── Persistent candidate actions (Sprint 78) ──────────────────────────────

  // Sprint 90: the legacy view above has shown these warnings since
  // candidateWarnings.ts existed; the persistent view never wired them
  // in, despite being the primary path going forward. "Previous text for
  // this source" here means the most recently detected *other* notice
  // from the same source (persistent notices have no source_checks row
  // to compare against), not a perfect analogue of warningsFor() above —
  // close enough to catch the same "looks like last time" case.
  function noticeWarningsFor(n: SourceNoticeCandidate): string[] {
    const text = n.rawText || n.excerpt || "";
    const previousFromSameSource = notices
      .filter((other) => other.id !== n.id && other.sourceId === n.sourceId)
      .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))[0];

    return getCandidateWarnings(
      { sourceUrl: n.sourceUrl ?? "", notes: text },
      {
        previousCheckNotes: previousFromSameSource?.rawText || previousFromSameSource?.excerpt,
        alertTitles: alerts.map((a) => a.title),
      }
    );
  }

  function sendNoticeToAiHelper(n: SourceNoticeCandidate) {
    sessionStorage.setItem(
      PENDING_SOURCE_KEY,
      JSON.stringify({
        sourceName: n.sourceName,
        sourceUrl: n.sourceUrl ?? "",
        suggestedCategory: (n.sourceId && sourceCategoryById[n.sourceId]) || "municipal",
        sourceId: n.sourceId ?? "",
        checkNotes: n.rawText || n.excerpt || "",
        candidateNoticeId: n.id,
      })
    );
    setSentId(n.id);
    router.push("/ai-helper");
  }

  function createBuilderDraftFromNotice(n: SourceNoticeCandidate) {
    const draft = {
      category: (n.sourceId && sourceCategoryById[n.sourceId]) || "municipal",
      severity: "info",
      title: n.title,
      slug: `${toSlug(n.title)}-${Date.now()}`,
      place: "",
      startsAt: new Date().toISOString().slice(0, 10),
      endsAt: null,
      change: n.rawText || n.excerpt || "",
      action: "",
      sourceName: n.sourceName,
      sourceUrl: n.sourceUrl || null,
    };
    sessionStorage.setItem(AI_PENDING_KEY, JSON.stringify(draft));
    if (n.sourceId) sessionStorage.setItem(AI_PENDING_SOURCE_ID_KEY, n.sourceId);
    sessionStorage.setItem(PENDING_CANDIDATE_ID_KEY, n.id);
    setSentId(n.id);
    router.push("/builder");
  }

  async function setNoticeStatus(n: SourceNoticeCandidate, status: SourceCandidateStatus) {
    setNoticeActionId(n.id);
    const result = await updateCandidateStatus(n.id, status);
    setNoticeActionId(null);
    if (!result.ok) {
      setNoticesError(result.error ?? "Nie udało się zmienić statusu kandydata.");
      return;
    }
    await loadPersistentNotices();
  }

  const bySource = sourceFilter
    ? candidates.filter((c) => c.sourceId === sourceFilter)
    : candidates;
  const pending = bySource.filter((c) => !c.relatedAlertId);
  const converted = bySource.filter((c) => c.relatedAlertId);
  const filteredSourceName = sourceFilter ? bySource[0]?.sourceName : undefined;

  const noticesBySource = sourceFilter
    ? notices.filter((n) => n.sourceId === sourceFilter)
    : notices;
  const noticeCounts: Record<SourceCandidateStatus, number> = {
    pending: 0, ignored: 0, converted: 0, archived: 0,
  };
  for (const n of noticesBySource) noticeCounts[n.status]++;
  const filteredNotices = noticesBySource.filter((n) => n.status === noticeStatusFilter);

  return (
    <main className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-10">
      {/* Page header */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2.5 mb-1">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Kandydaci na alerty
          </h1>
          <span className="inline-flex items-center text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
            Admin
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500 leading-relaxed">
          Komunikaty znalezione podczas sprawdzania źródeł, czekające na decyzję admina.
        </p>
      </div>

      {/* Workflow explanation */}
      <section className="mb-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-2">Jak to działa</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Kandydaci trafiają tutaj w dwóch miejscach: (1) gdy w{" "}
            <Link href="/admin/sources" className="font-medium text-blue-600 hover:underline">
              Źródłach
            </Link>{" "}
            klikniesz „Zapisz jako kandydata” przy fragmencie z „Sprawdź stronę” — trwały
            wpis z akcjami ignoruj/przywróć/archiwizuj — albo (2) automatycznie, gdy w
            Historii sprawdzenia zapiszesz wynik „Znaleziono komunikat” albo „Wymaga
            późniejszego sprawdzenia” (starszy widok, bez tych akcji). Z każdego kandydata:
            otwórz źródło → AI Helper / Kreator → ręczna publikacja.{" "}
            <strong className="font-semibold text-slate-800">
              AI nigdy nie publikuje samodzielnie — zatwierdzenie i publikacja zawsze należą do admina.
            </strong>
          </p>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 mb-6">
          <p className="text-sm font-medium text-red-700">
            Nie udało się pobrać kandydatów z Supabase.
          </p>
          <p className="text-xs text-red-500 mt-1 font-mono">{error}</p>
        </div>
      )}

      {sourceFilter && (
        <div className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 mb-6 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-purple-800">
            Filtr: {filteredSourceName ? <strong className="font-semibold">{filteredSourceName}</strong> : "jedno źródło"}
          </p>
          <button
            onClick={clearSourceFilter}
            className="text-xs font-medium text-purple-700 hover:text-purple-900 hover:underline"
          >
            Wyczyść filtr ×
          </button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          Kandydaci (trwali) — Sprint 78, source_notice_candidates
      ════════════════════════════════════════════════════════════════════ */}
      <section className="mb-10">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Kandydaci (trwali)</h2>

        {noticesTableMissing ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-sm font-medium text-slate-700 mb-1">
              Trwali kandydaci nie są jeszcze włączeni.
            </p>
            <p className="text-sm text-slate-500 leading-relaxed">
              Uruchom migrację z{" "}
              <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                docs/supabase_source_notice_candidates.sql
              </span>{" "}
              w Supabase SQL Editor, aby zacząć zapisywać kandydatów na trwałe (przycisk
              „Zapisz jako kandydata” w Źródłach). Do tego czasu działa tylko starszy widok
              poniżej.
            </p>
          </div>
        ) : (
          <>
            {noticesError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 mb-4">
                <p className="text-sm font-medium text-red-700">{noticesError}</p>
              </div>
            )}

            {/* Status tabs */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {(["pending", "ignored", "converted", "archived"] as SourceCandidateStatus[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setNoticeStatusFilter(s)}
                  className={`px-3 py-1.5 text-sm rounded-full font-medium transition-colors ${
                    noticeStatusFilter === s
                      ? "bg-slate-800 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {CANDIDATE_STATUS_LABELS[s]} ({noticeCounts[s]})
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex flex-col gap-3">
                {[1, 2].map((i) => (
                  <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 animate-pulse">
                    <div className="h-4 w-2/3 bg-slate-100 rounded mb-2" />
                    <div className="h-3 w-1/3 bg-slate-100 rounded" />
                  </div>
                ))}
              </div>
            ) : filteredNotices.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <p className="text-sm text-slate-500">
                  {noticeStatusFilter === "pending"
                    ? "Brak oczekujących kandydatów. Zapisz fragment komunikatu jako kandydata w Źródłach, aby zobaczyć go tutaj."
                    : `Brak kandydatów ze statusem „${CANDIDATE_STATUS_LABELS[noticeStatusFilter]}”.`}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredNotices.map((n) => {
                  const convertedAlert = alertFor(n.convertedAlertId);
                  const busy = noticeActionId === n.id;
                  const warnings = n.status === "pending" ? noticeWarningsFor(n) : [];
                  return (
                    <div key={n.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 flex flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {n.sourceId && sourceCategoryById[n.sourceId] && (
                          <span className="text-xs font-medium text-slate-600 bg-slate-100 rounded-full px-2.5 py-1">
                            {categoryLabels[sourceCategoryById[n.sourceId]]}
                          </span>
                        )}
                        <span className="text-xs text-slate-400">{formatCheckedAt(n.detectedAt)}</span>
                      </div>

                      <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                      <p className="text-xs text-slate-500">Źródło: {n.sourceName}</p>

                      {n.excerpt && (
                        <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{n.excerpt}</p>
                      )}

                      {convertedAlert && (
                        <p className="text-xs text-emerald-700">
                          → przekształcone w alert: <strong className="font-semibold">{convertedAlert.title || "Bez tytułu"}</strong>
                        </p>
                      )}

                      {warnings.length > 0 && (
                        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                          <ul className="space-y-0.5">
                            {warnings.map((w, wi) => (
                              <li key={wi} className="text-xs text-amber-700">⚠ {w}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        {n.sourceUrl && (
                          <a
                            href={n.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                          >
                            Otwórz źródło →
                          </a>
                        )}
                        {n.candidateUrl && (
                          <a
                            href={n.candidateUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                          >
                            Otwórz link kandydata →
                          </a>
                        )}

                        {n.status === "pending" && (
                          <>
                            <button
                              onClick={() => sendNoticeToAiHelper(n)}
                              className="inline-flex items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-sm font-medium text-purple-700 hover:bg-purple-100 transition-colors"
                            >
                              Wyślij do AI Helpera →
                            </button>
                            <button
                              onClick={() => createBuilderDraftFromNotice(n)}
                              className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100 transition-colors"
                            >
                              Utwórz szkic w Kreatorze →
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => setNoticeStatus(n, "ignored")}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                            >
                              Zignoruj
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => setNoticeStatus(n, "archived")}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                            >
                              Archiwizuj
                            </button>
                          </>
                        )}

                        {(n.status === "ignored" || n.status === "archived") && (
                          <button
                            disabled={busy}
                            onClick={() => setNoticeStatus(n, "pending")}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                          >
                            Przywróć do oczekujących
                          </button>
                        )}

                        {sentId === n.id && (
                          <span className="text-xs text-emerald-700 font-medium">Wysłano ✓</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          Starsze (z historii sprawdzeń źródeł) — Sprint 74/75, unchanged
      ════════════════════════════════════════════════════════════════════ */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-slate-800 mb-1">
          Starsze (z historii sprawdzeń źródeł)
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          Wykryte automatycznie z wyników sprawdzenia źródła — bez statusu ignoruj/archiwizuj
          (patrz wyjaśnienie powyżej).
        </p>

        <h3 className="text-sm font-semibold text-slate-700 mb-3">
          Do przygotowania {!loading && `(${pending.length})`}
        </h3>

        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 animate-pulse">
                <div className="h-4 w-2/3 bg-slate-100 rounded mb-2" />
                <div className="h-3 w-1/3 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        ) : pending.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-sm font-medium text-emerald-700">Brak kandydatów na alerty.</p>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">
              Gdy podczas sprawdzania źródła zapiszesz wynik „Znaleziono komunikat” albo
              „Wymaga późniejszego sprawdzenia” w{" "}
              <Link href="/admin/sources" className="font-medium text-blue-600 hover:underline">
                Źródłach
              </Link>
              , kandydat pojawi się tutaj automatycznie.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {pending.map((c) => {
              const cfg = resultLabels[c.result] ?? { label: c.result, color: "text-slate-600 bg-slate-50 border-slate-200" };
              const isRealLink = Boolean(c.sourceUrl);
              const warnings = warningsFor(c);
              return (
                <div key={c.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-slate-600 bg-slate-100 rounded-full px-2.5 py-1">
                      {categoryLabels[c.sourceCategory] ?? c.sourceCategory}
                    </span>
                    <span className={`text-xs font-medium rounded-full px-2.5 py-1 border ${cfg.color}`}>
                      {cfg.label}
                    </span>
                    <span className="text-xs text-slate-400">{formatCheckedAt(c.checkedAt)}</span>
                  </div>

                  <p className="text-sm font-semibold text-slate-900">{c.sourceName}</p>

                  {c.notes ? (
                    <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{c.notes}</p>
                  ) : (
                    <p className="text-sm text-slate-400 italic">Brak zapisanej notatki z tego sprawdzenia.</p>
                  )}

                  {warnings.length > 0 && (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                      <ul className="space-y-0.5">
                        {warnings.map((w, wi) => (
                          <li key={wi} className="text-xs text-amber-700">⚠ {w}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    {isRealLink && (
                      <a
                        href={c.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                      >
                        Otwórz źródło →
                      </a>
                    )}
                    <button
                      onClick={() => sendToAiHelper(c)}
                      className="inline-flex items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-sm font-medium text-purple-700 hover:bg-purple-100 transition-colors"
                    >
                      Wyślij do AI Helpera →
                    </button>
                    <button
                      onClick={() => createBuilderDraft(c)}
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100 transition-colors"
                    >
                      Utwórz szkic w Kreatorze →
                    </button>
                    {sentId === c.id && (
                      <span className="text-xs text-emerald-700 font-medium">Wysłano ✓</span>
                    )}
                  </div>
                </div>
              );
            })}

            <p className="text-xs text-slate-400 leading-relaxed mt-1">
              Ten widok nie obsługuje ignorowania/archiwizacji (brak statusu w
              <span className="font-mono"> source_checks</span>) — zapisz fragment jako
              trwałego kandydata w Źródłach, aby zarządzać nim w sekcji „Kandydaci (trwali)” powyżej.
            </p>
          </div>
        )}

        {/* Converted candidates — de-emphasized, shown for reference only */}
        {!loading && converted.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">
              Wykorzystane ({converted.length})
            </h3>
            <div className="flex flex-col gap-3 opacity-70">
              {converted.map((c) => {
                const alert = alertFor(c.relatedAlertId);
                return (
                  <div key={c.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{c.sourceName}</p>
                      <p className="text-xs text-slate-400">{formatCheckedAt(c.checkedAt)}</p>
                    </div>
                    {alert ? (
                      <Link
                        href={`/builder?edit=${alert.slug}`}
                        className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                      >
                        {alert.title || "Bez tytułu"} →
                      </Link>
                    ) : (
                      <span className="shrink-0 text-xs text-slate-400 italic">Alert niedostępny</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

export default function QueuePage() {
  return (
    <AuthGate>
      <QueueContent />
    </AuthGate>
  );
}
