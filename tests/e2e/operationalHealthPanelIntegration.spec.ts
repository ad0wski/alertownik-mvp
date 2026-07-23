import { test, expect } from "@playwright/test";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import {
  formatOperationalHealthRow,
  OPERATIONAL_HEALTH_NO_DATA_LABEL,
  OPERATIONAL_HEALTH_NOTIFICATIONS_DISABLED_NOTE,
  OPERATIONAL_HEALTH_EMAIL_NOT_CONFIGURED_NOTE,
  type OperationalHealthSourceRow,
} from "@/lib/operationalHealthStatus";
import { classifyAutomationEvent } from "@/lib/automationErrorClassifier";

/**
 * Sprint 166D-2A — integration of the operational-health formatter into
 * AutomationStatusPanel.tsx. Two layers under test, matching this
 * codebase's existing convention (see automationStatus.spec.ts):
 *   1. formatOperationalHealthRow() — pure function, every scenario the
 *      brief asked for, no component rendering harness needed.
 *   2. AutomationStatusPanel.tsx — structural source-text audit, extending
 *      the existing invariants from automationStatus.spec.ts to also cover
 *      this sprint's additions.
 */

function rowFor(
  known: boolean,
  overrides: Partial<OperationalHealthSourceRow> = {}
): OperationalHealthSourceRow {
  return {
    sourceKey: "wkd-aktualnosci",
    sourceName: "WKD — aktualności",
    known,
    severity: "info",
    category: known ? "none" : null,
    adminActionRequired: false,
    retry: null,
    ...overrides,
  };
}

