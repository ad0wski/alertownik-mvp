import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "fs";
import path from "path";

/**
 * Sprint 153 — contract tests for the root vercel.json cron configuration.
 *
 * This is a feature-branch-only file: it is not merged to main and not
 * deployed to Production as part of Sprint 153A. These tests exist so that
 * whenever it IS eventually merged, CI enforces the exact shape agreed in
 * the Sprint 153 runbook — one cron, once daily, targeting only the
 * Michałowice dry-run wrapper, never the write-candidates or WKD routes.
 */

const VERCEL_JSON_PATH = path.join(process.cwd(), "vercel.json");

test.describe("root vercel.json — cron configuration contract", () => {
  test("vercel.json exists at the repo root", () => {
    expect(existsSync(VERCEL_JSON_PATH)).toBe(true);
  });

  test("is valid JSON with exactly one cron entry", () => {
    const raw = readFileSync(VERCEL_JSON_PATH, "utf8");
    const parsed = JSON.parse(raw);
    expect(Array.isArray(parsed.crons)).toBe(true);
    expect(parsed.crons).toHaveLength(1);
  });

  test("the single cron targets only the Michałowice dry-run wrapper route", () => {
    const parsed = JSON.parse(readFileSync(VERCEL_JSON_PATH, "utf8"));
    const [cron] = parsed.crons;
    expect(cron.path).toBe("/api/cron/check-michalowice");
    expect(cron.path.startsWith("/")).toBe(true);
    expect(cron.path).not.toContain("?");
  });

  test("the cron never targets the write-candidates or WKD-specific routes", () => {
    const raw = readFileSync(VERCEL_JSON_PATH, "utf8");
    expect(raw).not.toContain("write-candidates");
    expect(raw).not.toContain("wkd-aktualnosci");
  });

  test("schedule is once daily (0 5 * * *) — Hobby-plan safe", () => {
    const parsed = JSON.parse(readFileSync(VERCEL_JSON_PATH, "utf8"));
    const [cron] = parsed.crons;
    expect(cron.schedule).toBe("0 5 * * *");
  });

  test("schedule expression cannot run more than once per day (no minute/hour wildcards below day granularity)", () => {
    const parsed = JSON.parse(readFileSync(VERCEL_JSON_PATH, "utf8"));
    const [cron] = parsed.crons;
    const [minute, hour] = cron.schedule.split(" ");
    // A fixed minute AND a fixed hour (neither is "*" or a "*/n" step) is
    // the only shape that resolves to exactly one invocation per day.
    expect(minute).not.toBe("*");
    expect(minute).not.toMatch(/\*\//);
    expect(hour).not.toBe("*");
    expect(hour).not.toMatch(/\*\//);
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
