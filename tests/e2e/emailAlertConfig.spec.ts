import { test, expect } from "@playwright/test";
import {
  isEmailAlertsEnabled,
  buildEmailAlertConfigStatus,
  EMAIL_ALERT_PROVIDER_NONE,
  EMAIL_ALERT_PROVIDER_RESEND,
} from "@/lib/emailAlertConfig";

/**
 * Sprint 166E-1 — pure config-status builder tests. No env var is read
 * here (mirrors buildAutomationStatus's own test convention) — every case
 * passes explicit booleans.
 */

test.describe("isEmailAlertsEnabled", () => {
  test("exact 'true' string enables", () => {
    expect(isEmailAlertsEnabled("true")).toBe(true);
  });

  test("undefined, empty, or any other value never enables", () => {
    expect(isEmailAlertsEnabled(undefined)).toBe(false);
    expect(isEmailAlertsEnabled("")).toBe(false);
    expect(isEmailAlertsEnabled("false")).toBe(false);
    expect(isEmailAlertsEnabled("1")).toBe(false);
    expect(isEmailAlertsEnabled("TRUE")).toBe(false);
    expect(isEmailAlertsEnabled(" true")).toBe(false);
  });
});

test.describe("buildEmailAlertConfigStatus", () => {
  test("disabled → provider none, configComplete irrelevant to enabled flag", () => {
    const status = buildEmailAlertConfigStatus({
      enabled: false,
      apiKeyConfigured: true,
      fromConfigured: true,
      toConfigured: true,
    });
    expect(status.enabled).toBe(false);
    expect(status.provider).toBe(EMAIL_ALERT_PROVIDER_NONE);
    expect(status.configComplete).toBe(true);
  });

  test("enabled + all three configured → provider resend, configComplete true", () => {
    const status = buildEmailAlertConfigStatus({
      enabled: true,
      apiKeyConfigured: true,
      fromConfigured: true,
      toConfigured: true,
    });
    expect(status.enabled).toBe(true);
    expect(status.provider).toBe(EMAIL_ALERT_PROVIDER_RESEND);
    expect(status.configComplete).toBe(true);
  });

  test("enabled but missing API key → configComplete false", () => {
    const status = buildEmailAlertConfigStatus({
      enabled: true,
      apiKeyConfigured: false,
      fromConfigured: true,
      toConfigured: true,
    });
    expect(status.configComplete).toBe(false);
  });

  test("enabled but missing sender → configComplete false", () => {
    const status = buildEmailAlertConfigStatus({
      enabled: true,
      apiKeyConfigured: true,
      fromConfigured: false,
      toConfigured: true,
    });
    expect(status.configComplete).toBe(false);
  });

  test("enabled but missing recipient → configComplete false", () => {
    const status = buildEmailAlertConfigStatus({
      enabled: true,
      apiKeyConfigured: true,
      fromConfigured: true,
      toConfigured: false,
    });
    expect(status.configComplete).toBe(false);
  });

  test("no field in the output could ever carry a secret value — only booleans and a closed-set provider string", () => {
    const status = buildEmailAlertConfigStatus({
      enabled: true,
      apiKeyConfigured: true,
      fromConfigured: true,
      toConfigured: true,
    });
    for (const [key, value] of Object.entries(status)) {
      if (key === "provider") {
        expect([EMAIL_ALERT_PROVIDER_NONE, EMAIL_ALERT_PROVIDER_RESEND]).toContain(value);
      } else {
        expect(typeof value).toBe("boolean");
      }
    }
  });
});
