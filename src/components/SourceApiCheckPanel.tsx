"use client";

import { useState } from "react";
import Link from "next/link";
import type { OfficialSourceCheck } from "@/lib/officialSourceChecklist";
import type { AlertSource } from "@/types/alertSource";
import type { SourceCheckApiResponse } from "@/app/api/sources/check/route";
import {
  findMatchingRegistrySource,
  suggestCheckResult,
  MANUAL_CHECK_DISCLAIMER,
  CHECK_BUTTON_LABEL,
  type CheckProposal,
} from "@/lib/sourceCheck";
import { authFetch } from "@/lib/apiClientAuth";
import { createSourceCandidateNotice } from "@/lib/supabaseCandidateWrites";
import { createSourceCheck } from "@/lib/supabaseSourceWrites";
import { findSimilarText } from "@/lib/candidateWarnings";
import type { FetchDiagnosticCode } from "@/lib/scheduledWriterRunSafety";

// Sprint 134 (A2) — the manual trigger for /api/sources/check, rendered only
// on checklist cards whose source is on the safe-source allowlist (Sprint
// 139: Gmina Michałowice komunikaty + WKD aktualności). The route only proposes; every
// write below (candidate save, check-history log) runs in this browser
// through the admin's authenticated session — nothing is saved or published
// automatically, and each proposal needs its own explicit click.

interface SourceApiCheckPanelProps {
  source: OfficialSourceCheck;
  /** Registry rows from alert_sources — used to attach source_id and log history. */
  registrySources: AlertSource[];
  /** Existing candidate texts + alert titles for the duplicate heuristic. */
  dedupTexts: string[];
  /** Sprint 171 — reports this check's outcome (success or the already-safe
   *  Polish error message) so the Source Health dashboard row for this
   *  source can show it too. Session-only, never persisted by this
   *  callback — see sourceHealth.ts's SessionCheckOutcome for why. */
  onCheckOutcome?: (outcome: { ok: boolean; message?: string; at: string }) => void;
}

type CheckState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: string; errorCode?: FetchDiagnosticCode }
  | {
      status: "done";
      proposals: CheckProposal[];
      fetchedAt: string;
      pageTitle: string;
    };

