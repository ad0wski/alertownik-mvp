import { test, expect } from "@playwright/test";
import {
  extractPowiatWiadomosciListItems,
  extractPowiatArticleBodyText,
  isPowiatNoticeRelevant,
} from "@/lib/sourceParsers/powiatPruszkowskiParser";
import {
  buildPowiatWiadomosciParse,
  MAX_ARTICLE_BODY_FETCHES,
  type ArticleBodyFetcher,
} from "@/lib/sourceParsers/powiatPruszkowskiFetch";
import { buildCheckProposals, MAX_CHECK_PROPOSALS } from "@/lib/sourceCheck";
import { findSimilarText } from "@/lib/candidateWarnings";

/**
 * Sprint 183A — fixture-based tests for Powiat Pruszkowski's "Wiadomości"
 * source. Structure (Liferay gov.pl template: `<div class="art-prev">` list
 * of `<li><a><div class="title">/<div class="intro">` items, article pages
 * with `<div class="editor-content">`) is modeled on the real, live markup
 * verified during this sprint's audit; slugs, titles, and body text below
 * are invented for this test only — no scraped content is committed here.
 */

const BASE_URL = "https://samorzad.gov.pl/web/powiat-pruszkowski/wiadomosci";

function listingHtml(
  items: { slug: string; title: string; intro?: string }[]
): string {
  const lis = items
    .map(
      (i) => `
<li>
<a href="/web/powiat-pruszkowski/${i.slug}">
<picture><img alt="foto" src="/photo/x" /></picture>
<div>
<div class="title">${i.title}</div>
${i.intro ? `<div class="intro">${i.intro}</div>` : ""}
</div>
</a>
</li>`
    )
    .join("\n");

  return `<!DOCTYPE html><html><body>
<main>
<article class="article-area__article ">
<h2>Wiadomości</h2>
<div class="art-prev art-prev--near-menu" >
<ul>
${lis}
</ul>
</div>
<nav class="pagination"><span>124</span></nav>
</article>
</main>
</body></html>`;
}

function articleHtml(title: string, bodyParagraphs: string[]): string {
  const paras = bodyParagraphs.map((p) => `<p>${p}</p>`).join("\n");
  return `<!DOCTYPE html><html><body>
<main>
<div class="article-area main-container ">
<article class="article-area__article " id="main-content">
<h2>${title}</h2>
<div class="main-photo"><picture><img alt="foto" src="/photo/x" /></picture></div>
<div class="editor-content">
<div>${paras}</div>
</div>
<h3>Zdjęcia (1)</h3>
<div class="gallery"></div>
</article>
</div>
</main>
</body></html>`;
}

// ── 1. Listing fetch + item extraction ──────────────────────────────────────

