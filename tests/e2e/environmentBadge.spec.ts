import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";

/**
 * Sprint 165B — structural audit of src/components/EnvironmentBadge.tsx
 * and its wiring into AppHeader. Rendering/visual verification (light/
 * dark/system theme, actual Preview deployment) is manual browser QA —
 * see docs/SPRINT_165B_ISOLATED_PREVIEW_CODE_SAFETY_PACKAGE_V1.md.
 */

const badgeSrc = readFileSync(
  path.join(process.cwd(), "src/components/EnvironmentBadge.tsx"),
  "utf8"
);
const headerSrc = readFileSync(
  path.join(process.cwd(), "src/components/AppHeader.tsx"),
  "utf8"
);

test.describe("EnvironmentBadge.tsx — structural audit", () => {
  test("is a Client Component", () => {
    expect(badgeSrc).toMatch(/^\s*["']use client["']/);
  });

  test("never references a Supabase URL, project ref pattern, or any secret env var name", () => {
    expect(badgeSrc).not.toMatch(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(badgeSrc).not.toMatch(/SUPABASE_ENVIRONMENT_TAG/);
    expect(badgeSrc).not.toMatch(/SUPABASE_SCHEDULED_WRITER/);
    expect(badgeSrc).not.toMatch(/CRON_SECRET/);
    expect(badgeSrc).not.toMatch(/service_role/i);
  });

  test("only renders the four fixed labels sourced from ENVIRONMENT_LABELS — no interpolated raw env value", () => {
    expect(badgeSrc).toMatch(/ENVIRONMENT_LABELS\[identity\]/);
    expect(badgeSrc).not.toMatch(/process\.env/);
  });

  test("has no onClick or fetch — a purely presentational, read-only label, never a control", () => {
    expect(badgeSrc).not.toMatch(/onClick/);
    expect(badgeSrc).not.toMatch(/fetch\(/);
  });

  test("resolves its identity synchronously at render time (no useEffect) — avoids the hydration-mismatch class of bug a post-mount fetch/update would introduce", () => {
    expect(badgeSrc).not.toMatch(/useEffect/);
    expect(badgeSrc).not.toMatch(/useState/);
  });
});

test.describe("AppHeader.tsx — environment badge wiring", () => {
  test("imports EnvironmentBadge", () => {
    expect(headerSrc).toMatch(/import\s*\{\s*EnvironmentBadge\s*\}\s*from ["']@\/components\/EnvironmentBadge["']/);
  });

  test("renders <EnvironmentBadge /> at least twice — once for desktop nav, once for the mobile admin dropdown", () => {
    const occurrences = headerSrc.match(/<EnvironmentBadge\s*\/>/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  test("every <EnvironmentBadge /> usage sits inside a session-gated block, never in the always-rendered public nav", () => {
    // Structural proxy for "public part of the site does not need to show
    // the badge" (Requirement C.6): the component must never appear before
    // the file's first `session &&` gate.
    const firstSessionGate = headerSrc.indexOf("session &&");
    const firstBadgeUsage = headerSrc.indexOf("<EnvironmentBadge");
    expect(firstSessionGate).toBeGreaterThan(-1);
    expect(firstBadgeUsage).toBeGreaterThan(firstSessionGate);
  });
});
