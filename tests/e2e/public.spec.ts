import { test, expect } from "@playwright/test";

/**
 * Public homepage smoke tests.
 *
 * These tests cover the public-facing UI only. They do not log in, do not create
 * or delete any Supabase data, and do not depend on a specific alert being published.
 * Tests that involve alert cards gracefully skip if no alerts are published.
 */

test.describe("Public homepage", () => {
  test("main heading is visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("Lokalne zmiany");
  });

  test("search input accepts text without crashing", async ({ page }) => {
    await page.goto("/");
    const input = page.getByPlaceholder(/Szukaj po miejscowości/);
    await expect(input).toBeVisible();
    await input.fill("transport");
    await expect(input).toHaveValue("transport");
  });

  test("category filter buttons are present and clickable", async ({ page }) => {
    await page.goto("/");
    const transportBtn = page.getByRole("button", { name: "Transport" });
    await expect(transportBtn).toBeVisible();
    await transportBtn.click();
    // Page should not crash — the button must still be visible after clicking
    await expect(transportBtn).toBeVisible();
  });

  test("alert card expands to show detail labels", async ({ page }) => {
    await page.goto("/");

    // Wait for loading to finish: either the alert counter or the empty-state message appears
    await expect(
      page.getByText(/Wszystkich alertów|Brak aktualnych alertów/)
    ).toBeVisible({ timeout: 15_000 });

    const detailsBtn = page.getByRole("button", { name: /Szczegóły/ }).first();
    if (!(await detailsBtn.isVisible())) {
      // No published alerts in Supabase — nothing to expand
      return;
    }

    await detailsBtn.click();
    await expect(page.getByText("Kiedy")).toBeVisible();
    await expect(page.getByText("Co się zmienia")).toBeVisible();
  });

  test("opening alert detail page does not crash the app", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByText(/Wszystkich alertów|Brak aktualnych alertów/)
    ).toBeVisible({ timeout: 15_000 });

    const openLink = page.getByRole("link", { name: /Otwórz alert/ }).first();
    if (!(await openLink.isVisible())) {
      // No published alerts — nothing to navigate to
      return;
    }

    await openLink.click();
    // Should navigate away from the homepage
    await expect(page).not.toHaveURL("/");
    // Should not show a Next.js or React application error
    await expect(page.locator("body")).not.toContainText("Application error");
  });
});
