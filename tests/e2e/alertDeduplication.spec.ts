import { test, expect } from "@playwright/test";
import { buildAlertFingerprint, isWithinCooldown, DEFAULT_ALERT_COOLDOWN_MS } from "@/lib/alertDeduplication";

/**
 * Sprint 166D-1 — deduplication/cooldown tests. Pure functions, injectable
 * clock (matching the existing isRunLockHeld testing pattern in
 * scheduledWriterRunSafety.spec.ts).
 */

test.describe("buildAlertFingerprint", () => {
  test("same inputs produce the same fingerprint", () => {
    const a = buildAlertFingerprint("wkd-aktualnosci", "transient_fetch", "preview");
    const b = buildAlertFingerprint("wkd-aktualnosci", "transient_fetch", "preview");
    expect(a).toBe(b);
  });

  test("different sourceKey produces a different fingerprint", () => {
    const a = buildAlertFingerprint("wkd-aktualnosci", "transient_fetch", "preview");
    const b = buildAlertFingerprint("michalowice-komunikaty", "transient_fetch", "preview");
    expect(a).not.toBe(b);
  });

  test("different category produces a different fingerprint", () => {
    const a = buildAlertFingerprint("wkd-aktualnosci", "transient_fetch", "preview");
    const b = buildAlertFingerprint("wkd-aktualnosci", "permanent_fetch", "preview");
    expect(a).not.toBe(b);
  });

  test("different environmentTag produces a different fingerprint", () => {
    const a = buildAlertFingerprint("wkd-aktualnosci", "transient_fetch", "preview");
    const b = buildAlertFingerprint("wkd-aktualnosci", "transient_fetch", "production");
    expect(a).not.toBe(b);
  });
});

test.describe("isWithinCooldown", () => {
  test("null lastAlertSentAt never suppresses (first alert ever)", () => {
    expect(isWithinCooldown(null)).toBe(false);
  });

  test("just under the cooldown window is still suppressed", () => {
    const now = new Date("2026-07-23T12:00:00.000Z");
    const lastSent = new Date(now.getTime() - (DEFAULT_ALERT_COOLDOWN_MS - 1)).toISOString();
    expect(isWithinCooldown(lastSent, now)).toBe(true);
  });

  test("exactly at the cooldown boundary is no longer suppressed", () => {
    const now = new Date("2026-07-23T12:00:00.000Z");
    const lastSent = new Date(now.getTime() - DEFAULT_ALERT_COOLDOWN_MS).toISOString();
    expect(isWithinCooldown(lastSent, now)).toBe(false);
  });

  test("well past the cooldown window is not suppressed", () => {
    const now = new Date("2026-07-23T12:00:00.000Z");
    const lastSent = new Date(now.getTime() - DEFAULT_ALERT_COOLDOWN_MS * 2).toISOString();
    expect(isWithinCooldown(lastSent, now)).toBe(false);
  });

  test("a custom cooldown window is respected", () => {
    const now = new Date("2026-07-23T12:00:00.000Z");
    const oneHourMs = 60 * 60 * 1000;
    const lastSent = new Date(now.getTime() - oneHourMs / 2).toISOString();
    expect(isWithinCooldown(lastSent, now, oneHourMs)).toBe(true);
    expect(isWithinCooldown(lastSent, now, oneHourMs / 4)).toBe(false);
  });

  test("an invalid lastAlertSentAt string never crashes and never suppresses", () => {
    expect(isWithinCooldown("not-a-real-date", new Date())).toBe(false);
  });
});
