import { test, expect } from "@playwright/test";
import {
  OFFICIAL_SOURCE_CHECKS,
  CHECKLIST_PUBLISH_POLICY,
  FOUND_SOMETHING_STEPS,
  FREQUENCY_LABELS,
  RISK_LABELS,
  PILOT_LOCALITIES,
} from "@/lib/officialSourceChecklist";

/**
 * Unit-style tests for the Sprint 129 Source Checker Dashboard v1 config.
 * The UI lives on /admin/sources (auth-gated — no e2e coverage possible,
 * same situation as alertQuality/testContentDetection), so the source
 * definitions are validated directly. Deliberately NO live fetching:
 * only the shape and href values are tested, never remote content.
 */

const OFFICIAL_DOMAINS = [
  "wkd.com.pl",
  "michalowice.pl",
  "pruszkow.pl",
  "pgedystrybucja.pl",
  "wodociagimichalowice.pl",
  "samorzad.gov.pl",
  // Blok Wykonawczy 2 (Etap E) — 10 HTTP-verified Mazowieckie water
  // utilities, check-only, deliberately outside PILOT_LOCALITIES (see
  // docs/EXEC_BLOCK_2_SOURCE_ACTIVATION_V1.md).
  "ekoraszyn.pl",
  "bpwik.pl",
  "pkn.net.pl",
  "zwik.ozarow-mazowiecki.pl",
  "pwikradzymin.pl",
  "pwklegionowo.com",
  "opwik.com",
  "pwikzabki.pl",
  "hydrosfera-jozefow.pl",
  "pwikzielonka.com.pl",
  // Etap F, Fala 2 (2026-07-30) — 4 more HTTP-verified sources, personally
  // verified by the main agent.
  "pwikminsk.pl",
  "pwikwyszkow.pl",
  "pwikpultusk.pl",
  "zwikndm.pl",
];

// Sprint 129's original 9 sources are all scoped to the 6-locality pilot;
// Blok Wykonawczy 2 added 10 deliberately out-of-pilot, check-only sources
// (localities: [], see officialSourceChecklist.ts's own header comment on
// those entries) — an empty list there is a documented, honest fact, not a
// missing value, so it's tracked separately from the pilot-scoped sources.
const EXPECTED_EMPTY_LOCALITIES_IDS = [
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
  "pwik-minsk-mazowiecki",
  "pwik-wyszkow",
  "pwik-pultusk",
  "zwik-nowy-dwor-mazowiecki",
];

test.describe("OFFICIAL_SOURCE_CHECKS definitions", () => {
  test("every source has a name and what-to-check text", () => {
    for (const source of OFFICIAL_SOURCE_CHECKS) {
      expect(source.name.trim().length, source.id).toBeGreaterThan(0);
      expect(source.whatToCheck.trim().length, source.id).toBeGreaterThan(20);
    }
  });

  test("pilot-scoped sources have at least one real pilot locality; Blok Wykonawczy 2's wave is honestly empty, not a missing value", () => {
    for (const source of OFFICIAL_SOURCE_CHECKS) {
      if (EXPECTED_EMPTY_LOCALITIES_IDS.includes(source.id)) {
        expect(source.localities, source.id).toEqual([]);
        continue;
      }
      expect(source.localities.length, source.id).toBeGreaterThan(0);
      for (const locality of source.localities) {
        expect(PILOT_LOCALITIES).toContain(locality);
      }
    }
  });

  test("ids are unique", () => {
    const ids = OFFICIAL_SOURCE_CHECKS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every official URL is https and points at a known official domain", () => {
    for (const source of OFFICIAL_SOURCE_CHECKS) {
      const url = new URL(source.officialUrl);
      expect(url.protocol, source.id).toBe("https:");
      const host = url.hostname.replace(/^www\./, "");
      expect(OFFICIAL_DOMAINS, `${source.id}: ${host}`).toContain(host);
    }
  });

  test("frequency and risk values all have Polish labels", () => {
    for (const source of OFFICIAL_SOURCE_CHECKS) {
      expect(FREQUENCY_LABELS[source.frequency], source.id).toBeTruthy();
      expect(RISK_LABELS[source.risk], source.id).toBeTruthy();
    }
  });

  test("the known source categories from the sprint brief are all covered", () => {
    const categories = new Set(OFFICIAL_SOURCE_CHECKS.map((s) => s.category));
    for (const required of ["transport", "municipal", "power", "waste", "water", "roads"]) {
      expect(categories, `missing category: ${required}`).toContain(required);
    }
  });

  test("the exact official URLs from the sprint brief are present", () => {
    const urls = OFFICIAL_SOURCE_CHECKS.map((s) => s.officialUrl);
    expect(urls).toContain("https://wkd.com.pl/aktualnosci");
    expect(urls).toContain("https://pgedystrybucja.pl/wylaczenia/planowane-wylaczenia");
    expect(urls).toContain(
      "https://pgedystrybucja.pl/wylaczenia/aktualne-przerwy-w-dostawie-energii"
    );
    expect(urls).toContain(
      "https://www.michalowice.pl/dla-mieszkancow-i-inwestorow/wylaczenia-pradu"
    );
    expect(urls.some((u) => u.includes("pruszkow.pl"))).toBe(true);
  });

  test("PGE planned outages source covers all six pilot localities", () => {
    const pge = OFFICIAL_SOURCE_CHECKS.find((s) => s.id === "pge-planowane");
    expect(pge).toBeDefined();
    expect(pge!.localities).toEqual([...PILOT_LOCALITIES]);
  });
});

test.describe("checklist policy texts (honest manual workflow)", () => {
  test("policy states draft-first, manual publication, and the Facebook rule", () => {
    const policy = CHECKLIST_PUBLISH_POLICY.join(" ");
    expect(policy).toContain("szkicu");
    expect(policy).toContain("ręcznie z Kreatora");
    expect(policy).toContain("Facebook");
  });

  test("policy never claims automation", () => {
    const allText = [
      ...CHECKLIST_PUBLISH_POLICY,
      ...FOUND_SOMETHING_STEPS,
      ...OFFICIAL_SOURCE_CHECKS.map((s) => s.whatToCheck),
    ].join(" ").toLowerCase();
    // Guard against copy drifting into monitoring-like promises.
    expect(allText).not.toContain("automatycznie pobier");
    expect(allText).not.toContain("automatyczna publikacja");
    expect(allText).not.toContain("auto-publish");
  });

  test("found-something flow ends in a draft, not a publication", () => {
    const lastStep = FOUND_SOMETHING_STEPS[FOUND_SOMETHING_STEPS.length - 1];
    expect(lastStep).toContain("draft");
    expect(lastStep).toContain("po weryfikacji");
  });
});
