import { test, expect } from "@playwright/test";
import { parsePageHtml, describePageFetchFailure } from "@/lib/sourceParsers/pageParser";
import { detectParserStrategy } from "@/lib/sourceParsers";
import { detectDateInText, textSimilarity, findSimilarText, trimAtWord } from "@/lib/candidateWarnings";

/**
 * Unit-style tests for the Sprint 76 parser abstraction and the Sprint 75
 * candidate-warning helpers. These call pure functions directly — no
 * browser page, no dev server, no live external site — so they stay fast
 * and stable regardless of network conditions.
 */

test.describe("detectParserStrategy", () => {
  test("maps known source types to the right strategy", () => {
    expect(detectParserStrategy("website")).toBe("page");
    expect(detectParserStrategy("rss")).toBe("feed");
    expect(detectParserStrategy("pdf")).toBe("pdf_manual");
    expect(detectParserStrategy("other")).toBe("page");
  });

  test("falls back to 'unknown' for missing/unrecognized values", () => {
    expect(detectParserStrategy(undefined)).toBe("unknown");
    expect(detectParserStrategy("something-unexpected")).toBe("unknown");
  });
});

test.describe("parsePageHtml", () => {
  const SAMPLE_HTML = `
    <html>
      <head>
        <title>Aktualności — Gmina Testowa</title>
        <link rel="stylesheet" href="/style.css">
        <link rel="alternate" type="application/rss+xml" href="/feed.xml">
      </head>
      <body>
        <nav>Menu nawigacyjne, powinno zostać odfiltrowane</nav>
        <main>
          <h2>Przerwa w dostawie wody 24 czerwca 2026</h2>
          <p>W dniu 24 czerwca 2026 r. nastąpi planowana przerwa w dostawie wody
          w związku z pracami konserwacyjnymi na sieci wodociągowej w okolicy.</p>
          <h2>Krótki nagłówek bez treści</h2>
        </main>
        <footer>Stopka strony, powinna zostać odfiltrowana</footer>
      </body>
    </html>
  `;

  test("extracts the page title", () => {
    const result = parsePageHtml(SAMPLE_HTML, "https://example.test/aktualnosci");
    expect(result.title).toBe("Aktualności — Gmina Testowa");
  });

  test("resolves a relative feed link to an absolute URL", () => {
    const result = parsePageHtml(SAMPLE_HTML, "https://example.test/aktualnosci");
    expect(result.feedUrl).toBe("https://example.test/feed.xml");
  });

  test("builds a candidate from a heading followed by a paragraph, flagged as having a date", () => {
    const result = parsePageHtml(SAMPLE_HTML, "https://example.test/aktualnosci");
    expect(result.candidates.length).toBeGreaterThan(0);
    const first = result.candidates[0];
    expect(first.heading).toContain("Przerwa w dostawie wody");
    expect(first.hasDate).toBe(true);
  });

  test("does not include <nav>/<footer> boilerplate in the extracted text", () => {
    const result = parsePageHtml(SAMPLE_HTML, "https://example.test/aktualnosci");
    expect(result.rawText).not.toContain("Menu nawigacyjne");
    expect(result.rawText).not.toContain("Stopka strony");
  });

  test("returns no feedUrl when the page has no <link rel=alternate>", () => {
    const html = "<html><head><title>Bez RSS</title></head><body><p>Brak kanału.</p></body></html>";
    const result = parsePageHtml(html, "https://example.test/");
    expect(result.feedUrl).toBeUndefined();
  });
});

test.describe("describePageFetchFailure", () => {
  test("403/401 are described as bot-blocking, not a broken link", () => {
    expect(describePageFetchFailure(403)).toContain("zablokowała automatyczne pobieranie");
    expect(describePageFetchFailure(401)).toContain("zablokowała automatyczne pobieranie");
    expect(describePageFetchFailure(403)).not.toContain("Sprawdź, czy adres URL jest poprawny");
  });

  test("404 points at a possibly outdated URL", () => {
    expect(describePageFetchFailure(404)).toContain("nie została znaleziona");
  });

  test("5xx is described as a problem on the source's side", () => {
    expect(describePageFetchFailure(500)).toContain("problem po stronie źródła");
    expect(describePageFetchFailure(503)).toContain("problem po stronie źródła");
  });

  test("other statuses fall back to the generic URL-check message", () => {
    expect(describePageFetchFailure(418)).toContain("Sprawdź, czy adres URL jest poprawny");
  });
});

test.describe("candidateWarnings helpers", () => {
  test("detectDateInText recognizes ISO and Polish-month dates", () => {
    expect(detectDateInText("Termin: 2026-06-24")).toBe(true);
    expect(detectDateInText("Spotkanie 24 czerwca 2026 roku")).toBe(true);
    expect(detectDateInText("Brak jakiejkolwiek wzmianki o terminie")).toBe(false);
  });

  test("textSimilarity scores near-identical Polish text highly, unrelated text near zero", () => {
    const a = "Remont ulicy Głównej w Granicy zakończony w terminie";
    const b = "Remont ul. Głównej w Granicy zakończony w terminie";
    const c = "Planowana przerwa w dostawie wody w Komorowie";
    expect(textSimilarity(a, b)).toBeGreaterThan(0.6);
    expect(textSimilarity(a, c)).toBeLessThan(0.3);
  });

  test("findSimilarText returns the closest match above the threshold", () => {
    const text = "Remont ulicy Głównej w Granicy zakończony w terminie";
    const candidates = [
      "Planowana przerwa w dostawie wody w Komorowie",
      "Remont ul. Głównej w Granicy zakończony w terminie",
    ];
    expect(findSimilarText(text, candidates)).toBe(candidates[1]);
  });

  test("findSimilarText returns null when nothing is similar enough", () => {
    const text = "Remont ulicy Głównej w Granicy zakończony w terminie";
    const candidates = ["Planowana przerwa w dostawie wody w Komorowie", "", "Inny temat zupełnie"];
    expect(findSimilarText(text, candidates)).toBeNull();
  });

  test("trimAtWord leaves short text untouched", () => {
    expect(trimAtWord("Krótki tytuł", 80)).toBe("Krótki tytuł");
  });

  test("trimAtWord cuts at the last whole word, not mid-word", () => {
    const text = "Remont ulicy Głównej w Granicy rozpoczyna się od skrzyżowania z ulicą Rekreacyjną i potrwa kilka tygodni";
    const result = trimAtWord(text, 40);
    expect(result.length).toBeLessThanOrEqual(41); // 40 + the trailing "…"
    expect(result.endsWith("…")).toBe(true);
    expect(text.startsWith(result.slice(0, -1).trimEnd())).toBe(true);
  });
});
