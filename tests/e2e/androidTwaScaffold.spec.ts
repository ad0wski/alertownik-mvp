import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync } from "fs";
import path from "path";

// Sprint 189 — Blok A+D Android TWA scaffold. This is a hand-written
// config template, never a real Bubblewrap project (Bubblewrap generates a
// real signing keystore during `init` itself, which this scaffold
// deliberately stops before running — see android-twa/README.md). Adam
// decided the real, final packageId (pl.alertownik.app) in a later block
// (2026-07-31) — these tests pin that exact decision and confirm the
// scaffold otherwise stays inert: no key material, no account data, and
// nothing in the app wires it in.

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test.describe("android-twa scaffold stays inert", () => {
  // Adam's explicit, final packageId decision (2026-07-31) — permanent
  // once ever uploaded to Google Play. This pins the exact, canonical
  // value so a future edit can't silently drift to something else
  // (including either of the two options Adam explicitly rejected:
  // io.github.ad0wski.alertownik and com.alertownik.mvp), and confirms
  // it's syntactically a valid Android application ID (lowercase
  // dot-separated segments only — reused later verbatim by `bubblewrap
  // init`, which this scaffold still stops short of running).
  test("twa-manifest.example.json has Adam's decided, canonical packageId", () => {
    const raw = readRepoFile("android-twa/twa-manifest.example.json");
    const parsed = JSON.parse(raw);
    expect(parsed.packageId).toBe("pl.alertownik.app");
    expect(parsed.packageId).not.toBe("io.github.ad0wski.alertownik");
    expect(parsed.packageId).not.toBe("com.alertownik.mvp");
    expect(parsed.packageId).toMatch(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);
  });

  test("twa-manifest.example.json values match the live manifest.ts (no drift)", () => {
    const raw = readRepoFile("android-twa/twa-manifest.example.json");
    const parsed = JSON.parse(raw);
    const manifestSrc = readRepoFile("src/app/manifest.ts");
    expect(manifestSrc).toContain(parsed.themeColor);
    expect(manifestSrc).toContain(parsed.backgroundColor);
    // Blok D (2026-07-31) — extended beyond colors to every field Bubblewrap
    // would otherwise prompt for, so a future manifest.ts edit (new start
    // path, renamed app, different orientation) can't silently drift out of
    // sync with this template without a test failing here first.
    expect(manifestSrc).toContain(`"${parsed.name}"`);
    expect(manifestSrc).toContain(`display: "${parsed.display}"`);
    expect(manifestSrc).toContain(`orientation: "${parsed.orientation}"`);
    expect(manifestSrc).toContain(`start_url: "${parsed.startUrl}"`);
    expect(parsed.host).toBe("alertownik-mvp.vercel.app");
    expect(parsed.webManifestUrl).toBe(`https://${parsed.host}/manifest.webmanifest`);
    expect(parsed.iconUrl).toBe(`https://${parsed.host}/icon-512.png`);
    expect(parsed.maskableIconUrl).toBe(`https://${parsed.host}/icon-maskable-512.png`);
  });

  test("no signing key material anywhere in the scaffold", () => {
    for (const file of readdirSync(path.join(process.cwd(), "android-twa"))) {
      const content = readRepoFile(path.join("android-twa", file));
      expect(content).not.toMatch(/BEGIN (RSA|EC|PRIVATE) KEY/);
      expect(content.toLowerCase()).not.toMatch(/keystore.{0,40}(password|pass)\s*[:=]\s*["'][^"']+["']/);
    }
  });

  test("no real-looking SHA-256 fingerprint anywhere in the scaffold", () => {
    // A real keystore fingerprint (needed for assetlinks.json) is 32
    // colon-separated hex byte pairs, e.g. "14:6D:E9:...". README.md
    // explicitly defers this until a real keystore exists — this pins that
    // no one ever pastes a real or fabricated one in here by mistake.
    const sha256FingerprintPattern = /([0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2}/;
    for (const file of readdirSync(path.join(process.cwd(), "android-twa"))) {
      const content = readRepoFile(path.join("android-twa", file));
      expect(content).not.toMatch(sha256FingerprintPattern);
    }
  });

  test("no email address or account-shaped data anywhere in the scaffold", () => {
    // This scaffold precedes any Google Play Console account — it should
    // never accumulate a developer email, publisher name, or similar
    // account-identifying data ahead of that real decision.
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    for (const file of readdirSync(path.join(process.cwd(), "android-twa"))) {
      const content = readRepoFile(path.join("android-twa", file));
      expect(content).not.toMatch(emailPattern);
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
