import { test, expect } from "@playwright/test";
import {
  computeSourceCoverage,
  findMissingCategoriesForGmina,
  type CoverageSourceRecord,
} from "@/lib/sourceScale/coverageCalculator";

// Sprint 188A — National Source Scale Plan foundation. Pure unit tests,
// no network, no Supabase — this module never reads live data.

const SOURCES: CoverageSourceRecord[] = [
  {
    id: "s1",
    category: "water",
    lifecycleStatus: "active",
    wojewodztwo: "mazowieckie",
    powiat: "pruszkowski",
    gmina: "Michałowice",
  },
  {
    id: "s2",
    category: "roads",
    lifecycleStatus: "active",
    wojewodztwo: "mazowieckie",
    powiat: "pruszkowski",
    gmina: "Michałowice",
  },
  {
    id: "s3",
    category: "municipal",
    lifecycleStatus: "active",
    wojewodztwo: "mazowieckie",
    powiat: "pruszkowski",
    gmina: "Pruszków",
  },
  {
    id: "s4",
    category: "power",
    lifecycleStatus: "degraded",
    wojewodztwo: "mazowieckie",
    powiat: "pruszkowski",
    gmina: "Pruszków",
  },
  {
    id: "s5",
    category: "waste",
    lifecycleStatus: "discovered",
    wojewodztwo: null,
    powiat: null,
    gmina: null,
  },
];

test.describe("computeSourceCoverage", () => {
  test("counts total sources and lifecycle breakdown", () => {
    const coverage = computeSourceCoverage(SOURCES);
    expect(coverage.totalSources).toBe(5);
    expect(coverage.byLifecycleStatus.active).toBe(3);
    expect(coverage.byLifecycleStatus.degraded).toBe(1);
    expect(coverage.byLifecycleStatus.discovered).toBe(1);
    expect(coverage.byLifecycleStatus.disabled).toBe(0);
  });

  test("only active sources count toward geography coverage", () => {
    const coverage = computeSourceCoverage(SOURCES);
    expect(coverage.activeWojewodztwa).toEqual(["mazowieckie"]);
    expect(coverage.activePowiaty).toEqual(["pruszkowski"]);
    expect(coverage.activeGminy).toEqual(["Michałowice", "Pruszków"]);
  });

  test("degraded source (s4, power) does not count as active coverage for its category", () => {
    const coverage = computeSourceCoverage(SOURCES);
    expect(coverage.activeGminyByCategory.power).toEqual([]);
  });

  test("sources with null geography (discovered, not yet classified) never appear in any bucket", () => {
    const coverage = computeSourceCoverage(SOURCES);
    expect(coverage.activeGminy).not.toContain(null);
    expect(coverage.activeGminy.length).toBe(2);
  });

  test("empty source list yields all-zero coverage without throwing", () => {
    const coverage = computeSourceCoverage([]);
    expect(coverage.totalSources).toBe(0);
    expect(coverage.activeGminy).toEqual([]);
  });
});

test.describe("findMissingCategoriesForGmina", () => {
  test("Michałowice has active water+roads but is missing the other 4 categories", () => {
    const coverage = computeSourceCoverage(SOURCES);
    const missing = findMissingCategoriesForGmina(coverage, "Michałowice");
    expect(missing.sort()).toEqual(["municipal", "power", "transport", "waste"].sort());
  });

  test("a gmina with zero active sources is missing all 6 categories", () => {
    const coverage = computeSourceCoverage(SOURCES);
    const missing = findMissingCategoriesForGmina(coverage, "Nieznana Gmina");
    expect(missing.length).toBe(6);
  });
});
