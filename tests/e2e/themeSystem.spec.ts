import { test, expect } from "@playwright/test";

/**
 * Sprint 162 — light / dark / system theme.
 *
 * Covers: default system behavior, all three manual choices, persistence,
 * manual-over-system precedence, live system-change reaction, no hydration
 * error, no flash-of-wrong-theme (bootstrap runs before paint), invalid
 * localStorage recovery, theme-color metadata, dark rendering on public /
 * alert-detail / admin surfaces, and no horizontal scroll at common mobile
 * widths. Runs against `next dev` (no service worker involved — theme
 * resolution has no dependency on it).
 */

const STORAGE_KEY = "alertownik-theme-preference";

async function htmlHasDarkClass(page: import("@playwright/test").Page) {
  return page.evaluate(() => document.documentElement.classList.contains("dark"));
}

test.describe("Theme — default system behavior", () => {
  test("no stored preference + system light → light (no .dark class)", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    expect(await htmlHasDarkClass(page)).toBe(false);
    expect(await page.evaluate(() => localStorage.getItem("alertownik-theme-preference"))).toBeNull();
  });

  test("no stored preference + system dark → dark (.dark class present)", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    expect(await htmlHasDarkClass(page)).toBe(true);
  });
});

test.describe("Theme — manual selection", () => {
  test("manual light persists and applies regardless of system", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.addInitScript(
      ([key]) => localStorage.setItem(key, "light"),
      [STORAGE_KEY]
    );
    await page.goto("/ustawienia");
    expect(await htmlHasDarkClass(page)).toBe(false);
    expect(
      await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
    ).toBe("light");
  });

  test("manual dark persists and applies regardless of system", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.addInitScript(
      ([key]) => localStorage.setItem(key, "dark"),
      [STORAGE_KEY]
    );
    await page.goto("/ustawienia");
    expect(await htmlHasDarkClass(page)).toBe(true);
  });

  test("manual system explicitly stored behaves like system", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.addInitScript(
      ([key]) => localStorage.setItem(key, "system"),
      [STORAGE_KEY]
    );
    await page.goto("/ustawienia");
    expect(await htmlHasDarkClass(page)).toBe(true);
  });

  test("clicking Ciemny in the toggle sets dark and persists after reload", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/ustawienia");
    expect(await htmlHasDarkClass(page)).toBe(false);

    await page.getByRole("radio", { name: "Ciemny" }).click();
    // A click's setPreference() call triggers a React state update and an
    // effect that applies the .dark class asynchronously — the same
    // settle-time the file's own matchMedia-change tests already account
    // for with expect.poll() below; reading the DOM synchronously right
    // after .click() races that effect under load.
    await expect.poll(() => htmlHasDarkClass(page)).toBe(true);
    expect(
      await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
    ).toBe("dark");

    await page.reload();
    expect(await htmlHasDarkClass(page)).toBe(true);
    await expect(page.getByRole("radio", { name: "Ciemny" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  test("clicking Jasny overrides a dark system preference", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/ustawienia");
    expect(await htmlHasDarkClass(page)).toBe(true);

    await page.getByRole("radio", { name: "Jasny" }).click();
    await expect.poll(() => htmlHasDarkClass(page)).toBe(false);
  });

  test("clicking Systemowy after a manual choice reverts to following the OS", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.addInitScript(
      ([key]) => localStorage.setItem(key, "light"),
      [STORAGE_KEY]
    );
    await page.goto("/ustawienia");
    expect(await htmlHasDarkClass(page)).toBe(false);

    await page.getByRole("radio", { name: "Systemowy" }).click();
    await expect.poll(() => htmlHasDarkClass(page)).toBe(true);
  });
});

test.describe("Theme — live system reaction", () => {
  test("system preference stays selected and reacts to an OS theme change without reload", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/ustawienia");
    expect(await htmlHasDarkClass(page)).toBe(false);

    // No page.reload() here — this is the point of the test: the
    // ThemeProvider's matchMedia change listener must react live.
    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => htmlHasDarkClass(page)).toBe(true);

    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(() => htmlHasDarkClass(page)).toBe(false);
  });
});

test.describe("Theme — robustness", () => {
  test("invalid stored value falls back safely to system", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.addInitScript(
      ([key]) => localStorage.setItem(key, "purple-mode-please"),
      [STORAGE_KEY]
    );
    await page.goto("/ustawienia");
    // Falls back to system (dark here), not to a crash or a stuck light theme.
    expect(await htmlHasDarkClass(page)).toBe(true);
  });

  test("no flash of wrong theme — dark class is present at first paint, not applied late", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.addInitScript(
      ([key]) => localStorage.setItem(key, "dark"),
      [STORAGE_KEY]
    );
    // Checking right at domcontentloaded (before React hydrates) proves the
    // beforeInteractive bootstrap script — not React — set the class.
    await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(await htmlHasDarkClass(page)).toBe(true);
  });

  test("no hydration error is logged on a dark-mode load", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const hydrationErrors = consoleErrors.filter((t) =>
      /hydrat/i.test(t)
    );
    expect(hydrationErrors).toEqual([]);
  });
});

test.describe("Theme — metadata", () => {
  test("dual light/dark theme-color meta tags are present", async ({ page }) => {
    await page.goto("/");
    const metas = await page.$$eval('meta[name="theme-color"]', (nodes) =>
      nodes.map((n) => ({
        media: n.getAttribute("media"),
        content: n.getAttribute("content"),
      }))
    );
    expect(metas.length).toBeGreaterThanOrEqual(2);
    expect(metas.some((m) => m.media?.includes("dark"))).toBe(true);
    expect(metas.some((m) => m.media?.includes("light"))).toBe(true);
  });

  test("theme-color meta content follows a manual dark override", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.addInitScript(
      ([key]) => localStorage.setItem(key, "dark"),
      [STORAGE_KEY]
    );
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const metas = await page.$$eval('meta[name="theme-color"]', (nodes) =>
      nodes.map((n) => n.getAttribute("content"))
    );
    expect(metas.every((c) => c === "#0b1220")).toBe(true);
  });
});

test.describe("Theme — coverage across surfaces", () => {
  test("public homepage renders with dark class and no console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    expect(await htmlHasDarkClass(page)).toBe(true);
    expect(errors).toEqual([]);
  });

  test("alert detail route renders with dark class (not-found state)", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/alerts/nieistniejacy-slug-sprint-162-theme-test");
    expect(await htmlHasDarkClass(page)).toBe(true);
    await expect(page.getByText("Nie znaleziono alertu")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("login page renders with dark class", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/login");
    expect(await htmlHasDarkClass(page)).toBe(true);
  });

  test("/ustawienia renders with dark class and the toggle is keyboard-focusable", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/ustawienia");
    expect(await htmlHasDarkClass(page)).toBe(true);
    const radiogroup = page.getByRole("radiogroup", { name: "Wygląd aplikacji" });
    await expect(radiogroup).toBeVisible();
    await page.getByRole("radio", { name: "Systemowy" }).focus();
    await expect(page.getByRole("radio", { name: "Systemowy" })).toBeFocused();
  });
});

test.describe("Theme — no horizontal scroll on mobile widths", () => {
  for (const width of [375, 390, 414]) {
    test(`homepage has no horizontal overflow at ${width}px (dark)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ colorScheme: "dark" });
      await page.goto("/");
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    });
  }
});
