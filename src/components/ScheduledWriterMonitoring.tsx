"use client";

import { getSafeCheckSource } from "@/lib/sourceCheck";
import {
  WRITER_MONITORING_TITLE,
  WRITER_MONITORING_NO_PUBLISH_NOTE,
  WRITER_MONITORING_KILL_SWITCH_NOTE,
  WRITER_MONITORING_UNTRACKED_NOTE,
  type ScheduledWriterSourceActivity,
} from "@/lib/writerCandidateActivity";

// Sprint 149 — Scheduled Writer Monitoring v1 (admin-only, rendered on
// /admin/sources below the Source Health Dashboard). Read-only view over
// data the page already loads; triggers nothing, fetches nothing, writes
// nothing. All derivation logic and copy live in
// src/lib/writerCandidateActivity.ts, where tests pin both.

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

export function ScheduledWriterMonitoring({ rows }: { rows: ScheduledWriterSourceActivity[] }) {
  return (
    <section
      id="scheduled-writer-monitoring"
      className="mb-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-4 sm:p-5"
    >
      <details>
        <summary className="cursor-pointer select-none">
          <span className="text-base font-semibold text-slate-800 dark:text-slate-100">
            {WRITER_MONITORING_TITLE}
          </span>
          <span className="ml-2 inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 ring-1 ring-purple-200">
            published: false
          </span>
        </summary>

        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mt-2 mb-1.5">
          {WRITER_MONITORING_NO_PUBLISH_NOTE}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-1.5">
          {WRITER_MONITORING_KILL_SWITCH_NOTE}
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed mb-3">
          {WRITER_MONITORING_UNTRACKED_NOTE}
        </p>

        <div className="space-y-2">
          {rows.map((row) => {
            const source = getSafeCheckSource(row.sourceKey);
            return (
              <div
                key={row.sourceKey}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 p-3"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 mr-1">
                    {source?.name ?? row.sourceKey}
                  </span>
                  <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 ring-1 ring-slate-200">
                    {row.totalCandidates} kandydat(ów) łącznie
                  </span>
                  {row.pendingCandidates > 0 && (
                    <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200">
                      {row.pendingCandidates} oczekuje na weryfikację
                    </span>
                  )}
                </div>
                <div className="mt-1.5">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {row.lastCandidateAt
                      ? `Ostatni kandydat od Scheduled Writera: ${formatTimestamp(row.lastCandidateAt)}`
                      : "Scheduled Writer jeszcze nie zapisał tu żadnego kandydata"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </details>
    </section>
  );
}
