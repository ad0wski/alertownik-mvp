import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { join } from "path";
import { OFFICIAL_SOURCE_CHECKS } from "@/lib/officialSourceChecklist";
import { SAFE_CHECK_SOURCE_IDS, getSafeCheckSource } from "@/lib/sourceCheck";
import { resolveCronSources } from "@/lib/cronCheckSources";
import { REST_PARSERS_BY_SOURCE_ID } from "@/lib/sourceParsers/pageParser";
import { getAllowedWriteSourceIds, getRegistrySourceId, DEFAULT_ALLOWED_WRITE_SOURCE_IDS } from "@/lib/scheduledWriter";
import { getAutoPublishSourceIds, DEFAULT_AUTO_PUBLISH_SOURCE_IDS } from "@/lib/trustedSourceAutoPublish";

/**
 * LR-3A regression guard — WRONG MUNICIPALITY.
 *
 * `wodociagi-michalowice` (wodociagimichalowice.pl) is the water utility of
 * Gmina Michałowice in Małopolska (32-091, near Kraków). Alertownik's pilot
 * is Gmina Michałowice near Warsaw (05-816, powiat pruszkowski). The two
 * share a name and nothing else. From Sprint 168 until LR-3 (2026-11-11)
 * the Małopolska site was configured as the pilot's water source, claiming
 * coverage of Komorów / Nowa Wieś / Granica / Michałowice / Reguły — it was
 * caught one step before Production activation.
 *
 * Deliberately a simple, literal guard for this one known mistake — not a
 * general geolocation check.
 */

const WRONG_SOURCE_ID = "wodociagi-michalowice";
const WRONG_DOMAIN = "wodociagimichalowice.pl";

function withEnv(vars: Record<string, string>, fn: () => void) {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    previous[key] = process.env[key];
    process.env[key] = vars[key];
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(vars)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test.describe("wrong-municipality water source stays out of the pilot", () => {
  test("is not in the runtime source set (checklist, safe-check allowlist, cron resolution, parser map)", () => {
    expect(OFFICIAL_SOURCE_CHECKS.map((s) => s.id)).not.toContain(WRONG_SOURCE_ID);
    expect(SAFE_CHECK_SOURCE_IDS as readonly string[]).not.toContain(WRONG_SOURCE_ID);
    expect(getSafeCheckSource(WRONG_SOURCE_ID)).toBeNull();
    expect(resolveCronSources(WRONG_SOURCE_ID)).toEqual([]);
    expect(resolveCronSources().map((s) => s.id)).not.toContain(WRONG_SOURCE_ID);
    expect(Object.keys(REST_PARSERS_BY_SOURCE_ID)).not.toContain(WRONG_SOURCE_ID);
  });

  test("no configured source points at the wrong domain — so it can never be described as covering Komorów/Reguły/Nowa Wieś/Granica", () => {
    for (const source of OFFICIAL_SOURCE_CHECKS) {
      expect(source.officialUrl).not.toContain(WRONG_DOMAIN);
      expect(source.apiUrl ?? "").not.toContain(WRONG_DOMAIN);
    }
  });

  test("the admin source-suggestion list and the checklist config do not offer the wrong domain", () => {
    const root = join(__dirname, "..", "..");
    const adminPage = readFileSync(join(root, "src", "app", "admin", "sources", "page.tsx"), "utf-8");
    expect(adminPage).not.toContain(WRONG_DOMAIN);
    expect(adminPage).not.toContain(WRONG_SOURCE_ID);
  });

  test("cannot enter the writer allowlist — even when the env var explicitly names it", () => {
    expect(DEFAULT_ALLOWED_WRITE_SOURCE_IDS).not.toContain(WRONG_SOURCE_ID);
    withEnv(
      { SCHEDULED_WRITER_ALLOWED_SOURCE_IDS: JSON.stringify(["michalowice-komunikaty", WRONG_SOURCE_ID]) },
      () => {
        expect(getAllowedWriteSourceIds()).toEqual(["michalowice-komunikaty"]);
      }
    );
    withEnv({ SCHEDULED_WRITER_ALLOWED_SOURCE_IDS: JSON.stringify([WRONG_SOURCE_ID]) }, () => {
      expect(getAllowedWriteSourceIds()).not.toContain(WRONG_SOURCE_ID);
    });
  });

  test("cannot enter auto-publish selection — even when the env var explicitly names it", () => {
    expect(DEFAULT_AUTO_PUBLISH_SOURCE_IDS).not.toContain(WRONG_SOURCE_ID);
    withEnv({ SCHEDULED_AUTO_PUBLISH_SOURCE_IDS: JSON.stringify([WRONG_SOURCE_ID]) }, () => {
      expect(getAutoPublishSourceIds()).toEqual([]);
    });
    withEnv(
      { SCHEDULED_AUTO_PUBLISH_SOURCE_IDS: JSON.stringify(["michalowice-komunikaty", WRONG_SOURCE_ID]) },
      () => {
        expect(getAutoPublishSourceIds()).toEqual(["michalowice-komunikaty"]);
      }
    );
  });

  test("the Production-shaped registry mapping (Michałowice only) resolves no registry id for it", () => {
    withEnv(
      { SCHEDULED_WRITER_SOURCE_REGISTRY_IDS: JSON.stringify({ "michalowice-komunikaty": "00000000-0000-0000-0000-000000000001" }) },
      () => {
        expect(getRegistrySourceId(WRONG_SOURCE_ID)).toBeNull();
      }
    );
  });
});
