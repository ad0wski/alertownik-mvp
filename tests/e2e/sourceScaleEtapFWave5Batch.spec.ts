import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";
import { OFFICIAL_SOURCE_CHECKS, PILOT_LOCALITIES } from "@/lib/officialSourceChecklist";
import { SAFE_CHECK_SOURCE_IDS, getSafeCheckSource } from "@/lib/sourceCheck";
import { DEFAULT_ALLOWED_WRITE_SOURCE_IDS } from "@/lib/scheduledWriter";
import { DEFAULT_AUTO_PUBLISH_SOURCE_IDS } from "@/lib/trustedSourceAutoPublish";
import {
  parseTransportRoadsRestPosts,
  REST_PARSERS_BY_SOURCE_ID,
  type WordpressRestPost,
} from "@/lib/sourceParsers/pageParser";
import { buildCheckProposals } from "@/lib/sourceCheck";

// Etap F, Fala 5 (2026-07-30) — first Kujawsko-Pomorskie + Pomorskie +
// Zachodniopomorskie sources, 6 HTTP-verified check-only sources (2 water,
// 3 transport, 1 roads — deliberately diversified away from water-only
// after Fala 4's finding that many water-company feeds are tender-
// dominated), each personally double-checked by the main agent, no
// subagent (see CLAUDE.md's post-incident subagent ban). Same
// wordpress_rest mechanics as every prior wave. This file proves: batch
// shape, correct check-only activation, and — the part that must never
// become false — no writer/auto-publish reach, no write path. No network
// calls in this file.

const FALA5_IDS = [
  "mzk-grudziadz",
  "pewik-gdynia",
  "pwik-kwidzyn",
  "zdiz-gdynia",
  "mzk-koszalin",
  "mpk-stargard",
];

