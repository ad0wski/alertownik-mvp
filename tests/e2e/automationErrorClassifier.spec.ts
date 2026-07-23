import { test, expect } from "@playwright/test";
import {
  categoryFromDiagnostic,
  categoryFromSourceOutcome,
  categoryFromRunOutcome,
  severityForCategory,
  buildRetryState,
  buildAdminActionRequired,
  classifyAutomationEvent,
} from "@/lib/automationErrorClassifier";

/**
 * Sprint 166D-1 — deterministic classifier tests. Pure functions only, no
 * network, no Supabase, no env vars. Mirrors the exact decision table
 * documented in
 * docs/SPRINT_166D_OPERATIONAL_MONITORING_ALERTING_AUDIT_AND_DESIGN_V1.md
 * §C.1-2.
 */

test.describe("categoryFromDiagnostic", () => {
  test("transient diagnostics map to transient_fetch", () => {
    expect(categoryFromDiagnostic("http_5xx")).toBe("transient_fetch");
    expect(categoryFromDiagnostic("network_error")).toBe("transient_fetch");
    expect(categoryFromDiagnostic("timeout_10s")).toBe("transient_fetch");
  });

  test("permanent diagnostics map to permanent_fetch", () => {
    expect(categoryFromDiagnostic("http_4xx")).toBe("permanent_fetch");
    expect(categoryFromDiagnostic("non_html_content_type")).toBe("permanent_fetch");
    expect(categoryFromDiagnostic("parse_exception")).toBe("permanent_fetch");
  });
});

test.describe("categoryFromSourceOutcome", () => {
  test("success and no_proposals map to none", () => {
    expect(categoryFromSourceOutcome("success")).toBe("none");
    expect(categoryFromSourceOutcome("no_proposals")).toBe("none");
  });

  test("write_error always maps to write_error, regardless of diagnostic", () => {
    expect(categoryFromSourceOutcome("write_error")).toBe("write_error");
  });

  test("fetch_error/timeout defer to the diagnostic when provided", () => {
    expect(categoryFromSourceOutcome("fetch_error", "http_4xx")).toBe("permanent_fetch");
    expect(categoryFromSourceOutcome("fetch_error", "http_5xx")).toBe("transient_fetch");
    expect(categoryFromSourceOutcome("timeout", "timeout_10s")).toBe("transient_fetch");
  });

  test("fetch_error/timeout without a diagnostic defaults to transient_fetch (never silently permanent)", () => {
    expect(categoryFromSourceOutcome("fetch_error")).toBe("transient_fetch");
    expect(categoryFromSourceOutcome("timeout")).toBe("transient_fetch");
  });
});

test.describe("categoryFromRunOutcome", () => {
  test("success maps to none", () => {
    expect(categoryFromRunOutcome("success")).toBe("none");
  });

  test("partial_failure and total_failure map to unexpected_error", () => {
    expect(categoryFromRunOutcome("partial_failure")).toBe("unexpected_error");
    expect(categoryFromRunOutcome("total_failure")).toBe("unexpected_error");
  });

  test("skipped_kill_switch maps to kill_switch_disabled", () => {
    expect(categoryFromRunOutcome("skipped_kill_switch")).toBe("kill_switch_disabled");
  });

  test("skipped_lock_held and abandoned map to lock_held", () => {
    expect(categoryFromRunOutcome("skipped_lock_held")).toBe("lock_held");
    expect(categoryFromRunOutcome("abandoned")).toBe("lock_held");
  });
});

test.describe("severityForCategory", () => {
  test("none and kill_switch_disabled are info", () => {
    expect(severityForCategory("none")).toBe("info");
    expect(severityForCategory("kill_switch_disabled")).toBe("info");
  });

  test("transient_fetch is warning", () => {
    expect(severityForCategory("transient_fetch")).toBe("warning");
  });

  test("permanent_fetch, write_error, lock_held, environment_guard_blocked, credentials_not_configured, unexpected_error are all critical", () => {
    expect(severityForCategory("permanent_fetch")).toBe("critical");
    expect(severityForCategory("write_error")).toBe("critical");
    expect(severityForCategory("lock_held")).toBe("critical");
    expect(severityForCategory("environment_guard_blocked")).toBe("critical");
    expect(severityForCategory("credentials_not_configured")).toBe("critical");
    expect(severityForCategory("unexpected_error")).toBe("critical");
  });
});

