import { test, expect } from "@playwright/test";
import {
  WASTE_TYPES,
  WASTE_TYPE_LABELS,
  placeLabel,
  groupByDate,
  nextCollectionGroup,
  validateWasteScheduleInput,
  isPastDate,
  findDuplicateWasteItem,
  matchesLocationKeywords,
} from "@/lib/wasteSchedule";
import type { WasteScheduleItem, WasteScheduleItemInput } from "@/types/wasteSchedule";

/**
 * Unit-style tests for the Sprint 82/83 waste-schedule helpers. Pure
 * functions, no Supabase/browser dependency — no live external site, no
 * live Supabase project required.
 */

function makeItem(overrides: Partial<WasteScheduleItem> = {}): WasteScheduleItem {
  return {
    id: "1",
    locality: "Komorów",
    wasteType: "mixed",
    collectionDate: "2026-07-03",
    createdAt: "2026-06-21T00:00:00Z",
    updatedAt: "2026-06-21T00:00:00Z",
    ...overrides,
  };
}

function makeInput(overrides: Partial<WasteScheduleItemInput> = {}): WasteScheduleItemInput {
  return {
    locality: "Komorów",
    wasteType: "mixed",
    collectionDate: "2026-07-03",
    ...overrides,
  };
}

test.describe("WASTE_TYPE_LABELS", () => {
  test("has a Polish label for every WasteType value", () => {
    for (const t of WASTE_TYPES) {
      expect(WASTE_TYPE_LABELS[t]).toBeTruthy();
    }
  });
});

test.describe("placeLabel", () => {
  test("prefers areaName + streetGroup over locality", () => {
    const item = makeItem({ areaName: "Strefa A", streetGroup: "ul. Główna" });
    expect(placeLabel(item)).toBe("Strefa A — ul. Główna");
  });

  test("falls back to locality when areaName/streetGroup are missing", () => {
    expect(placeLabel(makeItem())).toBe("Komorów");
  });
});

test.describe("groupByDate", () => {
  test("groups consecutive items sharing the same date", () => {
    const items = [
      makeItem({ id: "1", collectionDate: "2026-07-03", wasteType: "mixed" }),
      makeItem({ id: "2", collectionDate: "2026-07-03", wasteType: "bio" }),
      makeItem({ id: "3", collectionDate: "2026-07-10", wasteType: "paper" }),
    ];
    const groups = groupByDate(items);
    expect(groups).toHaveLength(2);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].items).toHaveLength(1);
  });
});

test.describe("nextCollectionGroup", () => {
  test("returns all items matching the first (soonest) date", () => {
    const items = [
      makeItem({ id: "1", collectionDate: "2026-07-03", wasteType: "mixed" }),
      makeItem({ id: "2", collectionDate: "2026-07-03", wasteType: "bio" }),
      makeItem({ id: "3", collectionDate: "2026-07-10", wasteType: "paper" }),
    ];
    const group = nextCollectionGroup(items);
    expect(group).toHaveLength(2);
    expect(group.every((i) => i.collectionDate === "2026-07-03")).toBe(true);
  });

  test("returns an empty array for an empty input", () => {
    expect(nextCollectionGroup([])).toEqual([]);
  });
});

test.describe("validateWasteScheduleInput", () => {
  test("accepts a fully valid input", () => {
    expect(validateWasteScheduleInput(makeInput())).toEqual([]);
  });

  test("requires locality", () => {
    const errors = validateWasteScheduleInput(makeInput({ locality: "  " }));
    expect(errors.some((e) => e.includes("Lokalizacja"))).toBe(true);
  });

  test("rejects an unsupported waste type", () => {
    // @ts-expect-error -- deliberately invalid value, simulating bad JSON import input
    const errors = validateWasteScheduleInput(makeInput({ wasteType: "toxic" }));
    expect(errors.some((e) => e.includes("rodzaj odpadów"))).toBe(true);
  });

  test("rejects a missing or malformed collection date", () => {
    expect(
      validateWasteScheduleInput(makeInput({ collectionDate: "" })).length
    ).toBeGreaterThan(0);
    expect(
      validateWasteScheduleInput(makeInput({ collectionDate: "3 lipca 2026" })).length
    ).toBeGreaterThan(0);
  });
});

test.describe("isPastDate", () => {
  test("treats a date far in the past as past", () => {
    expect(isPastDate("2000-01-01")).toBe(true);
  });

  test("treats a date far in the future as not past", () => {
    expect(isPastDate("2099-01-01")).toBe(false);
  });
});

test.describe("matchesLocationKeywords", () => {
  test("matches when locality contains a saved keyword", () => {
    const item = makeItem({ locality: "Komorów" });
    expect(matchesLocationKeywords(item, "Komorów, Pruszków")).toBe(true);
  });

  test("matches case-insensitively against areaName/streetGroup", () => {
    const item = makeItem({ locality: "Komorów", streetGroup: "ul. Główna – ul. Sportowa" });
    expect(matchesLocationKeywords(item, "główna")).toBe(true);
  });

  test("returns false when no keyword matches any field", () => {
    const item = makeItem({ locality: "Komorów" });
    expect(matchesLocationKeywords(item, "Pruszków")).toBe(false);
  });

  test("empty keywords match everything (no filter applied)", () => {
    const item = makeItem({ locality: "Komorów" });
    expect(matchesLocationKeywords(item, "")).toBe(true);
    expect(matchesLocationKeywords(item, "   ")).toBe(true);
  });
});

test.describe("findDuplicateWasteItem", () => {
  test("finds an exact locality + waste type + date match, case-insensitively", () => {
    const existing = [makeItem({ locality: "  KOMORÓW  " })];
    const dup = findDuplicateWasteItem(makeInput({ locality: "komorów" }), existing);
    expect(dup).not.toBeNull();
  });

  test("returns null when waste type differs", () => {
    const existing = [makeItem({ wasteType: "bio" })];
    const dup = findDuplicateWasteItem(makeInput({ wasteType: "mixed" }), existing);
    expect(dup).toBeNull();
  });

  test("returns null when date differs", () => {
    const existing = [makeItem({ collectionDate: "2026-08-01" })];
    const dup = findDuplicateWasteItem(makeInput({ collectionDate: "2026-07-03" }), existing);
    expect(dup).toBeNull();
  });
});
