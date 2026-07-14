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

  // Sprint 98 — a single-glance trust/status card for first-time visitors,
  // consolidating facts that previously required a click to /about.
  test("homepage shows the beta status card", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Status pilotażu")).toBeVisible();
    await expect(page.getByRole("link", { name: /Zgłoś brakujące źródło lub błąd/ })).toBeVisible();
  });

  // Sprint 140 — Trust & Source UX v1: the "not an official app" disclaimer
  // must be visible on first landing, not just one click away on /zasady.
  test("homepage status card states Alertownik is independent, not an official app", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByText(/niezależnym projektem — nie jest oficjalną aplikacją WKD, PGE ani żadnej gminy/)
    ).toBeVisible();
  });

  // Sprint 140 — same disclaimer restated in the sitewide footer, since not
  // every page renders BetaStatusCard.
  test("footer states Alertownik is independent, not an official app", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByText(/Niezależny projekt — nie jest oficjalną aplikacją żadnej gminy, WKD ani PGE/)
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
    // Sprint 148: AlertDetailClient fetches its data client-side in a
    // useEffect after navigation (not embedded in the initial SSR
    // payload) — under load, that fetch can occasionally take longer
    // than Playwright's default assertion timeout, which previously
    // caused this test to fail intermittently even when a published
    // alert existed (a timing flake, not a real data-dependency issue —
    // the graceful skip above already handles the "no alert exists"
    // case correctly). Matches the same 15s allowance the sibling
    // "does not crash" test already uses for this identical navigation.
    await expect(page.getByText(/nie zastępuje/)).toBeVisible({ timeout: 15_000 });
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
    // Sprint 148: same client-side-fetch timing allowance as the
    // trust-disclaimer test above — see that test's comment.
    await expect(page.getByText(/Zatwierdzone ręcznie przez administratora/)).toBeVisible({ timeout: 15_000 });
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
    await expect(page.getByText("Co sprawdzić w 60 sekund")).toBeVisible();
  });

  // Sprint 98 — one-click feedback reasons, so a tester doesn't have to
  // compose a message from a blank line.
  test("about page has quick feedback reason options", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByRole("link", { name: "Brakuje ważnego alertu" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Dane są nieaktualne" })).toBeVisible();
  });

  // Sprint 156B — renamed from "Moje alerty" to "Moja okolica" for
  // consistency with the label already used everywhere else in the app for
  // this exact same location filter (PreferencesSection's field,
  // AreaPreferenceBar, the /odpady "Moja okolica" toggle).
  test("Moja okolica toggle opens the local preferences panel", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Moja okolica", exact: true }).click();
    await expect(page.getByText(/preferencje|okolic/i).first()).toBeVisible();
  });

  test("Wszystkie alerty / Moja okolica toggle has no regression: both modes still show the alert-list area", async ({ page }) => {
    await page.goto("/");
    const allBtn = page.getByRole("button", { name: "Wszystkie alerty" });
    const myBtn = page.getByRole("button", { name: "Moja okolica", exact: true });
    await expect(allBtn).toBeVisible();
    await expect(myBtn).toBeVisible();

    await myBtn.click();
    await expect(page.getByRole("heading", { name: "Moja okolica" })).toBeVisible();

    await allBtn.click();
    await expect(
      page.getByText(/Wszystkich alertów|Brak aktualnych alertów/)
    ).toBeVisible({ timeout: 15_000 });
  });

  test("homepage links to the about page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "O projekcie" }).first().click();
    await expect(page).toHaveURL(/\/about$/);
  });

  test("odpady page loads with early-version badge and official source links", async ({ page }) => {
    await page.goto("/odpady");
    await expect(page.locator("h1")).toContainText("Odpady");
    // Sprint 125: "W przygotowaniu" → "Wczesna wersja" after the first
    // real import (Komorów batch 1) made the old badge untrue.
    await expect(page.getByText("Wczesna wersja")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Eco-Harmonogram/ })
    ).toHaveAttribute("href", /pruszkow\.pl/);
  });

  test("odpady page's upcoming-schedule section shows a graceful state, not a crash", async ({ page }) => {
    await page.goto("/odpady");
    await expect(page.getByText("Nadchodzące terminy")).toBeVisible();
    // Three honest states are acceptable: table missing, table empty, or
    // real imported rows (the coverage line only renders with data —
    // Sprint 124, first real rows live). Fabricated dates or a crash are
    // not (see Decisions.md, Sprint 80/81). This spec runs against the
    // real Supabase project, so which state appears depends on the DB.
    await expect(
      page.getByText(/Harmonogram nie jest jeszcze włączony|Brak zapisanych terminów|Zapisane terminy obejmują:/)
    ).toBeVisible({ timeout: 10_000 });
  });

  test("odpady page's next-collection card shows a graceful state, not a crash", async ({ page }) => {
    await page.goto("/odpady");
    await expect(page.getByText("Najbliższy odbiór")).toBeVisible();
    // Same three honest states as the full list above, applied to the
    // single-item highlight card (Sprint 82). With real rows and no saved
    // area preference (this test saves none), the card always shows the
    // "Ustaw swoją okolicę" personalization hint.
    await expect(
      page.getByText(/Funkcja jeszcze nie jest włączona|Brak zaplanowanych terminów|Ustaw swoją okolicę powyżej/)
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
    // Sprint 148: same client-side-fetch timing allowance as the other
    // alert-detail tests above.
    await expect(page.getByRole("link", { name: /Zgłoś/ })).toBeVisible({ timeout: 15_000 });
  });

  // Sprint 92 — beta-readiness check: AppHeader/AppFooter gate every admin
  // link behind `{session && ...}`; this asserts that gate from the
  // outside, on a genuinely logged-out session, rather than just trusting
  // the source. The footer's single "Panel admina" → /login link is the
  // one intentional exception (a generic login link, not admin content).
  test("logged-out visitors see no admin navigation links", async ({ page }) => {
    await page.goto("/");
    for (const label of ["Nowy alert", "Kreator alertu", "AI Helper", "Źródła", "Kandydaci", "Harmonogram odpadów", "Wyloguj"]) {
      await expect(page.getByRole("link", { name: label })).toHaveCount(0);
      await expect(page.getByRole("button", { name: label })).toHaveCount(0);
    }
  });

  test("logged-out visitors see no admin navigation links on /odpady", async ({ page }) => {
    await page.goto("/odpady");
    for (const label of ["Nowy alert", "Kreator alertu", "AI Helper", "Źródła", "Kandydaci", "Harmonogram odpadów", "Wyloguj"]) {
      await expect(page.getByRole("link", { name: label })).toHaveCount(0);
      await expect(page.getByRole("button", { name: label })).toHaveCount(0);
    }
  });
});

