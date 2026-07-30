import { test, expect } from "@playwright/test";
import { parsePageHtml } from "@/lib/sourceParsers/pageParser";
import {
  SAFE_CHECK_SOURCE_IDS,
  getSafeCheckSource,
  buildCheckProposals,
  suggestCheckResult,
  findMatchingRegistrySource,
  MANUAL_CHECK_DISCLAIMER,
  CHECK_BUTTON_LABEL,
  UNSUPPORTED_SOURCE_ERROR,
} from "@/lib/sourceCheck";

/**
 * Sprint 134 (A2) — unit-style tests for the manual Source Check API's
 * deterministic layer (src/lib/sourceCheck.ts). Everything here runs on
 * fixture HTML through the pure parsePageHtml + buildCheckProposals path —
 * no browser page, no dev server, NO live external website. The
 * /api/sources/check route itself is a thin fetch wrapper around these
 * functions (same split as pageParser vs fetch-preview, Sprint 76).
 */

// Fixture modeled on a typical municipal announcements page — content is
// invented for the test only and never leaves the test run.
const FIXTURE_HTML = `
  <html>
    <head><title>Komunikaty — Gmina Testowa</title></head>
    <body>
      <nav>Menu nawigacyjne do odfiltrowania</nav>
      <main>
        <h2>Testowe uruchomienie syren alarmowych 16 lipca 2026</h2>
        <p>W dniu 16 lipca 2026 r. w godzinach 12:00–12:30 na terenie gminy
        zostanie przeprowadzone testowe uruchomienie syren alarmowych.
        Prosimy mieszkańców o zachowanie spokoju.</p>
        <h2>Utrudnienia w ruchu drogowym</h2>
        <p>W związku z pracami remontowymi na ulicy Przykładowej wystąpią
        utrudnienia w ruchu drogowym. Prosimy o korzystanie z objazdów
        wyznaczonych przez wykonawcę robót.</p>
        <h2>Krótki wpis</h2>
        <p>Za krótki fragment.</p>
      </main>
      <footer>Stopka do odfiltrowania</footer>
    </body>
  </html>
`;

test.describe("safe-source allowlist (getSafeCheckSource)", () => {
  test("exactly forty-two safe sources after Etap F Fala 7 — growing the list stays a per-block decision", () => {
    expect(SAFE_CHECK_SOURCE_IDS).toEqual([
      "michalowice-komunikaty",
      "wkd-aktualnosci",
      "wodociagi-michalowice",
      "pruszkow-aktualnosci",
      "powiat-pruszkowski-wiadomosci",
      "eko-raszyn",
      "bpwik-brwinow",
      "pkn-nadarzyn",
      "zwik-ozarow-mazowiecki",
      "pwik-radzymin",
      "pwk-legionowo",
      "opwik-otwock",
      "pwik-zabki",
      "hydrosfera-jozefow",
      "pwik-zielonka",
      "pwik-minsk-mazowiecki",
      "pwik-wyszkow",
      "pwik-pultusk",
      "zwik-nowy-dwor-mazowiecki",
      "zwik-pabianice",
      "wodkan-zgierz",
      "pwik-piotrkow",
      "pgkim-aleksandrow-lodzki",
      "komunalne-wielun",
      "mzwik-glowno",
      "pwik-konin",
      "pwik-wrzesnia",
      "sremskie-wodociagi",
      "mwik-ostrowiec",
      "mpgk-busko-zdroj",
      "wodociagi-pinczowskie",
      "mzk-grudziadz",
      "pewik-gdynia",
      "pwik-kwidzyn",
      "zdiz-gdynia",
      "mzk-koszalin",
      "mpk-stargard",
      "mzd-rzeszow",
      "pgk-suwalki",
      "tarnowska-komunikacja",
      "zdw-krakow",
      "zdw-katowice",
    ]);
  });

  test("resolves the Michałowice komunikaty source from the canonical checklist config", () => {
    const source = getSafeCheckSource("michalowice-komunikaty");
    expect(source).not.toBeNull();
    expect(source?.name).toBe("Gmina Michałowice — komunikaty");
    expect(source?.officialUrl).toContain("michalowice.pl");
    expect(source?.category).toBe("municipal");
  });

  test("resolves the WKD aktualności source from the canonical checklist config (Sprint 139)", () => {
    const source = getSafeCheckSource("wkd-aktualnosci");
    expect(source).not.toBeNull();
    expect(source?.name).toBe("WKD — aktualności");
    expect(source?.officialUrl).toBe("https://wkd.com.pl/aktualnosci");
    expect(source?.category).toBe("transport");
  });

  test("rejects unknown, unlisted and empty keys — the API can never fetch an arbitrary source", () => {
    expect(getSafeCheckSource("pge-planowane")).toBeNull(); // region picker + active WAF block, must stay manual
    expect(getSafeCheckSource("michalowice-wylaczenia-pradu")).toBeNull(); // not yet reviewed
    expect(getSafeCheckSource("https://evil.example/page")).toBeNull();
    expect(getSafeCheckSource("")).toBeNull();
  });

  test("resolves the Pruszków aktualności source from the canonical checklist config (Sprint 169)", () => {
    const source = getSafeCheckSource("pruszkow-aktualnosci");
    expect(source?.name).toBe("Miasto Pruszków — aktualności");
    expect(source?.apiUrl).toBe("https://www.pruszkow.pl/wp-json/wp/v2/posts?categories=371&per_page=6");
  });
});

