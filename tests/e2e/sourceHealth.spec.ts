import { test, expect } from "@playwright/test";
import { OFFICIAL_SOURCE_CHECKS } from "@/lib/officialSourceChecklist";
import {
  buildSourceHealthRows,
  summarizeSourceHealth,
  HEALTH_STALE_DAYS,
  RECENT_CANDIDATE_DAYS,
  HEALTH_STATUS_LABELS,
  HEALTH_BADGE_MANUAL,
  HEALTH_BADGE_NO_CRON,
  HEALTH_DASHBOARD_DISCLAIMER,
  HEALTH_API_SUPPORT_NOTE,
  HEALTH_ERROR_FALLBACK_NOTE,
  HEALTH_API_SUPPORTED_LABEL,
  HEALTH_MANUAL_ONLY_LABEL,
} from "@/lib/sourceHealth";

/**
 * Sprint 137 — unit-style tests for the Source Health Dashboard's
 * deterministic layer (src/lib/sourceHealth.ts). Everything runs on plain
 * mocked arrays with an injected clock — no browser page, no dev server,
 * no Supabase, NO live external website.
 */

// Fixed clock so "recent" vs "stale" is deterministic forever.
const NOW = new Date("2026-07-08T12:00:00Z");

// Real checklist entries the rows are keyed on — pulled from the canonical
// config so URLs can never drift between test and app.
const MICHALOWICE = OFFICIAL_SOURCE_CHECKS.find((s) => s.id === "michalowice-komunikaty")!;
const WKD = OFFICIAL_SOURCE_CHECKS.find((s) => s.id === "wkd-aktualnosci")!;

// Registry rows deliberately use www./trailing-slash variants of the
// official URLs to exercise the normalized matching.
const REGISTRY = [
  { id: "reg-mich", url: "https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty/" },
  { id: "reg-wkd", url: "https://www.wkd.com.pl/aktualnosci" },
];

function rowsFor(args: Partial<Parameters<typeof buildSourceHealthRows>[0]> = {}) {
  return buildSourceHealthRows({
    registrySources: REGISTRY,
    checks: [],
    candidates: [],
    now: NOW,
    ...args,
  });
}

function findRow(rows: ReturnType<typeof buildSourceHealthRows>, checklistId: string) {
  const row = rows.find((r) => r.checklistId === checklistId);
  expect(row).toBeDefined();
  return row!;
}

test.describe("buildSourceHealthRows — coverage and API-support flags", () => {
  test("one health row per checklist source, in checklist order", () => {
    const rows = rowsFor();
    expect(rows.length).toBe(OFFICIAL_SOURCE_CHECKS.length);
    expect(rows.map((r) => r.checklistId)).toEqual(OFFICIAL_SOURCE_CHECKS.map((s) => s.id));
  });

  test("exactly two sources are API-supported after Sprint 139: WKD + Michałowice", () => {
    const rows = rowsFor();
    const supported = rows.filter((r) => r.apiSupported).map((r) => r.checklistId);
    // Checklist order: WKD is listed first in officialSourceChecklist.ts.
    expect(supported).toEqual(["wkd-aktualnosci", "michalowice-komunikaty"]);
  });

  test("registry matching ignores www. and trailing slash", () => {
    const rows = rowsFor();
    expect(findRow(rows, "michalowice-komunikaty").registrySourceId).toBe("reg-mich");
    expect(findRow(rows, "wkd-aktualnosci").registrySourceId).toBe("reg-wkd");
  });

  test("checklist source without a registry row → unregistered, honest fallback", () => {
    const rows = rowsFor({ registrySources: [] });
    for (const row of rows) {
      expect(row.status).toBe("unregistered");
      expect(row.registrySourceId).toBeNull();
      expect(row.lastCheckAt).toBeNull();
      expect(row.lastCheckResult).toBeNull();
      expect(row.recentCandidateCount).toBe(0);
    }
  });

  // Sprint 165C-1 regression — this is the exact crash reproduced on
  // /admin/sources in the isolated Preview deployment: alert_sources.url is
  // nullable (a source can be registered before its official URL is known;
  // the Preview synthetic seed deliberately includes such a row), and this
  // function's registry matching must handle that without throwing and
  // without ever treating the null-url row as a match.
  test("a registry row with url: null does not throw and is never falsely matched", () => {
    const registryWithNullUrl = [...REGISTRY, { id: "reg-no-url", url: null }];
    expect(() => rowsFor({ registrySources: registryWithNullUrl })).not.toThrow();

    const rows = rowsFor({ registrySources: registryWithNullUrl });
    expect(findRow(rows, "michalowice-komunikaty").registrySourceId).toBe("reg-mich");
    expect(findRow(rows, "wkd-aktualnosci").registrySourceId).toBe("reg-wkd");
    expect(rows.every((r) => r.registrySourceId !== "reg-no-url")).toBe(true);
  });
});

