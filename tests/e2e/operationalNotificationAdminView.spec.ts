import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { join } from "path";
import {
  formatLatestOperationalNotification,
  OPERATIONAL_NOTIFICATION_NO_DATA_LABEL,
} from "@/lib/operationalNotificationAdminView";

/**
 * Sprint 166F-1 — admin-view design tests. This module is a design for a
 * FUTURE panel section — it must never query a live table (it doesn't
 * exist yet) and no component renders it yet. These tests pin both
 * invariants structurally, plus the formatter's own correctness.
 */

test.describe("formatLatestOperationalNotification", () => {
  test("null snapshot (no data yet) → every field is the neutral no-data label, never a guess", () => {
    const formatted = formatLatestOperationalNotification(null);
    for (const value of Object.values(formatted)) {
      expect(value === OPERATIONAL_NOTIFICATION_NO_DATA_LABEL || value === "brak danych").toBeTruthy();
    }
  });

  test("a real snapshot is formatted through closed-vocabulary label maps only", () => {
    const formatted = formatLatestOperationalNotification({
      eventType: "permanent_fetch",
      status: "sent",
      severity: "critical",
      suppressedReason: null,
      cooldownUntil: null,
      attemptCount: 1,
      scheduledWriterRunId: "run-1",
      sourceId: "michalowice-komunikaty",
      adminActionRequired: true,
      safeSummary: "trwały błąd pobierania — źródło: Gmina Michałowice",
    });
    expect(formatted.eventType).toBe("trwały błąd pobierania");
    expect(formatted.status).toBe("wysłano");
    expect(formatted.severity).toBe("krytyczne");
    expect(formatted.suppressedReason).toBe("nie dotyczy");
    expect(formatted.adminActionRequired).toBe("tak");
  });

  test("a suppressed snapshot renders its suppressedReason through the closed label map", () => {
    const formatted = formatLatestOperationalNotification({
      eventType: "transient_fetch",
      status: "suppressed",
      severity: "warning",
      suppressedReason: "suppress_cooldown",
      cooldownUntil: "2026-01-01T00:00:00.000Z",
      attemptCount: 1,
      scheduledWriterRunId: null,
      sourceId: "wkd-aktualnosci",
      adminActionRequired: false,
      safeSummary: null,
    });
    expect(formatted.suppressedReason).toBe("w okresie wyciszenia (cooldown)");
    expect(formatted.safeSummary).toBe("brak podsumowania");
  });
});

test.describe("structural guarantees — design only, not wired into any live query or component", () => {
  test("the admin-view module never imports a Supabase client or performs a query", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/operationalNotificationAdminView.ts"),
      "utf-8"
    );
    expect(source).not.toMatch(/@supabase\/supabase-js/);
    expect(source).not.toMatch(/\.from\(["']operational_notification_events["']\)/);
    expect(source).not.toContain("createClient(");
  });

  test("no component renders operational_notification_events data this sprint", () => {
    const panelSource = readFileSync(
      join(process.cwd(), "src/components/AutomationStatusPanel.tsx"),
      "utf-8"
    );
    expect(panelSource).not.toMatch(/operational_notification_events/);
    expect(panelSource).not.toMatch(/operationalNotificationAdminView/);
  });
});