test.describe("buildRetryState", () => {
  test("transient_fetch after 1 attempt: will retry within run", () => {
    const state = buildRetryState("transient_fetch", 1);
    expect(state.willRetryWithinRun).toBe(true);
    expect(state.attemptsMade).toBe(1);
    expect(state.maxAttemptsPerRun).toBe(2);
    expect(state.nextScheduledRunKnown).toBe(false);
  });

  test("transient_fetch after 2 attempts: no more retries within run (bound reached)", () => {
    const state = buildRetryState("transient_fetch", 2);
    expect(state.willRetryWithinRun).toBe(false);
  });

  test("permanent_fetch never retries, regardless of attempts", () => {
    expect(buildRetryState("permanent_fetch", 1).willRetryWithinRun).toBe(false);
  });

  test("write_error never retries", () => {
    expect(buildRetryState("write_error", 1).willRetryWithinRun).toBe(false);
  });
});

test.describe("buildAdminActionRequired", () => {
  test("permanent_fetch always requires admin action", () => {
    expect(buildAdminActionRequired("permanent_fetch", 0)).toEqual({ required: true, reason: "permanent_failure" });
  });

  test("write_error always requires admin action", () => {
    expect(buildAdminActionRequired("write_error", 0)).toEqual({ required: true, reason: "permanent_failure" });
  });

  test("unexpected_error always requires admin action", () => {
    expect(buildAdminActionRequired("unexpected_error", 0)).toEqual({ required: true, reason: "permanent_failure" });
  });

  test("credentials_not_configured always requires admin action", () => {
    expect(buildAdminActionRequired("credentials_not_configured", 0)).toEqual({
      required: true,
      reason: "credentials_missing",
    });
  });

  test("lock_held below threshold does not require action", () => {
    expect(buildAdminActionRequired("lock_held", 1)).toEqual({ required: false, reason: null });
    expect(buildAdminActionRequired("lock_held", 2)).toEqual({ required: false, reason: null });
  });

  test("lock_held at/above threshold requires action (stuck_lock)", () => {
    expect(buildAdminActionRequired("lock_held", 3)).toEqual({ required: true, reason: "stuck_lock" });
  });

  test("transient_fetch below threshold does not require action", () => {
    expect(buildAdminActionRequired("transient_fetch", 2)).toEqual({ required: false, reason: null });
  });

  test("transient_fetch at threshold requires action via generic consecutive_failures path", () => {
    expect(buildAdminActionRequired("transient_fetch", 3)).toEqual({ required: true, reason: "consecutive_failures" });
  });

  test("none never requires action, even with a high consecutiveFailures count passed by mistake", () => {
    // none should not realistically accumulate consecutive failures, but the
    // function must still degrade safely if a caller ever passes one.
    expect(buildAdminActionRequired("none", 0)).toEqual({ required: false, reason: null });
  });
});

test.describe("classifyAutomationEvent — composition", () => {
  test("combines category/severity/retry/adminAction/notificationStatus into one event", () => {
    const event = classifyAutomationEvent({
      category: "transient_fetch",
      attemptsMade: 1,
      consecutiveFailures: 0,
      notificationStatus: "disabled",
    });
    expect(event.category).toBe("transient_fetch");
    expect(event.severity).toBe("warning");
    expect(event.retry.willRetryWithinRun).toBe(true);
    expect(event.adminAction).toEqual({ required: false, reason: null });
    expect(event.notificationStatus).toBe("disabled");
  });

  test("a permanent failure with high consecutive failures still reports permanent_failure, not consecutive_failures", () => {
    const event = classifyAutomationEvent({
      category: "permanent_fetch",
      attemptsMade: 1,
      consecutiveFailures: 10,
      notificationStatus: "disabled",
    });
    expect(event.adminAction).toEqual({ required: true, reason: "permanent_failure" });
  });
});
