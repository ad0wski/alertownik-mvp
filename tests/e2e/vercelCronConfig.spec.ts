import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "fs";
import path from "path";

/**
 * Sprint 153 — contract tests for the root vercel.json cron configuration.
 * Sprint 180A extended this contract to a second cron entry, the first
 * write-capable one (`/api/cron/write-candidates`). Sprint 180C adds a
 * third: `/api/cron/auto-publish-trusted-source`. All three entries stay
 * Hobby-plan-safe (daily granularity, no sub-day wildcards) and carry NO
 * query string — Vercel's documented `crons[].path` spec never covers
 * query-string behavior, so (matching check-michalowice's own reasoning)
 * source/behavior scoping for every cron-triggered route is enforced
 * entirely server-side via env vars, never via an undocumented
 * `?sourceKey=` on the cron path itself.
 */

const VERCEL_JSON_PATH = path.join(process.cwd(), "vercel.json");
const KNOWN_CRON_PATHS = [
  "/api/cron/check-michalowice",
  "/api/cron/write-candidates",
  "/api/cron/auto-publish-trusted-source",
] as const;

function isDailySafe(schedule: string): boolean {
  const [minute, hour] = schedule.split(" ");
  return minute !== "*" && !/\*\//.test(minute) && hour !== "*" && !/\*\//.test(hour);
}

function readConfig(): { $schema: string; crons: Array<{ path: string; schedule: string }> } {
  return JSON.parse(readFileSync(VERCEL_JSON_PATH, "utf8"));
}

test.describe("root vercel.json — cron configuration contract", () => {
  test("vercel.json exists at the repo root", () => {
    expect(existsSync(VERCEL_JSON_PATH)).toBe(true);
  });

  test("is valid JSON with exactly three cron entries", () => {
    const parsed = readConfig();
    expect(Array.isArray(parsed.crons)).toBe(true);
    expect(parsed.crons).toHaveLength(3);
  });

  test("every cron entry targets one of the three known, reviewed routes, with no query string", () => {
    const parsed = readConfig();
    for (const cron of parsed.crons) {
      expect(cron.path.startsWith("/")).toBe(true);
      expect(cron.path).not.toContain("?");
      expect(KNOWN_CRON_PATHS as readonly string[]).toContain(cron.path);
    }
  });

  test("Michałowice dry-run cron is daily (0 5 * * *) — Hobby-plan safe", () => {
    const parsed = readConfig();
    const cron = parsed.crons.find((c) => c.path === "/api/cron/check-michalowice");
    expect(cron?.schedule).toBe("0 5 * * *");
  });

  test("write-candidates cron is daily (30 5 * * *) — Hobby-plan safe, offset from the dry-run cron", () => {
    const parsed = readConfig();
    const cron = parsed.crons.find((c) => c.path === "/api/cron/write-candidates");
    expect(cron?.schedule).toBe("30 5 * * *");
  });

  test("auto-publish-trusted-source cron is daily (45 5 * * *) — Hobby-plan safe, after write-candidates", () => {
    const parsed = readConfig();
    const cron = parsed.crons.find((c) => c.path === "/api/cron/auto-publish-trusted-source");
    expect(cron?.schedule).toBe("45 5 * * *");
  });

  test("all three schedules are distinct", () => {
    const parsed = readConfig();
    const schedules = parsed.crons.map((c) => c.schedule);
    expect(new Set(schedules).size).toBe(schedules.length);
  });

  test("no cron schedule can run more than once per day (no minute/hour wildcards below day granularity)", () => {
    const parsed = readConfig();
    for (const cron of parsed.crons) {
      expect(isDailySafe(cron.schedule)).toBe(true);
    }
  });

  test("the WKD-specific route is never targeted by any cron", () => {
    const raw = readFileSync(VERCEL_JSON_PATH, "utf8");
    expect(raw).not.toContain("wkd-aktualnosci");
  });

  test("contains no secret-shaped values and no hardcoded Production URL", () => {
    const raw = readFileSync(VERCEL_JSON_PATH, "utf8");
    expect(raw).not.toMatch(/CRON_SECRET\s*[:=]\s*['"a-zA-Z0-9]/);
    expect(raw).not.toContain("alertownik-mvp.vercel.app");
    expect(raw).not.toContain("env");
  });

  test("only the expected top-level keys are present ($schema, crons)", () => {
    const parsed = readConfig();
    expect(Object.keys(parsed).sort()).toEqual(["$schema", "crons"]);
  });
});
