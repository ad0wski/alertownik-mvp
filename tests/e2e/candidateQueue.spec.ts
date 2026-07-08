import { test, expect } from "@playwright/test";
import {
  isMissingTableError,
  rowToCandidate,
} from "@/lib/supabaseCandidateWrites";
import { CANDIDATE_STATUS_LABELS } from "@/lib/candidateStatusLabels";
import type { CandidateStatus } from "@/types/sourceCandidate";

/**
 * Sprint 131 — Candidate Queue UI skeleton smoke tests.
 * Sprint 133 — unit-style tests for candidate persistence now that the
 * source_notice_candidates table exists in production (migration run
 * manually by Adam, 2026-07-08): table detection, v2 row mapping, status
 * labels. These call pure functions directly — no browser, no Supabase
 * connection, no live external site.
 *
 * The queue itself (/admin/queue) is auth-gated, and no test in this suite
 * logs in (no admin credentials in any Claude Code session — same situation
 * as sourceChecklist/alertQuality). What CAN be verified from the outside:
 *
 *   1. the route exists and is protected (login gate, not a 404),
 *   2. nothing on the public pages leaks a link to the queue.
 *
 * The logged-in content (status cards, empty state, CTA links to
 * /admin/sources, /admin/new-alert and /builder) is covered by manual QA —
 * see the Obsidian note "Candidate Persistence Smoke Test".
 * No test here calls any live external website.
 */

test.describe("isMissingTableError (missing-table / stale-cache detection)", () => {
  test("recognizes the Postgres and PostgREST missing-table codes", () => {
    expect(isMissingTableError({ code: "42P01" })).toBe(true);
    expect(isMissingTableError({ code: "PGRST205" })).toBe(true);
  });

  test("recognizes missing-table messages without a code", () => {
    expect(
      isMissingTableError({ message: 'relation "source_notice_candidates" does not exist' })
    ).toBe(true);
    expect(
      isMissingTableError({
        message: "Could not find the table 'public.source_notice_candidates' in the schema cache",
      })
    ).toBe(true);
  });

  test("does NOT flag other errors — real failures must surface, not hide behind the banner", () => {
    expect(isMissingTableError(null)).toBe(false);
    expect(isMissingTableError({ code: "23502", message: "null value in column violates not-null constraint" })).toBe(false);
    expect(isMissingTableError({ message: "JWT expired" })).toBe(false);
  });
});

test.describe("rowToCandidate (v2 column mapping)", () => {
  const baseRow = {
    id: "abc-123",
    source_id: "src-1",
    source_name: "WKD — aktualności",
    source_url: "https://example.test/aktualnosci",
    title: "Zmiana rozkładu",
    detected_at: "2026-07-08T10:00:00Z",
    status: "pending",
    created_at: "2026-07-08T10:00:00Z",
    updated_at: "2026-07-08T10:00:00Z",
  };

  test("maps required columns and keeps the v2 status verbatim", () => {
    const c = rowToCandidate(baseRow);
    expect(c.id).toBe("abc-123");
    expect(c.sourceUrl).toBe("https://example.test/aktualnosci");
    expect(c.status).toBe("pending");
    expect(c.convertedAlertId).toBeNull();
    expect(c.riskLevel).toBeNull();
  });

  test("maps v2 verification fields when present", () => {
    const c = rowToCandidate({
      ...baseRow,
      status: "converted_to_draft",
      confidence_score: 0.8,
      risk_level: "low",
      verification_status: "human_verified",
      converted_alert_id: "alert-9",
    });
    expect(c.status).toBe("converted_to_draft");
    expect(c.confidenceScore).toBe(0.8);
    expect(c.riskLevel).toBe("low");
    expect(c.verificationStatus).toBe("human_verified");
    expect(c.convertedAlertId).toBe("alert-9");
  });

  test("confidence_score of 0 survives the mapping (number check, not truthiness)", () => {
    expect(rowToCandidate({ ...baseRow, confidence_score: 0 }).confidenceScore).toBe(0);
  });
});

test.describe("candidate status labels (v2 enum)", () => {
  const ALL_STATUSES: CandidateStatus[] = [
    "pending", "needs_review", "approved", "rejected",
    "converted_to_draft", "published", "archived",
  ];

  test("every v2 status has a non-empty Polish label", () => {
    for (const s of ALL_STATUSES) {
      expect(CANDIDATE_STATUS_LABELS[s], `label for ${s}`).toBeTruthy();
    }
    expect(Object.keys(CANDIDATE_STATUS_LABELS).sort()).toEqual([...ALL_STATUSES].sort());
  });

  test("no label suggests automatic publication", () => {
    for (const s of ALL_STATUSES) {
      expect(CANDIDATE_STATUS_LABELS[s].toLowerCase()).not.toContain("automatycz");
      expect(CANDIDATE_STATUS_LABELS[s].toLowerCase()).not.toContain("autopublish");
    }
  });
});

test.describe("Candidate queue (/admin/queue)", () => {
  test("route exists and shows the login gate to unauthenticated visitors", async ({ page }) => {
    const response = await page.goto("/admin/queue");
    // The page must render (client-side auth gate), never 404.
    expect(response?.status()).toBeLessThan(400);
    await expect(
      page.getByRole("link", { name: /Przejdź do logowania/ })
    ).toBeVisible({ timeout: 15_000 });
    // None of the queue's admin content may render while logged out.
    await expect(page.getByText("Kandydaci na alerty")).toHaveCount(0);
    await expect(page.getByText("Utwórz draft ze źródła")).toHaveCount(0);
  });

  test("public homepage has no links into the candidate queue", async ({ page }) => {
    await page.goto("/");
    // Wait for the client-side session check to settle before asserting.
    await expect(
      page.getByText(/Wszystkich alertów|Brak aktualnych alertów/)
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('a[href="/admin/queue"]')).toHaveCount(0);
    await expect(page.locator('a[href^="/admin/queue?"]')).toHaveCount(0);
  });

  test("public odpady page has no links into the candidate queue", async ({ page }) => {
    await page.goto("/odpady");
    await expect(page.getByText("Nadchodzące terminy")).toBeVisible();
    await expect(page.locator('a[href="/admin/queue"]')).toHaveCount(0);
  });
});