test.describe("formatOperationalHealthRow — scenario coverage", () => {
  test("1. good last run (success, no error) shows honest no-error labels", () => {
    const event = classifyAutomationEvent({
      category: "none",
      attemptsMade: 0,
      consecutiveFailures: 0,
      notificationStatus: "disabled",
    });
    const row = rowFor(true, {
      category: event.category,
      severity: event.severity,
      adminActionRequired: event.adminAction.required,
      retry: event.retry,
    });
    const display = formatOperationalHealthRow(row);
    expect(display.lastRunOutcome).toBe("brak błędu");
    expect(display.errorCategorySeverity).toBe("brak błędu / informacja");
    expect(display.adminActionRequired).toBe("nie");
    expect(display.retryState).toContain("kolejna w tym uruchomieniu: nie");
  });

  test("2. transient failure with an in-progress retry shows retry state honestly", () => {
    const event = classifyAutomationEvent({
      category: "transient_fetch",
      attemptsMade: 1,
      consecutiveFailures: 0,
      notificationStatus: "disabled",
    });
    const row = rowFor(true, {
      category: event.category,
      severity: event.severity,
      adminActionRequired: event.adminAction.required,
      retry: event.retry,
    });
    const display = formatOperationalHealthRow(row);
    expect(display.lastRunOutcome).toBe("chwilowy błąd pobierania");
    expect(display.errorCategorySeverity).toBe("chwilowy błąd pobierania / ostrzeżenie");
    expect(display.retryState).toBe("próba 1 z 2, kolejna w tym uruchomieniu: tak");
    expect(display.adminActionRequired).toBe("nie");
  });

  test("3. permanent failure requires admin action and is reported as critical", () => {
    const event = classifyAutomationEvent({
      category: "permanent_fetch",
      attemptsMade: 1,
      consecutiveFailures: 1,
      notificationStatus: "disabled",
    });
    const row = rowFor(true, {
      category: event.category,
      severity: event.severity,
      adminActionRequired: event.adminAction.required,
      retry: event.retry,
    });
    const display = formatOperationalHealthRow(row);
    expect(display.lastRunOutcome).toBe("trwały błąd pobierania");
    expect(display.errorCategorySeverity).toBe("trwały błąd pobierania / krytyczne");
    expect(display.adminActionRequired).toBe("tak");
    expect(display.retryState).toContain("kolejna w tym uruchomieniu: nie");
  });

  test("4. no run history known (event: null) shows the neutral no-data label everywhere, never a guess", () => {
    const row = rowFor(false);
    const display = formatOperationalHealthRow(row);
    expect(display.lastRunOutcome).toBe(OPERATIONAL_HEALTH_NO_DATA_LABEL);
    expect(display.lastRunTime).toBe(OPERATIONAL_HEALTH_NO_DATA_LABEL);
    expect(display.retryState).toBe(OPERATIONAL_HEALTH_NO_DATA_LABEL);
    expect(display.errorCategorySeverity).toBe(OPERATIONAL_HEALTH_NO_DATA_LABEL);
    expect(display.adminActionRequired).toBe(OPERATIONAL_HEALTH_NO_DATA_LABEL);
  });

  test("lastRunTime is always the neutral no-data label — no code path anywhere supplies a real timestamp yet", () => {
    const event = classifyAutomationEvent({
      category: "write_error",
      attemptsMade: 1,
      consecutiveFailures: 0,
      notificationStatus: "disabled",
    });
    const row = rowFor(true, {
      category: event.category,
      severity: event.severity,
      adminActionRequired: event.adminAction.required,
      retry: event.retry,
    });
    expect(formatOperationalHealthRow(row).lastRunTime).toBe(OPERATIONAL_HEALTH_NO_DATA_LABEL);
  });

  test("6. output never contains a raw/unclosed-vocabulary string — every field is one of the fixed Polish labels or the no-data label", () => {
    const knownCategories: Array<Parameters<typeof classifyAutomationEvent>[0]["category"]> = [
      "none",
      "transient_fetch",
      "permanent_fetch",
      "write_error",
      "lock_held",
      "environment_guard_blocked",
      "credentials_not_configured",
      "kill_switch_disabled",
      "unexpected_error",
    ];
    const allowedOutcomeLabels = new Set([
      "brak błędu",
      "chwilowy błąd pobierania",
      "trwały błąd pobierania",
      "błąd zapisu",
      "poprzednie uruchomienie wciąż trwa",
      "zablokowane przez zabezpieczenie środowiska",
      "brak skonfigurowanych danych logowania",
      "automatyzacja wyłączona",
      "nieoczekiwany błąd",
      OPERATIONAL_HEALTH_NO_DATA_LABEL,
    ]);
    for (const category of knownCategories) {
      const event = classifyAutomationEvent({
        category,
        attemptsMade: 1,
        consecutiveFailures: 0,
        notificationStatus: "disabled",
      });
      const row = rowFor(true, {
        category: event.category,
        severity: event.severity,
        adminActionRequired: event.adminAction.required,
        retry: event.retry,
      });
      const display = formatOperationalHealthRow(row);
      expect(allowedOutcomeLabels.has(display.lastRunOutcome)).toBe(true);
      expect(["tak", "nie"]).toContain(display.adminActionRequired);
      // Never a raw diagnostic/technical string (e.g. "http_5xx", a stack
      // trace fragment, or a URL) leaking through — every field must be
      // short, human Polish text only.
      expect(display.lastRunOutcome).not.toMatch(/https?:\/\//);
      expect(display.errorCategorySeverity).not.toMatch(/https?:\/\//);
    }
  });
});

// ── Panel structural audit — extends the existing invariants from
// automationStatus.spec.ts to also cover this sprint's additions. Updated
// for Sprint 166D-2B: the panel now renders status.runHistory (a real,
// server-computed run-history snapshot) instead of the 166D-2A
// per-source/always-unknown formatter. ──

test.describe("AutomationStatusPanel.tsx — structural audit (Sprint 166D-2B additions)", () => {
  const panelSource = readFileSync(
    join(process.cwd(), "src/components/AutomationStatusPanel.tsx"),
    "utf-8"
  );

  test("still a Client Component; still never imports scheduledWriter.ts, Supabase, or admin credentials", () => {
    expect(panelSource).toMatch(/^\s*["']use client["']/);
    expect(panelSource).not.toMatch(/from ["']@\/lib\/scheduledWriter["']/);
    expect(panelSource).not.toMatch(/from ["']@supabase\/supabase-js["']/);
    expect(panelSource).not.toMatch(/SUPABASE_SCHEDULED_WRITER_(EMAIL|PASSWORD)/);
    expect(panelSource).not.toMatch(/service_role/i);
  });

  test("the only activation control is the Sprint 166E-2A Preview-only, confirm()-gated email test button", () => {
    // Sprint 166E-2A deliberately adds exactly one guarded onClick (a
    // confirm()-gated, Preview-only, flag-gated test-email button) — see
    // tests/e2e/automationStatus.spec.ts's own structural-audit test for
    // the full guard rationale. This test only needs to confirm the
    // Sprint 166D-2B run-history additions themselves added no second one.
    const onClickMatches = panelSource.match(/onClick/g) ?? [];
    expect(onClickMatches.length).toBe(1);
    expect(panelSource).toMatch(/onClick=\{runOperationalEmailTest\}/);
  });

  test("performs a GET fetch to its own status endpoint, plus the one Sprint 166E-2A guarded POST test call — nothing else", () => {
    expect(panelSource).toMatch(/\/api\/admin\/automation-status/);
    expect(panelSource).toMatch(/\/api\/admin\/operational-email-test/);
    expect(panelSource).toMatch(/method:\s*["']POST["']/);
    expect(panelSource).not.toMatch(/method:\s*["']DELETE["']/);
    expect(panelSource).not.toMatch(/method:\s*["']PUT["']/);
    // Exactly two authFetch calls: the original status GET (166D-2B) and
    // the new guarded test POST (166E-2A) — the run-history section itself
    // adds no additional endpoint.
    const fetchCalls = panelSource.match(/authFetch\(/g) ?? [];
    expect(fetchCalls.length).toBe(2);
  });

  test("renders status.runHistory using the shared label maps, never a raw outcome/category/severity string", () => {
    expect(panelSource).toMatch(/status\.runHistory/);
    expect(panelSource).toMatch(/RUN_OUTCOME_LABELS_PL/);
    expect(panelSource).toMatch(/AUTOMATION_ERROR_CATEGORY_LABELS_PL/);
    expect(panelSource).toMatch(/AUTOMATION_SEVERITY_LABELS_PL/);
  });

  test("never reads or renders an errorSummary/error_summary field from status (comments documenting the absence are fine)", () => {
    // Guards actual data access, not prose: this must never appear as a
    // property access like `.error_summary` / `.errorSummary` or a
    // destructured identifier — the explanatory comment above the section
    // legitimately says "error_summary" in English prose to document why
    // it's absent, which is not a leak.
    expect(panelSource).not.toMatch(/\.errorSummary\b/);
    expect(panelSource).not.toMatch(/\.error_summary\b/);
  });

  test("does not render a per-source list for run history (only ScheduledWriterMonitoring/SourceHealthDashboard render per-source rows elsewhere)", () => {
    expect(panelSource).not.toMatch(/runHistory\.sources/);
    expect(panelSource).not.toMatch(/canarySources\.map[\s\S]{0,80}RUN_OUTCOME_LABELS_PL/);
  });

  test("references the notifications-disabled and email-not-configured copy constants (never a hardcoded 'enabled' claim)", () => {
    expect(panelSource).toMatch(/OPERATIONAL_HEALTH_NOTIFICATIONS_DISABLED_NOTE/);
    expect(panelSource).toMatch(/OPERATIONAL_HEALTH_EMAIL_NOT_CONFIGURED_NOTE/);
  });
});

test.describe("OperationalHealthPanel.tsx — removed as dead code (Sprint 166D-2B)", () => {
  test("the standalone component file no longer exists", () => {
    expect(existsSync(join(process.cwd(), "src/components/OperationalHealthPanel.tsx"))).toBe(false);
  });

  test("nothing under src/ imports it (mentions in explanatory comments are fine)", () => {
    // Plain recursive Node fs scan (no shell-out, no new devDependency —
    // avoids relying on a `grep` binary being on PATH cross-platform).
    // Only flags an actual import/require of the component, not a prose
    // mention documenting why it was removed (e.g. operationalHealthStatus.ts's
    // own header comment references it by name for that reason).
    const srcDir = join(process.cwd(), "src");
    const importPattern = /(?:from|require\()\s*["'].*OperationalHealthPanel["']/;
    const matches: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
        } else if (/\.(ts|tsx)$/.test(entry)) {
          if (importPattern.test(readFileSync(full, "utf-8"))) {
            matches.push(full);
          }
        }
      }
    };
    walk(srcDir);
    expect(matches).toEqual([]);
  });
});

test.describe("copy constants — pinned", () => {
  test("notifications-disabled note says notifications are off and nothing was sent", () => {
    expect(OPERATIONAL_HEALTH_NOTIFICATIONS_DISABLED_NOTE).toMatch(/wyłączone/);
    expect(OPERATIONAL_HEALTH_NOTIFICATIONS_DISABLED_NOTE).toMatch(/nic nie jest ani nie było wysyłane/);
  });

  test("email-not-configured note says the provider is not configured", () => {
    expect(OPERATIONAL_HEALTH_EMAIL_NOT_CONFIGURED_NOTE).toMatch(/nieskonfigurowany/);
  });
});
