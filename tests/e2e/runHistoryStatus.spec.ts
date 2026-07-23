import { test, expect } from "@playwright/test";
import {
  buildRunHistorySnapshot,
  notConfiguredRunHistorySnapshot,
  RUN_HISTORY_NO_RETRY_DATA_NOTE,
  RUN_OUTCOME_LABELS_PL,
  formatRunTrigger,
  type RunHistoryRow,
} from "@/lib/runHistoryStatus";
import { ALLOWED_RUN_OUTCOMES, RUN_LOCK_STALE_AFTER_MS } from "@/lib/scheduledWriterRunSafety";

/**
 * Sprint 166D-2B — pure-function tests for buildRunHistorySnapshot(), the
 * only place that shapes raw scheduled_writer_runs rows into the safe
 * fields this project is willing to surface in the browser.
 */

function row(overrides: Partial<RunHistoryRow>): RunHistoryRow {
  return {
    id: "row-1",
    startedAt: "2026-07-23T10:00:00.000Z",
    finishedAt: "2026-07-23T10:00:30.000Z",
    trigger: "manual",
    environmentTag: "preview",
    outcome: "success",
    sourcesChecked: 1,
    sourcesFailed: 0,
    ...overrides,
  };
}

test.describe("notConfiguredRunHistorySnapshot", () => {
  test("reports configured:false and null runs", () => {
    const snapshot = notConfiguredRunHistorySnapshot();
    expect(snapshot.configured).toBe(false);
    expect(snapshot.lastClosedRun).toBeNull();
    expect(snapshot.openRun).toBeNull();
    expect(snapshot.retryInfoNote).toBe(RUN_HISTORY_NO_RETRY_DATA_NOTE);
  });
});

