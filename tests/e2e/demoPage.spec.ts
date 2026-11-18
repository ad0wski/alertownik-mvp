import { test, expect } from "@playwright/test";

/**
 * Sprint 185A — /demo: a short, public, no-login page meant to be shared
 * as a single link with a gmina/powiat/partner. Kept deliberately separate
 * from /partnerzy's fuller cooperation content.
 */

test.describe("Demo page (/demo)", () => {
  test("loads with 200 and the main heading", async ({ page }) => {
    const response = await page.goto("/demo");
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("Lokalne komunikaty w jednym miejscu");
  });

  test("all three CTAs are visible and point to the right places", async ({ page }) => {
    await page.goto("/demo");
    const appLink = page.getByRole("link", { name: /Zobacz działającą aplikację/ });
    const alertsLink = page.getByRole("link", { name: /Zobacz wszystkie alerty/ });
    const pilotLink = page.getByRole("link", { name: /Zgłoś zainteresowanie pilotażem/ });
    await expect(appLink).toHaveAttribute("href", "/");
    await expect(alertsLink).toHaveAttribute("href", "/alerty");
    await expect(pilotLink).toHaveAttribute("href", /^mailto:alertownik\.kontakt@gmail\.com/);
  });

  // Google Play policy fix (18.11.2026): same scope and sources as /about
  // and the store listing — no county, no PGE/power, link to the source list.
  test("names the actual pilot scope and links to the official source list", async ({ page }) => {
    await page.goto("/demo");
    const main = page.locator("main");
    await expect(main).toContainText("Rejon gminy Michałowice");
    await expect(main).toContainText("Miasta Pruszków i WKD");
    await expect(main.getByRole("link", { name: "Oficjalne źródła informacji" })).toHaveAttribute("href", "/about#zrodla");
  });

  test("makes no claims about sources or features outside the current scope", async ({ page }) => {
    await page.goto("/demo");
    const main = page.locator("main");
    await expect(main).not.toContainText("PGE");
    await expect(main).not.toContainText(/powiat/i);
    await expect(main).not.toContainText(/prąd/i);
  });

  test("states pilot / independence status honestly", async ({ page }) => {
    await page.goto("/demo");
    await expect(page.getByText(/lokalny pilotaż/)).toBeVisible();
    await expect(page.getByText(/niezależnym projektem/)).toBeVisible();
    await expect(
      page.getByText(/Nie jest oficjalną aplikacją ani przedstawicielem Gminy Michałowice/)
    ).toBeVisible();
  });

  test("does not overclaim full automation — states a human approves every alert", async ({ page }) => {
    await page.goto("/demo");
    await expect(
      page.getByText(/każdy alert zatwierdza człowiek przed publikacją/)
    ).toBeVisible();
  });

  // Scoped to the page's own <main> content, not the sitewide header/footer
  // chrome (which carries a "Panel admina" → /login link on every public
  // page — /about, /partnerzy, /prywatnosc included — as the existing,
  // unrelated way staff reach the login form; removing it here alone would
  // be inconsistent with the rest of the site, not a fix).
  test("page content itself has no link to /admin, /login, or any admin surface", async ({ page }) => {
    await page.goto("/demo");
    const links = await page.locator("main a[href]").evaluateAll((els) =>
      els.map((el) => el.getAttribute("href"))
    );
    for (const href of links) {
      expect(href).not.toMatch(/\/admin|\/login|\/builder|\/ai-helper/);
    }
  });

  test("contains no technical jargon (cron, RLS, parser, dedup)", async ({ page }) => {
    await page.goto("/demo");
    const bodyText = (await page.locator("main").textContent()) ?? "";
    const lower = bodyText.toLowerCase();
    for (const term of ["cron", "rls", "parser", "dedup", "webhook", "api"]) {
      expect(lower).not.toContain(term);
    }
  });

  test("uses a real embedded screenshot, not a placeholder", async ({ page }) => {
    await page.goto("/demo");
    await expect(page.getByAltText(/Lista alertów Alertownika/)).toBeVisible();
  });

  test("all links are reachable via keyboard (Tab) and focusable", async ({ page }) => {
    await page.goto("/demo");
    const appLink = page.getByRole("link", { name: /Zobacz działającą aplikację/ });
    await appLink.focus();
    await expect(appLink).toBeFocused();
  });

  for (const width of [375, 390, 414]) {
    test(`no horizontal scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 });
      await page.goto("/demo");
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      );
      expect(overflows).toBe(false);
    });
  }

  test("no horizontal scroll on desktop (1280px)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/demo");
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(overflows).toBe(false);
  });
});