// Sprint 109 — public partner/cooperation page. Static content, no auth,
// no Supabase dependency; safe to assert exact copy.
test.describe("Partner page (/partnerzy)", () => {
  test("heading and pilot honesty copy are visible", async ({ page }) => {
    await page.goto("/partnerzy");
    await expect(page.locator("h1")).toContainText("Współpraca i partnerstwa");
    await expect(page.getByText(/wczesnej fazie pilotażu/)).toBeVisible();
  });

  test("all five cooperation types are listed", async ({ page }) => {
    await page.goto("/partnerzy");
    for (const label of [
      "Lokalny sponsor",
      "Wspólnota mieszkaniowa / zarządca",
      "Gmina / lokalna instytucja",
      "Partner źródłowy / danych",
      "Partner beta / tester",
    ]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test("contact CTA is a mailto link with the cooperation subject", async ({ page }) => {
    await page.goto("/partnerzy");
    const cta = page.getByRole("link", { name: /Napisz w sprawie współpracy/ });
    await expect(cta).toBeVisible();
    const href = await cta.getAttribute("href");
    expect(href).toContain("mailto:");
    expect(href).toContain(encodeURIComponent("Alertownik — współpraca"));
  });

  test("trust disclaimer — no emergency guarantee — is visible", async ({ page }) => {
    await page.goto("/partnerzy");
    await expect(
      page.getByText(/nie jest systemem powiadamiania ratunkowego/)
    ).toBeVisible();
  });

  // Sprint 110 — independence must be stated on the partner page itself,
  // not only on /zasady: a potential partner reading this page must not
  // come away thinking they'd be dealing with an official municipal app.
  test("independence disclaimer and legal-page links are visible", async ({ page }) => {
    await page.goto("/partnerzy");
    await expect(
      page.getByText(/niezależnym projektem prywatnym/)
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Polityka prywatności" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Zasady korzystania" })).toBeVisible();
  });

  test("footer links to the partner page for logged-out visitors", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Współpraca" })).toBeVisible();
  });
});

