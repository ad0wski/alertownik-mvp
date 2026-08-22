import { test, expect } from "@playwright/test";

/**
 * Sprint 163 — mobile app shell, "Dzisiaj" view, bottom navigation, /alerty,
 * /wiecej, and native share. AlertList's own search/filter/preferences
 * behavior is NOT retested here — that coverage moved with the component to
 * /alerty inside tests/e2e/public.spec.ts (same tests, same assertions,
 * new URL). This file covers what's genuinely new in Sprint 163.
 */

const MOBILE_WIDTHS = [375, 390, 414];

test.describe("Bottom navigation — visibility", () => {
  test("visible on a public mobile page (/alerty)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/alerty");
    // /alerty may be the first-ever hit to this route for the whole test
    // run (only this file and public.spec.ts, which sorts after it
    // alphabetically, visit it) — the dev server compiles routes on
    // demand, and CSS/JS assets for a never-before-compiled route can
    // still be in flight when goto() resolves. Waiting for network idle
    // here mirrors what a real first-time visitor's browser does before
    // the fixed nav's sm:hidden breakpoint styling is guaranteed applied.
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("navigation", { name: "Nawigacja główna" })).toBeVisible();
  });

  test("hidden on desktop (sm and up), even on a public page", async ({ page }) => {
    // Default project viewport is Desktop Chrome — no explicit resize.
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Nawigacja główna" })).toBeHidden();
  });

  test("hidden on /login", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");
    await expect(page.getByRole("navigation", { name: "Nawigacja główna" })).toHaveCount(0);
  });

  test("hidden on /admin (public app-shell must never leak onto the admin surface)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin");
    await expect(page.getByRole("navigation", { name: "Nawigacja główna" })).toHaveCount(0);
  });
});

test.describe("Bottom navigation — active tab", () => {
  const cases: { path: string; active: string }[] = [
    { path: "/", active: "Dzisiaj" },
    { path: "/alerty", active: "Alerty" },
    { path: "/odpady", active: "Odpady" },
    { path: "/wiecej", active: "Więcej" },
  ];

  for (const { path, active } of cases) {
    test(`${path} marks "${active}" as the active tab via aria-current`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(path);
      const nav = page.getByRole("navigation", { name: "Nawigacja główna" });
      await expect(nav.getByRole("link", { name: active, exact: true })).toHaveAttribute(
        "aria-current",
        "page"
      );
      for (const other of cases.map((c) => c.active).filter((l) => l !== active)) {
        await expect(nav.getByRole("link", { name: other, exact: true })).not.toHaveAttribute(
          "aria-current",
          "page"
        );
      }
    });
  }

  test("an alert detail page marks 'Alerty' as active, not 'Dzisiaj'", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/alerts/nieistniejacy-slug-sprint-163-nav-test");
    const nav = page.getByRole("navigation", { name: "Nawigacja główna" });
    await expect(nav.getByRole("link", { name: "Alerty", exact: true })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });
});

test.describe("Bottom navigation — layout and touch targets", () => {
  for (const width of MOBILE_WIDTHS) {
    test(`no horizontal scroll at ${width}px on / and /alerty`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      for (const path of ["/", "/alerty"]) {
        await page.goto(path);
        const overflows = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
        );
        expect(overflows, `${path} at ${width}px`).toBe(false);
      }
    });
  }

  test("each of the four tabs is at least 44px tall", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/alerty");
    const nav = page.getByRole("navigation", { name: "Nawigacja główna" });
    for (const label of ["Dzisiaj", "Alerty", "Odpady", "Więcej"]) {
      const box = await nav.getByRole("link", { name: label, exact: true }).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("bottom nav does not cover the last piece of page content (spacer reserves room)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/wiecej");
    const nav = page.getByRole("navigation", { name: "Nawigacja główna" });
    const navBox = await nav.boundingBox();
    // "Panel admina" was removed from the public /wiecej menu for security
    // reasons (d09ebe5, fix(security): remove public admin panel links) —
    // "Kontakt / feedback" is now the last row.
    const lastRow = page.getByRole("link", { name: /Kontakt \/ feedback/ });
    await lastRow.scrollIntoViewIfNeeded();
    const rowBox = await lastRow.boundingBox();
    expect(navBox).not.toBeNull();
    expect(rowBox).not.toBeNull();
    // The last row's bottom edge must not be hidden underneath the fixed nav.
    expect(rowBox!.y + rowBox!.height).toBeLessThanOrEqual(navBox!.y + 1);
  });

  test("bottom nav reserves safe-area-inset-bottom space (standalone/notched-device compatibility)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/alerty");
    const navClass = await page.getByRole("navigation", { name: "Nawigacja główna" }).getAttribute("class");
    expect(navClass).toContain("safe-area-inset-bottom");
  });
});

