import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { join } from "path";
import { parsePageHtml } from "@/lib/sourceParsers/pageParser";
import {
  buildCheckProposals,
  suggestCheckResult,
  MAX_CHECK_PROPOSALS,
  MIN_PROPOSAL_TEXT_LENGTH,
} from "@/lib/sourceCheck";

/**
 * Sprint 138 — fixture-based reliability tests for the Gmina Michałowice
 * source parser. The fixtures in tests/fixtures/ copy the STRUCTURE of the
 * live michalowice.pl komunikaty listing (div-only <div class="news-item">
 * blocks — the page has no <h1-3> and no <p> tags at all, which is exactly
 * why the pre-138 block extractor returned zero candidates on the real
 * page). Content in the fixtures is invented for the test.
 *
 * Everything here runs on local files through pure functions — no browser
 * page, no dev server, NO live external website.
 */

const FIXTURES_DIR = join(__dirname, "..", "fixtures");
const BASE_URL = "https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty";

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf-8");
}

test.describe("Michałowice news-item listing (realistic fixture)", () => {
  const parse = parsePageHtml(loadFixture("michalowice-komunikaty.html"), BASE_URL);
  const proposals = buildCheckProposals(parse);

  test("extracts notices from div-only news-item markup (no h1-3/p on the page)", () => {
    expect(parse.candidates.length).toBeGreaterThan(0);
    expect(proposals.length).toBe(3);
  });

  test("proposal titles come from the news-item title link", () => {
    expect(proposals[0].title).toBe("Testowe uruchomienie syren alarmowych 16 lipca 2026 r.");
    expect(proposals[1].title).toBe("Przerwa w dostawie wody w Komorowie");
    expect(proposals[2].title).toBe("Zmiana organizacji ruchu na ulicy Głównej");
  });

  test("rawText includes the date line and the teaser body", () => {
    expect(proposals[0].rawText).toContain("Data wydarzenia: 16.07.2026");
    expect(proposals[0].rawText).toContain("testy syren alarmowych");
    expect(proposals[1].rawText).toContain("awarią sieci wodociągowej");
  });

  test("hasDate reflects the date div / notice text (missing dates flagged false)", () => {
    expect(proposals[0].hasDate).toBe(true); // "Data wydarzenia: 16.07.2026"
    expect(proposals[1].hasDate).toBe(true); // "07.07.2026 12:05"
    expect(proposals[2].hasDate).toBe(false); // no date div, no date in body
  });

  test("duplicated titles are proposed once (pinned/repeated notices)", () => {
    const waterTitles = proposals.filter((p) => p.title === "Przerwa w dostawie wody w Komorowie");
    expect(waterTitles.length).toBe(1);
  });

  test("too-short fragments are skipped, not proposed", () => {
    expect(proposals.some((p) => p.title === "Krótki wpis")).toBe(false);
  });

  test("'czytaj więcej' link chrome never leaks into proposals", () => {
    for (const p of proposals) {
      expect(p.rawText.toLowerCase()).not.toContain("czytaj więcej");
      expect(p.title.toLowerCase()).not.toContain("czytaj więcej");
    }
  });

  test("cookie banner and menu are not proposed", () => {
    for (const p of proposals) {
      expect(p.rawText).not.toContain("plików cookies");
      expect(p.title).not.toContain("Strona główna");
    }
  });

  test("page title and RSS autodiscovery still work on the listing markup", () => {
    expect(parse.title).toContain("Komunikaty");
    expect(parse.feedUrl).toBe("https://www.michalowice.pl/rss.php?fid=935674466");
  });

  test("a found notice suggests the found_notice check result", () => {
    expect(suggestCheckResult(proposals.length)).toBe("found_notice");
  });
});

