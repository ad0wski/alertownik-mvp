import { test, expect, type Page } from "@playwright/test";

/**
 * /odpady "data state" tests — Sprint 85.
 *
 * Sprints 80-84 only ever tested the graceful empty/missing states,
 * since `waste_schedule_items` has had no real rows. These tests mock
 * the Supabase REST response for that table at the network level
 * (Playwright route interception) so the actual data-rendering path —
 * grouping by date, Polish waste-type labels, locality/area/street
 * group, source links, the "Moja okolica" filter — gets exercised by a
 * real browser without depending on real production data or writing
 * anything to Supabase.
 */

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

const TOMORROW = isoDaysFromNow(1);
const NEXT_WEEK = isoDaysFromNow(10);

const MOCK_ROWS = [
  {
    id: "mock-1",
    locality: "Komorów",
    area_name: "Strefa A",
    street_group: "ul. Główna – ul. Sportowa",
    waste_type: "mixed",
    collection_date: TOMORROW,
    source_name: "Eco-Harmonogram",
    source_url: "https://www.pruszkow.pl/aplikacja-eco-harmonogram/",
    notes: null,
    created_at: "2026-06-21T00:00:00Z",
    updated_at: "2026-06-21T00:00:00Z",
  },
  {
    id: "mock-2",
    locality: "Komorów",
    area_name: "Strefa A",
    street_group: "ul. Główna – ul. Sportowa",
    waste_type: "bio",
    collection_date: TOMORROW,
    source_name: "Eco-Harmonogram",
    source_url: "https://www.pruszkow.pl/aplikacja-eco-harmonogram/",
    notes: null,
    created_at: "2026-06-21T00:00:00Z",
    updated_at: "2026-06-21T00:00:00Z",
  },
  {
    id: "mock-3",
    locality: "Pruszków",
    area_name: null,
    street_group: null,
    waste_type: "paper",
    collection_date: NEXT_WEEK,
    source_name: "MZO Pruszków",
    source_url: "https://www.pruszkow.pl/mieszkancy/terminy-odbioru-odpadow/",
    notes: null,
    created_at: "2026-06-21T00:00:00Z",
    updated_at: "2026-06-21T00:00:00Z",
  },
];

async function mockWasteScheduleRows(page: Page, rows: unknown[] = MOCK_ROWS) {
  await page.route("**/rest/v1/waste_schedule_items**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(rows),
    })
  );
}

// Scoped containers — /odpady also has static marketing copy (the "Jak to
// ma działać" and "Na razie sprawdź oficjalne źródło" sections) that
// happens to mention the same Polish waste-type words and the same
// "Eco-Harmonogram" source name as the real data. Scoping to each
// component's own container avoids false multi-match collisions with that
// unrelated static text.
function nextCollectionCard(page: Page) {
  return page.locator("p", { hasText: "Najbliższy odbiór" }).locator("..");
}
function upcomingSection(page: Page) {
  return page.locator("h2", { hasText: "Nadchodzące terminy" }).locator("..");
}

