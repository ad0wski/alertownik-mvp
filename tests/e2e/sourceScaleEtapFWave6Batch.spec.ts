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

// Etap F, Fala 6 (2026-07-30) — first Lubelskie + Podkarpackie + Podlaskie
// sources. Discovery spanned two sessions (docs/EXEC_ETAP_F_FALA_6_V1.md
// covers both the paused-checkpoint findings and the completed discovery);
// 51 candidates were personally HTTP-verified across the three
// voivodeships and only 2 cleared the GO bar — most municipal WordPress
// feeds tested were either non-WordPress CMSes, general PR/news portals, or
// dominated by tenders/administrative notices. Same wordpress_rest
// mechanics as every prior wave. This file proves: batch shape, correct
// check-only activation, and — the part that must never become false — no
// writer/auto-publish reach, no write path. No network calls in this file.

const FALA6_IDS = ["mzd-rzeszow", "pgk-suwalki"];

test.describe("Fala 6 — batch shape", () => {
  test("both instances registered in OFFICIAL_SOURCE_CHECKS with a valid wordpress_rest config", () => {
    for (const id of FALA6_IDS) {
      const entry = OFFICIAL_SOURCE_CHECKS.find((s) => s.id === id);
      expect(entry, id).toBeDefined();
      expect(entry!.apiUrl, id).toContain("/wp-json/wp/v2/posts");
      expect(entry!.officialUrl, id).toMatch(/^https:\/\//);
    }
  });

  test("categories are diversified — roads and transport, not water", () => {
    const categories = FALA6_IDS.map(
      (id) => OFFICIAL_SOURCE_CHECKS.find((s) => s.id === id)!.category
    );
    expect(categories).toContain("roads");
    expect(categories).toContain("transport");
    expect(categories).not.toContain("water");
  });

  test("every instance's apiUrl is on the instance's own official domain", () => {
    for (const id of FALA6_IDS) {
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

for (const id of FALA6_IDS) {
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

    test(`${id}: is wired to the transport/roads keyword filter, not the water-biased default`, () => {
      expect(REST_PARSERS_BY_SOURCE_ID[id], id).toBe(parseTransportRoadsRestPosts);
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
// (Rzeszów road-investment / Suwałki bus-route notices) — not a
// reproduction of any real site's content, per this repo's existing test
// convention.
function post(overrides: Partial<WordpressRestPost>): WordpressRestPost {
  return {
    title: { rendered: "Tytuł testowy" },
    excerpt: { rendered: "<p>Treść testowa.</p>" },
    date: "2026-07-30T08:00:00",
    link: "https://example-mzd.pl/2026/07/30/test/",
    slug: "test",
    ...overrides,
  };
}

test.describe("parseTransportRoadsRestPosts handles Fala 6's roads/transport shape", () => {
  test("a real-shaped road-disruption fixture is proposed correctly", () => {
    const posts = [
      post({
        title: { rendered: "Utrudnienia w ruchu w związku z budową ronda" },
        excerpt: {
          rendered:
            "<p>W związku z budową ronda na skrzyżowaniu ulic Głównej i Bocznej, od " +
            "1 sierpnia 2026 roku wprowadzona zostanie tymczasowa zmiana organizacji " +
            "ruchu. Prosimy kierowców o zachowanie ostrożności.</p>",
        },
      }),
    ];
    const parse = parseTransportRoadsRestPosts(posts);
    const proposals = buildCheckProposals(parse);
    expect(proposals.length).toBe(1);
    expect(proposals[0].title).toContain("Utrudnienia w ruchu");
    expect(proposals[0].hasDate).toBe(true);
  });
});
