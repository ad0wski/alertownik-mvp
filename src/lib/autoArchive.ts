import type { AutoArchiveAlertRow, ScheduledSourceWriter } from "@/lib/scheduledWriter";
import type { AutomationMode } from "@/lib/autoAlertsV1";

// AUTO ALERTS V1 — automatic archiving of ended alerts.
//
// published alert → ends_at + grace period has passed → status "archived"
// (plus alerts.auto_archived_at, which marks the change as automatic).
// Never DELETE, never touches drafts or already-archived rows, never an
// alert without a trustworthy ends_at, never sends a push (this module
// imports nothing from src/lib/push — pinned by a test).
//
// The database enforces the same boundary independently: the writer's
// UPDATE policy only matches published rows whose ends_at is at least 30
// minutes in the past, and a guard trigger rejects any automation change
// other than published → archived + auto_archived_at
// (docs/sql/PROPOSED_AUTO_ALERTS_V1.sql).

/** Default grace period. Cron runs at most a few times a day on this
 *  project, so the effective delay is "grace, then the next run". */
export const DEFAULT_AUTO_ARCHIVE_GRACE_MINUTES = 60;
/** Same floor as the database policy — the env can never go below it. */
export const MIN_AUTO_ARCHIVE_GRACE_MINUTES = 30;
export const MAX_AUTO_ARCHIVE_GRACE_MINUTES = 24 * 60;
/** Per-run cap — a misconfiguration can never mass-archive in one go. */
export const DEFAULT_AUTO_ARCHIVE_MAX_PER_RUN = 20;

export function getAutoArchiveGraceMinutes(raw: string | undefined = process.env.SCHEDULED_AUTO_ARCHIVE_GRACE_MINUTES): number {
  if (!raw) return DEFAULT_AUTO_ARCHIVE_GRACE_MINUTES;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_AUTO_ARCHIVE_GRACE_MINUTES;
  return Math.min(MAX_AUTO_ARCHIVE_GRACE_MINUTES, Math.max(MIN_AUTO_ARCHIVE_GRACE_MINUTES, Math.floor(parsed)));
}

export type AutoArchiveSkipReason = "not_published" | "ends_at_missing" | "ends_at_invalid" | "ends_before_start" | "not_ended_yet";

/** Re-validates one row in code (defence in depth on top of the query
 *  filter and the database policy). null = archive it. */
export function checkAlertArchivable(row: AutoArchiveAlertRow, cutoffMs: number): AutoArchiveSkipReason | null {
  if (row.status !== "published") return "not_published";
  if (!row.endsAt) return "ends_at_missing";
  const endMs = new Date(row.endsAt).getTime();
  if (!Number.isFinite(endMs)) return "ends_at_invalid";
  if (row.startsAt) {
    const startMs = new Date(row.startsAt).getTime();
    if (!Number.isFinite(startMs) || endMs <= startMs) return "ends_before_start";
  }
  if (endMs >= cutoffMs) return "not_ended_yet";
  return null;
}

export type AutoArchiveRunStatus = "off" | "ok" | "read_failed" | "partial_failure";

export interface AutoArchiveRunResult {
  mode: AutomationMode;
  status: AutoArchiveRunStatus;
  graceMinutes: number;
  archived: string[];
  wouldArchive: string[];
  skipped: Array<{ alertId: string; reason: AutoArchiveSkipReason | "already_changed" }>;
  failed: string[];
  decisionLogFailures: number;
}

export interface AutoArchiveRunOptions {
  mode: AutomationMode;
  runId: string | null;
  now?: Date;
  graceMinutes?: number;
  maxPerRun?: number;
}

export async function runAutoArchive(writer: ScheduledSourceWriter, options: AutoArchiveRunOptions): Promise<AutoArchiveRunResult> {
  const now = options.now ?? new Date();
  const graceMinutes = options.graceMinutes ?? getAutoArchiveGraceMinutes();
  const result: AutoArchiveRunResult = {
    mode: options.mode,
    status: "off",
    graceMinutes,
    archived: [],
    wouldArchive: [],
    skipped: [],
    failed: [],
    decisionLogFailures: 0,
  };
  if (options.mode === "off") return result;
  if (!writer.findAlertsForAutoArchive || !writer.archiveEndedAlert) {
    result.status = "read_failed";
    return result;
  }

  const cutoffMs = now.getTime() - graceMinutes * 60_000;
  const cutoffIso = new Date(cutoffMs).toISOString();

  const log = async (alertId: string, decision: "would_archive" | "archived" | "skipped" | "failed", reason: string | null) => {
    if (!writer.insertAutomationDecision) return;
    const logged = await writer
      .insertAutomationDecision({
        run_id: options.runId,
        kind: "auto_archive",
        mode: options.mode === "dry_run" ? "dry_run" : "live",
        subject_id: alertId,
        decision,
        reason,
        alert_id: alertId,
      })
      .catch(() => ({ ok: false }));
    if (!logged.ok) result.decisionLogFailures += 1;
  };

  let rows: AutoArchiveAlertRow[];
  try {
    rows = await writer.findAlertsForAutoArchive(cutoffIso, options.maxPerRun ?? DEFAULT_AUTO_ARCHIVE_MAX_PER_RUN);
  } catch {
    result.status = "read_failed";
    return result;
  }

  for (const row of rows) {
    const skip = checkAlertArchivable(row, cutoffMs);
    if (skip) {
      result.skipped.push({ alertId: row.id, reason: skip });
      await log(row.id, "skipped", skip);
      continue;
    }
    if (options.mode === "dry_run") {
      result.wouldArchive.push(row.id);
      await log(row.id, "would_archive", `grace_${graceMinutes}m`);
      continue;
    }
    const archivedAt = now.toISOString();
    const update = await writer.archiveEndedAlert(row.id, cutoffIso, archivedAt).catch(() => ({ ok: false as const }));
    if (!update.ok) {
      result.failed.push(row.id);
      await log(row.id, "failed", "update_failed");
      continue;
    }
    if (!update.archived) {
      result.skipped.push({ alertId: row.id, reason: "already_changed" });
      continue;
    }
    result.archived.push(row.id);
    await log(row.id, "archived", `grace_${graceMinutes}m`);
  }

  result.status = result.failed.length > 0 ? "partial_failure" : "ok";
  return result;
}