test.describe("/odpady data state (mocked Supabase response)", () => {
  test("next-collection card shows the soonest mocked item with a relative label", async ({ page }) => {
    await mockWasteScheduleRows(page);
    await page.goto("/odpady");

    const card = nextCollectionCard(page);
    await expect(card.getByText("Jutro")).toBeVisible();
    await expect(card.getByText("Zmieszane", { exact: true })).toBeVisible();
    await expect(card.getByText("BIO", { exact: true })).toBeVisible();
    await expect(card.getByText("Strefa A — ul. Główna – ul. Sportowa", { exact: true })).toBeVisible();
  });

  test("upcoming-schedule section groups mocked items by date with Polish labels and source links", async ({ page }) => {
    await mockWasteScheduleRows(page);
    await page.goto("/odpady");

    const section = upcomingSection(page);
    await expect(section.getByText("Papier", { exact: true })).toBeVisible();
    await expect(
      section.getByRole("link", { name: /Eco-Harmonogram/ }).first()
    ).toHaveAttribute("href", /pruszkow\.pl/);
  });

  test("table returning zero rows still shows the honest empty state, not a crash", async ({ page }) => {
    await mockWasteScheduleRows(page, []);
    await page.goto("/odpady");

    await expect(page.getByText("Brak zaplanowanych terminów")).toBeVisible();
    await expect(page.getByText("Brak zapisanych terminów.")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Application error");
    // The coverage line is derived from fetched rows — with zero rows it
    // must not appear (nothing may claim any locality is covered).
    await expect(page.getByText("Zapisane terminy obejmują:")).toHaveCount(0);
  });

  // Sprint 123 — the coverage line names exactly the localities present in
  // the data, never a hardcoded list (guards the "no pretending data
  // exists" rule in the other direction too: with rows, coverage is stated).
  test("coverage line lists the localities derived from the fetched rows", async ({ page }) => {
    await mockWasteScheduleRows(page);
    await page.goto("/odpady");

    const section = upcomingSection(page);
    await expect(section.getByText("Zapisane terminy obejmują:")).toBeVisible();
    await expect(section.getByText("Komorów, Pruszków", { exact: true })).toBeVisible();
  });

  test("'Moja okolica' filter narrows both the card and the full list to the saved locality", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "alertownik-user-preferences",
        JSON.stringify({ locationKeywords: "Komorów", categories: [] })
      );
    });
    await mockWasteScheduleRows(page);
    await page.goto("/odpady");

    // The card auto-prefers the matching "Komorów" item over the global soonest.
    await expect(page.getByText("Najbliższy odbiór — Twoja okolica", { exact: true })).toBeVisible();

    // The full list defaults to "Wszystkie okolice" — switch to "Moja okolica".
    await page.getByRole("button", { name: "Moja okolica" }).click();
    const section = upcomingSection(page);
    await expect(section.getByText("Papier", { exact: true })).toHaveCount(0);
    await expect(section.getByText("Zmieszane", { exact: true })).toBeVisible();
  });

  test("'Moja okolica' filter shows a dedicated empty state when nothing matches", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "alertownik-user-preferences",
        JSON.stringify({ locationKeywords: "Warszawa", categories: [] })
      );
    });
    await mockWasteScheduleRows(page);
    await page.goto("/odpady");

    await page.getByRole("button", { name: "Moja okolica" }).click();
    await expect(page.getByText("Brak terminów dla Twojej okolicy.")).toBeVisible();
  });
});

/**
 * Inline area-preference editor — Sprint 86.
 *
 * Before this sprint, the only way to set/change the "Moja okolica" value
 * consumed by /odpady was the homepage's "Moje alerty" panel — both
 * NextCollectionCard and WasteScheduleSection read localStorage
 * independently on their own mount. This sprint added AreaPreferenceBar +
 * OdpadyClient (a shared state owner) so the value can be set/changed/
 * cleared directly on /odpady and both views update live, with no page
 * reload. These tests exercise that live-update behavior specifically.
 */
