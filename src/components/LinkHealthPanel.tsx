"use client";

import { useState } from "react";
import { authFetch } from "@/lib/apiClientAuth";
import {
  summarizeLinkHealth,
  LINK_HEALTH_DISCLAIMER,
  LINK_HEALTH_BLOCKED_NOTE,
  MAX_LINK_HEALTH_TARGETS_PER_REQUEST,
  type LinkHealthRow,
  type LinkHealthTarget,
} from "@/lib/linkHealthShared";
type LinkHealthResponse =
  | { ok: true; checkedAt: string; results: LinkHealthRow[] }
  | { ok: false; error: string };

// Sprint 164A — Link Health Panel (admin-only, /admin/sources). Manual
// trigger only ("Sprawdź dostępność linków" button) — nothing here fetches
// on mount, on an interval, or in response to any other action. Read-only:
// this panel never writes to Supabase and the check results themselves are
// never persisted, only held in this component's state for the current
// session (see src/lib/linkHealthCheck.ts's file header for why).

function formatCheckedAt(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Warsaw",
  });
}

const outcomeBadgeClass: Record<LinkHealthRow["outcome"], string> = {
  healthy: "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200",
  needs_attention: "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200",
  blocked: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 ring-1 ring-slate-200",
};

const outcomeLabel: Record<LinkHealthRow["outcome"], string> = {
  healthy: "zdrowe",
  needs_attention: "problem źródła — wymaga uwagi",
  blocked: "zablokowane (reguły bezpieczeństwa)",
};

export function LinkHealthPanel({ targets }: { targets: LinkHealthTarget[] }) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<LinkHealthRow[]>([]);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const truncatedTargets = targets.slice(0, MAX_LINK_HEALTH_TARGETS_PER_REQUEST);

  async function runCheck() {
    if (status === "loading") return;
    setStatus("loading");
    setError(null);
    try {
      const res = await authFetch("/api/admin/link-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targets: truncatedTargets }),
      });
      const data = (await res.json()) as LinkHealthResponse;
      if (!data.ok) {
        setError(data.error);
        setStatus("error");
        return;
      }
      setRows(data.results);
      setCheckedAt(data.checkedAt);
      setStatus("success");
    } catch {
      setError("Błąd połączenia z serwerem.");
      setStatus("error");
    }
  }

  const summary = summarizeLinkHealth(rows);

  return (
    <section className="mb-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-4 sm:p-5">
      <details>
        <summary className="cursor-pointer select-none">
          <span className="text-base font-semibold text-slate-800 dark:text-slate-100">
            Kontrola dostępności linków
          </span>
          <span className="ml-2 inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 ring-1 ring-slate-200">
            na żądanie
          </span>
        </summary>

        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mt-2 mb-3">
          {LINK_HEALTH_DISCLAIMER}
        </p>

        <div className="flex flex-wrap items-center gap-3 mb-3">
          <button
            onClick={runCheck}
            disabled={status === "loading" || truncatedTargets.length === 0}
            className="min-h-11 px-4 py-2.5 bg-blue-600 dark:bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-700 dark:hover:bg-blue-400 disabled:opacity-50 transition-colors"
          >
            {status === "loading" ? "Sprawdzanie…" : "Sprawdź dostępność linków"}
          </button>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {truncatedTargets.length} aktywnych źródeł
            {targets.length > truncatedTargets.length
              ? ` (pokazano pierwsze ${MAX_LINK_HEALTH_TARGETS_PER_REQUEST})`
              : ""}
          </span>
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-2 mb-3">
            {error}
          </p>
        )}

        {status === "success" && (
          <>
            <div className="flex flex-wrap gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-full px-2.5 py-1">
                Sprawdzono: <span className="font-semibold text-slate-800 dark:text-slate-100">{summary.total}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 rounded-full px-2.5 py-1">
                Zdrowe: <span className="font-semibold">{summary.healthy}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 rounded-full px-2.5 py-1">
                Wymagają uwagi: <span className="font-semibold">{summary.needsAttention}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-full px-2.5 py-1">
                Zablokowane: <span className="font-semibold">{summary.blocked}</span>
              </span>
              {checkedAt && (
                <span className="inline-flex items-center text-xs text-slate-500 dark:text-slate-400 px-1 py-1">
                  ostatnia kontrola: {formatCheckedAt(checkedAt)}
                </span>
              )}
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
              {LINK_HEALTH_BLOCKED_NOTE}
            </p>

            <div className="space-y-2">
              {rows.map((row) => (
                <div
                  key={row.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/60 p-3"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 mr-1 break-words">
                      {row.name}
                    </span>
                    <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ${outcomeBadgeClass[row.outcome]}`}>
                      {outcomeLabel[row.outcome]}
                    </span>
                    {row.httpStatus !== null && (
                      <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 ring-1 ring-slate-200">
                        HTTP {row.httpStatus}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1.5">
                    <span className="text-xs text-slate-500 dark:text-slate-400 break-all">
                      {row.finalUrl ?? row.url}
                    </span>
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-11 inline-flex items-center text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline"
                    >
                      Otwórz źródło ↗
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </details>
    </section>
  );
}