test.describe("buildRunHistorySnapshot — scenario coverage", () => {
  test("1. no history at all → configured true, both runs null", () => {
    const snapshot = buildRunHistorySnapshot([], "preview");
    expect(snapshot.configured).toBe(true);
    expect(snapshot.lastClosedRun).toBeNull();
    expect(snapshot.openRun).toBeNull();
  });

  test("2. last run success → category none, severity info, no admin action", () => {
    const snapshot = buildRunHistorySnapshot([row({ outcome: "success" })], "preview");
    expect(snapshot.lastClosedRun?.category).toBe("none");
    expect(snapshot.lastClosedRun?.severity).toBe("info");
    expect(snapshot.lastClosedRun?.adminActionRequired).toBe(false);
  });

  test("3. last run failed (partial_failure/total_failure) → unexpected_error, critical, admin action required", () => {
    const partial = buildRunHistorySnapshot([row({ outcome: "partial_failure" })], "preview");
    expect(partial.lastClosedRun?.category).toBe("unexpected_error");
    expect(partial.lastClosedRun?.severity).toBe("critical");
    expect(partial.lastClosedRun?.adminActionRequired).toBe(true);

    const total = buildRunHistorySnapshot([row({ outcome: "total_failure" })], "preview");
    expect(total.lastClosedRun?.category).toBe("unexpected_error");
    expect(total.lastClosedRun?.adminActionRequired).toBe(true);
  });

  test("4. last run abandoned → lock_held category", () => {
    const snapshot = buildRunHistorySnapshot([row({ outcome: "abandoned" })], "preview");
    expect(snapshot.lastClosedRun?.category).toBe("lock_held");
  });

  test("5. an open run (finished_at null) is reported via openRun, not lastClosedRun", () => {
    const snapshot = buildRunHistorySnapshot(
      [row({ id: "open", finishedAt: null, outcome: null })],
      "preview"
    );
    expect(snapshot.openRun).not.toBeNull();
    expect(snapshot.lastClosedRun).toBeNull();
  });

  test("6. duration is computed correctly in whole seconds", () => {
    const snapshot = buildRunHistorySnapshot(
      [row({ startedAt: "2026-07-23T10:00:00.000Z", finishedAt: "2026-07-23T10:02:15.000Z" })],
      "preview"
    );
    expect(snapshot.lastClosedRun?.durationSeconds).toBe(135);
  });

  test("duration never goes negative even for a malformed row (finishedAt before startedAt)", () => {
    const snapshot = buildRunHistorySnapshot(
      [row({ startedAt: "2026-07-23T10:05:00.000Z", finishedAt: "2026-07-23T10:00:00.000Z" })],
      "preview"
    );
    expect(snapshot.lastClosedRun?.durationSeconds).toBe(0);
  });

  test("7. retryInfoNote is always the fixed honest note — never derived from row data", () => {
    const success = buildRunHistorySnapshot([row({ outcome: "success" })], "preview");
    const failure = buildRunHistorySnapshot([row({ outcome: "total_failure" })], "preview");
    expect(success.retryInfoNote).toBe(RUN_HISTORY_NO_RETRY_DATA_NOTE);
    expect(failure.retryInfoNote).toBe(RUN_HISTORY_NO_RETRY_DATA_NOTE);
  });

  test("8. every allowed outcome classifies to a safe category without throwing", () => {
    for (const outcome of ALLOWED_RUN_OUTCOMES) {
      const snapshot = buildRunHistorySnapshot([row({ outcome: outcome as RunHistoryRow["outcome"] })], "preview");
      expect(typeof snapshot.lastClosedRun?.category).toBe("string");
      expect(typeof snapshot.lastClosedRun?.severity).toBe("string");
    }
  });

  test("9. the row/snapshot shape structurally cannot carry error_summary — no such field exists on the type", () => {
    const snapshot = buildRunHistorySnapshot([row({ outcome: "total_failure" })], "preview");
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toMatch(/error_summary/i);
    expect(serialized).not.toMatch(/errorSummary/);
  });

  test("11. rows for a different environment_tag are filtered out, even when they'd otherwise be the most recent", () => {
    const rows: RunHistoryRow[] = [
      row({ id: "prod-row", environmentTag: "production", startedAt: "2026-07-23T12:00:00.000Z", finishedAt: "2026-07-23T12:00:10.000Z" }),
      row({ id: "preview-row", environmentTag: "preview", startedAt: "2026-07-23T10:00:00.000Z", finishedAt: "2026-07-23T10:00:10.000Z" }),
    ];
    const snapshot = buildRunHistorySnapshot(rows, "preview");
    expect(snapshot.lastClosedRun?.startedAt).toBe("2026-07-23T10:00:00.000Z");
  });

  test("an open run older than RUN_LOCK_STALE_AFTER_MS is flagged likelyStuck", () => {
    const now = new Date("2026-07-23T12:00:00.000Z");
    const staleStart = new Date(now.getTime() - RUN_LOCK_STALE_AFTER_MS - 1_000).toISOString();
    const snapshot = buildRunHistorySnapshot(
      [row({ id: "stuck", finishedAt: null, outcome: null, startedAt: staleStart })],
      "preview",
      now
    );
    expect(snapshot.openRun?.likelyStuck).toBe(true);
  });

  test("an open run younger than RUN_LOCK_STALE_AFTER_MS is not flagged likelyStuck", () => {
    const now = new Date("2026-07-23T12:00:00.000Z");
    const freshStart = new Date(now.getTime() - 5_000).toISOString();
    const snapshot = buildRunHistorySnapshot(
      [row({ id: "fresh", finishedAt: null, outcome: null, startedAt: freshStart })],
      "preview",
      now
    );
    expect(snapshot.openRun?.likelyStuck).toBe(false);
  });

  test("deterministic ordering: the most recent closed row wins regardless of input array order", () => {
    const older = row({ id: "older", startedAt: "2026-07-23T09:00:00.000Z", finishedAt: "2026-07-23T09:00:10.000Z" });
    const newer = row({ id: "newer", startedAt: "2026-07-23T11:00:00.000Z", finishedAt: "2026-07-23T11:00:10.000Z" });
    const snapshotA = buildRunHistorySnapshot([older, newer], "preview");
    const snapshotB = buildRunHistorySnapshot([newer, older], "preview");
    expect(snapshotA.lastClosedRun?.startedAt).toBe("2026-07-23T11:00:00.000Z");
    expect(snapshotB.lastClosedRun?.startedAt).toBe("2026-07-23T11:00:00.000Z");
  });
});

test.describe("RUN_OUTCOME_LABELS_PL / formatRunTrigger — coverage", () => {
  test("every allowed RunOutcome has a Polish label", () => {
    for (const outcome of ALLOWED_RUN_OUTCOMES) {
      expect(RUN_OUTCOME_LABELS_PL[outcome as keyof typeof RUN_OUTCOME_LABELS_PL]).toBeTruthy();
    }
  });

  test("formatRunTrigger covers both trigger values", () => {
    expect(formatRunTrigger("cron")).toBeTruthy();
    expect(formatRunTrigger("manual")).toBeTruthy();
  });
});
