import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { join } from "path";
import { parsePageHtml } from "@/lib/sourceParsers/pageParser";
import {
  getSafeCheckSource,
  buildCheckProposals,
  suggestCheckResult,
  MAX_CHECK_PROPOSALS,
  UNSUPPORTED_SOURCE_ERROR,
} from "@/lib/sourceCheck";

/**
 * Sprint 139 — fixture-based tests for the second safe source: WKD —
 * aktualności. The fixture in tests/fixtures/ copies the STRUCTURE of the
 * live wkd.com.pl/aktualnosci Joomla listing (itemprop="blogPost" blocks
 * with <p class="published"><time>, an item-header <h2><a> title and an
 * item-introtext <div> teaser — no <main>, no teaser <p>, which is why the
 * generic heading/paragraph extractor pairs nothing on the real page).
 * Content in the fixture is invented for the test.
 *
 * Everything here runs on local files through pure functions — no browser
 * page, no dev server, NO live external website.
 */

const FIXTURES_DIR = join(__dirname, "..", "fixtures");
const BASE_URL = "https://wkd.com.pl/aktualnosci";

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf-8");
}

test.describe("WKD allowlist entry (Sprint 139)", () => {
  test("resolves the WKD aktualności source from the canonical checklist config", () => {
    const source = getSafeCheckSource("wkd-aktualnosci");
    expect(source).not.toBeNull();
    expect(source?.name).toBe("WKD — aktualności");
    expect(source?.officialUrl).toBe("https://wkd.com.pl/aktualnosci");
    expect(source?.category).toBe("transport");
  });

  test("the unsupported-source error names both supported sources (anti-drift)", () => {
    expect(UNSUPPORTED_SOURCE_ERROR).toContain("Gmina Michałowice — komunikaty");
    expect(UNSUPPORTED_SOURCE_ERROR).toContain("WKD — aktualności");
    expect(UNSUPPORTED_SOURCE_ERROR).toContain("ręcznie");
  });
});

test.describe("WKD blogPost listing (realistic fixture)", () => {
  const parse = parsePageHtml(loadFixture("wkd-aktualnosci.html"), BASE_URL);
  const proposals = buildCheckProposals(parse);

  test("extracts notices from Joomla blogPost markup (no main/article, div teasers)", () => {
    expect(parse.candidates.length).toBeGreaterThan(0);
    expect(proposals.length).toBe(3);
  });

  test("proposal titles come from the item-header link", () => {
    expect(proposals[0].title).toBe("Zmiana rozkładu jazdy pociągów od 20 lipca 2026 r.");
    expect(proposals[1].title).toBe(
      "Ograniczenia prędkości pociągów na odcinku Komorów – Podkowa Leśna"
    );
    expect(proposals[2].title).toBe("Konkurs wakacyjny dla pasażerów WKD");
  });

  test("rawText includes the published date and the teaser body", () => {
    expect(proposals[0].rawText).toContain("03.07.2026");
    expect(proposals[0].rawText).toContain("pracami torowymi");
    expect(proposals[1].rawText).toContain("01.07.2026");
    expect(proposals[1].rawText).toContain("opóźnienia pociągów");
  });

  test("hasDate reflects the <time> element / notice text (missing dates flagged false)", () => {
    expect(proposals[0].hasDate).toBe(true); // published 03.07.2026 + date in title
    expect(proposals[1].hasDate).toBe(true); // published 01.07.2026
    expect(proposals[2].hasDate).toBe(false); // no <time>, no date in teaser
  });

  test("pinned/duplicated notices are proposed once", () => {
    const speedTitles = proposals.filter((p) =>
      p.title.startsWith("Ograniczenia prędkości pociągów")
    );
    expect(speedTitles.length).toBe(1);
  });

  test("too-short teasers are skipped, not proposed", () => {
    expect(proposals.some((p) => p.title === "Krótki wpis")).toBe(false);
  });

  test("cookie boilerplate rendered as a listing item is dropped at the proposal layer", () => {
    // The fixture's cookie item IS extracted as a candidate (the extractor is
    // markup-driven), so this asserts the boilerplate filter is exercised.
    const cookieCandidate = parse.candidates.find((c) => c.text.includes("plików cookie"));
    expect(cookieCandidate).toBeDefined();
    expect(proposals.some((p) => p.title === "Informacja o plikach cookie")).toBe(false);
  });

  test("'Czytaj więcej' link chrome and menu never leak into proposals", () => {
    for (const p of proposals) {
      expect(p.rawText.toLowerCase()).not.toContain("czytaj więcej");
      expect(p.title.toLowerCase()).not.toContain("czytaj więcej");
      expect(p.title).not.toContain("Rozkład jazdy"); // nav menu item
    }
  });

  test("page title and RSS autodiscovery work on the WKD markup", () => {
    expect(parse.title).toBe("Aktualności - WKD");
    expect(parse.feedUrl).toContain("wkd.com.pl/aktualnosci?format=feed");
  });

  test("a found notice suggests the found_notice check result", () => {
    expect(suggestCheckResult(proposals.length)).toBe("found_notice");
  });
});