test.describe("buildSourceHealthRows — last check and staleness", () => {
  test("picks the latest check regardless of input order and propagates its result", () => {
    const rows = rowsFor({
      checks: [
        { sourceId: "reg-mich", checkedAt: "2026-07-06T09:00:00Z", result: "no_changes" },
        { sourceId: "reg-mich", checkedAt: "2026-07-01T09:00:00Z", result: "found_notice" },
      ],
    });
    const row = findRow(rows, "michalowice-komunikaty");
    expect(row.lastCheckAt).toBe("2026-07-06T09:00:00Z");
    expect(row.lastCheckResult).toBe("no_changes");
    expect(row.status).toBe("checked_recently");
  });

  test(`check older than ${HEALTH_STALE_DAYS} days → stale`, () => {
    const rows = rowsFor({
      checks: [{ sourceId: "reg-mich", checkedAt: "2026-06-20T09:00:00Z", result: "no_changes" }],
    });
    expect(findRow(rows, "michalowice-komunikaty").status).toBe("stale");
  });

  test("registered but zero history → never_checked", () => {
    const row = findRow(rowsFor(), "wkd-aktualnosci");
    expect(row.status).toBe("never_checked");
    expect(row.lastCheckAt).toBeNull();
  });

  test("falls back to registry lastCheckedAt when no history row is loaded (result stays null)", () => {
    const rows = rowsFor({
      registrySources: [{ ...REGISTRY[0], lastCheckedAt: "2026-07-07T10:00:00Z" }],
    });
    const row = findRow(rows, "michalowice-komunikaty");
    expect(row.lastCheckAt).toBe("2026-07-07T10:00:00Z");
    expect(row.lastCheckResult).toBeNull();
    expect(row.status).toBe("checked_recently");
  });
});

test.describe("buildSourceHealthRows — recent candidate counts", () => {
  test(`counts candidates within ${RECENT_CANDIDATE_DAYS} days, attributed via registry source id`, () => {
    const rows = rowsFor({
      candidates: [
        { sourceId: "reg-mich", detectedAt: "2026-07-01T08:00:00Z" }, // 7 days — counted
        { sourceId: "reg-mich", detectedAt: "2026-07-07T08:00:00Z" }, // 1 day — counted
        { sourceId: "reg-mich", detectedAt: "2026-06-01T08:00:00Z" }, // 37 days — too old
        { sourceId: null, detectedAt: "2026-07-07T08:00:00Z" }, // unattributed — skipped, not guessed
        { sourceId: "reg-unknown", detectedAt: "2026-07-07T08:00:00Z" }, // no checklist match
      ],
    });
    expect(findRow(rows, "michalowice-komunikaty").recentCandidateCount).toBe(2);
    expect(findRow(rows, "wkd-aktualnosci").recentCandidateCount).toBe(0);
  });
});

test.describe("summarizeSourceHealth", () => {
  test("totals add up: recent + needs-attention = total, API-supported counted once", () => {
    const rows = rowsFor({
      checks: [{ sourceId: "reg-mich", checkedAt: "2026-07-07T09:00:00Z", result: "no_changes" }],
    });
    const summary = summarizeSourceHealth(rows);
    expect(summary.total).toBe(OFFICIAL_SOURCE_CHECKS.length);
    expect(summary.apiSupported).toBe(2);
    expect(summary.checkedRecently).toBe(1); // only reg-mich has a fresh check
    expect(summary.needsAttention).toBe(summary.total - summary.checkedRecently);
  });
});

test.describe("dashboard copy (anti-drift — Sprint 137 req. 5/6/7)", () => {
  test("required honest phrases are present verbatim", () => {
    expect(HEALTH_BADGE_MANUAL).toBe("ręczne sprawdzanie");
    expect(HEALTH_BADGE_NO_CRON).toContain("cron jeszcze nieaktywny");
    expect(HEALTH_DASHBOARD_DISCLAIMER).toContain("publikacja nadal wymaga człowieka");
  });

  test("does not pretend to be an official WKD/PGE/gmina app", () => {
    expect(HEALTH_DASHBOARD_DISCLAIMER).toContain("nie jest oficjalną aplikacją");
  });

  test("non-API sources are labeled honestly as manual-checklist-only", () => {
    expect(HEALTH_MANUAL_ONLY_LABEL).toBe("tylko ręczna checklista");
    expect(HEALTH_API_SUPPORTED_LABEL).toContain("check przez aplikację");
    expect(HEALTH_API_SUPPORT_NOTE).toContain("Gmina Michałowice — komunikaty");
    expect(HEALTH_API_SUPPORT_NOTE).toContain("WKD — aktualności");
    expect(HEALTH_API_SUPPORT_NOTE).toContain("ręcznie");
  });

  test("last-error fallback is documented as a deliberate no-schema-change gap", () => {
    expect(HEALTH_ERROR_FALLBACK_NOTE).toContain("nie są zapisywane");
    expect(HEALTH_ERROR_FALLBACK_NOTE).toContain("schematu");
  });

  test("no copy promises scheduled automation or automatic publication", () => {
    const allCopy = [
      HEALTH_BADGE_MANUAL,
      HEALTH_BADGE_NO_CRON,
      HEALTH_DASHBOARD_DISCLAIMER,
      HEALTH_API_SUPPORT_NOTE,
      HEALTH_ERROR_FALLBACK_NOTE,
      HEALTH_API_SUPPORTED_LABEL,
      HEALTH_MANUAL_ONLY_LABEL,
      ...Object.values(HEALTH_STATUS_LABELS),
    ];
    for (const copy of allCopy) {
      const lower = copy.toLowerCase();
      expect(lower).not.toContain("automatycznie publikuje");
      expect(lower).not.toContain("autopublish");
      expect(lower).not.toContain("sam publikuje");
      expect(lower).not.toContain("sprawdza się samo");
      expect(lower).not.toContain("harmonogram checków"); // no scheduled-checks promise
    }
  });
});
