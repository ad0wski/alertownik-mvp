import { test, expect } from "@playwright/test";
import { buildFeedbackMailto, buildAlertReportMailto, FEEDBACK_QUESTIONS } from "@/lib/feedbackMailto";

/**
 * Unit-style tests for the Sprint 93 feedback-mailto helpers — pure
 * string builders, no browser/Supabase dependency. The actual mailto
 * links (about page, alert detail, footer) are exercised by existing
 * public.spec.ts tests; these confirm the URL-building logic itself.
 */

test.describe("buildFeedbackMailto", () => {
  test("targets the feedback email with the opinion subject", () => {
    const href = buildFeedbackMailto();
    expect(href).toContain("mailto:ak.jurkowski@gmail.com");
    expect(href).toContain(encodeURIComponent("Alertownik — opinia o pilotażu"));
  });

  test("includes every suggested question in the encoded body", () => {
    const href = buildFeedbackMailto();
    const bodyParam = new URL(href.replace("mailto:", "http://x/")).searchParams.get("body") ?? "";
    for (const q of FEEDBACK_QUESTIONS) {
      expect(bodyParam).toContain(q);
    }
  });
});

test.describe("buildAlertReportMailto", () => {
  test("includes the alert title in the subject, not the general question list", () => {
    const href = buildAlertReportMailto("Brak wody w Granicy");
    expect(href).toContain(encodeURIComponent("Alertownik — zgłoszenie: Brak wody w Granicy"));
    const bodyParam = new URL(href.replace("mailto:", "http://x/")).searchParams.get("body") ?? "";
    expect(bodyParam).toContain("nieaktualne albo błędne");
    expect(bodyParam).not.toContain(FEEDBACK_QUESTIONS[0]);
  });
});
