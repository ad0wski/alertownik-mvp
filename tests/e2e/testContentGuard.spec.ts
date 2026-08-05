import { test, expect } from "@playwright/test";
import { containsBlockedSyntheticContent, isSyntheticAutomationContent } from "@/lib/testContentGuard";

/**
 * Sprint 191 — automation content guard (hard block). Distinct from
 * src/lib/testContentDetection.ts's own warn-only heuristic (see that
 * module's tests, unchanged by this file) — this suite specifically pins
 * that a bare, ordinary occurrence of "test" or "przykład" in a REAL
 * notice is never blocked, while unambiguous synthetic/placeholder markers
 * always are, regardless of case or whitespace.
 */

test.describe("containsBlockedSyntheticContent — blocked cases", () => {
  test("explicit placeholder marker", () => {
    expect(containsBlockedSyntheticContent("To jest placeholder tekstu.")).toBe(true);
  });

  test("lorem ipsum filler text", () => {
    expect(containsBlockedSyntheticContent("Lorem ipsum dolor sit amet, consectetur adipiscing elit.")).toBe(true);
  });

  test("explicit project convention: 'komunikat testowy'", () => {
    expect(containsBlockedSyntheticContent("UWAGA: to jest komunikat testowy, proszę zignorować.")).toBe(true);
  });

  test("'do not publish' (English)", () => {
    expect(containsBlockedSyntheticContent("DO NOT PUBLISH — this is only a draft fixture.")).toBe(true);
  });

  test("Polish equivalent: 'nie publikować'", () => {
    expect(containsBlockedSyntheticContent("Nie publikować — treść wyłącznie do testów wewnętrznych.")).toBe(true);
  });

  test("case-insensitive: all caps still matches", () => {
    expect(containsBlockedSyntheticContent("LOREM IPSUM DOLOR SIT AMET")).toBe(true);
  });

  test("whitespace variants still match after normalization", () => {
    expect(containsBlockedSyntheticContent("komunikat    testowy   ")).toBe(true);
    expect(containsBlockedSyntheticContent("\n\tKOMUNIKAT TESTOWY\n")).toBe(true);
  });

  test("dummy / sample data markers", () => {
    expect(containsBlockedSyntheticContent("This is dummy content for a sample data run.")).toBe(true);
  });

  test("Polish 'fikcyjny komunikat'", () => {
    expect(containsBlockedSyntheticContent("To jest fikcyjny komunikat użyty do testów jednostkowych.")).toBe(true);
  });

  test("keyboard-mash dev junk (asdf)", () => {
    expect(containsBlockedSyntheticContent("asdf asdf asdf treść tymczasowa")).toBe(true);
  });
});

test.describe("containsBlockedSyntheticContent — real notices are never blocked", () => {
  test("real notice about a siren test ('test syren alarmowych')", () => {
    expect(
      containsBlockedSyntheticContent(
        "W najbliższą środę o godz. 12:00 na terenie gminy odbędzie się test syren alarmowych."
      )
    ).toBe(false);
  });

  test("real notice about a warning-system test ('test systemu ostrzegania')", () => {
    expect(
      containsBlockedSyntheticContent(
        "Informujemy, że w dniach 10–12 sierpnia przeprowadzony zostanie test systemu ostrzegania ludności."
      )
    ).toBe(false);
  });

  test("real notice that merely uses the ordinary word 'test'", () => {
    expect(
      containsBlockedSyntheticContent(
        "Prawdziwa informacja zawierająca zwykłe słowo „test” w środku zdania, nic więcej."
      )
    ).toBe(false);
  });

  test("ordinary road alert", () => {
    expect(
      containsBlockedSyntheticContent(
        "Od 29 lipca 2026 r. od godz. 9:00 zostanie wprowadzona czasowa organizacja ruchu na drodze wojewódzkiej nr 719."
      )
    ).toBe(false);
  });

  test("ordinary water-outage notice", () => {
    expect(
      containsBlockedSyntheticContent(
        "W dniu jutrzejszym w godzinach 8:00–14:00 nastąpi przerwa w dostawie wody w związku z pracami sieciowymi."
      )
    ).toBe(false);
  });

  test("ordinary sentence using 'na przykład' is never blocked", () => {
    expect(
      containsBlockedSyntheticContent(
        "Zakres prac może się zmienić — na przykład czas trwania utrudnień może zostać wydłużony."
      )
    ).toBe(false);
  });
});

test.describe("isSyntheticAutomationContent — checks both title and text", () => {
  test("blocked when only the title is synthetic", () => {
    expect(
      isSyntheticAutomationContent({
        title: "Przykładowy komunikat testowy",
        text: "Realna, poprawna treść komunikatu bez żadnych markerów.",
      })
    ).toBe(true);
  });

  test("blocked when only the text is synthetic", () => {
    expect(
      isSyntheticAutomationContent({
        title: "Zwykły tytuł alertu",
        text: "Lorem ipsum dolor sit amet.",
      })
    ).toBe(true);
  });

  test("not blocked when neither title nor text is synthetic", () => {
    expect(
      isSyntheticAutomationContent({
        title: "Przerwa w dostawie wody",
        text: "Planowana przerwa w dostawie wody w gminie od jutra w godzinach 8:00–14:00.",
      })
    ).toBe(false);
  });
});
