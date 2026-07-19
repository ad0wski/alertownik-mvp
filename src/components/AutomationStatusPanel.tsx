"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/apiClientAuth";
import {
  AUTOMATION_STATUS_TITLE,
  AUTOMATION_STATUS_NO_PUBLISH_NOTE,
  AUTOMATION_STATUS_INFO_ONLY_NOTE,
  type AutomationStatusSnapshot,
} from "@/lib/automationStatus";
import type { ScheduledWriterSourceActivity } from "@/lib/writerCandidateActivity";

type AutomationStatusResponse =
  | { ok: true; status: AutomationStatusSnapshot }
  | { ok: false; error: string };

// Sprint 164B — Safe Auto-Candidate Canary Foundation. Admin-only,
// read-only status panel rendered on /admin/sources. Fetches its status
// ONCE on mount (GET /api/admin/automation-status — no side effects, no
// write, mirrors how the rest of this page auto-loads its own read-only
// data) and never again unless the page reloads. There is no button here
// that triggers anything — this panel cannot activate automation, cannot
// run a canary check, and cannot be used to change any switch.

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Warsaw",
  });
}

function StatusBadge({ active, activeLabel, inactiveLabel }: { active: boolean; activeLabel: string; inactiveLabel: string }) {
  return (
    <span
      className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ring-1 ${
        active
          ? "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-200"
          : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 ring-slate-200"
      }`}
    >
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

export function AutomationStatusPanel({ activityRows }: { activityRows: ScheduledWriterSourceActivity[] }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [status, setStatus] = useState<AutomationStatusSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch("/api/admin/automation-status");
        const data = (await res.json()) as AutomationStatusResponse;
        if (cancelled) return;
        if (!data.ok) {
          setError(data.error);
          setState("error");
          return;
        }
        setStatus(data.status);
        setState("ready");
      } catch {
        if (!cancelled) {
          setError("Błąd połączenia z serwerem.");
          setState("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mb-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-4 sm:p-5">
      <details>
        <summary className="cursor-pointer select-none">
          <span className="text-base font-semibold text-slate-800 dark:text-slate-100">
            {AUTOMATION_STATUS_TITLE}
          </span>
          <span className="ml-2 inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 ring-1 ring-purple-200 dark:ring-purple-500/30">
            informacyjny — bez przycisku aktywacji
          </span>
        </summary>

        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mt-2 mb-1.5">
          {AUTOMATION_STATUS_NO_PUBLISH_NOTE}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
          {AUTOMATION_STATUS_INFO_ONLY_NOTE}
        </p>

        {state === "loading" && (
          <p className="text-sm text-slate-500 dark:text-slate-400">Wczytywanie stanu…</p>
        )}

        {state === "error" && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {state === "ready" && status && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">Automatyczne sprawdzanie:</span>
              <StatusBadge active={status.checksEnabled} activeLabel="aktywne" inactiveLabel="wyłączone" />
              <span className="text-xs text-slate-500 dark:text-slate-400 ml-3">Automatyczne tworzenie kandydatów:</span>
              <StatusBadge active={status.writesEnabled} activeLabel="aktywne" inactiveLabel="wyłączone" />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">CRON_SECRET:</span>
              <StatusBadge active={status.cronSecretConfigured} activeLabel="skonfigurowany" inactiveLabel="brak" />
              <span className="text-xs text-slate-500 dark:text-slate-400 ml-3">Dane konta writer:</span>
              <StatusBadge active={status.writerCredentialsConfigured} activeLabel="skonfigurowane" inactiveLabel="brak" />
            </div>

            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400">Źródło canary: </span>
              <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                {status.canarySources.map((s) => s.name).join(", ") || "brak"}
              </span>
              {!status.isSingleSourceCanary && (
                <span className="ml-2 inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200">
                  uwaga: nie jest to pojedyncze źródło canary
                </span>
              )}
            </div>

            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400">Limit nowych kandydatów na uruchomienie: </span>
              <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{status.maxCandidatesPerRun}</span>
            </div>

            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400">Zapis możliwy przy obecnej konfiguracji: </span>
              <StatusBadge active={status.writeAttemptsPossible} activeLabel="tak — wszystkie bramy spełnione" inactiveLabel="nie — co najmniej jedna brama zamknięta" />
            </div>

            <div className="pt-1 border-t border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400">Ostatni bezpieczny wynik: </span>
              {(() => {
                const canaryActivity = activityRows.find((row) =>
                  status.canarySources.some((s) => s.id === row.sourceKey)
                );
                if (!canaryActivity || !canaryActivity.lastCandidateAt) {
                  return (
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      brak — automat jeszcze nie zapisał tu żadnego kandydata
                    </span>
                  );
                }
                return (
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    ostatni kandydat: {formatTimestamp(canaryActivity.lastCandidateAt)} ({canaryActivity.pendingCandidates} oczekuje na weryfikację)
                  </span>
                );
              })()}
            </div>
          </div>
        )}
      </details>
    </section>
  );
}
