import { test, expect } from "@playwright/test";
import {
  classifyFetchFailure,
  isRunLockHeld,
  buildRunHistoryOpenInsert,
  buildRunHistoryCloseUpdate,
  MAX_FETCH_ATTEMPTS,
  RUN_LOCK_STALE_AFTER_MS,
  type RunLockRow,
} from "@/lib/scheduledWriterRunSafety";

/**
 * Sprint 166C — pure-function tests for the new run-safety primitives.
 * None of this is wired into any live route yet (see
 * docs/SPRINT_166C_AUTOMATIC_SOURCE_MONITORING_AUDIT_AND_DESIGN_V1.md §D)
 * except classifyFetchFailure, which the write-candidates route's retry
 * wrapper uses — covered separately in scheduledWriterRoute.spec.ts.
 */

test.describe("classifyFetchFailure", () => {
  test("http_5xx is transient", () => {
    expect(classifyFetchFailure("http_5xx")).toBe("transient");
  });

  test("timeout_10s is transient", () => {
    expect(classifyFetchFailure("timeout_10s")).toBe("transient");
  });

  test("network_error is transient", () => {
    expect(classifyFetchFailure("network_error")).toBe("transient");
  });

  test("http_4xx is permanent", () => {
    expect(classifyFetchFailure("http_4xx")).toBe("permanent");
  });

  test("non_html_content_type is permanent", () => {
    expect(classifyFetchFailure("non_html_content_type")).toBe("permanent");
  });

  test("parse_exception is permanent", () => {
    expect(classifyFetchFailure("parse_exception")).toBe("permanent");
  });
});

test.describe("MAX_FETCH_ATTEMPTS — bounded, never a loop", () => {
  test("is exactly 2 (one retry, ever)", () => {
    expect(MAX_FETCH_ATTEMPTS).toBe(2);
  });
});

test.describe("isRunLockHeld", () => {
  test("no lock at all never blocks", () => {
    expect(isRunLockHeld(null)).toBe(false);
  });

  test("a finished lock never blocks, regardless of age", () => {
    const lock: RunLockRow = {
      startedAt: new Date(Date.now() - 10_000).toISOString(),
      finishedAt: new Date().toISOString(),
    };
    expect(isRunLockHeld(lock)).toBe(false);
  });

  test("a fresh, unfinished lock blocks", () => {
    const lock: RunLockRow = { startedAt: new Date().toISOString(), finishedAt: null };
    expect(isRunLockHeld(lock)).toBe(true);
  });

  test("an unfinished lock older than the stale window no longer blocks (abandoned-run recovery)", () => {
    const now = new Date();
    const lock: RunLockRow = {
      startedAt: new Date(now.getTime() - RUN_LOCK_STALE_AFTER_MS - 1_000).toISOString(),
      finishedAt: null,
    };
    expect(isRunLockHeld(lock, now)).toBe(false);
  });

  test("an unfinished lock just inside the stale window still blocks", () => {
    const now = new Date();
    const lock: RunLockRow = {
      startedAt: new Date(now.getTime() - RUN_LOCK_STALE_AFTER_MS + 1_000).toISOString(),
      finishedAt: null,
    };
    expect(isRunLockHeld(lock, now)).toBe(true);
  });

  test("a malformed startedAt never blocks (fails open on bad data, never wedges every future run)", () => {
    const lock: RunLockRow = { startedAt: "not-a-date", finishedAt: null };
    expect(isRunLockHeld(lock)).toBe(false);
  });
});

test.describe("buildRunHistoryOpenInsert", () => {
  test("shapes exactly the open-phase columns, snake_case, no extra fields", () => {
    const payload = buildRunHistoryOpenInsert({
      id: "11111111-1111-4111-8111-111111111111",
      startedAt: "2026-07-22T06:00:00.000Z",
      trigger: "manual",
      environmentTag: "preview",
    });
    expect(payload).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      started_at: "2026-07-22T06:00:00.000Z",
      trigger: "manual",
      environment_tag: "preview",
    });
  });

  test("never includes finished_at or outcome — an open row always starts null on both", () => {
    const payload = buildRunHistoryOpenInsert({
      id: "11111111-1111-4111-8111-111111111111",
      startedAt: "2026-07-22T06:00:00.000Z",
      trigger: "cron",
      environmentTag: "production",
    });
    expect(payload).not.toHaveProperty("finished_at");
    expect(payload).not.toHaveProperty("outcome");
  });
});

test.describe("buildRunHistoryCloseUpdate", () => {
  test("shapes exactly the close-phase columns, snake_case, no extra fields", () => {
    const payload = buildRunHistoryCloseUpdate({
      finishedAt: "2026-07-22T06:00:05.000Z",
      outcome: "success",
      sourcesChecked: 1,
      sourcesFailed: 0,
      candidatesInserted: 1,
      duplicatesSkipped: 0,
      ambiguousCandidates: 0,
      cappedSkipped: 5,
      duplicatesPreventedByDatabase: 0,
      errorSummary: null,
    });
    expect(payload).toEqual({
      finished_at: "2026-07-22T06:00:05.000Z",
      outcome: "success",
      sources_checked: 1,
      sources_failed: 0,
      candidates_inserted: 1,
      duplicates_skipped: 0,
      ambiguous_candidates: 0,
      capped_skipped: 5,
      duplicates_prevented_by_database: 0,
      error_summary: null,
    });
  });

  test("never includes an 'alerts'-shaped or publish-shaped field — structural no-auto-publish check", () => {
    const payload = buildRunHistoryCloseUpdate({
      finishedAt: "2026-07-22T06:00:05.000Z",
      outcome: "total_failure",
      sourcesChecked: 1,
      sourcesFailed: 1,
      candidatesInserted: 0,
      duplicatesSkipped: 0,
      ambiguousCandidates: 0,
      cappedSkipped: 0,
      duplicatesPreventedByDatabase: 0,
      errorSummary: "1/1 sources failed",
    });
    expect(JSON.stringify(payload)).not.toContain("alert");
    expect(JSON.stringify(payload)).not.toContain("publish");
  });

  test("never includes started_at, trigger, or id — closing never touches the row's identity/open-phase fields", () => {
    const payload = buildRunHistoryCloseUpdate({
      finishedAt: "2026-07-22T06:00:05.000Z",
      outcome: "success",
      sourcesChecked: 1,
      sourcesFailed: 0,
      candidatesInserted: 0,
      duplicatesSkipped: 0,
      ambiguousCandidates: 0,
      cappedSkipped: 0,
      duplicatesPreventedByDatabase: 0,
      errorSummary: null,
    });
    expect(payload).not.toHaveProperty("id");
    expect(payload).not.toHaveProperty("started_at");
    expect(payload).not.toHaveProperty("trigger");
  });
});
