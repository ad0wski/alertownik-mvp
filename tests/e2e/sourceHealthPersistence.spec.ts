import { test, expect } from "@playwright/test";
import {
  buildSourceHealthRows,
  sanitizeErrorSummary,
  describePersistedFailure,
  type SourceHealthRow,
} from "@/lib/sourceHealth";

/**
 * Sprint 172 (proposed) — tests for the persisted check-failure layer.
 * These exercise code that becomes reachable only once
 * PROPOSED_SPRINT_172_SOURCE_CHECK_FAILURE_PERSISTENCE_V1.sql is applied
 * (source_checks.result accepting "failed", plus error_code/error_summary
 * columns) — but the pure functions themselves are fully testable today
 * against plain mocked objects, no Supabase, no migration required to run
 * this file. Mirrors sourceHealth.spec.ts's existing fixture style.
 */

const NOW = new Date("2026-07-08T12:00:00Z");

const REGISTRY = [{ id: "reg-mich", url: "https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty/" }];

function rowsFor(args: Partial<Parameters<typeof buildSourceHealthRows>[0]> = {}) {
  return buildSourceHealthRows({
    registrySources: REGISTRY,
    checks: [],
    candidates: [],
    now: NOW,
    ...args,
  });
}

function findRow(rows: SourceHealthRow[], checklistId: string): SourceHealthRow {
  const row = rows.find((r) => r.checklistId === checklistId);
  expect(row).toBeDefined();
  return row!;
}

test.describe("buildSourceHealthRows — persisted failure tracking", () => {
  test("first-ever success (no prior history): status healthy, zero consecutive failures", () => {
    const rows = rowsFor({
      checks: [{ sourceId: "reg-mich", checkedAt: "2026-07-08T09:00:00Z", result: "no_changes" }],
    });
    const row = findRow(rows, "michalowice-komunikaty");
    expect(row.status).toBe("checked_recently");
    expect(row.consecutiveFailures).toBe(0);
    expect(row.lastSuccessAt).toBe("2026-07-08T09:00:00Z");
    expect(row.lastErrorCode).toBeNull();
    expect(row.lastErrorSummary).toBeNull();
  });

  test("first-ever failure (no prior history): status failing, exactly 1 consecutive failure, no last success", () => {
    const rows = rowsFor({
      checks: [
        {
          sourceId: "reg-mich",
          checkedAt: "2026-07-08T09:00:00Z",
          result: "failed",
          errorCode: "timeout_10s",
          errorSummary: "Źródło nie odpowiada (timeout 10 s). Spróbuj później albo sprawdź stronę ręcznie.",
        },
      ],
    });
    const row = findRow(rows, "michalowice-komunikaty");
    expect(row.status).toBe("failing");
    expect(row.consecutiveFailures).toBe(1);
    expect(row.lastSuccessAt).toBeNull();
    expect(row.lastErrorCode).toBe("timeout_10s");
    expect(row.lastErrorSummary).toContain("timeout 10 s");
  });

  test("several consecutive failures: count matches exactly, latest error wins", () => {
    const rows = rowsFor({
      checks: [
        { sourceId: "reg-mich", checkedAt: "2026-07-08T09:00:00Z", result: "failed", errorCode: "http_5xx", errorSummary: "Newest failure." },
        { sourceId: "reg-mich", checkedAt: "2026-07-07T09:00:00Z", result: "failed", errorCode: "http_4xx", errorSummary: "Middle failure." },
        { sourceId: "reg-mich", checkedAt: "2026-07-06T09:00:00Z", result: "failed", errorCode: "network_error", errorSummary: "Oldest failure." },
      ],
    });
    const row = findRow(rows, "michalowice-komunikaty");
    expect(row.status).toBe("failing");
    expect(row.consecutiveFailures).toBe(3);
    expect(row.lastErrorSummary).toBe("Newest failure.");
    expect(row.lastSuccessAt).toBeNull();
  });

  test("success after prior failures: streak resets to 0, status returns to healthy", () => {
    const rows = rowsFor({
      checks: [
        { sourceId: "reg-mich", checkedAt: "2026-07-08T09:00:00Z", result: "no_changes" },
        { sourceId: "reg-mich", checkedAt: "2026-07-07T09:00:00Z", result: "failed", errorCode: "http_5xx", errorSummary: "Old failure." },
        { sourceId: "reg-mich", checkedAt: "2026-07-06T09:00:00Z", result: "failed", errorCode: "http_5xx", errorSummary: "Older failure." },
      ],
    });
    const row = findRow(rows, "michalowice-komunikaty");
    expect(row.status).toBe("checked_recently");
    expect(row.consecutiveFailures).toBe(0);
    expect(row.lastSuccessAt).toBe("2026-07-08T09:00:00Z");
    expect(row.lastErrorCode).toBeNull();
    expect(row.lastErrorSummary).toBeNull();
  });

  test("a failure right after a success starts a fresh streak of 1, not accumulating an older run", () => {
    const rows = rowsFor({
      checks: [
        { sourceId: "reg-mich", checkedAt: "2026-07-08T09:00:00Z", result: "failed", errorCode: "http_5xx", errorSummary: "Newest failure." },
        { sourceId: "reg-mich", checkedAt: "2026-07-07T09:00:00Z", result: "no_changes" },
        { sourceId: "reg-mich", checkedAt: "2026-07-06T09:00:00Z", result: "failed", errorCode: "http_5xx", errorSummary: "Old, unrelated failure." },
      ],
    });
    const row = findRow(rows, "michalowice-komunikaty");
    expect(row.consecutiveFailures).toBe(1);
    expect(row.lastSuccessAt).toBe("2026-07-07T09:00:00Z");
  });

  test("no check history at all: never_checked, fail-closed — never healthy, never failing", () => {
    const row = findRow(rowsFor(), "michalowice-komunikaty");
    expect(row.status).toBe("never_checked");
    expect(row.consecutiveFailures).toBe(0);
    expect(row.lastSuccessAt).toBeNull();
    expect(row.lastErrorCode).toBeNull();
    expect(row.lastErrorSummary).toBeNull();
  });

  test("no registry match at all: unregistered, fail-closed", () => {
    const rows = buildSourceHealthRows({ registrySources: [], checks: [], candidates: [], now: NOW });
    const row = findRow(rows, "michalowice-komunikaty");
    expect(row.status).toBe("unregistered");
    expect(row.consecutiveFailures).toBe(0);
    expect(row.lastSuccessAt).toBeNull();
  });

  test("pre-migration rows (no errorCode/errorSummary fields at all, only original result values) never crash and never show as failing", () => {
    // Simulates every row that exists today, before the migration: plain
    // objects with no errorCode/errorSummary keys whatsoever, and result
    // values drawn only from the original four (never "failed", since
    // that value cannot exist in the database yet).
    const rows = rowsFor({
      checks: [
        { sourceId: "reg-mich", checkedAt: "2026-07-08T09:00:00Z", result: "found_notice" },
        { sourceId: "reg-mich", checkedAt: "2026-07-01T09:00:00Z", result: "no_changes" },
      ],
    });
    const row = findRow(rows, "michalowice-komunikaty");
    expect(row.status).toBe("checked_recently");
    expect(row.consecutiveFailures).toBe(0);
    expect(row.lastErrorCode).toBeNull();
    expect(row.lastErrorSummary).toBeNull();
  });

  test("does not affect recentCandidateCount — candidate attribution is independent of check results", () => {
    const rows = rowsFor({
      checks: [
        { sourceId: "reg-mich", checkedAt: "2026-07-08T09:00:00Z", result: "failed", errorCode: "http_5xx", errorSummary: "Failure." },
      ],
      candidates: [{ sourceId: "reg-mich", detectedAt: "2026-07-07T08:00:00Z" }],
    });
    const row = findRow(rows, "michalowice-komunikaty");
    expect(row.recentCandidateCount).toBe(1);
    expect(row.status).toBe("failing");
  });
});

