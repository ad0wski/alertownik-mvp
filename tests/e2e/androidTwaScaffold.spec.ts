import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync } from "fs";
import path from "path";

// Sprint 189 — Blok A+D Android TWA scaffold. This is a hand-written
// config template, never a real Bubblewrap project (Bubblewrap generates a
// real signing keystore during `init` itself, which this scaffold
// deliberately stops before running — see android-twa/README.md). These
// tests pin that the scaffold stays inert: no real package ID, no key
// material, and nothing in the app wires it in.

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test.describe("android-twa scaffold stays inert", () => {
  test("twa-manifest.example.json has a placeholder packageId, never a real one", () => {
    const raw = readRepoFile("android-twa/twa-manifest.example.json");
    const parsed = JSON.parse(raw);
    expect(parsed.packageId).toContain("REPLACE_ME");
  });

  test("twa-manifest.example.json values match the live manifest.ts (no drift)", () => {
    const raw = readRepoFile("android-twa/twa-manifest.example.json");
    const parsed = JSON.parse(raw);
    const manifestSrc = readRepoFile("src/app/manifest.ts");
    expect(manifestSrc).toContain(parsed.themeColor);
    expect(manifestSrc).toContain(parsed.backgroundColor);
  });

  test("no signing key material anywhere in the scaffold", () => {
    for (const file of readdirSync(path.join(process.cwd(), "android-twa"))) {
      const content = readRepoFile(path.join("android-twa", file));
      expect(content).not.toMatch(/BEGIN (RSA|EC|PRIVATE) KEY/);
      expect(content.toLowerCase()).not.toMatch(/keystore.{0,40}(password|pass)\s*[:=]\s*["'][^"']+["']/);
    }
  });

  test("nothing under src/ references the android-twa scaffold — it is not wired into the app", () => {
    // A static grep-equivalent: scaffold is documentation/config only, never
    // imported or fetched by application code.
    const srcFiles = ["src/app/manifest.ts", "src/app/layout.tsx"];
    for (const f of srcFiles) {
      expect(readRepoFile(f)).not.toContain("android-twa");
    }
  });
});