test.describe("/odpady inline area preference editor (Sprint 86)", () => {
  test("with no saved preference, shows a prompt and lets the user set an area inline", async ({ page }) => {
    await mockWasteScheduleRows(page);
    await page.goto("/odpady");

    await expect(page.getByText("Wybierz swoją okolicę")).toBeVisible();
    await page.getByRole("button", { name: "Wybierz okolicę" }).click();

    await page.getByLabel("Moja okolica").fill("Komorów");
    await page.getByRole("button", { name: "Zapisz" }).click();

    // The card now prefers the Komorów match — no page reload needed.
    await expect(page.getByText("Najbliższy odbiór — Twoja okolica", { exact: true })).toBeVisible();
  });

  test("with a saved preference, shows the current value with Zmień/Wyczyść controls", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "alertownik-user-preferences",
        JSON.stringify({ locationKeywords: "Komorów", categories: [] })
      );
    });
    await mockWasteScheduleRows(page);
    await page.goto("/odpady");

    await expect(page.getByText("Komorów", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Zmień" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Wyczyść" })).toBeVisible();
  });

  test("changing the area inline updates the next-collection card live", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "alertownik-user-preferences",
        JSON.stringify({ locationKeywords: "Warszawa", categories: [] })
      );
    });
    await mockWasteScheduleRows(page);
    await page.goto("/odpady");

    // "Warszawa" matches nothing in the mocked rows — global soonest shown.
    await expect(page.getByText("Najbliższy odbiór", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Zmień" }).click();
    await page.getByLabel("Moja okolica").fill("Komorów");
    await page.getByRole("button", { name: "Zapisz" }).click();

    await expect(page.getByText("Najbliższy odbiór — Twoja okolica", { exact: true })).toBeVisible();
  });

  test("clearing the area inline removes the 'Moja okolica' filter toggle from the full list", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "alertownik-user-preferences",
        JSON.stringify({ locationKeywords: "Komorów", categories: [] })
      );
    });
    await mockWasteScheduleRows(page);
    await page.goto("/odpady");

    await expect(page.getByRole("button", { name: "Moja okolica" })).toBeVisible();

    await page.getByRole("button", { name: "Wyczyść" }).click();

    await expect(page.getByRole("button", { name: "Moja okolica" })).toHaveCount(0);
    await expect(page.getByText("Wybierz swoją okolicę")).toBeVisible();
  });

  test("'Anuluj' discards an in-progress edit without saving", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "alertownik-user-preferences",
        JSON.stringify({ locationKeywords: "Komorów", categories: [] })
      );
    });
    await mockWasteScheduleRows(page);
    await page.goto("/odpady");

    await page.getByRole("button", { name: "Zmień" }).click();
    await page.getByLabel("Moja okolica").fill("Coś innego");
    await page.getByRole("button", { name: "Anuluj" }).click();

    // Original value is still shown, edit was discarded.
    await expect(page.getByText("Komorów", { exact: true })).toBeVisible();
  });
});

/**
 * In-app reminder enhancements — Sprint 89.
 *
 * Adds: relative day labels + a "Ten tydzień" (this week) badge on the
 * full upcoming list (previously only the next-collection card showed a
 * relative label); explicit messaging on the next-collection card for
 * "no area preference set yet" and "preference set but nothing matches";
 * and the two new no-push-yet / verify-with-official-source trust lines.
 */
test.describe("/odpady in-app reminder enhancements (Sprint 89)", () => {
  test("upcoming list shows a relative day label and a 'Ten tydzień' badge only for near-term groups", async ({ page }) => {
    await mockWasteScheduleRows(page);
    await page.goto("/odpady");

    const section = upcomingSection(page);
    // mock-1/mock-2 collect TOMORROW (one group, within 7 days); mock-3
    // collects 10 days out (a second group, outside the window) — so
    // exactly one of the two date groups should carry the badge.
    await expect(section.getByText("Jutro")).toBeVisible();
    await expect(section.getByText("Ten tydzień")).toHaveCount(1);
  });

  test("next-collection card prompts to set an area when no preference exists yet", async ({ page }) => {
    await mockWasteScheduleRows(page);
    await page.goto("/odpady");

    const card = nextCollectionCard(page);
    await expect(card.getByText("Ustaw swoją okolicę powyżej, aby spersonalizować to przypomnienie.")).toBeVisible();
  });

  test("next-collection card explains a non-matching area preference instead of silently falling back", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "alertownik-user-preferences",
        JSON.stringify({ locationKeywords: "Warszawa", categories: [] })
      );
    });
    await mockWasteScheduleRows(page);
    await page.goto("/odpady");

    const card = nextCollectionCard(page);
    await expect(card.getByText("Brak terminów dla Twojej okolicy — pokazujemy najbliższy ogólny termin.")).toBeVisible();
  });

  test("no-push-yet and verify-with-source trust copy is visible on /odpady", async ({ page }) => {
    await mockWasteScheduleRows(page);
    await page.goto("/odpady");

    await expect(
      page.getByText("Nie wysyłamy jeszcze powiadomień — to przypomnienie widoczne w aplikacji.")
    ).toBeVisible();
    await expect(
      page.getByText("Dane harmonogramu należy sprawdzić w oficjalnym źródle.")
    ).toBeVisible();
  });
});
