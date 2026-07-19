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
}

type CheckState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: string }
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
}: SourceApiCheckPanelProps) {
  const [check, setCheck] = useState<CheckState>({ status: "idle" });
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const [savedIdxs, setSavedIdxs] = useState<Set<number>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loggingCheck, setLoggingCheck] = useState(false);
  const [checkLogged, setCheckLogged] = useState(false);
  const [checkLogError, setCheckLogError] = useState<string | null>(null);

  const registryMatch = findMatchingRegistrySource(registrySources, source.officialUrl);

  async function runCheck() {
    setCheck({ status: "loading" });
    setSavedIdxs(new Set());
    setSaveError(null);
    setCheckLogged(false);
    setCheckLogError(null);

    try {
      const res = await authFetch("/api/sources/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceKey: source.id }),
      });
      const data: SourceCheckApiResponse = await res.json();
      if (!data.ok) {
        setCheck({ status: "error", error: data.error });
        return;
      }
      setCheck({
        status: "done",
        proposals: data.proposals,
        fetchedAt: data.fetchedAt,
        pageTitle: data.pageTitle,
      });
    } catch {
      setCheck({
        status: "error",
        error: "Nie udało się połączyć z API sprawdzania. Spróbuj ponownie.",
      });
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

  return (
    <div className="mt-3 rounded-xl border border-purple-200 bg-purple-50/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={runCheck}
          disabled={check.status === "loading"}
          className="inline-flex items-center gap-1 rounded-lg border border-purple-300 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-medium text-purple-700 hover:bg-purple-100 disabled:opacity-50 transition-colors"
        >
          {check.status === "loading" ? "Sprawdzanie…" : `${CHECK_BUTTON_LABEL} →`}
        </button>
        <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 ring-1 ring-purple-200">
          ręczny check — nie cron
        </span>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-1.5">
        {MANUAL_CHECK_DISCLAIMER}
      </p>

      {check.status === "error" && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-2">
          {check.error}
        </p>
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
              <p className="text-xs text-slate-400 dark:text-slate-500">
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