test.describe("defensive handling (broken/degenerate input)", () => {
  test("empty HTML string yields zero proposals, not a crash", () => {
    const parse = parsePageHtml("", BASE_URL);
    expect(parse.candidates).toEqual([]);
    expect(buildCheckProposals(parse)).toEqual([]);
  });

  test("whitespace/garbage input yields zero proposals, not a crash", () => {
    for (const html of ["   \n\t  ", "not html at all", "<div><div><div>"]) {
      expect(buildCheckProposals(parsePageHtml(html, BASE_URL))).toEqual([]);
    }
  });

  test("boilerplate-heavy page with no notices yields zero proposals (fixture)", () => {
    const parse = parsePageHtml(loadFixture("michalowice-komunikaty-boilerplate.html"), BASE_URL);
    const proposals = buildCheckProposals(parse);
    expect(proposals).toEqual([]);
    expect(suggestCheckResult(proposals.length)).toBe("no_changes");
  });

  test("cookie-consent paragraph is dropped as boilerplate even when extracted as a block", () => {
    // The boilerplate fixture's cookie <p> is long enough to become a
    // paragraph candidate — the proposal builder must still reject it.
    const parse = parsePageHtml(loadFixture("michalowice-komunikaty-boilerplate.html"), BASE_URL);
    const cookieCandidate = parse.candidates.find((c) => c.text.includes("plików cookies"));
    expect(cookieCandidate).toBeDefined(); // filter is exercised, not bypassed
    expect(buildCheckProposals(parse)).toEqual([]);
  });

  test("news-item shells without title and text are skipped", () => {
    const html = `
      <html><body>
        <div class="news-item div-link"><div><div class="image"><img src="/a.jpg"></div></div></div>
        <div class="news-item div-link"><div><div class="description">
          <div class="date">01.07.2026 08:00</div>
          <div class="h3 title-border"><a href="/x">Jedyny prawdziwy komunikat o utrudnieniach</a></div>
          <div class="description-body">W związku z pracami na sieci energetycznej możliwe są przerwy w dostawie prądu w godzinach popołudniowych.</div>
        </div></div></div>
      </body></html>`;
    const proposals = buildCheckProposals(parsePageHtml(html, BASE_URL));
    expect(proposals.length).toBe(1);
    expect(proposals[0].title).toBe("Jedyny prawdziwy komunikat o utrudnieniach");
  });

  test(`proposal count is capped at ${MAX_CHECK_PROPOSALS} even for a very long listing`, () => {
    const items = Array.from({ length: 15 }, (_, i) =>
      `<div class="news-item div-link"><div><div class="description">
        <div class="date">0${(i % 9) + 1}.07.2026 10:00</div>
        <div class="h3 title-border"><a href="/k${i}">Komunikat numer ${i} o pracach na terenie gminy</a></div>
        <div class="description-body">Dłuższa treść komunikatu numer ${i}, która zdecydowanie przekracza minimalny próg długości i wygląda jak realny wpis urzędu gminy.</div>
      </div></div></div>`
    ).join("\n");
    const proposals = buildCheckProposals(
      parsePageHtml(`<html><body><div class="row">${items}</div></body></html>`, BASE_URL)
    );
    expect(proposals.length).toBe(MAX_CHECK_PROPOSALS);
  });

  test("minimum text length gate holds (constant pinned by name)", () => {
    expect(MIN_PROPOSAL_TEXT_LENGTH).toBe(60);
    const html = `
      <html><body>
        <div class="news-item"><div class="description">
          <div class="h3"><a href="/x">Tytuł jest, treść za krótka</a></div>
          <div class="description-body">Za krótko.</div>
        </div></div>
      </body></html>`;
    expect(buildCheckProposals(parsePageHtml(html, BASE_URL))).toEqual([]);
  });
});

test.describe("regression: generic heading/paragraph pages still parse", () => {
  test("h2+p markup (non-CMS source pages) keeps producing proposals", () => {
    const html = `
      <html><body><main>
        <h2>Przerwa w dostawie wody 24 czerwca 2026</h2>
        <p>W dniu 24 czerwca 2026 r. nastąpi planowana przerwa w dostawie wody
        w związku z pracami konserwacyjnymi na sieci wodociągowej w okolicy.</p>
      </main></body></html>`;
    const proposals = buildCheckProposals(parsePageHtml(html, BASE_URL));
    expect(proposals.length).toBe(1);
    expect(proposals[0].title).toContain("Przerwa w dostawie wody");
    expect(proposals[0].hasDate).toBe(true);
  });
});