// Sprint 110 — public PWA install instructions. Static content, honest by
// requirement: must explain add-to-home-screen per platform WITHOUT claiming
// the app is in any store.
test.describe("PWA install instructions (/about#instalacja)", () => {
  test("about page has per-platform add-to-home-screen steps", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByText("Dodaj Alertownik do ekranu głównego")).toBeVisible();
    await expect(page.getByText("Android (Chrome)")).toBeVisible();
    await expect(page.getByText("iPhone (Safari)")).toBeVisible();
  });

  test("install section honestly states the app is not in any store yet", async ({ page }) => {
    await page.goto("/about");
    await expect(
      page.getByText(/nie ma jeszcze w\s+Google Play ani App Store/)
    ).toBeVisible();
  });

  test("footer install line links to the install instructions", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "zobacz jak" }).click();
    await expect(page).toHaveURL(/\/about#instalacja$/);
    await expect(page.getByText("Android (Chrome)")).toBeVisible();
  });
});

// Sprint 109B — public legal pages (beta drafts). Static content, no auth,
// no Supabase dependency.
test.describe("Legal pages (/prywatnosc, /zasady)", () => {
  test("privacy policy page shows heading, beta-draft status and privacy contact", async ({ page }) => {
    await page.goto("/prywatnosc");
    await expect(page.locator("h1")).toContainText("Polityka prywatności");
    await expect(page.getByText(/Wersja beta \(szkic\)/)).toBeVisible();
    await expect(page.getByText(/Status tego dokumentu/)).toBeVisible();
    // The honest "what we do NOT collect" line — a core trust claim.
    await expect(page.getByText(/Czego NIE zbieramy/)).toBeVisible();
  });

  test("privacy policy names the actual processors", async ({ page }) => {
    await page.goto("/prywatnosc");
    for (const processor of ["Vercel", "Supabase", "Anthropic"]) {
      await expect(page.getByText(processor, { exact: false }).first()).toBeVisible();
    }
  });

  // Sprint 155 — Variant A: named data controller + dedicated project
  // contact address, replacing the previous anonymous-operator wording.
  test("privacy policy names the data controller and dedicated project contact", async ({ page }) => {
    await page.goto("/prywatnosc");
    await expect(page.getByText("Adam Jurkowski")).toBeVisible();
    await expect(page.getByText(/Administratorem danych osobowych/)).toBeVisible();
    await expect(page.getByRole("link", { name: "alertownik.kontakt@gmail.com" })).toBeVisible();
    await expect(page.getByText(/niezależny, niekomercyjny projekt/)).toBeVisible();
    await expect(page.getByText(/nie jest oficjalnym\s+serwisem żadnej gminy/)).toBeVisible();
  });

  test("privacy policy does not expose the previous private contact address", async ({ page }) => {
    await page.goto("/prywatnosc");
    const html = await page.content();
    expect(html).not.toContain("ak.jurkowski@gmail.com");
  });

  test("terms page leads with the not-an-emergency-service disclaimer and 112", async ({ page }) => {
    await page.goto("/zasady");
    await expect(page.locator("h1")).toContainText("Zasady korzystania");
    await expect(page.getByText(/nie jest oficjalnym\s+system/i)).toBeVisible();
    await expect(page.getByText("112", { exact: true })).toBeVisible();
  });

  test("terms page states independence from municipalities and operators", async ({ page }) => {
    await page.goto("/zasady");
    await expect(page.getByText(/Nie jest\s+oficjalnym serwisem żadnej gminy/)).toBeVisible();
  });

  test("footer links to privacy and terms for logged-out visitors", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Prywatność" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Zasady" })).toBeVisible();
  });
});

