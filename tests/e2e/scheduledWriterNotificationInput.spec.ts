import { test, expect } from "@playwright/test";
import {
  buildRunLevelNotificationCategoryInput,
  buildRunLevelSafeSummary,
} from "@/lib/scheduledWriterNotificationInput";
import { SAFE_SUMMARY_MAX_LENGTH } from "@/lib/operationalNotificationLedger";

/**
 * Sprint 166G-1 — pure builders turning a closed, already-final RunOutcome
 * into the policy's own input shape. No I/O, no Supabase, no fetch.
 */

test.describe("buildRunLevelNotificationCategoryInput — every RunOutcome value", () => {
  test("success → category none, not abandoned", () => {
    const result = buildRunLevelNotificationCategoryInput("success");
    expect(result).toEqual({ category: "none", isAbandonedRun: false });
  });

  test("partial_failure → category unexpected_error, not abandoned", () => {
    const result = buildRunLevelNotificationCategoryInput("partial_failure");
    expect(result).toEqual({ category: "unexpected_error", isAbandonedRun: false });
  });

  test("total_failure → category unexpected_error, not abandoned", () => {
    const result = buildRunLevelNotificationCategoryInput("total_failure");
    expect(result).toEqual({ category: "unexpected_error", isAbandonedRun: false });
  });

  test("skipped_kill_switch → category kill_switch_disabled, not abandoned", () => {
    const result = buildRunLevelNotificationCategoryInput("skipped_kill_switch");
    expect(result).toEqual({ category: "kill_switch_disabled", isAbandonedRun: false });
  });

  test("skipped_lock_held → category lock_held, not abandoned", () => {
    const result = buildRunLevelNotificationCategoryInput("skipped_lock_held");
    expect(result).toEqual({ category: "lock_held", isAbandonedRun: false });
  });

  test("abandoned → category collapses to lock_held, but isAbandonedRun is true — never treated as a plain still-open lock", () => {
    const result = buildRunLevelNotificationCategoryInput("abandoned");
    expect(result.category).toBe("lock_held");
    expect(result.isAbandonedRun).toBe(true);
  });
});

test.describe("buildRunLevelSafeSummary — closed labels and counts only", () => {
  test("uses the closed-vocabulary Polish label and the exact counts given", () => {
    const summary = buildRunLevelSafeSummary({
      eventType: "unexpected_error",
      sourcesFailed: 2,
      sourcesChecked: 3,
    });
    expect(summary).toContain("nieoczekiwany błąd");
    expect(summary).toContain("2/3");
  });

  test("never contains a secret, URL, or stack trace fragment", () => {
    const summary = buildRunLevelSafeSummary({
      eventType: "abandoned_run",
      sourcesFailed: 1,
      sourcesChecked: 1,
    });
    expect(summary).not.toMatch(/re_[a-zA-Z0-9]/);
    expect(summary).not.toMatch(/https?:\/\//);
    expect(summary).not.toContain("node_modules");
    expect(summary).not.toContain("at Object");
  });

  test("is capped at SAFE_SUMMARY_MAX_LENGTH", () => {
    const summary = buildRunLevelSafeSummary({
      eventType: "unexpected_error",
      sourcesFailed: 999999,
      sourcesChecked: 999999,
    });
    expect(summary.length).toBeLessThanOrEqual(SAFE_SUMMARY_MAX_LENGTH);
  });
});
