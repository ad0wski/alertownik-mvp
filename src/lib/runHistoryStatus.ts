import { RUN_LOCK_STALE_AFTER_MS, type RunOutcome, type RunTrigger } from "@/lib/scheduledWriterRunSafety";
import { categoryFromRunOutcome, buildAdminActionRequired, severityForCategory } from "@/lib/automationErrorClassifier";
import type { AutomationErrorCategory, AutomationSeverity } from "@/lib/automationAlerting";

// Sprint 166D-2B — safe, read-only run-history snapshot. Pure functions
// only — no Supabase import, no fetch. The caller (GET
// /api/admin/automation-status) is the only place that ever queries
// public.scheduled_writer_runs; this module only shapes already-fetched
// rows into the closed, non-sensitive fields this project is willing to
// surface in the browser. See
// docs/SPRINT_166D_OPERATIONAL_MONITORING_ALERTING_AUDIT_AND_DESIGN_V1.md
// and the Sprint 166D-2B audit for the full rationale.
//
// HONEST LIMITATION (audit finding, Etap 2.7): scheduled_writer_runs has
// no column recording attempt counts or whether a retry happened —
// sources_checked/sources_failed are aggregates across the whole run, not
// per-attempt. This module never fabricates a retry state; it always
// reports RUN_HISTORY_NO_RETRY_DATA_NOTE verbatim.
//
// NEVER included anywhere in this module's output: error_summary (raw
// text), any stack trace, any URL with query parameters, any header,
// token, or credential, or a raw Supabase error object. The only fields
// ever read from a row are: id, started_at, finished_at, trigger,
// environment_tag, outcome, sources_checked, sources_failed.

export const RUN_HISTORY_NO_RETRY_DATA_NOTE = "Brak danych o zaplanowanej kolejnej próbie.";

export const RUN_HISTORY_NO_DATA_LABEL = "brak danych";

/** Polish labels for the closed RunOutcome vocabulary (mirrors
 *  ALLOWED_RUN_OUTCOMES in scheduledWriterRunSafety.ts exactly — one entry
 *  per allowed value, nothing else). */
export const RUN_OUTCOME_LABELS_PL: Record<RunOutcome, string> = {
  success: "sukces",
  partial_failure: "częściowy błąd",
  total_failure: "całkowity błąd",
  skipped_kill_switch: "pominięty (wyłącznik automatyzacji)",
  skipped_lock_held: "pominięty (poprzedni przebieg wciąż trwał)",
  abandoned: "porzucony (blokada wygasła)",
};

const TRIGGER_LABELS_PL: Record<RunTrigger, string> = {
  cron: "harmonogram (cron)",
  manual: "ręczne wywołanie",
};

export function formatRunTrigger(trigger: RunTrigger): string {
  return TRIGGER_LABELS_PL[trigger];
}

/** Shape of a row this module accepts — mirrors exactly the columns the
 *  route selects from scheduled_writer_runs, camelCased. Never a wider
 *  shape (no error_summary field exists here at all — it is never
 *  selected by the route in the first place, so it structurally cannot
 *  leak through this type). */
export interface RunHistoryRow {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  trigger: RunTrigger;
  environmentTag: string;
  outcome: RunOutcome | null;
  sourcesChecked: number;
  sourcesFailed: number;
}

export interface LastClosedRunInfo {
  outcome: RunOutcome;
  category: AutomationErrorCategory;
  severity: AutomationSeverity;
  adminActionRequired: boolean;
  startedAt: string;
  finishedAt: string;
  durationSeconds: number;
  trigger: RunTrigger;
  sourcesChecked: number;
  sourcesFailed: number;
}

export interface OpenRunInfo {
  startedAt: string;
  ageSeconds: number;
  /** True once the open run has been running longer than
   *  RUN_LOCK_STALE_AFTER_MS — the same threshold the atomic lock itself
   *  uses to treat a run as abandoned (scheduledWriterRunSafety.ts). Never
   *  a new, separately-invented threshold. */
  likelyStuck: boolean;
  trigger: RunTrigger;
}