// Sprint 156B — mobile-first product value + personalization polish.
// Real-device (iPhone Safari) smoke found the first viewport dominated by
// explanatory text/status card, personalization not discoverable enough,
// category filters hidden behind an undiscoverable horizontal scroll, and
// the waste page leading with too much text before the actual schedule.
test.describe("Sprint 156B — homepage value-first + personalization", () => {
  test("hero is short (two sentences) and states the covered area", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Sprawdź, co może dziś wpłynąć na Twój dzień/)).toBeVisible();
    await expect(page.getByText(/Komorowa, Pruszkowa i okolic/)).toBeVisible();
  });

  test("compact beta status card keeps the independence disclaimer and a link to the full explanation", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Status pilotażu")).toBeVisible();
    await expect(
      page.getByText(/niezależnym projektem — nie jest oficjalną aplikacją WKD, PGE ani żadnej gminy/)
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Jak działa pilotaż/ })).toBeVisible();
  });

  test("alert list is visible immediately, with no blocking onboarding modal", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByText(/Wszystkich alertów|Brak aktualnych alertów/)
    ).toBeVisible({ timeout: 15_000 });
    // No dialog/modal should intercept the page on first load.
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("locality quick-pick CTA is visible and does not require login or an exact address", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByText(/Ustaw swoją okolicę, aby widzieć tylko alerty/)
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Ustaw moją okolicę" })).toBeVisible();
    // Skipping personalization must still show the full alert list.
    await expect(
      page.getByText(/Wszystkich alertów|Brak aktualnych alertów/)
    ).toBeVisible({ timeout: 15_000 });
  });

  test("locality quick-pick reveals PILOT_LOCALITIES chips and selecting one saves the preference and switches mode", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Ustaw moją okolicę" }).click();
    const localityChip = page.getByRole("button", { name: "Komorów", exact: true });
    await expect(localityChip).toBeVisible();
    await localityChip.click();

    // Preference saved via the existing localStorage mechanism.
    const saved = await page.evaluate(() =>
      localStorage.getItem("alertownik-user-preferences")
    );
    expect(saved).toContain("Komorów");
    const mode = await page.evaluate(() => localStorage.getItem("alertownik-alert-mode"));
    expect(mode).toBe("my");

    // Selected locality is shown, with an easy way to change it.
    await expect(page.getByText(/Twoja okolica:/)).toBeVisible();
    await expect(page.getByText(/Twoja okolica:\s*Komorów/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Zmień" })).toBeVisible();
  });

  test("locality can be changed after being set", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "alertownik-user-preferences",
        JSON.stringify({ locationKeywords: "Komorów", categories: [] })
      );
      localStorage.setItem("alertownik-alert-mode", "my");
    });
    await page.goto("/");
    await expect(page.getByText(/Twoja okolica:/)).toBeVisible();
    await page.getByRole("button", { name: "Zmień" }).click();
    const pruszkowChip = page.getByRole("button", { name: "Pruszków", exact: true });
    await expect(pruszkowChip).toBeVisible();
    await pruszkowChip.click();
    const saved = await page.evaluate(() =>
      localStorage.getItem("alertownik-user-preferences")
    );
    expect(saved).toContain("Pruszków");
  });

  test("category filters wrap and are all visible on a narrow mobile viewport, with no hidden horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    const categories = ["Wszystkie", "Transport", "Woda", "Prąd", "Odpady", "Drogi", "Komunikaty"];
    for (const label of categories) {
      await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
    }
    // The category-filter row itself must not require horizontal scrolling —
    // every button wraps onto additional rows instead of overflowing.
    const overflowsHorizontally = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === "Wszystkie"
      );
      const row = btn?.parentElement;
      if (!row) return true;
      return row.scrollWidth > row.clientWidth + 1;
    });
    expect(overflowsHorizontally).toBe(false);
  });
});

