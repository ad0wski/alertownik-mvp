import { test, expect } from "@playwright/test";
import { isOperationalNotificationRuntimeEnabled } from "@/lib/operationalNotificationRuntimeConfig";

/**
 * Sprint 166G-1 — the single flag gating all runtime ledger orchestration.
 * No env var is read here — every case passes an explicit string/undefined.
 */

test.describe("isOperationalNotificationRuntimeEnabled — off by default, exact match only", () => {
  test("undefined (no env var set) → false", () => {
    expect(isOperationalNotificationRuntimeEnabled(undefined)).toBe(false);
  });

  test("empty string → false", () => {
    expect(isOperationalNotificationRuntimeEnabled("")).toBe(false);
  });

  test("any value other than the exact string 'true' → false", () => {
    expect(isOperationalNotificationRuntimeEnabled("TRUE")).toBe(false);
    expect(isOperationalNotificationRuntimeEnabled("1")).toBe(false);
    expect(isOperationalNotificationRuntimeEnabled("false")).toBe(false);
    expect(isOperationalNotificationRuntimeEnabled(" true")).toBe(false);
    expect(isOperationalNotificationRuntimeEnabled("true ")).toBe(false);
  });

  test("exact string 'true' → true", () => {
    expect(isOperationalNotificationRuntimeEnabled("true")).toBe(true);
  });
});