test.describe("buildCheckProposals (fixture HTML, deterministic)", () => {
  const proposals = buildCheckProposals(parsePageHtml(FIXTURE_HTML, "https://example.test/komunikaty"));

  test("extracts headed notices as titled proposals", () => {
    expect(proposals.length).toBe(2);
    expect(proposals[0].title).toContain("Testowe uruchomienie syren");
    expect(proposals[0].rawText).toContain("12:00–12:30");
    expect(proposals[1].title).toContain("Utrudnienia w ruchu drogowym");
  });

  test("flags date presence per proposal (heuristic from candidateWarnings)", () => {
    expect(proposals[0].hasDate).toBe(true); // "16 lipca 2026"
    expect(proposals[1].hasDate).toBe(false); // no date anywhere in that block
  });

  test("skips too-short blocks instead of proposing noise", () => {
    expect(proposals.some((p) => p.title.includes("Krótki wpis"))).toBe(false);
  });

  test("caps the proposal count", () => {
    const manyBlocks = Array.from({ length: 20 }, (_, i) =>
      `<h2>Komunikat numer ${i} o czymś ważnym</h2>
       <p>Dłuższa treść komunikatu numer ${i}, która zdecydowanie przekracza
       minimalny próg długości i wygląda jak realny wpis urzędu gminy.</p>`
    ).join("\n");
    const many = buildCheckProposals(
      parsePageHtml(`<html><body><main>${manyBlocks}</main></body></html>`, "https://example.test/")
    );
    expect(many.length).toBeLessThanOrEqual(6);
  });

  test("empty or boilerplate-only page yields zero proposals, not a crash", () => {
    const empty = buildCheckProposals(
      parsePageHtml("<html><body><nav>Tylko menu</nav></body></html>", "https://example.test/")
    );
    expect(empty).toEqual([]);
  });
});

test.describe("suggestCheckResult (history logging)", () => {
  test("proposals found → found_notice; nothing found → no_changes (loggable result too)", () => {
    expect(suggestCheckResult(3)).toBe("found_notice");
    expect(suggestCheckResult(1)).toBe("found_notice");
    expect(suggestCheckResult(0)).toBe("no_changes");
  });
});

test.describe("findMatchingRegistrySource", () => {
  const registry = [
    { id: "a", url: "https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty/" },
    { id: "b", url: "https://wkd.com.pl/aktualnosci" },
  ];

  test("matches ignoring www. and trailing slash", () => {
    const match = findMatchingRegistrySource(
      registry,
      "https://michalowice.pl/dzieje-sie/aktualnosci/komunikaty"
    );
    expect(match?.id).toBe("a");
  });

  test("no match → null (candidates then save with source_id null, history unavailable)", () => {
    expect(findMatchingRegistrySource(registry, "https://example.test/other")).toBeNull();
    expect(findMatchingRegistrySource([], "https://michalowice.pl/")).toBeNull();
  });

  // Sprint 165C-1 — alert_sources.url is nullable (a source can be
  // registered before its official URL is known; the isolated Preview
  // synthetic seed deliberately includes one such row). A registry row
  // with no URL must never crash the match, and must never be treated as
  // "matching" an official URL just because both sides fell back to an
  // empty-string comparison.
  test("a registry row with url: null is skipped, never throws, and is never falsely matched", () => {
    const withNullUrl = [...registry, { id: "c", url: null }];

    const officialUrl = "https://michalowice.pl/dzieje-sie/aktualnosci/komunikaty";
    expect(() => findMatchingRegistrySource(withNullUrl, officialUrl)).not.toThrow();
    expect(findMatchingRegistrySource(withNullUrl, officialUrl)?.id).toBe("a");

    // An officialUrl that itself normalizes to an empty string must still
    // never match the null-url row (both "empty" is not a match).
    expect(findMatchingRegistrySource(withNullUrl, "")).toBeNull();

    // Null-url-only registry — no match, no crash.
    expect(findMatchingRegistrySource([{ id: "c", url: null }], "https://michalowice.pl/")).toBeNull();
  });
});

test.describe("manual-check copy (anti-drift)", () => {
  test("disclaimer says the check is manual and publish stays a separate manual decision", () => {
    expect(MANUAL_CHECK_DISCLAIMER).toContain("ręczny");
    expect(MANUAL_CHECK_DISCLAIMER).toContain("Kreatora");
  });

  test("no copy promises automation or automatic publication", () => {
    for (const copy of [MANUAL_CHECK_DISCLAIMER, CHECK_BUTTON_LABEL, UNSUPPORTED_SOURCE_ERROR]) {
      const lower = copy.toLowerCase();
      expect(lower).not.toContain("automatycznie publikuje");
      expect(lower).not.toContain("autopublish");
      expect(lower).not.toContain("cron");
      expect(lower).not.toContain("sam publikuje");
    }
  });
});