test.describe("extractPowiatWiadomosciListItems — listing extraction", () => {
  test("parses title, intro, and absolute URL for each item", () => {
    const html = listingHtml([
      { slug: "konkurs-fotograficzny", title: "Konkurs fotograficzny „Zielone okulary”", intro: "Zapraszamy mieszkańców do udziału w konkursie fotograficznym poświęconym przyrodzie regionu." },
    ]);
    const items = extractPowiatWiadomosciListItems(html, BASE_URL);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Konkurs fotograficzny „Zielone okulary”");
    expect(items[0].intro).toContain("konkursie fotograficznym");
    expect(items[0].url).toBe("https://samorzad.gov.pl/web/powiat-pruszkowski/konkurs-fotograficzny");
  });

  test("an item with no intro (the real shape for genuine road notices) has intro undefined, not empty string", () => {
    const html = listingHtml([{ slug: "utrudnienia-ul-testowa", title: "Utrudnienia w ruchu na ul. Testowej" }]);
    const items = extractPowiatWiadomosciListItems(html, BASE_URL);
    expect(items[0].intro).toBeUndefined();
  });

  // ── 2 / 13. URL resolution and safety ─────────────────────────────────────

  test("2. resolves a relative href into a direct absolute permalink", () => {
    const items = extractPowiatWiadomosciListItems(
      listingHtml([{ slug: "zamkniecie-ulicy-x", title: "Zamknięcie ulicy X na czas remontu" }]),
      BASE_URL
    );
    expect(items[0].url.startsWith("https://samorzad.gov.pl/")).toBe(true);
  });

  test("13. a cross-origin href in the markup is rejected — no item produced for it", () => {
    const html = `<!DOCTYPE html><html><body><main><article class="article-area__article ">
<h2>Wiadomości</h2>
<div class="art-prev">
<ul>
<li><a href="https://evil.example.com/phishing"><div><div class="title">Utrudnienia drogowe — pilne</div></div></a></li>
</ul>
</div>
<nav class="pagination"></nav>
</article></main></body></html>`;
    expect(extractPowiatWiadomosciListItems(html, BASE_URL)).toHaveLength(0);
  });

  test("13. a non-http(s) scheme href (e.g. javascript:) is rejected, never produces an item", () => {
    const html = `<!DOCTYPE html><html><body><main><article class="article-area__article ">
<h2>Wiadomości</h2>
<div class="art-prev">
<ul>
<li><a href="javascript:alert(1)"><div><div class="title">Utrudnienia drogowe</div></div></a></li>
</ul>
</div>
<nav class="pagination"></nav>
</article></main></body></html>`;
    expect(() => extractPowiatWiadomosciListItems(html, BASE_URL)).not.toThrow();
    expect(extractPowiatWiadomosciListItems(html, BASE_URL)).toHaveLength(0);
  });

  test("a template change (no art-prev container found) degrades to zero items, never a crash", () => {
    expect(() => extractPowiatWiadomosciListItems("<html><body>redesigned page</body></html>", BASE_URL)).not.toThrow();
    expect(extractPowiatWiadomosciListItems("<html><body>redesigned page</body></html>", BASE_URL)).toEqual([]);
  });
});

// ── 4. Polish characters survive extraction ─────────────────────────────────

test.describe("Polish character handling", () => {
  test("4. diacritics (literal UTF-8, as the real page sends them) and named/numeric HTML entities both decode correctly", () => {
    // Real Powiat Pruszkowski article bodies (verified live, Sprint 183A
    // audit) mix literal UTF-8 Polish characters with named entities like
    // &oacute; for "ó" — a WYSIWYG-editor quirk this codebase's other
    // sources hadn't exercised before.
    const html = listingHtml([
      {
        slug: "utrudnienia-piastow",
        title: "Utrudnienia w ruchu &ndash; ul. Piłsudskiego w Piastowie",
        intro: "Rob&oacute;t drogowych ci&#261;g dalszy, prosimy o wyrozumiałość.",
      },
    ]);
    const items = extractPowiatWiadomosciListItems(html, BASE_URL);
    expect(items[0].title).toContain("Piłsudskiego");
    expect(items[0].intro).toContain("Robót");
    expect(items[0].intro).toContain("ciąg");
  });

  test("4. article body preserves Polish characters from entities", () => {
    const html = articleHtml("Utrudnienia", [
      "Od 20 lipca do 30 sierpnia nast&#261;pi zamkni&#281;cie ulicy z powodu rob&oacute;t drogowych.",
    ]);
    const body = extractPowiatArticleBodyText(html);
    expect(body).toContain("nastąpi");
    expect(body).toContain("zamknięcie");
  });
});

// ── 5 / 6 / 7. Topic relevance filter ───────────────────────────────────────

test.describe("isPowiatNoticeRelevant — topic pre-filter", () => {
  test("5. a genuine road-disruption title/intro passes", () => {
    expect(isPowiatNoticeRelevant("Utrudnienia w ruchu - rozbudowa ul. Testowej w Piastowie")).toBe(true);
    expect(isPowiatNoticeRelevant("Uwaga kierowcy! Czasowe zamknięcia dróg powiatowych")).toBe(true);
  });

  test("6. a routine municipal/strategy announcement is rejected", () => {
    expect(
      isPowiatNoticeRelevant(
        "Strategia Rozwoju Powiatu Pruszkowskiego 2026–2036\n" +
          "Informujemy, że na stronie internetowej Powiatu Pruszkowskiego została opublikowana Strategia Rozwoju."
      )
    ).toBe(false);
  });

  test("7. a promotional/contest item is rejected", () => {
    expect(
      isPowiatNoticeRelevant(
        "Konkurs „Przez zielone okulary”\n" +
          "Powiat Pruszkowski zaprasza mieszkańców do udziału w konkursie kreatywnym."
      )
    ).toBe(false);
  });

  test("a weather/hydrological warning is rejected — out of scope per project rules (no weather content)", () => {
    expect(isPowiatNoticeRelevant("Ostrzeżenie hydrologiczne Województwo mazowieckie")).toBe(false);
  });
});

