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
    await expect(card.getByText("Bio", { exact: true })).toBeVisible();
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
