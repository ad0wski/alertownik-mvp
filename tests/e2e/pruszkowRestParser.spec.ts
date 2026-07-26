import { test, expect } from "@playwright/test";
import { parsePruszkowRestPosts, type WordpressRestPost } from "@/lib/sourceParsers/pageParser";
import { buildCheckProposals } from "@/lib/sourceCheck";
import { findSimilarText } from "@/lib/candidateWarnings";

/**
 * Sprint 169 — fixture-based tests for the WordPress REST API extraction
 * pass for pruszkow.pl's "Aktualności dla Mieszkańców" category (id 371).
 * Mirrors wordpressRestParser.spec.ts's shape (Sprint 168), but exercises
 * parsePruszkowRestPosts's own, broader keyword filter — this source's
 * live category is a much more mixed general-news feed than Wodociągi's,
 * so the negative cases here matter even more.
 *
 * All fixtures below are invented for this test only — modeled on the real
 * response shape verified live during this sprint's investigation, and on
 * real post *titles* actually observed live (quoted as examples in
 * comments), but the fixture bodies are fictional.
 */

function post(overrides: Partial<WordpressRestPost>): WordpressRestPost {
  return {
    title: { rendered: "Tytuł testowy" },
    excerpt: { rendered: "<p>Treść testowa.</p>" },
    date: "2026-07-23T09:00:00",
    link: "https://www.pruszkow.pl/2026/07/23/test/",
    slug: "test",
    ...overrides,
  };
}

test.describe("parsePruszkowRestPosts — genuine operational notices are included", () => {
  test("a road traffic-organization change is proposed, with correct date detection", () => {
    const posts = [
      post({
        title: { rendered: "Zmiana organizacji ruchu na drodze wojewódzkiej nr 719" },
        excerpt: {
          rendered:
            "<p>Od 28 lipca 2026 roku na drodze wojewódzkiej nr 719 w Pruszkowie wprowadzona " +
            "zostanie tymczasowa zmiana organizacji ruchu związana z pracami budowlanymi.</p>",
        },
      }),
    ];
    const parse = parsePruszkowRestPosts(posts);
    const proposals = buildCheckProposals(parse);
    expect(proposals.length).toBe(1);
    expect(proposals[0].title).toContain("Zmiana organizacji ruchu");
    expect(proposals[0].hasDate).toBe(true);
  });

  test("a heat/hot-water interruption notice is proposed", () => {
    const posts = [
      post({
        title: { rendered: "Przerwa w dostawie energii cieplnej i ciepłej wody" },
        excerpt: {
          rendered:
            "<p>W dniu 25 lipca 2026 roku w godzinach 8:00-16:00 wystąpi przerwa w dostawie " +
            "energii cieplnej i ciepłej wody w rejonie ulic Kraszewskiego i Sienkiewicza.</p>",
        },
      }),
    ];
    const parse = parsePruszkowRestPosts(posts);
    expect(parse.candidates.length).toBe(1);
    expect(parse.candidates[0].text).toContain("ciepłej wody");
  });

  test("a road-closure/detour notice (transit line diversion) is proposed", () => {
    const posts = [
      post({
        title: { rendered: "Linia nr 3 — objazd ul. Bohaterów Wolności od 20 lipca 2026 r." },
        excerpt: {
          rendered:
            "<p>Od 20 lipca 2026 roku autobusy linii nr 3 pojadą objazdem przez ul. Kraszewskiego " +
            "z powodu remontu nawierzchni na ul. Bohaterów Wolności.</p>",
        },
      }),
    ];
    const parse = parsePruszkowRestPosts(posts);
    expect(parse.candidates.length).toBe(1);
  });

  test("an alarm-siren test announcement is proposed", () => {
    const posts = [
      post({
        title: { rendered: "Głośne testy syren alarmowych w dniu 16 lipca 2026 r." },
        excerpt: {
          rendered:
            "<p>W dniu 16 lipca 2026 roku w godzinach porannych odbędą się głośne testy syren " +
            "alarmowych na terenie miasta Pruszków w ramach ćwiczeń obrony cywilnej.</p>",
        },
      }),
    ];
    const parse = parsePruszkowRestPosts(posts);
    expect(parse.candidates.length).toBe(1);
  });
});

