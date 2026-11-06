import { test, expect } from "@playwright/test";
import { getPrePublishWarnings } from "@/lib/alertQuality";
import { OPEN_ENDED_ALERT_FRESHNESS_DAYS } from "@/lib/getAlertTimeStatus";

/**
 * Unit-style tests for the Sprint 91 pre-publish quality checklist.
 * Extracted from builder/page.tsx (auth-gated, no e2e coverage) so this
 * logic itself stays directly testable — same reasoning already applied
 * to testContentDetection.ts in Sprint 90.
 */

function makeAlert(overrides: Partial<Parameters<typeof getPrePublishWarnings>[0]> = {}) {
  return {
    title: "Brak wody w Granicy",
    place: "Granica, ul. Sportowa",
    change: "Planowana przerwa w dostawie wody z powodu prac konserwacyjnych.",
    action: "Zaopatrz się w wodę z wyprzedzeniem, jeśli to możliwe.",
    sourceName: "Gmina Michałowice",
    sourceUrl: "https://www.michalowice.pl/przyklad",
    startsAt: "2026-06-24",
    endsAt: "2026-06-26",
    ...overrides,
  };
}

test.describe("getPrePublishWarnings", () => {
  test("returns no warnings for a fully filled, genuine-looking alert", () => {
    expect(getPrePublishWarnings(makeAlert())).toEqual([]);
  });

  test("flags missing place, change, action, sourceName, sourceUrl independently", () => {
    const warnings = getPrePublishWarnings(
      makeAlert({ place: "", change: "", action: "", sourceName: "", sourceUrl: "" })
    );
    expect(warnings).toContain("Brak lokalizacji.");
    expect(warnings).toContain("Brak opisu „Co się zmienia”.");
    expect(warnings).toContain("Brak opisu „Co zrobić”.");
    expect(warnings).toContain("Brak nazwy źródła.");
    expect(warnings).toContain("Brak linku do źródła.");
  });

  test("flags an inverted date range", () => {
    const warnings = getPrePublishWarnings(makeAlert({ startsAt: "2026-06-26", endsAt: "2026-06-24" }));
    expect(warnings.some((w) => w.includes("wcześniejsza niż data"))).toBe(true);
  });

  test("does not flag a missing endsAt as an inverted range", () => {
    const warnings = getPrePublishWarnings(makeAlert({ endsAt: undefined }));
    expect(warnings.some((w) => w.includes("wcześniejsza niż data"))).toBe(false);
  });

  // P0-1 fix (pre-launch audit, 2026-11-06) — publishing without an end
  // date is still allowed (requirement 2 of the fix brief), but the admin
  // must now be told explicitly what that means, since the real incident
  // this addresses was an open-ended alert nobody noticed had gone stale
  // for months. These pin the new warning to the exact fix in
  // getAlertTimeStatus.ts (OPEN_ENDED_ALERT_FRESHNESS_DAYS), so the two
  // files can never silently drift apart.
  test("flags a missing endsAt with an explicit freshness-window warning", () => {
    const warnings = getPrePublishWarnings(makeAlert({ endsAt: undefined }));
    expect(warnings.some((w) => w.includes("Brak daty zakończenia"))).toBe(true);
    expect(warnings.some((w) => w.includes(String(OPEN_ENDED_ALERT_FRESHNESS_DAYS)))).toBe(true);
  });

  test("flags a blank/whitespace-only endsAt the same way as a fully missing one", () => {
    const warnings = getPrePublishWarnings(makeAlert({ endsAt: "   " }));
    expect(warnings.some((w) => w.includes("Brak daty zakończenia"))).toBe(true);
  });

  test("does not flag a fully filled endsAt — the warning is specific to the open-ended case", () => {
    const warnings = getPrePublishWarnings(makeAlert());
    expect(warnings.some((w) => w.includes("Brak daty zakończenia"))).toBe(false);
  });

  test("flags very short change/action text as possibly not specific enough", () => {
    const warnings = getPrePublishWarnings(makeAlert({ change: "Coś.", action: "OK." }));
    expect(warnings.some((w) => w.includes("„Co się zmienia” jest bardzo krótkie"))).toBe(true);
    expect(warnings.some((w) => w.includes("„Co zrobić” jest bardzo krótkie"))).toBe(true);
  });

  test("flags suspicious test/placeholder wording via the shared word list", () => {
    const warnings = getPrePublishWarnings(makeAlert({ title: "Test alertu" }));
    expect(warnings.some((w) => w.includes("Tytuł") && w.includes("testowe/placeholder"))).toBe(true);
  });
});
