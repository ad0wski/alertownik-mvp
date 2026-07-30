import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";
import { validateSourceBatch } from "@/lib/sourceScale/batchOnboardingConfig";
import { MAZOWSZE_WODOCIAGI_WAVE_1 } from "@/lib/sourceScale/batches/mazowszeWodociagiWave1";
import { OFFICIAL_SOURCE_CHECKS, PILOT_LOCALITIES } from "@/lib/officialSourceChecklist";
import { SAFE_CHECK_SOURCE_IDS, getSafeCheckSource } from "@/lib/sourceCheck";
import { DEFAULT_ALLOWED_WRITE_SOURCE_IDS } from "@/lib/scheduledWriter";
import { DEFAULT_AUTO_PUBLISH_SOURCE_IDS } from "@/lib/trustedSourceAutoPublish";
import { parseWordpressRestPosts, type WordpressRestPost } from "@/lib/sourceParsers/pageParser";
import { buildCheckProposals } from "@/lib/sourceCheck";

// Blok Wykonawczy 1+2 (Etap E) — the Mazowsze water-utility wave, extended
// from 7 to 10 real, HTTP-verified sources and ACTIVATED check-only in
// Blok Wykonawczy 2 (docs/EXEC_BLOCK_2_SOURCE_ACTIVATION_V1.md). This file
// covers: batch shape, the fact that all 10 are now correctly registered
// as check-only (a change from Block 1's "not activated anywhere" state —
// that assumption is now intentionally false), and — the part that must
// never become false — that none of them reach the writer or auto-publish
// allowlist, and that the check-only code path performs no writes. No
// network calls in this file.

const WAVE_1_IDS = [
  "eko-raszyn",
  "bpwik-brwinow",
  "pkn-nadarzyn",
  "zwik-ozarow-mazowiecki",
  "pwik-radzymin",
  "pwk-legionowo",
  "opwik-otwock",
  "pwik-zabki",
  "hydrosfera-jozefow",
  "pwik-zielonka",
];

test.describe("MAZOWSZE_WODOCIAGI_WAVE_1 — batch shape", () => {
  test("validates cleanly as a single wordpress_rest batch of 10", () => {
    const result = validateSourceBatch(MAZOWSZE_WODOCIAGI_WAVE_1);
    expect(result).toEqual({ valid: true, issues: [] });
    expect(MAZOWSZE_WODOCIAGI_WAVE_1.instances).toHaveLength(10);
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

  test("every instance id is unique and kebab-case", () => {
    const ids = MAZOWSZE_WODOCIAGI_WAVE_1.instances.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });
});

// Parameterized test — one case per source, per Blok Wykonawczy 2 §9
// requirement #2 ("test każdego źródła lub wspólny test parametryzowany").
for (const id of WAVE_1_IDS) {
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

    test(`${id}: localities is empty — outside PILOT_LOCALITIES, honestly, not force-widened`, () => {
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

// Anti-drift, static source checks (same convention as
// writerIdentityAuditPlan.spec.ts) — proves the check-only code path this
// wave uses genuinely performs no write, without needing a live, authed
// request against Production.
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

// Sprint 168's fixture convention, reused verbatim: fixtures are invented,
// modeled on this wave's real, HTTP-verified response shape (Blok
// Wykonawczy 1+2 discovery docs), but the specific text below is
// fictional — proving the existing, unmodified parseWordpressRestPosts
// already handles this wave's shape with zero new parser code.
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
