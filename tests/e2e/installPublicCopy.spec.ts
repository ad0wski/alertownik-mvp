import { test, expect } from "@playwright/test";

// LR-8A — /instalacja must stay true for a public visitor both before and
// after any app-store release: no tester language, no store claims.

test("installation page has public, store-neutral copy", async ({ page }) => {
  await page.goto("/instalacja");
  await expect(page.getByRole("heading", { name: "Zainstaluj Alertownik" })).toBeVisible();
  const text = await page.locator("main").innerText();
  for (const banned of ["Test wczesnej wersji", "Google Play", "App Store", "Wyślij opinię", "5 minut", "tester"]) {
    expect(text, banned).not.toContain(banned);
  }
  await expect(page.getByRole("heading", { name: "Android / Chrome" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "iPhone / Safari" })).toBeVisible();
  await expect(page.getByText("iOS 16.4 lub nowszym")).toBeVisible();
  await expect(page.getByRole("link", { name: "Napisz do nas" })).toHaveAttribute("href", /^mailto:/);
});
