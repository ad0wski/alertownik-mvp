import type { ScheduledSourceWriter } from "@/lib/scheduledWriter";
import { runAutoAlertsV1, type AutoAlertsV1RunResult, type AutomationMode } from "@/lib/autoAlertsV1";
import { runAutoArchive, type AutoArchiveRunResult } from "@/lib/autoArchive";
import { isWriterStale, type AutomationNotificationEventType } from "@/lib/operationalNotificationOrchestrator";
import type { SsrfCheckResult } from "@/lib/ssrfGuard";

// AUTO ALERTS V1 — one automation cycle, as run by
// /api/cron/auto-publish-trusted-source: stale-writer check → auto-archive
// → auto-publish → which problems deserve an operational notification.
// Pure apart from the injected writer, so the whole cycle is testable with
// an in-memory fake (tests/e2e/autoAlertsV1.spec.ts).

export interface AutomationCycleModes {
  publish: AutomationMode;
  archive: AutomationMode;
}

/** SCHEDULED_AUTOMATION_DRY_RUN=true turns BOTH steps into dry runs even if
 *  a live flag is also set — the safe flag always wins. */
export function resolveAutomationCycleModes(env: Record<string, string | undefined> = process.env): AutomationCycleModes {
  const dryRun = env.SCHEDULED_AUTOMATION_DRY_RUN === "true";
  const mode = (live: string | undefined): AutomationMode => (dryRun ? "dry_run" : live === "true" ? "live" : "off");
  return { publish: mode(env.SCHEDULED_AUTO_PUBLISH_ENABLED), archive: mode(env.SCHEDULED_AUTO_ARCHIVE_ENABLED) };
}

export function isAnyAutomationStepOn(modes: AutomationCycleModes): boolean {
  return modes.publish !== "off" || modes.archive !== "off";
}

export interface AutomationNotificationRequest {
  eventType: AutomationNotificationEventType;
  summary: string;
}

export interface AutomationCycleResult {
  modes: AutomationCycleModes;
  writerStale: boolean | null;
  archive: AutoArchiveRunResult;
  publish: AutoAlertsV1RunResult;
  notifications: AutomationNotificationRequest[];
  /** true when any step failed (not merely "nothing to do"). */
  hadFailure: boolean;
}

export interface AutomationCycleOptions {
  modes: AutomationCycleModes;
  runId: string | null;
  now?: Date;
  checkUrl?: (url: string) => Promise<SsrfCheckResult>;
}

export async function runAutomationCycle(
  writer: ScheduledSourceWriter,
  options: AutomationCycleOptions
): Promise<AutomationCycleResult> {
  const now = options.now ?? new Date();

  let writerStale: boolean | null = null;
  if (writer.findLastSourceRunFinishedAt) {
    try {
      writerStale = isWriterStale(await writer.findLastSourceRunFinishedAt(), now);
    } catch {
      writerStale = null; // unknown — not reported as stale, not as healthy
    }
  }

  // Each step is isolated: an exception in one can never skip the other
  // into a half-done state, and is reported as that step's failure.
  const archive = await runAutoArchive(writer, { mode: options.modes.archive, runId: options.runId, now }).catch(
    (): AutoArchiveRunResult => ({
      mode: options.modes.archive,
      status: "read_failed",
      graceMinutes: 0,
      archived: [],
      wouldArchive: [],
      skipped: [],
      failed: [],
      decisionLogFailures: 0,
    })
  );
  const publish = await runAutoAlertsV1(writer, {
    mode: options.modes.publish,
    runId: options.runId,
    now,
    checkUrl: options.checkUrl,
  }).catch(
    (): AutoAlertsV1RunResult => ({ mode: options.modes.publish, status: "unexpected_error", decisions: [], decisionLogFailures: 0 })
  );

  const notifications = buildAutomationNotifications({ writerStale, archive, publish });
  const hadFailure =
    archive.status === "read_failed" ||
    archive.status === "partial_failure" ||
    ["dedup_pool_unavailable", "insert_failed", "mark_converted_failed", "unexpected_error"].includes(publish.status);

  return { modes: options.modes, writerStale, archive, publish, notifications, hadFailure };
}

/** Problems only — a normal run (published, archived, nothing to do, or
 *  only non-alert notices skipped) produces no notification at all. */
export function buildAutomationNotifications(input: {
  writerStale: boolean | null;
  archive: AutoArchiveRunResult;
  publish: AutoAlertsV1RunResult;
}): AutomationNotificationRequest[] {
  const out: AutomationNotificationRequest[] = [];
  if (input.writerStale === true) {
    out.push({ eventType: "writer_stale", summary: "Writer kandydatów nie zakończył żadnego uruchomienia od ponad 26 godzin." });
  }

  const { publish, archive } = input;
  if (["insert_failed", "mark_converted_failed", "unexpected_error", "dedup_pool_unavailable"].includes(publish.status)) {
    const label =
      publish.status === "mark_converted_failed"
        ? "alert opublikowany, ale kandydat nie został oznaczony — uzgodnij ręcznie"
        : publish.status === "dedup_pool_unavailable"
          ? "brak odczytu istniejących alertów do deduplikacji — nic nie opublikowano"
          : "nic nie opublikowano";
    out.push({ eventType: "auto_publish_failed", summary: `Automatyczna publikacja (${publish.mode}): ${publish.status} — ${label}.` });
  }

  const review = publish.decisions.filter((d) => d.needsReview && d.decision !== "failed");
  if (review.length > 0) {
    const reasons = Array.from(new Set(review.map((d) => d.reason))).join(", ");
    out.push({
      eventType: "auto_alert_needs_review",
      summary: `${review.length} komunikat(y) wymaga decyzji w kolejce kandydatów (${reasons}).`,
    });
  }

  if (archive.status === "read_failed" || archive.status === "partial_failure") {
    out.push({
      eventType: "auto_archive_failed",
      summary: `Automatyczna archiwizacja (${archive.mode}): ${archive.status}, nieudane: ${archive.failed.length}.`,
    });
  }
  return out;
}