// Sprint 156B — real-device (iPhone Safari) smoke flagged the mobile header
// as visually cramped at 375px; verifying no regression at the three
// standard iPhone widths and no unwanted page-level horizontal scroll.
test.describe("Sprint 156B — mobile header widths", () => {
  for (const width of [375, 390, 414]) {
    test(`header shows all public links without horizontal scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 });
      await page.goto("/");
      for (const label of ["Alerty", "Odpady", "O projekcie"]) {
        await expect(page.getByRole("link", { name: label, exact: true }).first()).toBeVisible();
      }
      const bodyOverflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      );
      expect(bodyOverflows).toBe(false);
    });
  }
});

// Sprint 156B — waste page hierarchy: locality/next-pickup/upcoming-terms
// must appear before the longer explanatory sections, with nothing removed.
test.describe("Sprint 156B — waste page hierarchy", () => {
  test("locality picker and next-collection card appear before the longer info sections", async ({ page }) => {
    await page.goto("/odpady");
    // With no saved locality (this test's default state), AreaPreferenceBar
    // renders its "Wybierz swoją okolicę" prompt — the "Moja okolica" label
    // only appears once a value is already set, and also happens to be the
    // exact text of an unrelated filter toggle further down the page
    // (WasteScheduleSection's "Wszystkie okolice"/"Moja okolica" pair), so
    // "Najbliższy odbiór" (NextCollectionCard's heading, always rendered,
    // unambiguous) is used as the structural marker instead.
    const localityHeading = page.getByText("Wybierz swoją okolicę");
    const nextCollectionHeading = page.getByText("Najbliższy odbiór");
    const howItWorksHeading = page.getByText("Jak to ma działać");
    await expect(localityHeading).toBeVisible();
    await expect(nextCollectionHeading).toBeVisible();
    await expect(howItWorksHeading).toBeVisible();

    const localityBox = await localityHeading.boundingBox();
    const nextCollectionBox = await nextCollectionHeading.boundingBox();
    const howItWorksBox = await howItWorksHeading.boundingBox();
    expect(localityBox).not.toBeNull();
    expect(nextCollectionBox).not.toBeNull();
    expect(howItWorksBox).not.toBeNull();
    expect(localityBox!.y).toBeLessThan(howItWorksBox!.y);
    expect(nextCollectionBox!.y).toBeLessThan(howItWorksBox!.y);
  });

  test("waste page intro is a single short sentence, with all disclaimers and sources preserved lower on the page", async ({ page }) => {
    await page.goto("/odpady");
    await expect(
      page.getByText(/ręcznie przepisane z oficjalnych harmonogramów, zawsze z linkiem do źródła/)
    ).toBeVisible();
    // Nothing was removed — official sources and the independence
    // disclaimer are still present, just further down the page.
    await expect(page.getByText("Pełny harmonogram znajdziesz w oficjalnym źródle")).toBeVisible();
    await expect(page.getByText("Źródła pozostają najważniejsze")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Eco-Harmonogram/ })
    ).toHaveAttribute("href", /pruszkow\.pl/);
  });
});