test.describe("'Dzisiaj' view (/)", () => {
  test("renders the Dzisiaj heading, not the old full-list hero", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("Dzisiaj");
  });

  test("shows an area chip that links to the full list to change it", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Wszystkie okolice")).toBeVisible();
    await expect(page.getByRole("link", { name: /Wszystkie okolice/ })).toHaveAttribute("href", "/alerty");
  });

  test("shows either the most important active alert or the calm 'no urgent alerts' state", async ({
    page,
  }) => {
    await page.goto("/");
    const calm = page.getByText("Brak pilnych alertów w tej chwili.");
    const anyCard = page.locator("main article").first();
    await expect(calm.or(anyCard)).toBeVisible({ timeout: 15_000 });
  });

  test("shows the next-collection card", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Najbliższy odbiór")).toBeVisible({ timeout: 10_000 });
  });

  test("has a 'Zobacz wszystkie alerty' link to /alerty", async ({ page }) => {
    await page.goto("/");
    const link = page.getByRole("link", { name: /Zobacz wszystkie alerty/ });
    await expect(link).toBeVisible({ timeout: 15_000 });
    await expect(link).toHaveAttribute("href", "/alerty");
  });

  test("keeps the compact pilot status card", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Status pilotażu")).toBeVisible();
  });

  test("does not render the full-list search box or category filters (moved to /alerty)", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByPlaceholder(/Szukaj po tytule lub treści/)).toHaveCount(0);
  });
});

test.describe("Full alert list (/alerty)", () => {
  test("renders the original hero, search, and category filters", async ({ page }) => {
    await page.goto("/alerty");
    await expect(page.locator("h1")).toContainText("Lokalne alerty");
    await expect(page.getByPlaceholder(/Szukaj po tytule lub treści/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Wszystkie alerty" })).toBeVisible();
  });

  test("renders the full alert count / empty state, same as the old homepage did", async ({ page }) => {
    await page.goto("/alerty");
    await expect(
      page.getByText(/Wszystkich alertów|Brak aktualnych alertów/)
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("'Więcej' page (/wiecej)", () => {
  test("lists all required destinations", async ({ page }) => {
    await page.goto("/wiecej");
    // Scoped to <main>: the sitewide footer (desktop viewport, this test's
    // default) repeats several of these same labels (e.g. "Ustawienia",
    // "Panel admina") in its own link row — this test is about /wiecej's
    // own rows, not a sitewide-uniqueness check.
    const main = page.locator("main");
    for (const label of [
      "Ustawienia",
      "Zainstaluj Alertownik",
      "O projekcie",
      "Zasady",
      "Prywatność",
      "Współpraca",
      "Kontakt / feedback",
    ]) {
      await expect(main.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test("every row is at least 44px tall", async ({ page }) => {
    await page.goto("/wiecej");
    const rows = page.locator("main a");
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const box = await rows.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("Ustawienia row links to /ustawienia", async ({ page }) => {
    await page.goto("/wiecej");
    await page.getByRole("link", { name: /Ustawienia/ }).first().click();
    await expect(page).toHaveURL(/\/ustawienia$/);
  });
});

test.describe("Native share on the alert detail page", () => {
  test("uses navigator.share when available", async ({ page }) => {
    await page.addInitScript(() => {
      window.navigator.share = async () => Promise.resolve();
    });
    await page.goto("/alerts/zmiana-trasy-wkd-linia-w1");
    const button = page.getByRole("button", { name: "Udostępnij" });
    await expect(button).toBeVisible();
    await button.click();
    await expect(page.getByText("Udostępniono.")).toBeVisible();
  });

  test("falls back to copying the link when navigator.share is unavailable", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.addInitScript(() => {
      // @ts-expect-error test-only removal to force the fallback path
      delete window.navigator.share;
    });
    await page.goto("/alerts/zmiana-trasy-wkd-linia-w1");
    const button = page.getByRole("button", { name: "Skopiuj link" });
    await expect(button).toBeVisible();
    await button.click();
    await expect(page.getByText("Link skopiowany do schowka.")).toBeVisible();
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain("/alerts/zmiana-trasy-wkd-linia-w1");
  });
});

test.describe("Theme compatibility for the new app-shell surfaces", () => {
  test("bottom nav and /wiecej render correctly in dark mode with no console errors", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/wiecej");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.getByRole("navigation", { name: "Nawigacja główna" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("'Dzisiaj' view renders correctly in dark mode with no hydration error", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const hydrationErrors = consoleErrors.filter((t) => /hydrat/i.test(t));
    expect(hydrationErrors).toEqual([]);
  });
});
