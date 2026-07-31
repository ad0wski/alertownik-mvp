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
    await page.goto("/alerty");
    await expect(page.locator("h1")).toContainText("Lokalne alerty");
  });

  // Sprint 95 — the hero must say *where* this is for, not just what it
  // does: a visitor deciding "is this for me" in the first few seconds
  // needs the location, not just the category list.
  // Sprint 182A — the covered-area sentence lives inside "Jak działa
  // Alertownik?" now (collapsed by default, real user feedback said the
  // intro had too much text on first paint); the H1 itself still states
  // the area directly, so check that first, then confirm the detail is
  // still there once expanded.
  test("hero states the pilot's covered area", async ({ page }) => {
    await page.goto("/alerty");
    await expect(page.locator("h1")).toContainText(/Komorowa, Pruszkowa i okolic/);
    await page.getByText("Jak działa Alertownik?").click();
    await expect(page.getByText(/Komorowa, Pruszkowa i okolic/).last()).toBeVisible();
  });

  // Sprint 96 — a practical "reason to return" status line, computed from
  // whatever alerts already loaded; visible even when the count is 0; not
  // tied to a specific published alert existing.
  test("homepage shows a 'co sprawdzić teraz' status line linking to odpady", async ({ page }) => {
    await page.goto("/alerty");
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
    await page.goto("/alerty");
    const input = page.getByPlaceholder(/Szukaj po tytule lub treści/);
    await expect(input).toBeVisible();
    await input.fill("transport");
    await expect(input).toHaveValue("transport");
  });

  test("category filter buttons are present and clickable", async ({ page }) => {
    await page.goto("/alerty");
    const transportBtn = page.getByRole("button", { name: "Transport" });
    await expect(transportBtn).toBeVisible();
    await transportBtn.click();
    // Page should not crash — the button must still be visible after clicking
    await expect(transportBtn).toBeVisible();
  });

  test("alert card expands to show detail labels", async ({ page }) => {
    await page.goto("/alerty");

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
    await page.goto("/alerty");

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
    await page.goto("/alerty");

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
    await page.goto("/alerty");

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
  //
  // Sprint 158A — the mode pill no longer auto-opens the settings panel
  // (Userbrain finding: two separate mechanisms for the same thing was
  // confusing). With no preferences saved yet, switching into "Moja
  // okolica" mode shows a hint pointing back at the single "Ustaw moją
  // okolicę" entry point instead.
  test("Moja okolica toggle shows a hint pointing at the single settings entry point", async ({ page }) => {
    await page.goto("/alerty");
    await page.getByRole("button", { name: "Moja okolica", exact: true }).click();
    await expect(page.getByText(/Ustaw okolicę powyżej/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Ustaw moją okolicę" })).toBeVisible();
  });

  test("Wszystkie alerty / Moja okolica toggle has no regression: both modes still show the alert-list area", async ({ page }) => {
    await page.goto("/alerty");
    const allBtn = page.getByRole("button", { name: "Wszystkie alerty" });
    const myBtn = page.getByRole("button", { name: "Moja okolica", exact: true });
    await expect(allBtn).toBeVisible();
    await expect(myBtn).toBeVisible();

    await myBtn.click();
    await expect(page.getByText(/Ustaw okolicę powyżej/i)).toBeVisible();

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
    await page.goto("/alerty");
    // Sprint 182A — this link now lives inside the collapsed "Jak działa
    // Alertownik?" details element, opened here before clicking.
    await page.getByText("Jak działa Alertownik?").click();
    await page.getByRole("link", { name: /zgłoś się jako tester/ }).click();
    await expect(page).toHaveURL(/\/about#chce-testowac$/);
  });

  test("alert detail page offers a way to report a wrong/outdated alert", async ({ page }) => {
    await page.goto("/alerty");

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

  // Sprint 183B — Gate 3 (Partner Demo) audit found the page had no real
  // screenshots and no explanation of sourcing/dedup safeguards; both added
  // without removing anything, using the real Sprint 181B screenshot files.
  test("real app screenshots are embedded, not placeholders", async ({ page }) => {
    await page.goto("/partnerzy");
    await expect(page.getByAltText(/dzisiejsze alerty/)).toBeVisible();
    await expect(page.getByAltText(/Lista alertów/)).toBeVisible();
    await expect(page.getByAltText(/na komputerze/)).toBeVisible();
  });

  test("explains official sourcing and deduplication safeguards", async ({ page }) => {
    await page.goto("/partnerzy");
    await expect(page.getByText(/oficjalnego źródła/).first()).toBeVisible();
    await expect(page.getByText(/nie duplikuje już istniejącego alertu/)).toBeVisible();
  });

  test("names Gmina Michałowice, Miasto Pruszków, and Powiat Pruszkowski as target audiences", async ({ page }) => {
    await page.goto("/partnerzy");
    await expect(page.getByText(/Gminy Michałowice/)).toBeVisible();
    await expect(page.getByText(/Miasta Pruszków/)).toBeVisible();
    await expect(page.getByText(/Powiatu Pruszkowskiego/)).toBeVisible();
  });

  test("demo scenario is a short numbered list, with a link to the live app", async ({ page }) => {
    await page.goto("/partnerzy");
    await expect(page.getByRole("listitem").filter({ hasText: "Komorowa" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Zobacz aplikację →" })).toHaveAttribute("href", "/");
  });

  for (const width of [375, 390, 414]) {
    test(`/partnerzy has no horizontal scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 });
      await page.goto("/partnerzy");
      const bodyOverflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      );
      expect(bodyOverflows).toBe(false);
    });
  }

  test("/partnerzy has no horizontal scroll on desktop (1280px)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/partnerzy");
    const bodyOverflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(bodyOverflows).toBe(false);
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

  // Sprint 156C-2/156C-3 — evidence-based international-transfer disclosure.
  // Sprint 156C-2's first draft said the Hobby plan has "no DPA/SCC
  // safeguard" — too broad, per Adam's manual panel verification (Sprint
  // 156C-3): confirmed facts are Vercel Hobby plan, Function Region iad1
  // (USA), and Vercel's own privacy policy declares it uses the EU-U.S. DPF
  // and other transfer mechanisms where applicable — the corrected wording
  // states the confirmed region/mechanism facts without claiming Alertownik
  // has an active DPA, and without claiming no protections exist at all.
  test("privacy policy discloses Vercel's iad1/USA region and declared transfer mechanisms, without overclaiming an active DPA or claiming no protections exist", async ({ page }) => {
    await page.goto("/prywatnosc");
    await expect(page.getByText(/iad1/)).toBeVisible();
    await expect(page.getByText(/Stany Zjednoczone/)).toBeVisible();
    await expect(page.getByText(/poza Europejskim\s+Obszarem Gospodarczym/)).toBeVisible();
    await expect(page.getByText(/EU–U\.S\. Data Privacy Framework/)).toBeVisible();
    await expect(page.getByText(/bezpłatnego planu Vercel \(Hobby\)/)).toBeVisible();
    const html = await page.content();
    // No overclaim that Alertownik has an active Vercel DPA...
    expect(html).not.toContain("Alertownik ma aktywny DPA Vercela");
    // ...and no claim that zero transfer protections exist at all (the
    // Sprint 156C-2 draft's "nie obejmuje formalnej umowy powierzenia
    // przetwarzania danych ani standardowych klauzul umownych" phrasing
    // read as exactly that overly broad claim).
    expect(html).not.toContain(
      "nie obejmuje formalnej umowy powierzenia przetwarzania danych ani standardowych klauzul umownych"
    );
  });

  // Sprint 156C-3 — Supabase region confirmed by Adam's manual panel check
  // (eu-west-2, London) — not presented as an unprotected transfer solely
  // because the UK is outside the EEA, since the UK has a current EU
  // adequacy decision.
  test("privacy policy names Supabase's UK region and the UK adequacy decision", async ({ page }) => {
    await page.goto("/prywatnosc");
    await expect(page.getByText(/Londyn/)).toBeVisible();
    await expect(page.getByText(/decyzj[aęi] o\s+adekwatności/)).toBeVisible();
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
  // Sprint 182A — the hero itself is now a single sentence (H1 only); the
  // "two sentences" description moved into the collapsed "Jak działa
  // Alertownik?" detail, per real user feedback about too much intro text.
  test("hero is short (one sentence) and states the covered area", async ({ page }) => {
    await page.goto("/alerty");
    await expect(page.locator("h1")).toContainText(/Komorowa, Pruszkowa i okolic/);
    await page.getByText("Jak działa Alertownik?").click();
    await expect(page.getByText(/Sprawdź, co może dziś wpłynąć na Twój dzień/)).toBeVisible();
  });

  test("compact beta status card keeps the independence disclaimer and a link to the full explanation", async ({ page }) => {
    await page.goto("/alerty");
    await expect(page.getByText("Status pilotażu")).toBeVisible();
    await expect(
      page.getByText(/niezależnym projektem — nie jest oficjalną aplikacją WKD, PGE ani żadnej gminy/)
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Jak działa pilotaż/ })).toBeVisible();
  });

  test("alert list is visible immediately, with no blocking onboarding modal", async ({ page }) => {
    await page.goto("/alerty");
    await expect(
      page.getByText(/Wszystkich alertów|Brak aktualnych alertów/)
    ).toBeVisible({ timeout: 15_000 });
    // No dialog/modal should intercept the page on first load.
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("locality quick-pick CTA is visible and does not require login or an exact address", async ({ page }) => {
    await page.goto("/alerty");
    await expect(
      page.getByText(/Ustaw swoją okolicę, aby widzieć tylko alerty/)
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Ustaw moją okolicę" })).toBeVisible();
    // Skipping personalization must still show the full alert list.
    await expect(
      page.getByText(/Wszystkich alertów|Brak aktualnych alertów/)
    ).toBeVisible({ timeout: 15_000 });
  });

  // Sprint 158A — the compact chip-only picker was merged into the single
  // PreferencesSection panel: clicking a pilot-locality chip now fills the
  // panel's field (one save action for the whole panel) instead of
  // instantly saving and switching mode on its own — the previous
  // instant-save-on-chip behavior was one of the two competing mechanisms
  // Userbrain testers found confusing.
  test("settings panel reveals PILOT_LOCALITIES chips and selecting one plus Save saves the preference and switches mode", async ({ page }) => {
    await page.goto("/alerty");
    await page.getByRole("button", { name: "Ustaw moją okolicę" }).click();
    const localityChip = page.getByRole("button", { name: "Komorów", exact: true });
    await expect(localityChip).toBeVisible();
    await localityChip.click();
    await page.getByRole("button", { name: "Zapisz preferencje" }).click();

    // Preference saved via the existing localStorage mechanism.
    const saved = await page.evaluate(() =>
      localStorage.getItem("alertownik-user-preferences")
    );
    expect(saved).toContain("Komorów");
    const mode = await page.evaluate(() => localStorage.getItem("alertownik-alert-mode"));
    expect(mode).toBe("my");

    // Active-scope bar states the current area plainly, with an easy way
    // to change it.
    await expect(page.getByText(/Pokazujesz alerty dla:/)).toBeVisible();
    await expect(page.getByText(/Pokazujesz alerty dla:\s*Komorów/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Zmień ustawienia" })).toBeVisible();
  });

  test("locality can be changed after being set", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "alertownik-user-preferences",
        JSON.stringify({ locationKeywords: "Komorów", categories: [] })
      );
      localStorage.setItem("alertownik-alert-mode", "my");
    });
    await page.goto("/alerty");
    await expect(page.getByText(/Pokazujesz alerty dla:/)).toBeVisible();
    await page.getByRole("button", { name: "Zmień ustawienia" }).click();
    const pruszkowChip = page.getByRole("button", { name: "Pruszków", exact: true });
    await expect(pruszkowChip).toBeVisible();
    await pruszkowChip.click();
    await page.getByRole("button", { name: "Zapisz preferencje" }).click();
    const saved = await page.evaluate(() =>
      localStorage.getItem("alertownik-user-preferences")
    );
    expect(saved).toContain("Pruszków");
  });

  // Sprint 158A-2 supersedes this: on narrow viewports the wrapped chip row
  // (which used to grow to two rows and push the first alert card below the
  // fold) is replaced by one compact <select>. This test now asserts the
  // select is what's visible, not the chip row — see the dedicated
  // "Sprint 158A-2" describe block below for the fuller mobile/desktop
  // category-control coverage.
  test("category filters use the compact mobile select (not chips) on a narrow viewport, with no hidden horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/alerty");
    const select = page.locator("#category-select");
    await expect(select).toBeVisible();
    const options = await select.locator("option").allTextContents();
    expect(options).toEqual(["Wszystkie", "Transport", "Woda", "Prąd", "Odpady", "Drogi", "Komunikaty"]);
    await expect(page.getByRole("button", { name: "Transport", exact: true })).toHaveCount(0);

    const overflowsHorizontally = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(overflowsHorizontally).toBe(false);
  });
});

// Sprint 156B — real-device (iPhone Safari) smoke flagged the mobile header
// as visually cramped at 375px. Sprint 163 replaced the header's own public
// link row on mobile with the fixed bottom navigation (src/components/BottomNav.tsx)
// — this test now verifies that replacement instead of the removed header
// row, at the same three standard iPhone widths, still with no page-level
// horizontal scroll.
test.describe("Sprint 163 — mobile bottom navigation widths (supersedes Sprint 156B header row)", () => {
  for (const width of [375, 390, 414]) {
    test(`bottom nav shows all four tabs without horizontal scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 });
      await page.goto("/alerty");
      const nav = page.getByRole("navigation", { name: "Nawigacja główna" });
      await expect(nav).toBeVisible();
      for (const label of ["Dzisiaj", "Alerty", "Odpady", "Więcej"]) {
        await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
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

// Sprint 158A — Personalization Clarity and Empty States. Source: two
// professional Userbrain tests (Franklin, Elizabeth). Both testers found
// "Moja okolica", but after saving preferences were unsure what changed on
// screen, whether the search box was a second way to set the area, and
// whether an empty result meant "no alerts" vs. "unsupported area" vs.
// "bad filter combo". These tests exercise the single settings panel, the
// active-scope bar, and the distinct empty states that address those
// findings.
test.describe("Sprint 158A — personalization clarity and empty states", () => {
  test("all alerts, no preferences: default view shows the full list with no personalization active", async ({ page }) => {
    await page.goto("/alerty");
    await expect(
      page.getByText(/Wszystkich alertów|Brak aktualnych alertów/)
    ).toBeVisible({ timeout: 15_000 });
    // No active-scope bar without saved preferences.
    await expect(page.getByText(/Pokazujesz alerty dla:/)).toHaveCount(0);
  });

  test("setting a supported locality manually (typed, not a chip) saves the preference and shows the active-scope bar", async ({ page }) => {
    await page.goto("/alerty");
    await page.getByRole("button", { name: "Ustaw moją okolicę" }).click();
    await page.getByLabel("Lub wpisz miejscowość albo grupę ulic").fill("Pruszków");
    await page.getByRole("button", { name: "Zapisz preferencje" }).click();

    const saved = await page.evaluate(() =>
      localStorage.getItem("alertownik-user-preferences")
    );
    expect(saved).toContain("Pruszków");
    await expect(page.getByText(/Pokazujesz alerty dla:\s*Pruszków/)).toBeVisible();
    await expect(page.getByText(/Kategorie:\s*wszystkie/)).toBeVisible();
  });

  test("saved preferences persist across a reload (localStorage round-trip)", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "alertownik-user-preferences",
        JSON.stringify({ locationKeywords: "Michałowice", categories: ["water"] })
      );
      localStorage.setItem("alertownik-alert-mode", "my");
    });
    await page.goto("/alerty");
    await expect(page.getByText(/Pokazujesz alerty dla:\s*Michałowice/)).toBeVisible();
    await expect(page.getByText(/Kategorie:\s*Woda/)).toBeVisible();
  });

  // Warszawa isn't in PILOT_LOCALITIES and isn't street-like, so
  // matchPilotLocality() confidently classifies it as "unsupported" — this
  // does not depend on what alerts currently exist in Supabase.
  test("an area outside the pilot (Warszawa) shows the unsupported-area empty state, not a generic 'no results' message", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "alertownik-user-preferences",
        JSON.stringify({ locationKeywords: "Warszawa", categories: [] })
      );
      localStorage.setItem("alertownik-alert-mode", "my");
    });
    await page.goto("/alerty");
    await expect(page.getByText("Nie obsługujemy jeszcze tej okolicy.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Obecny pilotaż obejmuje:.*Komorów/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Wybierz obsługiwaną okolicę" })).toBeVisible();
  });

  // A supported pilot locality with (most likely) no matching live alerts —
  // real Supabase data varies, so this accepts either honest outcome
  // instead of asserting one, but always rejects the wrong empty-state copy
  // (must never claim "unsupported" for a locality that IS in the pilot).
  test("a supported locality with no active alerts shows the area-empty state, never the unsupported-area message", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "alertownik-user-preferences",
        JSON.stringify({ locationKeywords: "Reguły", categories: [] })
      );
      localStorage.setItem("alertownik-alert-mode", "my");
    });
    await page.goto("/alerty");
    await expect(
      page.getByText(/Pokazujesz alerty dla:\s*Reguły/)
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Nie obsługujemy jeszcze tej okolicy.")).toHaveCount(0);

    const areaEmpty = page.getByText(/Dobra wiadomość — obecnie nie mamy aktywnych alertów/);
    if (await areaEmpty.isVisible()) {
      await expect(page.getByRole("button", { name: "Pokaż wszystkie alerty" })).toBeVisible();
      // Section D/K13 — the empty-state escape hatch actually switches mode.
      await page.getByRole("button", { name: "Pokaż wszystkie alerty" }).click();
      const mode = await page.evaluate(() => localStorage.getItem("alertownik-alert-mode"));
      expect(mode).toBe("all");
    }
  });

  test("a search phrase matching nothing shows the search-empty state with a clear-search action", async ({ page }) => {
    await page.goto("/alerty");
    await page.getByLabel("Szukaj w aktualnym widoku").fill("zzzz-nieistniejacy-alert-fraza-12345");
    await expect(
      page.getByText("Nie znaleziono alertów pasujących do wpisanej frazy.")
    ).toBeVisible({ timeout: 15_000 });
    // Two "Wyczyść wyszukiwanie" affordances now exist at once: the small
    // inline clear button inside the search input itself (aria-label only,
    // no visible text) and this empty-state's full-text button — the
    // empty-state one is the last "Wyczyść wyszukiwanie" button in the DOM.
    const emptyStateClearBtn = page.locator("button", { hasText: "Wyczyść wyszukiwanie" }).last();
    await expect(emptyStateClearBtn).toBeVisible();
    await emptyStateClearBtn.click();
    await expect(page.getByLabel("Szukaj w aktualnym widoku")).toHaveValue("");
  });

  test("a category filter with no matching alerts shows the category-empty state, never a blank screen", async ({ page }) => {
    await page.goto("/alerty");
    await page.getByRole("button", { name: "Woda", exact: true }).click();
    const categoryEmpty = page.getByText(/Nie ma obecnie aktywnych alertów kategorii Woda w tym widoku\./);
    if (await categoryEmpty.isVisible()) {
      await expect(page.getByRole("button", { name: "Pokaż wszystkie kategorie" })).toBeVisible();
    } else {
      // Real data has Woda alerts right now — must show the normal list,
      // not a crash or an empty screen.
      await expect(
        page.getByText(/Wszystkich alertów|Znaleziono alertów|Wyświetlane:/)
      ).toBeVisible();
    }
  });

  // Category + search together, forced to zero matches by the bogus search
  // phrase regardless of real data — this makes the combined (G5) state
  // deterministic, unlike the single-axis category/area tests above.
  test("category filter + search active together with no matches shows the combined empty state listing both conditions", async ({ page }) => {
    await page.goto("/alerty");
    await page.getByRole("button", { name: "Transport", exact: true }).click();
    await page.getByLabel("Szukaj w aktualnym widoku").fill("zzzz-nieistniejacy-alert-fraza-12345");
    await expect(
      page.getByText("Brak alertów spełniających kilka aktywnych warunków naraz.")
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Kategoria:\s*Transport/)).toBeVisible();
    await expect(page.getByText(/Szukana fraza:\s*„zzzz-nieistniejacy-alert-fraza-12345”/)).toBeVisible();
  });

  test("preferences panel shows an inline caution note for street-like input it cannot confidently classify", async ({ page }) => {
    await page.goto("/alerty");
    await page.getByRole("button", { name: "Ustaw moją okolicę" }).click();
    await page.getByLabel("Lub wpisz miejscowość albo grupę ulic").fill("ul. Nieznana 12");
    await expect(
      page.getByText(/Nie mamy pewności, czy ta grupa ulic znajduje się w obszarze pilotażu/)
    ).toBeVisible();
  });

  test("no forced onboarding: settings panel is closed by default on first visit", async ({ page }) => {
    await page.goto("/alerty");
    await expect(page.getByRole("heading", { name: "Moja okolica" })).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  for (const width of [375, 390, 414]) {
    test(`settings panel is usable with no horizontal scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 });
      await page.goto("/alerty");
      await page.getByRole("button", { name: "Ustaw moją okolicę" }).click();
      await expect(page.getByRole("heading", { name: "Moja okolica" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Komorów", exact: true })).toBeVisible();
      await expect(page.getByLabel("Lub wpisz miejscowość albo grupę ulic")).toBeVisible();
      const bodyOverflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      );
      expect(bodyOverflows).toBe(false);
    });
  }
});

// Sprint 158A-2 — Mobile Category Control and First-Viewport Completion.
// Follow-up to Sprint 158A's own verification, which found two remaining
// gaps: (1) the category filter still wrapped into two rows of chips on
// small screens instead of one compact control, and (2) the first alert
// card's top edge landed at y≈840 on a 390×844 viewport — technically
// inside the viewport but only ~3.5px of it visible, not a usable "first
// glance" per the Alerts First requirement. Both are addressed by replacing
// the mobile chip row with a native <select> (desktop chips unchanged) and
// trimming redundant vertical spacing above the list.
test.describe("Sprint 158A-2 — mobile category control and first viewport", () => {
  for (const width of [375, 390, 414]) {
    test(`mobile category select works end-to-end at ${width}px: default, change, filter, revert, no scroll`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 });
      await page.goto("/alerty");
      await expect(
        page.getByText(/Wszystkich alertów|Brak aktualnych alertów/)
      ).toBeVisible({ timeout: 15_000 });

      const select = page.getByLabel("Kategoria");
      await expect(select).toBeVisible();
      await expect(select).toHaveValue("all");

      // Desktop chips must not be present in this viewport at all.
      await expect(page.getByRole("button", { name: "Transport", exact: true })).toHaveCount(0);

      await select.selectOption("transport");
      await expect(select).toHaveValue("transport");
      // Same filtering model as desktop: switching categories changes what's
      // counted/listed, mirrored by the existing counter/empty-state copy.
      await expect(
        page.getByText(/Wszystkich alertów|Wyświetlane|Brak aktywnych alertów w kategorii|Brak alertów/)
      ).toBeVisible({ timeout: 15_000 });

      await select.selectOption("all");
      await expect(select).toHaveValue("all");

      const overflowsHorizontally = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      );
      expect(overflowsHorizontally).toBe(false);
    });
  }

  test("desktop keeps the category chip row; mobile select is hidden (not removed)", async ({ page }) => {
    // Default project viewport (Desktop Chrome, well above the sm breakpoint).
    await page.goto("/alerty");
    const categories = ["Wszystkie", "Transport", "Woda", "Prąd", "Odpady", "Drogi", "Komunikaty"];
    for (const label of categories) {
      await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
    }
    // The select exists in the DOM at every width (CSS-only hide/show, not
    // conditional rendering) — on desktop it must simply not be visible.
    await expect(page.locator("#category-select")).toBeHidden();

    const transportBtn = page.getByRole("button", { name: "Transport", exact: true });
    await transportBtn.click();
    await expect(page.getByText(/Kategoria:\s*Transport|Wszystkich alertów|Wyświetlane/)).toBeVisible({
      timeout: 15_000,
    });
    await expect(transportBtn).toHaveClass(/bg-blue-600/);
  });

  test("first active alert card starts with a clear, usable margin above the fold at 390×844", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/alerty");
    await expect(
      page.getByText(/Wszystkich alertów|Brak aktualnych alertów/)
    ).toBeVisible({ timeout: 15_000 });

    const firstCard = page.locator("main article").first();
    if (!(await firstCard.isVisible().catch(() => false))) {
      // No published alerts in Supabase for this environment — nothing to
      // measure. The empty-state message assertion above already covers
      // this branch; this test only pins the layout when a card exists.
      return;
    }

    const box = await firstCard.boundingBox();
    expect(box).not.toBeNull();
    // "A clear, usable start" means at least ~50px of the card's top is
    // visible before the fold at 390×844 — not just a sliver crossing the
    // viewport boundary. Threshold raised from 780 to 795 in Sprint 163:
    // the mode-toggle and "Ustaw moją okolicę" controls above the list grew
    // from ~32px to the required 44px touch-target minimum (spec section
    // H), pushing the first card down by ~13.5px — an intentional
    // accessibility improvement, not a regression to chase back to 780.
    expect(box!.y).toBeLessThanOrEqual(795);
  });
});

// Accessibility & Legal Readiness block (2026-07-31) — a skip link letting
// keyboard/screen-reader users bypass the repeated header/nav on every
// page, and an aria-live confirmation for the "Moja okolica" save action
// (previously a purely visual confirmation, silent to screen readers).
test.describe("Accessibility — skip link and live-region confirmations", () => {
  test("skip-to-content link is the first focusable element and moves focus into main content", async ({ page }) => {
    await page.goto("/alerty");
    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Przejdź do treści" });
    await expect(skipLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
  });

  test("saving 'Moja okolica' preferences announces confirmation via a live region", async ({ page }) => {
    await page.goto("/alerty");
    const settingsButton = page.getByRole("button", { name: /Ustaw moją okolicę|Zmień ustawienia/ }).first();
    await settingsButton.click();
    await page.getByRole("button", { name: "Zapisz preferencje" }).click();
    const confirmation = page.locator('[role="status"]', { hasText: "Preferencje zapisane" });
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toHaveAttribute("aria-live", "polite");
  });
});
