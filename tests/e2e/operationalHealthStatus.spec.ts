import { test, expect } from "@playwright/test";
import { buildOperationalHealthSummary } from "@/lib/operationalHealthStatus";
import { buildAutomationStatus, type AutomationStatusSnapshot } from "@/lib/automationStatus";
import { classifyAutomationEvent } from "@/lib/automationErrorClassifier";

/**
 * Sprint 166D-1 — simplified operational status formatter tests. Uses
 * buildAutomationStatus() (already tested in automationStatus.spec.ts) to
 * build realistic snapshot inputs rather than hand-rolling the shape.
 */

function statusWith(overrides: Partial<Parameters<typeof buildAutomationStatus>[0]>): AutomationStatusSnapshot {
  return buildAutomationStatus({
    checksEnabled: true,
    writesEnabled: true,
    cronSecretConfigured: true,
    writerCredentialsConfigured: true,
    allowedWriteSourceIds: ["michalowice-komunikaty"],
    maxCandidatesPerRun: 1,
    fingerprintProtectionEnabled: true,
    ...overrides,
  });
}

test.describe("buildOperationalHealthSummary", () => {
  test("kill switch off → overall severity is info regardless of source events", () => {
    const automationStatus = statusWith({ writesEnabled: false });
    const criticalEvent = classifyAutomationEvent({
      category: "permanent_fetch",
      attemptsMade: 1,
      consecutiveFailures: 5,
      notificationStatus: "disabled",
    });
    const summary = buildOperationalHealthSummary({
      automationStatus,
      sourceEvents: [{ sourceKey: "wkd-aktualnosci", sourceName: "WKD", event: criticalEvent }],
    });
    expect(summary.automationActive).toBe(false);
    expect(summary.overallSeverity).toBe("info");
  });

  test("no known events (event: null) → each source reported as unknown, overall info", () => {
    const automationStatus = statusWith({});
    const summary = buildOperationalHealthSummary({
      automationStatus,
      sourceEvents: [
        { sourceKey: "wkd-aktualnosci", sourceName: "WKD", event: null },
        { sourceKey: "michalowice-komunikaty", sourceName: "Michałowice", event: null },
      ],
    });
    expect(summary.sources).toHaveLength(2);
    expect(summary.sources.every((s) => s.known === false)).toBe(true);
    expect(summary.overallSeverity).toBe("info");
  });

  test("automation active + one critical source event → overall severity is critical", () => {
    const automationStatus = statusWith({});
    const criticalEvent = classifyAutomationEvent({
      category: "write_error",
      attemptsMade: 1,
      consecutiveFailures: 0,
      notificationStatus: "disabled",
    });
    const summary = buildOperationalHealthSummary({
      automationStatus,
      sourceEvents: [{ sourceKey: "wkd-aktualnosci", sourceName: "WKD", event: criticalEvent }],
    });
    expect(summary.overallSeverity).toBe("critical");
    expect(summary.sources[0].adminActionRequired).toBe(true);
  });

  test("automation active + one warning-only source event → overall severity is warning, not critical", () => {
    const automationStatus = statusWith({});
    const warningEvent = classifyAutomationEvent({
      category: "transient_fetch",
      attemptsMade: 1,
      consecutiveFailures: 0,
      notificationStatus: "disabled",
    });
    const summary = buildOperationalHealthSummary({
      automationStatus,
      sourceEvents: [{ sourceKey: "wkd-aktualnosci", sourceName: "WKD", event: warningEvent }],
    });
    expect(summary.overallSeverity).toBe("warning");
  });

  test("overall severity is the maximum across multiple sources, not the last one evaluated", () => {
    const automationStatus = statusWith({});
    const warningEvent = classifyAutomationEvent({
      category: "transient_fetch",
      attemptsMade: 1,
      consecutiveFailures: 0,
      notificationStatus: "disabled",
    });
    const infoEvent = classifyAutomationEvent({
      category: "none",
      attemptsMade: 0,
      consecutiveFailures: 0,
      notificationStatus: "disabled",
    });
    const summary = buildOperationalHealthSummary({
      automationStatus,
      sourceEvents: [
        { sourceKey: "a", sourceName: "A", event: infoEvent },
        { sourceKey: "b", sourceName: "B", event: warningEvent },
      ],
    });
    expect(summary.overallSeverity).toBe("warning");
  });
});