export interface RunHistorySnapshot {
  /** False when SUPABASE_ENVIRONMENT_TAG could not be resolved for this
   *  deployment — the route never attempted a query in that case, and
   *  this module was never called with rows at all (see
   *  notConfiguredRunHistorySnapshot()). */
  configured: boolean;
  lastClosedRun: LastClosedRunInfo | null;
  openRun: OpenRunInfo | null;
  retryInfoNote: string;
}

/** Returned by the route directly (no rows fetched at all) when the
 *  environment tag isn't configured — never guessed, never defaulted to a
 *  specific environment. */
export function notConfiguredRunHistorySnapshot(): RunHistorySnapshot {
  return {
    configured: false,
    lastClosedRun: null,
    openRun: null,
    retryInfoNote: RUN_HISTORY_NO_RETRY_DATA_NOTE,
  };
}

function durationSecondsBetween(startedAt: string, finishedAt: string): number {
  const startMs = new Date(startedAt).getTime();
  const finishMs = new Date(finishedAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(finishMs) || finishMs < startMs) return 0;
  return Math.round((finishMs - startMs) / 1000);
}

/** Builds the safe snapshot from already-fetched rows. Defense in depth:
 *  independently re-filters every row against `expectedEnvironmentTag`
 *  rather than trusting the caller's own Supabase query alone — mirrors
 *  the existing project convention (e.g. write-candidates/route.ts
 *  re-narrows allowedWriteSourceIds server-side even though the caller
 *  can't widen it). Rows for any other environment_tag are silently
 *  dropped, never surfaced, never mixed into the result. */
export function buildRunHistorySnapshot(
  rows: RunHistoryRow[],
  expectedEnvironmentTag: string,
  now: Date = new Date()
): RunHistorySnapshot {
  const scoped = rows.filter((r) => r.environmentTag === expectedEnvironmentTag);

  // Deterministic: rows are expected pre-sorted by the caller's query
  // (started_at desc, id desc) — re-sort defensively so this function's
  // own correctness never depends on the caller getting that right.
  const sorted = [...scoped].sort((a, b) => {
    const byStart = new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
    if (byStart !== 0) return byStart;
    return b.id.localeCompare(a.id);
  });

  const openRow = sorted.find((r) => r.finishedAt === null) ?? null;
  const closedRow = sorted.find((r) => r.finishedAt !== null) ?? null;

  let openRun: OpenRunInfo | null = null;
  if (openRow) {
    const startedMs = new Date(openRow.startedAt).getTime();
    const ageMs = Number.isFinite(startedMs) ? Math.max(0, now.getTime() - startedMs) : 0;
    openRun = {
      startedAt: openRow.startedAt,
      ageSeconds: Math.round(ageMs / 1000),
      likelyStuck: ageMs > RUN_LOCK_STALE_AFTER_MS,
      trigger: openRow.trigger,
    };
  }

  let lastClosedRun: LastClosedRunInfo | null = null;
  if (closedRow && closedRow.finishedAt && closedRow.outcome) {
    const category = categoryFromRunOutcome(closedRow.outcome);
    lastClosedRun = {
      outcome: closedRow.outcome,
      category,
      severity: severityForCategory(category),
      adminActionRequired: buildAdminActionRequired(category, 0).required,
      startedAt: closedRow.startedAt,
      finishedAt: closedRow.finishedAt,
      durationSeconds: durationSecondsBetween(closedRow.startedAt, closedRow.finishedAt),
      trigger: closedRow.trigger,
      sourcesChecked: closedRow.sourcesChecked,
      sourcesFailed: closedRow.sourcesFailed,
    };
  }

  return {
    configured: true,
    lastClosedRun,
    openRun,
    retryInfoNote: RUN_HISTORY_NO_RETRY_DATA_NOTE,
  };
}
