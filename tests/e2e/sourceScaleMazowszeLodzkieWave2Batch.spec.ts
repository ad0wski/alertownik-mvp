import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";
import { validateSourceBatch } from "@/lib/sourceScale/batchOnboardingConfig";
import { MAZOWSZE_LODZKIE_WODOCIAGI_WAVE_2 } from "@/lib/sourceScale/batches/mazowszeLodzkieWodociagiWave2";
import { OFFICIAL_SOURCE_CHECKS, PILOT_LOCALITIES } from "@/lib/officialSourceChecklist";
import { SAFE_CHECK_SOURCE_IDS, getSafeCheckSource } from "@/lib/sourceCheck";
import { DEFAULT_ALLOWED_WRITE_SOURCE_IDS } from "@/lib/scheduledWriter";
import { DEFAULT_AUTO_PUBLISH_SOURCE_IDS } from "@/lib/trustedSourceAutoPublish";
import { parseWordpressRestPosts, type WordpressRestPost } from "@/lib/sourceParsers/pageParser";
import { buildCheckProposals } from "@/lib/sourceCheck";

// Blok Wykonawczy 3 — wave 2 of the Mazowsze/Łódzkie water-utility
// expansion, activated check-only (docs/EXEC_BLOCK_3_SOURCE_DISCOVERY_V1.md).
// Same structure as sourceScaleMazowszeWave1Batch.spec.ts: batch shape,
// parameterized per-source registration proof, writer/auto-publish
// exclusion, static no-write proof, and a fixture-based parser test.

const WAVE_2_IDS = [
  "pwik-minsk-mazowiecki",
  "pwik-wyszkow",
  "pwik-pultusk",
  "wodkan-zgierz",
  "zwik-pabianice",
  "pgkim-aleksandrow-lodzki",
  "rawik-rawa-mazowiecka",
];

test.describe("MAZOWSZE_LODZKIE_WODOCIAGI_WAVE_2 — batch shape", () => {
  test("validates cleanly as a single wordpress_rest batch of 7", () => {
    const result = validateSourceBatch(MAZOWSZE_LODZKIE_WODOCIAGI_WAVE_2);
    expect(result).toEqual({ valid: true, issues: [] });
    expect(MAZOWSZE_LODZKIE_WODOCIAGI_WAVE_2.instances).toHaveLength(7);
  });

  test("every instance's apiUrl is a real wp-json posts endpoint on the instance's own official domain", () => {
    for (const instance of MAZOWSZE_LODZKIE_WODOCIAGI_WAVE_2.instances) {
      if (instance.config.type !== "wordpress_rest") throw new Error("expected wordpress_rest");
      const officialHost = new URL(instance.config.officialUrl).host;
      const apiHost = new URL(instance.config.apiUrl).host;
      expect(apiHost).toBe(officialHost);
      expect(instance.config.apiUrl).toContain("/wp-json/wp/v2/posts");
    }
  });

  test("every instance id is unique (within the wave, and against wave 1 + original sources)", () => {
    const ids = MAZOWSZE_LODZKIE_WODOCIAGI_WAVE_2.instances.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    const allOfficialIds = OFFICIAL_SOURCE_CHECKS.map((s) => s.id);
    expect(new Set(allOfficialIds).size).toBe(allOfficialIds.length);
  });
});

for (const id of WAVE_2_IDS) {
  test.describe(`Source "${id}" — check-only activation`, () => {
    test(`${id}: registered in OFFICIAL_SOURCE_CHECKS with a valid wordpress_rest config`, () => {
      const entry = OFFICIAL_SOURCE_CHECKS.find((s) => s.id === id);
      expect(entry).toBeDefined();
      expect(entry!.category).toBe("water");
      expect(entry!.apiUrl).toContain("/wp-json/wp/v2/posts");
      expect(entry!.officialUrl).toMatch(/^https:\/\//);
    });

    test(`${id}: is on SAFE_CHECK_SOURCE_IDS and resolvable via getSafeCheckSource`, () => {
      expect((SAFE_CHECK_SOURCE_IDS as readonly string[]).includes(id)).toBe(true);
      expect(getSafeCheckSource(id)).not.toBeNull();
    });

    test(`${id}: localities is empty — outside PILOT_LOCALITIES, honestly`, () => {
      const entry = OFFICIAL_SOURCE_CHECKS.find((s) => s.id === id)!;
      expect(entry.localities).toEqual([]);
    });

    test(`${id}: is NOT on the writer allowlist default`, () => {
      expect(DEFAULT_ALLOWED_WRITE_SOURCE_IDS.includes(id)).toBe(false);
    });

    test(`${id}: is NOT on the auto-publish allowlist default`, () => {
      expect(DEFAULT_AUTO_PUBLISH_SOURCE_IDS.includes(id)).toBe(false);
    });
  });
}

test.describe("Writer / auto-publish allowlists — still unchanged defaults after wave 2", () => {
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

test.describe("Check-only path performs no writes (static proof, re-checked for wave 2)", () => {
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

// Fixture modeled on this wave's real, HTTP-verified response shape
// (Blok Wykonawczy 3 discovery — e.g. rawik.pl's real "Awaria wodociągu"
// notices, pgkimal.pl's real "Brak wody!" notices) — text below is
// fictional, per this repo's existing fixture convention.
function post(overrides: Partial<WordpressRestPost>): WordpressRestPost {
  return {
    title: { rendered: "Tytuł testowy" },
    excerpt: { rendered: "<p>Treść testowa.</p>" },
    date: "2026-08-03T08:00:00",
    link: "https://example-wodociagi-2.pl/2026/08/03/test/",
    slug: "test",
    ...overrides,
  };
}

test.describe("parseWordpressRestPosts already handles wave 2's shape unmodified", () => {
  test("an outage notice fixture (modeled on the wave's verified shape) is proposed correctly", () => {
    const posts = [
      post({
        title: { rendered: "Awaria wodociągu — brak wody" },
        excerpt: {
          rendered:
            "<p>W dniu 4 sierpnia 2026 roku wystąpiła awaria sieci wodociągowej. Trwa usuwanie " +
            "awarii, przepraszamy za utrudnienia i prosimy o cierpliwość.</p>",
        },
      }),
    ];
    const parse = parseWordpressRestPosts(posts);
    const proposals = buildCheckProposals(parse);
    expect(proposals.length).toBe(1);
    expect(proposals[0].title).toContain("Awaria wodociągu");
    expect(proposals[0].hasDate).toBe(true);
  });
});