test.describe("WKD defensive handling (broken/degenerate input)", () => {
  test("blogPost shells without header and text yield zero proposals, not a crash", () => {
    const html = `
      <html><body>
        <div class="item" itemprop="blogPost"><div class="article-image"><img src="/a.jpg"></div></div>
        <div class="item" itemprop="blogPost"><div class="with-readmore"></div></div>
      </body></html>`;
    const parse = parsePageHtml(html, BASE_URL);
    const proposals = buildCheckProposals(parse);
    expect(proposals).toEqual([]);
    expect(suggestCheckResult(proposals.length)).toBe("no_changes");
  });

  test(`proposal count is capped at ${MAX_CHECK_PROPOSALS} even for a very long listing`, () => {
    const items = Array.from({ length: 15 }, (_, i) =>
      `<div class="item round-corners" itemprop="blogPost">
        <div class="article-info"><p class="published"><time datetime="2026-07-0${(i % 9) + 1}">0${(i % 9) + 1}.07.2026</time></p></div>
        <div class="item-header"><h2 itemprop="name"><a href="/k${i}">Komunikat numer ${i} o utrudnieniach na linii WKD</a></h2></div>
        <div class="item-introtext">Dłuższa treść komunikatu numer ${i}, która zdecydowanie przekracza minimalny próg długości i wygląda jak realny wpis przewoźnika kolejowego.</div>
      </div>`
    ).join("\n");
    const proposals = buildCheckProposals(
      parsePageHtml(`<html><body><div class="blog">${items}</div></body></html>`, BASE_URL)
    );
    expect(proposals.length).toBe(MAX_CHECK_PROPOSALS);
  });

  test("michalowice news-item markup keeps precedence over the blogPost pass", () => {
    // A page carrying BOTH markups (theoretical) must not double-propose:
    // the news-item pass wins, the blogPost pass is only a fallback.
    const html = `
      <html><body>
        <div class="news-item div-link"><div><div class="description">
          <div class="date">01.07.2026 08:00</div>
          <div class="h3 title-border"><a href="/x">Komunikat z markupu news-item o utrudnieniach</a></div>
          <div class="description-body">Treść komunikatu z markupu news-item, wystarczająco długa, żeby przejść próg minimalnej długości propozycji.</div>
        </div></div></div>
        <div class="item" itemprop="blogPost">
          <div class="item-header"><h2 itemprop="name"><a href="/y">Wpis z markupu blogPost</a></h2></div>
          <div class="item-introtext">Treść wpisu z markupu blogPost, także wystarczająco długa, żeby przejść próg minimalnej długości propozycji.</div>
        </div>
      </body></html>`;
    const proposals = buildCheckProposals(parsePageHtml(html, BASE_URL));
    expect(proposals.length).toBe(1);
    expect(proposals[0].title).toBe("Komunikat z markupu news-item o utrudnieniach");
  });
});