test.describe("Fala 5 — batch shape", () => {
  test("all 6 instances registered in OFFICIAL_SOURCE_CHECKS with a valid wordpress_rest config", () => {
    for (const id of FALA5_IDS) {
      const entry = OFFICIAL_SOURCE_CHECKS.find((s) => s.id === id);
      expect(entry, id).toBeDefined();
      expect(entry!.apiUrl, id).toContain("/wp-json/wp/v2/posts");
      expect(entry!.officialUrl, id).toMatch(/^https:\/\//);
    }
  });

  test("categories are diversified — not all water", () => {
    const categories = FALA5_IDS.map(
      (id) => OFFICIAL_SOURCE_CHECKS.find((s) => s.id === id)!.category
    );
    const waterCount = categories.filter((c) => c === "water").length;
    expect(waterCount).toBeLessThanOrEqual(categories.length / 2);
    expect(new Set(categories).size).toBeGreaterThan(1);
  });

  test("every instance's apiUrl is on the instance's own official domain", () => {
    for (const id of FALA5_IDS) {
      const entry = OFFICIAL_SOURCE_CHECKS.find((s) => s.id === id)!;
      const officialHost = new URL(entry.officialUrl).host;
      const apiHost = new URL(entry.apiUrl!).host;
      expect(apiHost, id).toBe(officialHost);
    }
  });

  test("every instance id is unique across the whole checklist", () => {
    const ids = OFFICIAL_SOURCE_CHECKS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

for (const id of FALA5_IDS) {
  test.describe(`Source "${id}" — check-only activation`, () => {
    test(`${id}: is on SAFE_CHECK_SOURCE_IDS and resolvable via getSafeCheckSource`, () => {
      expect((SAFE_CHECK_SOURCE_IDS as readonly string[]).includes(id)).toBe(true);
      expect(getSafeCheckSource(id)).not.toBeNull();
    });

    test(`${id}: localities is empty — outside PILOT_LOCALITIES, honestly`, () => {
      const entry = OFFICIAL_SOURCE_CHECKS.find((s) => s.id === id)!;
      expect(entry.localities).toEqual([]);
      for (const locality of entry.localities) {
        expect((PILOT_LOCALITIES as readonly string[]).includes(locality)).toBe(false);
      }
    });

    test(`${id}: is NOT on the writer allowlist default`, () => {
      expect(DEFAULT_ALLOWED_WRITE_SOURCE_IDS.includes(id)).toBe(false);
    });

    test(`${id}: is NOT on the auto-publish allowlist default`, () => {
      expect(DEFAULT_AUTO_PUBLISH_SOURCE_IDS.includes(id)).toBe(false);
    });
  });
}

test.describe("Writer / auto-publish allowlists — unchanged defaults", () => {
  test("DEFAULT_ALLOWED_WRITE_SOURCE_IDS is still exactly the pre-existing single entry", () => {
    expect(DEFAULT_ALLOWED_WRITE_SOURCE_IDS).toEqual(["michalowice-komunikaty"]);
  });

  test("DEFAULT_AUTO_PUBLISH_SOURCE_IDS is still exactly the pre-existing single entry", () => {
    expect(DEFAULT_AUTO_PUBLISH_SOURCE_IDS).toEqual(["pruszkow-aktualnosci"]);
  });
});

function readSource(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test.describe("Check-only path performs no writes (static proof)", () => {
  test("/api/sources/check route contains no Supabase write call, no candidate/alert creation", () => {
    const routeSrc = readSource("src/app/api/sources/check/route.ts");
    expect(routeSrc).not.toMatch(/\.insert\(/);
    expect(routeSrc).not.toMatch(/\.update\(/);
    expect(routeSrc).not.toMatch(/createSourceCheck\(|createCandidate\(|createAlert\(/);
  });

  test("manualSourceCheckFetch.ts contains no Supabase import and no write call", () => {
    const moduleSrc = readSource("src/lib/manualSourceCheckFetch.ts");
    expect(moduleSrc).not.toMatch(/supabase/i);
    expect(moduleSrc).not.toMatch(/\.insert\(|\.update\(/);
  });
});

// Fictional fixture modeled on this wave's real, HTTP-verified shape
// (Grudziądz/Gdynia/Koszalin/Stargard transport + roads notices) — not a
// reproduction of any real site's content, per this repo's existing test
// convention.
function post(overrides: Partial<WordpressRestPost>): WordpressRestPost {
  return {
    title: { rendered: "Tytuł testowy" },
    excerpt: { rendered: "<p>Treść testowa.</p>" },
    date: "2026-07-30T08:00:00",
    link: "https://example-mzk.pl/2026/07/30/test/",
    slug: "test",
    ...overrides,
  };
}

test.describe("parseTransportRoadsRestPosts handles Fala 5's transport/roads shape", () => {
  test("all four transport/roads sources are wired to the broader keyword filter, not the water-biased default", () => {
    for (const id of ["mzk-grudziadz", "zdiz-gdynia", "mzk-koszalin", "mpk-stargard"]) {
      expect(REST_PARSERS_BY_SOURCE_ID[id], id).toBe(parseTransportRoadsRestPosts);
    }
  });

  test("a real-shaped transport-disruption fixture is proposed correctly", () => {
    const posts = [
      post({
        title: { rendered: "Zmiany w rozkładzie jazdy linii nr 5" },
        excerpt: {
          rendered:
            "<p>W związku z remontem torowiska, od 1 sierpnia 2026 roku linia nr 5 będzie " +
            "kursować objazdem przez ulicę Objazdową. Zmiana potrwa do odwołania. " +
            "Przepraszamy za utrudnienia.</p>",
        },
      }),
    ];
    const parse = parseTransportRoadsRestPosts(posts);
    const proposals = buildCheckProposals(parse);
    expect(proposals.length).toBe(1);
    expect(proposals[0].title).toContain("Zmiany w rozkładzie jazdy");
    expect(proposals[0].hasDate).toBe(true);
  });
});
