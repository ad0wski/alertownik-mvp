import { test, expect } from "@playwright/test";
import { validateSourceBatch } from "@/lib/sourceScale/batchOnboardingConfig";
import { MAZOWSZE_WODOCIAGI_WAVE_1 } from "@/lib/sourceScale/batches/mazowszeWodociagiWave1";
import { OFFICIAL_SOURCE_CHECKS, PILOT_LOCALITIES } from "@/lib/officialSourceChecklist";
import { SAFE_CHECK_SOURCE_IDS } from "@/lib/sourceCheck";
import { parseWordpressRestPosts, type WordpressRestPost } from "@/lib/sourceParsers/pageParser";
import { buildCheckProposals } from "@/lib/sourceCheck";

// Blok Wykonawczy 1 (Etap E) — the first real discovered SourceBatch
// (docs/EXEC_BLOCK_1_SOURCE_DISCOVERY_MAZOWIECKIE_V1.md). Two concerns:
// 1) the batch itself is well-formed (shared type, valid configs);
// 2) — most important — it is genuinely NOT wired into anything that would
// fetch, check, or publish on Production. No network calls in this file.

test.describe("MAZOWSZE_WODOCIAGI_WAVE_1 — batch shape", () => {
  test("validates cleanly as a single wordpress_rest batch", () => {
    const result = validateSourceBatch(MAZOWSZE_WODOCIAGI_WAVE_1);
    expect(result).toEqual({ valid: true, issues: [] });
  });

  test("has exactly 7 instances, all category water", () => {
    expect(MAZOWSZE_WODOCIAGI_WAVE_1.instances).toHaveLength(7);
    for (const instance of MAZOWSZE_WODOCIAGI_WAVE_1.instances) {
      expect(instance.category).toBe("water");
    }
  });

  test("every instance's apiUrl is a real wp-json posts endpoint on the instance's own official domain", () => {
    for (const instance of MAZOWSZE_WODOCIAGI_WAVE_1.instances) {
      if (instance.config.type !== "wordpress_rest") throw new Error("expected wordpress_rest");
      const officialHost = new URL(instance.config.officialUrl).host;
      const apiHost = new URL(instance.config.apiUrl).host;
      expect(apiHost).toBe(officialHost);
      expect(instance.config.apiUrl).toContain("/wp-json/wp/v2/posts");
    }
  });

  test("every instance id is unique and kebab-case, matching the existing OfficialSourceCheck.id convention", () => {
    const ids = MAZOWSZE_WODOCIAGI_WAVE_1.instances.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });
});

test.describe("MAZOWSZE_WODOCIAGI_WAVE_1 — not activated anywhere (safety)", () => {
  test("no instance id appears in OFFICIAL_SOURCE_CHECKS", () => {
    const officialIds = new Set(OFFICIAL_SOURCE_CHECKS.map((s) => s.id));
    for (const instance of MAZOWSZE_WODOCIAGI_WAVE_1.instances) {
      expect(officialIds.has(instance.id)).toBe(false);
    }
  });

  test("no instance id appears in SAFE_CHECK_SOURCE_IDS (the manual-check allowlist)", () => {
    for (const instance of MAZOWSZE_WODOCIAGI_WAVE_1.instances) {
      expect((SAFE_CHECK_SOURCE_IDS as readonly string[]).includes(instance.id)).toBe(false);
    }
  });

  test("no batch gmina is one of the 6 existing PILOT_LOCALITIES (this is a new-territory wave, not a duplicate of the pilot)", () => {
    for (const instance of MAZOWSZE_WODOCIAGI_WAVE_1.instances) {
      expect((PILOT_LOCALITIES as readonly string[]).includes(instance.gmina ?? "")).toBe(false);
    }
  });
});

// Sprint 168's fixture convention, reused verbatim: fixtures are invented,
// modeled on the real, HTTP-verified response shape of this wave's sources
// (docs/EXEC_BLOCK_1_SOURCE_DISCOVERY_MAZOWIECKIE_V1.md — e.g. bpwik.pl's
// real "zakaz podlewania" notice, opwik.com's real network-works notice),
// but the specific text below is fictional — proving the existing,
// unmodified parseWordpressRestPosts already handles this wave's shape
// with zero new parser code, without reproducing any real site's content.
function post(overrides: Partial<WordpressRestPost>): WordpressRestPost {
  return {
    title: { rendered: "Tytuł testowy" },
    excerpt: { rendered: "<p>Treść testowa.</p>" },
    date: "2026-08-03T08:00:00",
    link: "https://example-wodociagi.pl/2026/08/03/test/",
    slug: "test",
    ...overrides,
  };
}

test.describe("parseWordpressRestPosts already handles this wave's shape unmodified", () => {
  test("a water-restriction notice fixture (modeled on the wave's verified shape) is proposed correctly", () => {
    const posts = [
      post({
        title: { rendered: "Komunikat — ograniczenie poboru wody" },
        excerpt: {
          rendered:
            "<p>Spółka informuje, że w związku z pracami na sieci w dniu 5 sierpnia 2026 roku " +
            "w godzinach 8:00–16:00 wystąpi ograniczenie dostawy wody w rejonie ulic centralnych. " +
            "Za utrudnienia przepraszamy.</p>",
        },
      }),
    ];
    const parse = parseWordpressRestPosts(posts);
    const proposals = buildCheckProposals(parse);
    expect(proposals.length).toBe(1);
    expect(proposals[0].title).toContain("ograniczenie poboru wody");
    expect(proposals[0].hasDate).toBe(true);
  });
});
