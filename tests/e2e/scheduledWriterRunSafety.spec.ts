import { test, expect } from "@playwright/test";
import {
  classifyFetchFailure,
  isRunLockHeld,
  buildRunHistoryOpenInsert,
  buildRunHistoryCloseUpdate,
  MAX_FETCH_ATTEMPTS,
  RUN_LOCK_STALE_AFTER_MS,
  isStaleAfterSecondsValid,
  isCloseRunInputValid,
  ALLOWED_RUN_OUTCOMES,
  ERROR_SUMMARY_MAX_LENGTH,
  type RunLockRow,
  type CloseRunValidationInput,
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

/**
 * Sprint 166C, Stage 2b — Revision 2 (post read-only security audit).
 *
 * These mirror the exact validation open_scheduled_writer_run() and
 * close_scheduled_writer_run() perform BEFORE touching any row — see
 * docs/sql/PROPOSED_SPRINT_166C_ATOMIC_LOCK_MIGRATION_V2.sql. The SQL
 * functions are the only place these checks are actually enforced; this
 * file exists so the exact boundary values can be reviewed and tested in
 * isolation without a live database, matching the isRunLockHeld
 * specification pattern above. Two concurrent opens racing on the same
 * lock are covered at the route level in
 * scheduledWriterRouteHistoryLock.spec.ts ("exactly one of two
 * simultaneous invocations opens the run") — not duplicated here.
 */
test.describe("isStaleAfterSecondsValid — mirrors open_scheduled_writer_run()'s bounds check", () => {
  test("null is rejected", () => {
    expect(isStaleAfterSecondsValid(null)).toBe(false);
  });

  test("undefined is rejected", () => {
    expect(isStaleAfterSecondsValid(undefined)).toBe(false);
  });

  test("0 is rejected", () => {
    expect(isStaleAfterSecondsValid(0)).toBe(false);
  });

  test("a negative value is rejected", () => {
    expect(isStaleAfterSecondsValid(-1)).toBe(false);
  });

  test("299 (just under the minimum) is rejected", () => {
    expect(isStaleAfterSecondsValid(299)).toBe(false);
  });

  test("300 (the minimum, and the route's real value) is accepted", () => {
    expect(isStaleAfterSecondsValid(300)).toBe(true);
  });

  test("86400 (the maximum) is accepted", () => {
    expect(isStaleAfterSecondsValid(86400)).toBe(true);
  });

  test("86401 (just over the maximum) is rejected", () => {
    expect(isStaleAfterSecondsValid(86401)).toBe(false);
  });

  test("NaN and Infinity are rejected", () => {
    expect(isStaleAfterSecondsValid(Number.NaN)).toBe(false);
    expect(isStaleAfterSecondsValid(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

function validCloseInput(overrides: Partial<CloseRunValidationInput> = {}): CloseRunValidationInput {
  return {
    outcome: "success",
    sourcesChecked: 1,
    sourcesFailed: 0,
    candidatesInserted: 1,
    duplicatesSkipped: 0,
    ambiguousCandidates: 0,
    cappedSkipped: 0,
    duplicatesPreventedByDatabase: 0,
    errorSummary: null,
    ...overrides,
  };
}

test.describe("isCloseRunInputValid — mirrors close_scheduled_writer_run()'s own validation", () => {
  test("a fully valid input (a normal successful close) is accepted", () => {
    expect(isCloseRunInputValid(validCloseInput())).toBe(true);
  });

  test("every outcome in ALLOWED_RUN_OUTCOMES is individually accepted, including 'abandoned'", () => {
    for (const outcome of ALLOWED_RUN_OUTCOMES) {
      expect(isCloseRunInputValid(validCloseInput({ outcome }))).toBe(true);
    }
  });

  test("an invalid p_outcome string is rejected", () => {
    expect(isCloseRunInputValid(validCloseInput({ outcome: "not_a_real_outcome" }))).toBe(false);
  });

  test("a null or undefined outcome is rejected", () => {
    expect(isCloseRunInputValid(validCloseInput({ outcome: null }))).toBe(false);
    expect(isCloseRunInputValid(validCloseInput({ outcome: undefined }))).toBe(false);
  });

  test("a negative sourcesChecked is rejected", () => {
    expect(isCloseRunInputValid(validCloseInput({ sourcesChecked: -1 }))).toBe(false);
  });

  test("a negative sourcesFailed is rejected", () => {
    expect(isCloseRunInputValid(validCloseInput({ sourcesFailed: -1 }))).toBe(false);
  });

  test("a negative candidatesInserted is rejected", () => {
    expect(isCloseRunInputValid(validCloseInput({ candidatesInserted: -1 }))).toBe(false);
  });

  test("a negative duplicatesSkipped is rejected", () => {
    expect(isCloseRunInputValid(validCloseInput({ duplicatesSkipped: -1 }))).toBe(false);
  });

  test("a negative ambiguousCandidates is rejected", () => {
    expect(isCloseRunInputValid(validCloseInput({ ambiguousCandidates: -1 }))).toBe(false);
  });

  test("a negative cappedSkipped is rejected", () => {
    expect(isCloseRunInputValid(validCloseInput({ cappedSkipped: -1 }))).toBe(false);
  });

  test("a negative duplicatesPreventedByDatabase is rejected", () => {
    expect(isCloseRunInputValid(validCloseInput({ duplicatesPreventedByDatabase: -1 }))).toBe(false);
  });

  test("a null or undefined counter is rejected (must be present, not merely non-negative)", () => {
    expect(isCloseRunInputValid(validCloseInput({ sourcesChecked: null }))).toBe(false);
    expect(isCloseRunInputValid(validCloseInput({ sourcesFailed: undefined }))).toBe(false);
  });

  test("a non-integer counter is rejected", () => {
    expect(isCloseRunInputValid(validCloseInput({ sourcesChecked: 1.5 }))).toBe(false);
  });

  test("a null errorSummary is accepted (the normal success-path shape)", () => {
    expect(isCloseRunInputValid(validCloseInput({ errorSummary: null }))).toBe(true);
  });

  test(`an errorSummary at exactly the ${ERROR_SUMMARY_MAX_LENGTH}-character limit is accepted`, () => {
    expect(isCloseRunInputValid(validCloseInput({ errorSummary: "a".repeat(ERROR_SUMMARY_MAX_LENGTH) }))).toBe(true);
  });

  test(`an errorSummary one character over the ${ERROR_SUMMARY_MAX_LENGTH}-character limit is rejected`, () => {
    expect(isCloseRunInputValid(validCloseInput({ errorSummary: "a".repeat(ERROR_SUMMARY_MAX_LENGTH + 1) }))).toBe(
      false
    );
  });
});
