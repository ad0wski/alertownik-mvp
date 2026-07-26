import { test, expect } from "@playwright/test";
import {
  parseWordpressRestPosts,
  isWordpressRestPostArray,
  type WordpressRestPost,
} from "@/lib/sourceParsers/pageParser";
import { buildCheckProposals } from "@/lib/sourceCheck";
import { findSimilarText } from "@/lib/candidateWarnings";

/**
 * Sprint 168 — fixture-based tests for the WordPress REST API extraction
 * pass (wodociagimichalowice.pl). All fixtures below are invented for
 * this test only — modeled on the real, live response shape verified
 * during this sprint's investigation (title.rendered / excerpt.rendered
 * / date / link / slug), but the specific content is fictional.
 */

function post(overrides: Partial<WordpressRestPost>): WordpressRestPost {
  return {
    title: { rendered: "Tytuł testowy" },
    excerpt: { rendered: "<p>Treść testowa.</p>" },
    date: "2026-07-21T09:36:15",
    link: "https://wodociagimichalowice.pl/2026/07/21/test/",
    slug: "test",
    ...overrides,
  };
}

test.describe("isWordpressRestPostArray — shape guard", () => {
  test("accepts an array (even empty)", () => {
    expect(isWordpressRestPostArray([])).toBe(true);
    expect(isWordpressRestPostArray([post({})])).toBe(true);
  });

  test("rejects anything that isn't an array — never guesses at a different shape", () => {
    expect(isWordpressRestPostArray({ posts: [] })).toBe(false);
    expect(isWordpressRestPostArray(null)).toBe(false);
    expect(isWordpressRestPostArray(undefined)).toBe(false);
    expect(isWordpressRestPostArray("not json")).toBe(false);
    expect(isWordpressRestPostArray(42)).toBe(false);
  });
});

test.describe("parseWordpressRestPosts — genuine operational notices are included", () => {
  test("a real outage notice is proposed, with correct title/text/date detection", () => {
    const posts = [
      post({
        title: { rendered: "Przerwa w dostawie wody" },
        excerpt: {
          rendered:
            "<p>Wodociągi Michałowice Sp. z o.o. informują, że w dniu 23 lipca 2026 roku tj. czwartek, " +
            "w godzinach od 9:00 do 14:00 wystąpi przerwa w dostawie wody w miejscowości Komorów " +
            "w rejonie ul. Krakowskiej, z powodu prac na sieci wodociągowej.</p>",
        },
      }),
    ];
    const parse = parseWordpressRestPosts(posts);
    const proposals = buildCheckProposals(parse);
    expect(proposals.length).toBe(1);
    expect(proposals[0].title).toContain("Przerwa w dostawie wody");
    expect(proposals[0].rawText).toContain("Komorów");
    expect(proposals[0].hasDate).toBe(true);
  });

  test("an outage notice with no title (real-world observed case) still proposes using the body", () => {
    const posts = [
      post({
        title: { rendered: "" },
        excerpt: {
          rendered:
            "<p>Wodociągi Michałowice informują o awarii sieci wodociągowej w miejscowości Granica, " +
            "trwa usuwanie awarii.</p>",
        },
      }),
    ];
    const parse = parseWordpressRestPosts(posts);
    expect(parse.candidates.length).toBe(1);
    expect(parse.candidates[0].heading).toBeUndefined();
    expect(parse.candidates[0].text).toContain("awarii");
  });
});

test.describe("parseWordpressRestPosts — generic informational posts are rejected", () => {
  test("a plain PR/educational post with no operational keyword is excluded, not proposed", () => {
    const posts = [
      post({
        title: { rendered: "Woda z kranu — zdrowo, ekologicznie i z korzyścią dla portfela" },
        excerpt: {
          rendered:
            "<p>Picie wody z kranu to najzdrowszy i najbardziej ekologiczny wybór. Sprawdź, dlaczego " +
            "warto zrezygnować z wody butelkowanej na rzecz kranówki.</p>",
        },
      }),
      post({
        title: { rendered: "Nowy cennik i godziny pracy" },
        excerpt: { rendered: "<p>Informujemy o zmianie godzin pracy biura obsługi klienta.</p>" },
      }),
    ];
    const parse = parseWordpressRestPosts(posts);
    expect(parse.candidates.length).toBe(0);
  });

  test("mixed batch: only the genuinely operational post survives", () => {
    const posts = [
      post({
        title: { rendered: "Woda z kranu — zdrowo, ekologicznie" },
        excerpt: { rendered: "<p>Artykuł edukacyjny o piciu wody z kranu.</p>" },
      }),
      post({
        title: { rendered: "Przerwa w dostawie wody" },
        excerpt: {
          rendered:
            "<p>W dniu 6 lipca 2026 roku wystąpi przerwa w dostawie wody w miejscowości Michałowice.</p>",
        },
      }),
    ];
    const parse = parseWordpressRestPosts(posts);
    expect(parse.candidates.length).toBe(1);
    expect(parse.candidates[0].heading).toContain("Przerwa");
  });
});