// ── Full pipeline: buildPowiatWiadomosciParse ───────────────────────────────

test.describe("buildPowiatWiadomosciParse — end-to-end orchestration", () => {
  test("an item with a long-enough intro produces a candidate without any article fetch", async () => {
    const html = listingHtml([
      {
        slug: "objazd-testowy",
        title: "Objazd na czas remontu ronda",
        intro:
          "W dniach 1-10 sierpnia 2026 roku wprowadzony zostanie objazd wyznaczony przez ulice sąsiednie z powodu remontu ronda na drodze powiatowej.",
      },
    ]);
    let fetchCalls = 0;
    const fetchBody: ArticleBodyFetcher = async () => {
      fetchCalls++;
      return null;
    };
    const parse = await buildPowiatWiadomosciParse(html, BASE_URL, fetchBody);
    expect(parse.candidates).toHaveLength(1);
    expect(fetchCalls).toBe(0);
  });

  test("5. a short/no-intro road item triggers exactly one article-body fetch and produces a candidate", async () => {
    const html = listingHtml([{ slug: "utrudnienia-testowa", title: "Utrudnienia w ruchu na ul. Testowej" }]);
    const article = articleHtml("Utrudnienia w ruchu na ul. Testowej", [
      "Informujemy, że w związku z remontem drogi powiatowej od 1 do 15 sierpnia 2026 r. nastąpi czasowe zamknięcie ul. Testowej na odcinku od skrzyżowania z ul. Główną.",
    ]);
    let fetchCalls = 0;
    const fetchBody: ArticleBodyFetcher = async () => {
      fetchCalls++;
      return article;
    };
    const parse = await buildPowiatWiadomosciParse(html, BASE_URL, fetchBody);
    expect(fetchCalls).toBe(1);
    expect(parse.candidates).toHaveLength(1);
    expect(parse.candidates[0].text).toContain("remontem drogi powiatowej");
    expect(parse.candidates[0].hasDate).toBe(true);
  });

  test("6/7. off-topic items never trigger an article fetch, even when short", async () => {
    const html = listingHtml([{ slug: "wydarzenie-testowe", title: "Akademickie zawody sportowe" }]);
    let fetchCalls = 0;
    const fetchBody: ArticleBodyFetcher = async () => {
      fetchCalls++;
      return articleHtml("Akademickie zawody sportowe", ["Treść wydarzenia sportowego, bez związku z drogami."]);
    };
    const parse = await buildPowiatWiadomosciParse(html, BASE_URL, fetchBody);
    expect(fetchCalls).toBe(0);
    expect(parse.candidates).toHaveLength(0);
  });

  test("8. a still-too-short combined result after fetching is dropped, never proposed", async () => {
    const html = listingHtml([{ slug: "utrudnienia-krotkie", title: "Utrudnienia — ul. X" }]);
    const article = articleHtml("Utrudnienia — ul. X", ["Krótko."]);
    const parse = await buildPowiatWiadomosciParse(html, BASE_URL, async () => article);
    expect(parse.candidates).toHaveLength(0);
  });

  test("9. an unavailable article page (fetch returns null) drops the item — never a bare-title candidate", async () => {
    const html = listingHtml([{ slug: "utrudnienia-404", title: "Utrudnienia drogowe — zamknięcie odcinka" }]);
    const parse = await buildPowiatWiadomosciParse(html, BASE_URL, async () => null);
    expect(parse.candidates).toHaveLength(0);
  });

  test("10. a timeout (fetcher throws/rejects is treated as failure by the caller) drops the item", async () => {
    const html = listingHtml([{ slug: "utrudnienia-timeout", title: "Utrudnienia drogowe — objazd wyznaczony" }]);
    const timeoutFetch: ArticleBodyFetcher = async () => {
      // Mirrors defaultFetchArticleBody's own contract: any failure (incl. an
      // aborted/timed-out request) resolves to null, never throws upward.
      return null;
    };
    const parse = await buildPowiatWiadomosciParse(html, BASE_URL, timeoutFetch);
    expect(parse.candidates).toHaveLength(0);
  });

  test("15. an article page missing the editor-content container is treated as ambiguous and dropped", async () => {
    const html = listingHtml([{ slug: "utrudnienia-ambiguous", title: "Utrudnienia drogowe — remont nawierzchni" }]);
    const brokenArticle = `<!DOCTYPE html><html><body><main><article id="main-content"><h2>Utrudnienia</h2></article></main></body></html>`;
    const parse = await buildPowiatWiadomosciParse(html, BASE_URL, async () => brokenArticle);
    expect(parse.candidates).toHaveLength(0);
  });

  test("14. article-body fetches are capped at MAX_ARTICLE_BODY_FETCHES even with more qualifying short items", async () => {
    const items = Array.from({ length: MAX_ARTICLE_BODY_FETCHES + 3 }, (_, i) => ({
      slug: `utrudnienia-${i}`,
      title: `Utrudnienia drogowe — odcinek ${i}`,
    }));
    const html = listingHtml(items);
    let fetchCalls = 0;
    const fetchBody: ArticleBodyFetcher = async (url) => {
      fetchCalls++;
      return articleHtml("Utrudnienia", [
        `Informujemy o utrudnieniach drogowych na odcinku opisanym pod adresem ${url}, prace potrwają do 20 sierpnia 2026 roku.`,
      ]);
    };
    await buildPowiatWiadomosciParse(html, BASE_URL, fetchBody);
    expect(fetchCalls).toBe(MAX_ARTICLE_BODY_FETCHES);
  });

  test("14. MAX_CHECK_PROPOSALS cap still applies after enrichment (shared buildCheckProposals logic, not duplicated)", async () => {
    const items = Array.from({ length: MAX_CHECK_PROPOSALS + 4 }, (_, i) => ({
      slug: `objazd-${i}`,
      title: `Objazd drogowy numer ${i}`,
      intro: `Wprowadzony zostaje objazd drogowy z powodu remontu drogi powiatowej numer ${i}, prosimy o zachowanie ostrożności podczas przejazdu.`,
    }));
    const html = listingHtml(items);
    const parse = await buildPowiatWiadomosciParse(html, BASE_URL, async () => null);
    const proposals = buildCheckProposals(parse);
    expect(proposals.length).toBeLessThanOrEqual(MAX_CHECK_PROPOSALS);
  });

  test("11/12. near-identical candidates are flagged as similar by the existing generic dedup helper", async () => {
    const html = listingHtml([
      {
        slug: "utrudnienia-a",
        title: "Utrudnienia w ruchu na ul. Kwiatowej",
        intro: "Od 1 do 10 sierpnia 2026 roku na ul. Kwiatowej wystąpią utrudnienia w ruchu związane z remontem nawierzchni drogi.",
      },
      {
        slug: "utrudnienia-b",
        title: "Utrudnienia w ruchu na ul. Kwiatowej",
        intro: "Od 1 do 10 sierpnia 2026 roku na ul. Kwiatowej wystąpią utrudnienia w ruchu związane z remontem nawierzchni jezdni.",
      },
    ]);
    const parse = await buildPowiatWiadomosciParse(html, BASE_URL, async () => null);
    expect(parse.candidates).toHaveLength(2);
    const [first, second] = parse.candidates.map((c) => c.text);
    expect(findSimilarText(second, [first])).not.toBeNull();
  });

  test("empty listing → zero candidates, never a crash", async () => {
    const parse = await buildPowiatWiadomosciParse(listingHtml([]), BASE_URL, async () => null);
    expect(parse.candidates).toEqual([]);
    expect(parse.rawText).toBe("");
  });

  test("result title identifies this source distinctly", async () => {
    const parse = await buildPowiatWiadomosciParse(listingHtml([]), BASE_URL, async () => null);
    expect(parse.title).toBe("Powiat Pruszkowski — Wiadomości");
  });
});