export function SourceApiCheckPanel({
  source,
  registrySources,
  dedupTexts,
  onCheckOutcome,
}: SourceApiCheckPanelProps) {
  const [check, setCheck] = useState<CheckState>({ status: "idle" });
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const [savedIdxs, setSavedIdxs] = useState<Set<number>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loggingCheck, setLoggingCheck] = useState(false);
  const [checkLogged, setCheckLogged] = useState(false);
  const [checkLogError, setCheckLogError] = useState<string | null>(null);
  // Sprint 172 (proposed) — logging a FAILED check requires
  // PROPOSED_SPRINT_172_SOURCE_CHECK_FAILURE_PERSISTENCE_V1.sql to be
  // applied first (source_checks.result doesn't accept "failed" and the
  // two error columns don't exist until then). This button only appears
  // after that migration ships and this code is deployed alongside it —
  // never before, per the sprint's own explicit constraint.
  const [loggingFailure, setLoggingFailure] = useState(false);
  const [failureLogged, setFailureLogged] = useState(false);
  const [failureLogError, setFailureLogError] = useState<string | null>(null);

  const registryMatch = findMatchingRegistrySource(registrySources, source.officialUrl);

  async function runCheck() {
    setCheck({ status: "loading" });
    setSavedIdxs(new Set());
    setSaveError(null);
    setCheckLogged(false);
    setCheckLogError(null);
    setFailureLogged(false);
    setFailureLogError(null);

    try {
      const res = await authFetch("/api/sources/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceKey: source.id }),
      });
      const data: SourceCheckApiResponse = await res.json();
      if (!data.ok) {
        setCheck({ status: "error", error: data.error, errorCode: data.errorCode });
        onCheckOutcome?.({ ok: false, message: data.error, at: new Date().toISOString() });
        return;
      }
      setCheck({
        status: "done",
        proposals: data.proposals,
        fetchedAt: data.fetchedAt,
        pageTitle: data.pageTitle,
      });
      onCheckOutcome?.({ ok: true, at: data.fetchedAt });
    } catch {
      const message = "Nie udało się połączyć z API sprawdzania. Spróbuj ponownie.";
      setCheck({ status: "error", error: message, errorCode: "network_error" });
      onCheckOutcome?.({ ok: false, message, at: new Date().toISOString() });
    }
  }

  async function saveProposal(idx: number, p: CheckProposal) {
    setSaveError(null);
    setSavingIdx(idx);
    const result = await createSourceCandidateNotice({
      sourceId: registryMatch?.id ?? null,
      sourceName: source.name,
      sourceUrl: source.officialUrl,
      title: p.title,
      excerpt: p.excerpt,
      rawText: p.rawText,
    });
    setSavingIdx(null);
    if (!result.ok) {
      setSaveError(result.error ?? "Nie udało się zapisać kandydata.");
      return;
    }
    setSavedIdxs((prev) => new Set(prev).add(idx));
  }

  async function logCheckToHistory() {
    if (!registryMatch || check.status !== "done") return;
    setCheckLogError(null);
    setLoggingCheck(true);
    const result = await createSourceCheck({
      sourceId: registryMatch.id,
      result: suggestCheckResult(check.proposals.length),
      notes: `Check przez aplikację (/api/sources/check): ${check.proposals.length} propozycji. ${source.officialUrl}`,
    });
    setLoggingCheck(false);
    if (!result.ok) {
      setCheckLogError(result.error ?? "Nie udało się zapisać checku.");
      return;
    }
    setCheckLogged(true);
  }

  // Sprint 172 (proposed) — see the loggingFailure state comment above:
  // only reachable in practice once the migration has shipped. Mirrors
  // logCheckToHistory exactly, but for a failed attempt: passes the same
  // already-curated, safe message the admin is already looking at as
  // errorSummary, capped to 200 chars server-side by createSourceCheck.
  async function logFailureToHistory() {
    if (!registryMatch || check.status !== "error") return;
    setFailureLogError(null);
    setLoggingFailure(true);
    const result = await createSourceCheck({
      sourceId: registryMatch.id,
      result: "failed",
      errorCode: check.errorCode,
      errorSummary: check.error,
      notes: `Check przez aplikację (/api/sources/check) — próba nieudana. ${source.officialUrl}`,
    });
    setLoggingFailure(false);
    if (!result.ok) {
      setFailureLogError(result.error ?? "Nie udało się zapisać błędu checku.");
      return;
    }
    setFailureLogged(true);
  }

  return (
    <div className="mt-3 rounded-xl border border-purple-200 dark:border-purple-500/30 bg-purple-50/60 dark:bg-purple-500/10 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={runCheck}
          disabled={check.status === "loading"}
          className="inline-flex items-center gap-1 rounded-lg border border-purple-300 dark:border-purple-500/40 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-medium text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-500/20 disabled:opacity-50 transition-colors"
        >
          {check.status === "loading" ? "Sprawdzanie…" : `${CHECK_BUTTON_LABEL} →`}
        </button>
        <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 ring-1 ring-purple-200 dark:ring-purple-500/30">
          ręczny check — nie cron
        </span>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-1.5">
        {MANUAL_CHECK_DISCLAIMER}
      </p>

      {check.status === "error" && (
        <div className="mt-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-2">
          <p>{check.error}</p>
          {/* Sprint 172 (proposed) — see the loggingFailure state comment
              above: requires the migration to be applied first. */}
          {registryMatch && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <button
                onClick={logFailureToHistory}
                disabled={loggingFailure || failureLogged}
                className="text-xs font-medium text-red-700 dark:text-red-300 hover:text-red-900 hover:underline disabled:opacity-50"
              >
                {failureLogged
                  ? "Błąd zapisany w historii ✓"
                  : loggingFailure
                    ? "Zapisywanie…"
                    : "Zapisz błąd w historii →"}
              </button>
              {failureLogError && <span className="text-red-700 dark:text-red-400">{failureLogError}</span>}
            </div>
          )}
        </div>
      )}

      {check.status === "done" && (
        <div className="mt-2">
          <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
            {check.proposals.length > 0
              ? `Znaleziono ${check.proposals.length} propozycji (do Twojego przeglądu):`
              : "Brak propozycji na stronie źródła — to też wynik, można go zalogować w historii."}
          </p>

          <div className="flex flex-col gap-2">
            {check.proposals.map((p, idx) => {
              const duplicate = findSimilarText(p.rawText, dedupTexts);
              return (
                <div key={idx} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mr-1">{p.title}</p>
                    {!p.hasDate && (
                      <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200">
                        brak daty w treści
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">
                    {p.excerpt}
                  </p>
                  {duplicate && (
                    <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 rounded-lg px-2.5 py-1.5">
                      ⚠ Możliwy duplikat — podobna treść już istnieje: „{duplicate.slice(0, 100)}”
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-3 mt-2">
                    <button
                      onClick={() => saveProposal(idx, p)}
                      disabled={savingIdx === idx || savedIdxs.has(idx)}
                      className="text-xs font-medium text-amber-600 dark:text-amber-300 hover:text-amber-800 hover:underline disabled:opacity-50"
                    >
                      {savedIdxs.has(idx)
                        ? "Zapisano jako kandydat ✓"
                        : savingIdx === idx
                          ? "Zapisywanie…"
                          : "Zapisz jako kandydata →"}
                    </button>
                    <a
                      href={source.officialUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline"
                    >
                      Otwórz źródło →
                    </a>
                  </div>
                </div>
              );
            })}
          </div>

          {saveError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-2">
              {saveError}
            </p>
          )}

          {savedIdxs.size > 0 && (
            <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 rounded-lg px-3 py-2">
              Kandydat zapisany w kolejce (status „Oczekujące”).{" "}
              <Link
                href={registryMatch ? `/admin/queue?source=${registryMatch.id}` : "/admin/queue"}
                className="font-medium text-emerald-800 dark:text-emerald-300 underline hover:text-emerald-900"
              >
                Zobacz w kolejce →
              </Link>{" "}
              Publikacja nadal wyłącznie ręczna — z Kreatora.
            </p>
          )}

          <div className="mt-2">
            {registryMatch ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={logCheckToHistory}
                  disabled={loggingCheck || checkLogged}
                  className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:underline disabled:opacity-50"
                >
                  {checkLogged
                    ? "Check zapisany w historii ✓"
                    : loggingCheck
                      ? "Zapisywanie checku…"
                      : `Zapisz check w historii (${
                          check.proposals.length > 0 ? "Znaleziono komunikat" : "Brak zmian"
                        }) →`}
                </button>
                {checkLogError && (
                  <span className="text-xs text-red-600 dark:text-red-400">{checkLogError}</span>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Historia checków niedostępna: to źródło nie ma jeszcze wpisu w rejestrze
                poniżej (dopasowanie po URL). Dodaj je do rejestru, aby logować checki.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
