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

  // Sprint 95 — the hero must say *where* this is for, not just what it
  // does: a visitor deciding "is this for me" in the first few seconds
  // needs the location, not just the category list.
  test("hero states the pilot's covered area", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Komorowa, Pruszkowa i okolic/)).toBeVisible();
  });

  // Sprint 96 — a practical "reason to return" status line, computed from
  // whatever alerts already loaded; visible even when the count is 0; not
  // tied to a specific published alert existing.
  test("homepage shows a 'co sprawdzić teraz' status line linking to odpady", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByText(/aktywn(y|ych) lub nadchodząc(y|ych) alert/)
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("link", { name: /Sprawdź najbliższy odbiór odpadów/ })
    ).toBeVisible();
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
    await expect(page.getByText("Źródło", { exact: true })).toBeVisible();
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
    // Should navigate away from the homepage — allow extra time for dev-server SSR of the dynamic route
    await expect(page).not.toHaveURL("/", { timeout: 15_000 });
    // Should not show a Next.js or React application error
    await expect(page.locator("body")).not.toContainText("Application error");
  });

  test("alert detail page shows the official-source trust disclaimer", async ({ page }) => {
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
    await expect(page).not.toHaveURL("/", { timeout: 15_000 });
    await expect(page.getByText(/nie zastępuje/)).toBeVisible();
  });

  // Sprint 96 — Real Data Readiness Audit: an alert needs to state plainly
  // that it was manually approved, not just imply it via /about's general
  // copy — this is the per-alert version of that trust signal.
  test("alert detail page states the alert was manually approved by an admin", async ({ page }) => {
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
    await expect(page).not.toHaveURL("/", { timeout: 15_000 });
    await expect(page.getByText(/Zatwierdzone ręcznie przez administratora/)).toBeVisible();
  });

  test("about page loads with project info and feedback link", async ({ page }) => {
    await page.goto("/about");
    await expect(page.locator("h1")).toContainText("O projekcie");
    await expect(page.getByRole("link", { name: /Napisz do nas/ })).toBeVisible();
  });

  test("about page has a tester-interest CTA", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByRole("link", { name: /Chcę testować/ })).toBeVisible();
  });

  test("about page lists known limitations", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByText("Znane ograniczenia")).toBeVisible();
  });

  test("about page has tester instructions", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByText("Jak testować")).toBeVisible();
  });

  test("My Alerty toggle opens the local preferences panel", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Moje alerty" }).click();
    await expect(page.getByText(/preferencje|okolic/i).first()).toBeVisible();
  });

  test("homepage links to the about page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "O projekcie" }).first().click();
    await expect(page).toHaveURL(/\/about$/);
  });

  test("odpady page loads with planned-feature info and official source links", async ({ page }) => {
    await page.goto("/odpady");
    await expect(page.locator("h1")).toContainText("Odpady");
    await expect(page.getByText("W przygotowaniu")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Eco-Harmonogram/ })
    ).toHaveAttribute("href", /pruszkow\.pl/);
  });

  test("odpady page's upcoming-schedule section shows a graceful state, not a crash", async ({ page }) => {
    await page.goto("/odpady");
    await expect(page.getByText("Nadchodzące terminy")).toBeVisible();
    // Whether the waste_schedule_items migration has been run or not, the
    // section must show one of these two honest states — never fabricated
    // dates (see Decisions.md, Sprint 80/81) and never a crash.
    await expect(
      page.getByText(/Harmonogram nie jest jeszcze włączony|Brak zapisanych terminów/)
    ).toBeVisible({ timeout: 10_000 });
  });

  test("odpady page's next-collection card shows a graceful state, not a crash", async ({ page }) => {
    await page.goto("/odpady");
    await expect(page.getByText("Najbliższy odbiór")).toBeVisible();
    // Same honesty requirement as the full list above, applied to the
    // single-item highlight card (Sprint 82) — table-missing/empty are
    // both acceptable, a fabricated date or a crash are not.
    await expect(
      page.getByText(/Funkcja jeszcze nie jest włączona|Brak zaplanowanych terminów/)
    ).toBeVisible({ timeout: 10_000 });
  });

  test("odpady page respects a saved 'Moja okolica' preference without crashing", async ({ page }) => {
    // Same localStorage key/shape AlertList's PreferencesSection saves
    // (src/lib/userPreferences.ts) — Sprint 84 reuses it on /odpady too,
    // rather than introducing a second area picker.
    await page.addInitScript(() => {
      localStorage.setItem(
        "alertownik-user-preferences",
        JSON.stringify({ locationKeywords: "Komorów", categories: [] })
      );
    });
    await page.goto("/odpady");
    await expect(page.getByText("Najbliższy odbiór")).toBeVisible();
    // Whether the table is missing, empty, or has rows that do/don't match
    // "Komorów", the page must show one honest state — never a crash.
    await expect(
      page.getByText(/Harmonogram nie jest jeszcze włączony|Brak zapisanych terminów|Wszystkie okolice/)
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("body")).not.toContainText("Application error");
  });

  test("homepage links to the odpady page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Odpady" }).first().click();
    await expect(page).toHaveURL(/\/odpady$/);
  });

  test("homepage links to the tester-interest section", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /zgłoś się jako tester/ }).click();
    await expect(page).toHaveURL(/\/about#chce-testowac$/);
  });

  test("alert detail page offers a way to report a wrong/outdated alert", async ({ page }) => {
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
    await expect(page).not.toHaveURL("/", { timeout: 15_000 });
    await expect(page.getByRole("link", { name: /Zgłoś/ })).toBeVisible();
  });

  // Sprint 92 — beta-readiness check: AppHeader/AppFooter gate every admin
  // link behind `{session && ...}`; this asserts that gate from the
  // outside, on a genuinely logged-out session, rather than just trusting
  // the source. The footer's single "Panel admina" → /login link is the
  // one intentional exception (a generic login link, not admin content).
  test("logged-out visitors see no admin navigation links", async ({ page }) => {
    await page.goto("/");
    for (const label of ["Kreator alertu", "AI Helper", "Źródła", "Kandydaci", "Harmonogram odpadów", "Wyloguj"]) {
      await expect(page.getByRole("link", { name: label })).toHaveCount(0);
      await expect(page.getByRole("button", { name: label })).toHaveCount(0);
    }
  });

  test("logged-out visitors see no admin navigation links on /odpady", async ({ page }) => {
    await page.goto("/odpady");
    for (const label of ["Kreator alertu", "AI Helper", "Źródła", "Kandydaci", "Harmonogram odpadów", "Wyloguj"]) {
      await expect(page.getByRole("link", { name: label })).toHaveCount(0);
      await expect(page.getByRole("button", { name: label })).toHaveCount(0);
    }
  });
});
