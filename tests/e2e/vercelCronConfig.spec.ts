import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "fs";
import path from "path";

/**
 * Sprint 153 — contract tests for the root vercel.json cron configuration.
 * Sprint 180A extended this contract to a second cron entry, the first
 * write-capable one (`/api/cron/write-candidates`). Both entries stay
 * Hobby-plan-safe (daily granularity, no sub-day wildcards). The
 * write-candidates entry deliberately carries NO query string — Vercel's
 * documented `crons[].path` spec never covers query-string behavior, so
 * (matching the existing check-michalowice wrapper's own reasoning) source
 * scoping for the cron-triggered write path is enforced entirely
 * server-side via SCHEDULED_WRITER_ALLOWED_SOURCE_IDS, never via an
 * undocumented `?sourceKey=` on the cron path itself.
 */

const VERCEL_JSON_PATH = path.join(process.cwd(), "vercel.json");

function isDailySafe(schedule: string): boolean {
  const [minute, hour] = schedule.split(" ");
  return minute !== "*" && !/\*\//.test(minute) && hour !== "*" && !/\*\//.test(hour);
}

test.describe("root vercel.json — cron configuration contract", () => {
  test("vercel.json exists at the repo root", () => {
    expect(existsSync(VERCEL_JSON_PATH)).toBe(true);
  });

  test("is valid JSON with exactly two cron entries", () => {
    const raw = readFileSync(VERCEL_JSON_PATH, "utf8");
    const parsed = JSON.parse(raw);
    expect(Array.isArray(parsed.crons)).toBe(true);
    expect(parsed.crons).toHaveLength(2);
  });

  test("the first cron targets only the Michałowice dry-run wrapper route", () => {
    const parsed = JSON.parse(readFileSync(VERCEL_JSON_PATH, "utf8"));
    const cron = parsed.crons.find((c: { path: string }) => c.path === "/api/cron/check-michalowice");
    expect(cron).toBeDefined();
    expect(cron.path.startsWith("/")).toBe(true);
    expect(cron.path).not.toContain("?");
  });

  test("Michałowice dry-run cron is daily (0 5 * * *) — Hobby-plan safe", () => {
    const parsed = JSON.parse(readFileSync(VERCEL_JSON_PATH, "utf8"));
    const cron = parsed.crons.find((c: { path: string }) => c.path === "/api/cron/check-michalowice");
    expect(cron.schedule).toBe("0 5 * * *");
  });

  test("the second cron targets only the write-candidates route, with no query string", () => {
    const parsed = JSON.parse(readFileSync(VERCEL_JSON_PATH, "utf8"));
    const cron = parsed.crons.find((c: { path: string }) => c.path === "/api/cron/write-candidates");
    expect(cron).toBeDefined();
    expect(cron.path).toBe("/api/cron/write-candidates");
    expect(cron.path).not.toContain("?");
  });

  test("write-candidates cron is daily (30 5 * * *) — Hobby-plan safe, offset from the dry-run cron", () => {
    const parsed = JSON.parse(readFileSync(VERCEL_JSON_PATH, "utf8"));
    const cron = parsed.crons.find((c: { path: string }) => c.path === "/api/cron/write-candidates");
    expect(cron.schedule).toBe("30 5 * * *");
    expect(cron.schedule).not.toBe(
      parsed.crons.find((c: { path: string }) => c.path === "/api/cron/check-michalowice").schedule
    );
  });

  test("no cron schedule can run more than once per day (no minute/hour wildcards below day granularity)", () => {
    const parsed = JSON.parse(readFileSync(VERCEL_JSON_PATH, "utf8"));
    for (const cron of parsed.crons as { schedule: string }[]) {
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
    const parsed = JSON.parse(readFileSync(VERCEL_JSON_PATH, "utf8"));
    expect(Object.keys(parsed).sort()).toEqual(["$schema", "crons"]);
  });
});
