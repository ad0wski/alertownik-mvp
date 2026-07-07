import { test, expect } from "@playwright/test";

/**
 * Sprint 131 — Candidate Queue UI skeleton smoke tests.
 *
 * The queue itself (/admin/queue) is auth-gated, and no test in this suite
 * logs in (no admin credentials in any Claude Code session — same situation
 * as sourceChecklist/alertQuality). What CAN be verified from the outside:
 *
 *   1. the route exists and is protected (login gate, not a 404),
 *   2. nothing on the public pages leaks a link to the queue.
 *
 * The logged-in content (status cards, empty state, CTA links to
 * /admin/sources, /admin/new-alert and /builder) is covered by manual QA.
 * No test here calls any live external website.
 */

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