test.describe("parseWordpressRestPosts — duplicate detection (existing generic mechanism)", () => {
  test("two near-identical outage notices are flagged as similar by the existing dedup heuristic", () => {
    const original = post({
      title: { rendered: "Przerwa w dostawie wody" },
      excerpt: {
        rendered:
          "<p>Wodociągi Michałowice informują, że w dniu 23 lipca 2026 roku wystąpi przerwa w " +
          "dostawie wody w miejscowości Komorów w rejonie ul. Krakowskiej.</p>",
      },
    });
    const nearDuplicate = post({
      title: { rendered: "Przerwa w dostawie wody" },
      excerpt: {
        rendered:
          "<p>Wodociągi Michałowice informują, że w dniu 23 lipca 2026 roku wystąpi przerwa w " +
          "dostawie wody w miejscowości Komorów, ul. Krakowska.</p>",
      },
    });
    const parse = parseWordpressRestPosts([original, nearDuplicate]);
    const [firstText, secondText] = parse.candidates.map((c) => c.text);
    expect(findSimilarText(secondText, [firstText])).not.toBeNull();
  });

  test("two genuinely different outage notices are never flagged as duplicates", () => {
    const a = post({
      title: { rendered: "Przerwa w dostawie wody" },
      excerpt: { rendered: "<p>Przerwa w dostawie wody w Komorowie z powodu prac na sieci.</p>" },
    });
    const b = post({
      title: { rendered: "Awaria sieci wodociągowej" },
      excerpt: { rendered: "<p>Trwa awaria sieci wodociągowej w Regułach, prosimy o cierpliwość.</p>" },
    });
    const parse = parseWordpressRestPosts([a, b]);
    const [firstText, secondText] = parse.candidates.map((c) => c.text);
    expect(findSimilarText(secondText, [firstText])).toBeNull();
  });
});

test.describe("parseWordpressRestPosts — robustness", () => {
  test("a post with no natural-language date phrase in the body → hasDate false, never a crash", () => {
    const posts = [
      post({
        title: { rendered: "Awaria sieci wodociągowej" },
        excerpt: { rendered: "<p>Trwa usuwanie awarii sieci wodociągowej, przepraszamy za utrudnienia.</p>" },
      }),
    ];
    expect(() => parseWordpressRestPosts(posts)).not.toThrow();
    const parse = parseWordpressRestPosts(posts);
    expect(parse.candidates[0].hasDate).toBe(false);
  });

  test("empty posts array → zero candidates, never a crash", () => {
    expect(() => parseWordpressRestPosts([])).not.toThrow();
    const parse = parseWordpressRestPosts([]);
    expect(parse.candidates).toEqual([]);
    expect(parse.rawText).toBe("");
  });

  test("a post missing every optional field entirely → skipped, never a crash", () => {
    expect(() => parseWordpressRestPosts([{}])).not.toThrow();
    const parse = parseWordpressRestPosts([{}]);
    expect(parse.candidates).toEqual([]);
  });

  test("extra/unexpected top-level fields on a post (plugin-added, real-world common) never break extraction", () => {
    const posts = [
      {
        ...post({
          title: { rendered: "Przerwa w dostawie wody" },
          excerpt: { rendered: "<p>Przerwa w dostawie wody w dniu 6 lipca 2026 roku w Regułach.</p>" },
        }),
        // Simulates fields real WordPress plugins commonly add (SEO
        // plugins, related-posts widgets, custom fields) that this
        // codebase never asked for and must never choke on.
        yoast_head: "<html>...</html>",
        _embedded: { author: [{ name: "Redakcja" }] },
        custom_fields: { unrelated: true },
      },
    ];
    expect(() => parseWordpressRestPosts(posts)).not.toThrow();
    const parse = parseWordpressRestPosts(posts);
    expect(parse.candidates.length).toBe(1);
    expect(parse.candidates[0].heading).toContain("Przerwa");
  });

  test("Polish diacritics survive HTML-entity encoding correctly (real-world observed encoding)", () => {
    const posts = [
      post({
        title: { rendered: "Przerwa w dostawie wody &#8211; Michałowice" },
        excerpt: {
          rendered:
            "<p>Wyst&#261;pi przerwa w dostawie wody w miejscowo&#347;ci Micha&#322;owice, " +
            "ul. Zag&#243;rzycka.</p>",
        },
      }),
    ];
    const parse = parseWordpressRestPosts(posts);
    expect(parse.candidates[0].heading).toContain("Michałowice");
    expect(parse.candidates[0].text).toContain("Michałowice");
    expect(parse.candidates[0].text).toContain("Zagórzycka");
  });
});