test.describe("sanitizeErrorSummary — message safety net", () => {
  test("trims whitespace and caps at 200 characters", () => {
    const long = "x".repeat(500);
    const result = sanitizeErrorSummary(`  ${long}  `);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(200);
  });

  test("undefined input → null, never an empty string", () => {
    expect(sanitizeErrorSummary(undefined)).toBeNull();
  });

  test("whitespace-only input → null", () => {
    expect(sanitizeErrorSummary("   \n\t  ")).toBeNull();
  });

  test("a normal curated message passes through unchanged", () => {
    const message = "Źródło zwróciło nieoczekiwany format danych. Sprawdź stronę ręcznie w przeglądarce.";
    expect(sanitizeErrorSummary(message)).toBe(message);
  });
});

test.describe("describePersistedFailure — panel display, fail-closed", () => {
  function baseRow(overrides: Partial<SourceHealthRow> = {}): SourceHealthRow {
    return {
      checklistId: "test-source",
      name: "Test Source",
      category: "municipal",
      officialUrl: "https://example.test/",
      apiSupported: true,
      registrySourceId: "reg-test",
      status: "checked_recently",
      lastCheckAt: "2026-07-08T09:00:00Z",
      lastCheckResult: "no_changes",
      lastSuccessAt: "2026-07-08T09:00:00Z",
      consecutiveFailures: 0,
      lastErrorCode: null,
      lastErrorSummary: null,
      recentCandidateCount: 0,
      ...overrides,
    };
  }

  test("a healthy row returns null — no false failure claim", () => {
    expect(describePersistedFailure(baseRow())).toBeNull();
  });

  test("a stale row (not failing) returns null too — only status: failing produces output", () => {
    expect(describePersistedFailure(baseRow({ status: "stale" }))).toBeNull();
  });

  test("a single failure mentions the summary, no streak suffix", () => {
    const text = describePersistedFailure(
      baseRow({
        status: "failing",
        consecutiveFailures: 1,
        lastErrorSummary: "Nie udało się pobrać strony źródła.",
        lastSuccessAt: null,
      })
    );
    expect(text).toContain("Nie udało się pobrać strony źródła.");
    expect(text).not.toContain("razy z rzędu");
  });

  test("a streak of failures mentions the count", () => {
    const text = describePersistedFailure(
      baseRow({ status: "failing", consecutiveFailures: 4, lastErrorSummary: "HTTP 503." })
    );
    expect(text).toContain("4 razy z rzędu");
  });

  test("mentions the last success time when one exists in history", () => {
    const text = describePersistedFailure(
      baseRow({
        status: "failing",
        consecutiveFailures: 1,
        lastErrorSummary: "HTTP 500.",
        lastSuccessAt: "2026-07-01T10:00:00Z",
      })
    );
    expect(text).toContain("Ostatni sukces");
  });

  test("never leaks anything resembling a stack trace or secret through the summary field", () => {
    const curated = "Źródło zwróciło typ application/json zamiast HTML. Sprawdź stronę ręcznie w przeglądarce.";
    const text = describePersistedFailure(
      baseRow({ status: "failing", consecutiveFailures: 1, lastErrorSummary: curated })
    )!;
    expect(text).toContain(curated);
    expect(text).not.toMatch(/at \w+\.\w+ \(|node_modules|\.ts:\d+:\d+|Bearer |sk-|eyJ/);
  });
});
