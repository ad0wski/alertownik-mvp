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
import { classifyProposalAgainstExisting, type DedupComparisonItem } from "@/lib/scheduledWriter";
import { isDirectSafePermalink } from "@/lib/trustedSourceAutoPublish";

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

// P0-2H.1 — the news-item title link's own href is now captured as the
// notice's direct permalink (previously always discarded, so every
// Michałowice candidate's candidate_url was null, structurally blocking
// auto-publish eligibility regardless of freshness). These fixtures use
// inline HTML rather than the shared michalowice-komunikaty.html fixture
// above, since that fixture's hrefs point at a different example domain
// (gmina-testowa.example) than BASE_URL — correct for testing "unrelated
// pre-existing fixture still parses", but not suitable for testing a
// same-origin permalink, which needs a href matching BASE_URL's own host.
test.describe("P0-2H.1 — Michałowice notice permalink extraction", () => {
  function newsItemHtml(titleHref: string, title = "Komunikat testowy o pracach na terenie gminy"): string {
    return `
      <html><body><div class="row"><div class="news-item div-link">
        <div><div class="description">
          <div class="date">05.11.2026 10:00</div>
          <div class="h3 title-border">${
            titleHref ? `<a href="${titleHref}">${title}</a>` : title
          }</div>
          <div class="description-body">Treść komunikatu testowego, wystarczająco długa, aby przejść przez filtr minimalnej długości.</div>
        </div></div>
      </div></div></body></html>`;
  }

  test("a direct absolute permalink on the official domain is captured as candidate_url", () => {
    const url = "https://www.michalowice.pl/dzieje-sie/zaproszenia/kulturalne/koncert-slawy-przybylskiej-odwolany,p1266210672";
    const proposals = buildCheckProposals(parsePageHtml(newsItemHtml(url), BASE_URL));
    expect(proposals).toHaveLength(1);
    expect(proposals[0].url).toBe(url);
    // Normal candidate generation (title/text) is unaffected by the url change.
    expect(proposals[0].title).toBe("Komunikat testowy o pracach na terenie gminy");
  });

  test("a relative permalink is normalized to an absolute official URL", () => {
    const proposals = buildCheckProposals(
      parsePageHtml(newsItemHtml("/dzieje-sie/aktualnosci/komunikaty/rok-2026/brak-wody-reguly,p1077989952"), BASE_URL)
    );
    expect(proposals[0].url).toBe(
      "https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty/rok-2026/brak-wody-reguly,p1077989952"
    );
  });

  test("a missing href (no link around the title at all) yields candidate_url null", () => {
    const proposals = buildCheckProposals(parsePageHtml(newsItemHtml(""), BASE_URL));
    expect(proposals[0].url).toBeUndefined();
  });

  test("an external domain href is rejected, never saved as candidate_url", () => {
    const proposals = buildCheckProposals(
      parsePageHtml(newsItemHtml("https://not-michalowice.example/komunikat"), BASE_URL)
    );
    expect(proposals[0].url).toBeUndefined();
  });

  test("a /wp-json/ href is rejected, even on the official domain", () => {
    const proposals = buildCheckProposals(
      parsePageHtml(newsItemHtml("https://www.michalowice.pl/wp-json/wp/v2/posts/1"), BASE_URL)
    );
    expect(proposals[0].url).toBeUndefined();
  });

  test("a href pointing back at the listing page itself is rejected, not treated as a direct permalink", () => {
    const proposals = buildCheckProposals(parsePageHtml(newsItemHtml(BASE_URL), BASE_URL));
    expect(proposals[0].url).toBeUndefined();
  });

  test("a malformed href never crashes parsing — falls back to candidate_url null", () => {
    // A plain relative-looking string like "not a url at all" is NOT a
    // genuine WHATWG URL-constructor failure case — it resolves cleanly
    // as a (percent-encoded) relative path against BASE_URL, which is
    // correct, safe behavior, not a crash to guard against. A string
    // that actually throws in `new URL(href, base)` is an unterminated
    // IPv6-bracket host (confirmed via a direct Node check before writing
    // this test) — this is the real "malformed" case this test exists
    // to cover.
    const proposals = buildCheckProposals(parsePageHtml(newsItemHtml("http://[not-a-valid-host"), BASE_URL));
    expect(proposals[0].url).toBeUndefined();
  });

  test("a bare '#' anchor href is rejected (same-page anchor, not a real notice link)", () => {
    const proposals = buildCheckProposals(parsePageHtml(newsItemHtml("#"), BASE_URL));
    expect(proposals[0].url).toBeUndefined();
  });

  test("dedup still blocks re-detecting the same notice, now that it carries a url", () => {
    const url = "https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty/rok-2026/przyklad,p1";
    const proposals = buildCheckProposals(parsePageHtml(newsItemHtml(url), BASE_URL));
    const existing: DedupComparisonItem[] = [{ text: proposals[0].rawText, url }];
    // Same exact-URL dedup classifier writeCandidatesForSource already
    // uses — not a reimplementation.
    expect(classifyProposalAgainstExisting({ text: proposals[0].rawText, url: proposals[0].url }, existing)).toBe(
      "duplicate"
    );
  });

  test("a captured Michałowice permalink passes isDirectSafePermalink — the same gate auto-publish eligibility checks", () => {
    const url = "https://www.michalowice.pl/dzieje-sie/zaproszenia/kulturalne/koncert-slawy-przybylskiej-odwolany,p1266210672";
    const proposals = buildCheckProposals(parsePageHtml(newsItemHtml(url), BASE_URL));
    expect(isDirectSafePermalink(proposals[0].url)).toBe(true);
  });

  test("a rejected (missing) permalink correctly fails isDirectSafePermalink too — fail-closed all the way to auto-publish", () => {
    const proposals = buildCheckProposals(parsePageHtml(newsItemHtml(""), BASE_URL));
    expect(isDirectSafePermalink(proposals[0].url)).toBe(false);
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
