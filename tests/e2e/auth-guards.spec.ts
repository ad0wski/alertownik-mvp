import { test, expect } from "@playwright/test";

/**
 * Auth guard smoke tests.
 *
 * These tests verify that admin-only routes are protected from unauthenticated visitors.
 * No login credentials are used. No Supabase data is read or written.
 *
 * Expected behaviour: every protected route shows a login prompt and a link to /login.
 * The exact prompt text differs per route (/admin and /admin/sources have their own
 * session checks; /builder and /ai-helper use the shared AuthGate component), but all
 * routes show a "Przejdź do logowania →" link.
 */

const PROTECTED_ROUTES = [
  { path: "/admin",         hint: "Panel admina jest dostępny po zalogowaniu." },
  { path: "/builder",       hint: "Zaloguj się, aby kontynuować." },
  { path: "/ai-helper",     hint: "Zaloguj się, aby kontynuować." },
  { path: "/admin/sources", hint: "Ta sekcja jest dostępna po zalogowaniu." },
  { path: "/admin/queue",   hint: "Zaloguj się, aby kontynuować." },
];

for (const { path, hint } of PROTECTED_ROUTES) {
  test(`${path} — shows login prompt to unauthenticated visitors`, async ({ page }) => {
    await page.goto(path);

    // All protected routes show a link to /login once the session check resolves.
    // Wait up to 15 s — the page renders a blank placeholder while checking the session.
    await expect(
      page.getByRole("link", { name: /Przejdź do logowania/ })
    ).toBeVisible({ timeout: 15_000 });

    // Also verify the page-specific message so we know the right gate is showing
    await expect(page.getByText(hint)).toBeVisible();
  });
}
