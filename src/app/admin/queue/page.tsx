"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import {
  getSourceCandidates,
  getSourceChecks,
  type SourceCandidate,
} from "@/lib/supabaseSourceWrites";
import { getAdminSupabaseAlerts, type AdminAlert } from "@/lib/getAdminSupabaseAlerts";
import { getCandidateWarnings } from "@/lib/candidateWarnings";
import type { SourceCheck } from "@/types/alertSource";
import type { AlertCategory } from "@/types/alert";

// ── Constants — same sessionStorage contracts already used by /admin/sources
// and /ai-helper, so this page is just another producer/consumer, not a new
// handoff mechanism. ─────────────────────────────────────────────────────────

const PENDING_SOURCE_KEY = "alertownik_pending_source_for_ai";
const AI_PENDING_KEY = "alertownik_pending_ai_alert_json";
const AI_PENDING_SOURCE_ID_KEY = "alertownik_pending_alert_source_id";

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
  const fromNotes = c.notes?.trim().slice(0, 80);
  return fromNotes || `${c.sourceName} — do uzupełnienia`;
}

// ── Page content (auth-gated) ──────────────────────────────────────────────────

function QueueContent() {
  const router = useRouter();
  const [candidates, setCandidates] = useState<SourceCandidate[]>([]);
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [allChecks, setAllChecks] = useState<SourceCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getSourceCandidates(100), getAdminSupabaseAlerts(), getSourceChecks()]).then(
      ([candidatesResult, alertsResult, checksResult]) => {
        setCandidates(candidatesResult.candidates);
        setError(candidatesResult.error ?? null);
        setAlerts(alertsResult.alerts);
        setAllChecks(checksResult.checks);
        setLoading(false);
      }
    );
  }, []);

  function alertFor(id?: string): AdminAlert | null {
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

  const pending = candidates.filter((c) => !c.relatedAlertId);
  const converted = candidates.filter((c) => c.relatedAlertId);

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
            Źródło →{" "}
            <Link href="/admin/sources" className="font-medium text-blue-600 hover:underline">
              sprawdzenie źródła
            </Link>{" "}
            → kandydat na komunikat (ta lista) → AI Helper / Kreator → ręczna publikacja.
            Kandydat pojawia się tutaj, gdy w „Historii” sprawdzenia źródła zapiszesz wynik
            „Znaleziono komunikat” albo „Wymaga późniejszego sprawdzenia”.{" "}
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

      {/* Pending candidates */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-slate-800 mb-4">
          Do przygotowania {!loading && `(${pending.length})`}
        </h2>

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
              Ignorowanie/archiwizacja kandydatów wymaga niewielkiej zmiany schematu (nowa
              kolumna statusu) — patrz{" "}
              <span className="font-mono">docs/supabase_source_notice_candidates.sql</span>.
              Na razie kandydaci pozostają na liście, dopóki nie zostaną wykorzystane.
            </p>
          </div>
        )}
      </section>

      {/* Converted candidates — de-emphasized, shown for reference only */}
      {!loading && converted.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-slate-800 mb-4">
            Wykorzystane ({converted.length})
          </h2>
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
        </section>
      )}
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