test.describe("parsePruszkowRestPosts — general municipal PR/event content is rejected", () => {
  test("a weekly events digest ('Co? Gdzie? Kiedy?') is excluded", () => {
    const posts = [
      post({
        title: { rendered: "Co? Gdzie? Kiedy? Przegląd wydarzeń w Pruszkowie w dniach 24–30 lipca" },
        excerpt: {
          rendered:
            "<p>Zapraszamy na cotygodniowy przegląd wydarzeń kulturalnych i sportowych " +
            "w Pruszkowie — koncerty, wystawy i zajęcia dla mieszkańców.</p>",
        },
      }),
    ];
    expect(parsePruszkowRestPosts(posts).candidates.length).toBe(0);
  });

  test("a lost-pet appeal is excluded", () => {
    const posts = [
      post({
        title: { rendered: "Kręciołek szuka jedynego domu i człowieka, któremu zaufa" },
        excerpt: {
          rendered:
            "<p>Schronisko dla zwierząt w Pruszkowie poszukuje domu dla psa o imieniu Kręciołek, " +
            "przyjaznego i towarzyskiego pupila.</p>",
        },
      }),
    ];
    expect(parsePruszkowRestPosts(posts).candidates.length).toBe(0);
  });

  test("a subsidy-program announcement ('Czyste Powietrze') is excluded — not an operational disruption", () => {
    const posts = [
      post({
        title: { rendered: "Od 20 lipca 2026 r. zmiany w programie „Czyste Powietrze”" },
        excerpt: {
          rendered:
            "<p>Informujemy o zmianach zasad dofinansowania w rządowym programie Czyste " +
            "Powietrze dla mieszkańców planujących wymianę pieca.</p>",
        },
      }),
    ];
    expect(parsePruszkowRestPosts(posts).candidates.length).toBe(0);
  });

  test("a cultural exhibition announcement is excluded", () => {
    const posts = [
      post({
        title: { rendered: "Terenowa wystawa głazów narzutowych w mieście" },
        excerpt: {
          rendered:
            "<p>Zapraszamy na plenerową wystawę poświęconą geologii regionu, dostępną " +
            "całodobowo w centrum miasta przez cały sierpień.</p>",
        },
      }),
    ];
    expect(parsePruszkowRestPosts(posts).candidates.length).toBe(0);
  });

  test("mixed batch: only the genuinely operational post survives", () => {
    const posts = [
      post({
        title: { rendered: "Warsztaty dla rodzin i bliskich osób z doświadczeniem kryzysu psychicznego" },
        excerpt: { rendered: "<p>Zapraszamy na bezpłatne warsztaty wsparcia psychologicznego.</p>" },
      }),
      post({
        title: { rendered: "Remont chodnika przy wiadukcie na ul. Poznańskiej" },
        excerpt: {
          rendered:
            "<p>Od 22 lipca 2026 roku rozpoczyna się remont chodnika przy wiadukcie na " +
            "ul. Poznańskiej w Pruszkowie, możliwe utrudnienia dla pieszych.</p>",
        },
      }),
    ];
    const parse = parsePruszkowRestPosts(posts);
    expect(parse.candidates.length).toBe(1);
    expect(parse.candidates[0].heading).toContain("Remont chodnika");
  });
});

test.describe("parsePruszkowRestPosts — duplicate detection (existing generic mechanism)", () => {
  test("two near-identical road-utrudnienie notices are flagged as similar", () => {
    const original = post({
      title: { rendered: "Utrudnienia w ruchu na ul. Bryły" },
      excerpt: {
        rendered:
          "<p>W dniach 23-29 lipca 2026 roku na ul. Bryły w Pruszkowie wystąpią utrudnienia " +
          "w ruchu związane z budową zatok postojowych.</p>",
      },
    });
    const nearDuplicate = post({
      title: { rendered: "Utrudnienia w ruchu na ul. Bryły" },
      excerpt: {
        rendered:
          "<p>W dniach 23-29 lipca 2026 roku na ul. Bryły w Pruszkowie wystąpią utrudnienia " +
          "w ruchu związane z budową zatoczek postojowych.</p>",
      },
    });
    const parse = parsePruszkowRestPosts([original, nearDuplicate]);
    const [firstText, secondText] = parse.candidates.map((c) => c.text);
    expect(findSimilarText(secondText, [firstText])).not.toBeNull();
  });
});

test.describe("parsePruszkowRestPosts — robustness", () => {
  test("a post with no detectable date phrase → hasDate false, never a crash", () => {
    const posts = [
      post({
        title: { rendered: "Awaria sieci ciepłowniczej" },
        excerpt: { rendered: "<p>Trwa usuwanie awarii sieci ciepłowniczej, przepraszamy za utrudnienia.</p>" },
      }),
    ];
    expect(() => parsePruszkowRestPosts(posts)).not.toThrow();
    expect(parsePruszkowRestPosts(posts).candidates[0].hasDate).toBe(false);
  });

  test("empty posts array → zero candidates, never a crash", () => {
    expect(() => parsePruszkowRestPosts([])).not.toThrow();
    const parse = parsePruszkowRestPosts([]);
    expect(parse.candidates).toEqual([]);
    expect(parse.rawText).toBe("");
  });

  test("a post missing every optional field entirely → skipped, never a crash", () => {
    expect(() => parsePruszkowRestPosts([{}])).not.toThrow();
    expect(parsePruszkowRestPosts([{}]).candidates).toEqual([]);
  });

  test("extra/unexpected top-level fields on a post never break extraction", () => {
    const posts = [
      {
        ...post({
          title: { rendered: "Remont chodnika przy wiadukcie" },
          excerpt: { rendered: "<p>Remont chodnika przy wiadukcie rozpocznie się 22 lipca 2026 roku.</p>" },
        }),
        yoast_head: "<html>...</html>",
        _embedded: { author: [{ name: "Redakcja" }] },
      },
    ];
    expect(() => parsePruszkowRestPosts(posts)).not.toThrow();
    expect(parsePruszkowRestPosts(posts).candidates.length).toBe(1);
  });

  test("result title identifies the Pruszków source distinctly from Wodociągi's", () => {
    const parse = parsePruszkowRestPosts([]);
    expect(parse.title).toBe("Miasto Pruszków — Aktualności dla Mieszkańców");
  });
});
