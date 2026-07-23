import { test, expect } from "@playwright/test";
import { buildAlertEmailContent } from "@/lib/alertEmailTemplate";

/**
 * Sprint 166D-1 — email template tests. Pins Polish copy (anti-drift,
 * same convention as sourceHealth.ts/automationStatus.ts) and asserts no
 * secret-shaped string ever appears in the output — this template is only
 * ever fed non-secret fields, and this test guards that invariant staying
 * true as the module evolves.
 */

const BASE_INPUT = {
  sourceName: "WKD — aktualności",
  category: "transient_fetch" as const,
  severity: "warning" as const,
  retry: {
    attemptsMade: 1,
    maxAttemptsPerRun: 2,
    willRetryWithinRun: true,
    nextScheduledRunKnown: false as const,
  },
  adminAction: { required: false, reason: null },
  environmentTag: "preview",
};

test.describe("buildAlertEmailContent", () => {
  test("subject includes environment, category label, and source name", () => {
    const { subject } = buildAlertEmailContent(BASE_INPUT);
    expect(subject).toContain("preview");
    expect(subject).toContain("WKD — aktualności");
    expect(subject).toContain("chwilowy błąd pobierania");
  });

  test("body reports retry state honestly when a same-run retry will happen", () => {
    const { textBody } = buildAlertEmailContent(BASE_INPUT);
    expect(textBody).toContain("Kolejna próba w tym samym uruchomieniu: tak");
    expect(textBody).toContain("próba 2 z 2");
  });

  test("body reports no same-run retry when attempts are exhausted", () => {
    const { textBody } = buildAlertEmailContent({
      ...BASE_INPUT,
      retry: { attemptsMade: 2, maxAttemptsPerRun: 2, willRetryWithinRun: false, nextScheduledRunKnown: false },
    });
    expect(textBody).toContain("Kolejna próba w tym samym uruchomieniu: nie");
  });

  test("body always states no cron schedule exists yet", () => {
    const { textBody } = buildAlertEmailContent(BASE_INPUT);
    expect(textBody).toContain("Brak harmonogramu cron");
  });

  test("body reports admin action required with the correct reason label", () => {
    const { textBody } = buildAlertEmailContent({
      ...BASE_INPUT,
      category: "permanent_fetch",
      severity: "critical",
      adminAction: { required: true, reason: "permanent_failure" },
    });
    expect(textBody).toContain("Wymagana akcja administratora: tak");
    expect(textBody).toContain("trwały błąd wymaga przeglądu źródła");
  });

  test("body reports no admin action required when not needed", () => {
    const { textBody } = buildAlertEmailContent(BASE_INPUT);
    expect(textBody).toContain("Wymagana akcja administratora: nie");
  });

  test("body states plainly that no email was ever sent and no provider is configured", () => {
    const { textBody } = buildAlertEmailContent(BASE_INPUT);
    expect(textBody).toContain("żaden dostawca poczty nie jest podłączony");
    expect(textBody).toContain("nigdy nie została wysłana");
  });

  test("output never contains a secret-shaped token (no long unbroken alphanumeric/base64-like run)", () => {
    const { subject, textBody } = buildAlertEmailContent(BASE_INPUT);
    const combined = `${subject}\n${textBody}`;
    // A crude but effective guard: nothing resembling an API key/token
    // (20+ contiguous alphanumeric/symbol characters with no whitespace).
    expect(combined).not.toMatch(/[A-Za-z0-9_\-]{20,}/);
  });

  test("output never contains an env var name that could imply a credential leak", () => {
    const { subject, textBody } = buildAlertEmailContent(BASE_INPUT);
    const combined = `${subject}\n${textBody}`;
    expect(combined).not.toContain("PASSWORD");
    expect(combined).not.toContain("SECRET");
    expect(combined).not.toContain("CRON_SECRET");
  });
});
