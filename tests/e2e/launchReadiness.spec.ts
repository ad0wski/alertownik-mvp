import { test, expect } from "@playwright/test";
import { buildAlertShareText } from "@/lib/alertShareText";

/**
 * LR-4 — Launch UX readiness. Small, copy-level guarantees a first-time
 * visitor depends on: honest claims, an empty feed that explains itself,
 * and a share message that makes sense on its own.
 */

test.describe("share text — understandable without opening the link", () => {
  test("includes what, when and whose notice it is", () => {
    expect(
      buildAlertShareText({
        title: "Utrudnienia w ruchu drogowym",
        place: "Nowa Wieś",
        when: "09.07.2026",
        sourceName: "Gmina Michałowice — komunikaty",
      })
    ).toBe(
      "Utrudnienia w ruchu drogowym · Nowa Wieś · 09.07.2026. Źródło: Gmina Michałowice — komunikaty. Szczegóły w Alertowniku:"
    );
  });

  test("does not repeat a place the title already names", () => {
    const text = buildAlertShareText({
      title: "Brak wody - Reguły",
      place: "Reguły",
      when: "10.11.2026, 11:00 – 15:00",
      sourceName: "Gmina Michałowice — komunikaty",
    });
    expect(text).toBe(
      "Brak wody - Reguły · 10.11.2026, 11:00 – 15:00. Źródło: Gmina Michałowice — komunikaty. Szczegóły w Alertowniku:"
    );
    expect(text.match(/Reguły/g)).toHaveLength(1);
  });

  test("degrades cleanly when place, time and source are missing — never 'undefined' or stray separators", () => {
    const text = buildAlertShareText({ title: "  Komunikat  ", place: null, when: "", sourceName: undefined });
    expect(text).toBe("Komunikat. Szczegóły w Alertowniku:");
    expect(text).not.toMatch(/undefined|null| · \./);
  });
});

test.describe("/zasady — automatic publication claim matches reality", () => {
  test("names the Michałowice notices as the only planned source and says it is switched off", async ({ page }) => {
    await page.goto("/zasady");
    const main = page.locator("main");
    await expect(main).toContainText("komunikaty gminy Michałowice");
    await expect(main).toContainText("Obecnie jest wyłączony");
    await expect(main).not.toContainText("aktualności Miasta Pruszków");
  });
});

test.describe("empty feed explains itself", () => {
  test("Dzisiaj: the calm state says the app works, names the monitored area and links to ended alerts", async ({ page }) => {
    await page.goto("/");
    const calm = page.getByText("Brak pilnych alertów w tej chwili.");
    const anyCard = page.locator("main article").first();
    await expect(calm.or(anyCard)).toBeVisible({ timeout: 15_000 });
    test.skip(!(await calm.isVisible()), "an active alert is published right now — the calm state is not shown");
    await expect(page.getByText(/Aplikacja działa/)).toBeVisible();
    await expect(page.getByText(/gminy Michałowice i powiatu pruszkowskiego/).first()).toBeVisible();
    const link = page.getByRole("link", { name: /Zobacz zakończone alerty/ });
    await expect(link).toHaveAttribute("href", "/alerty");
  });

  test("Alerty: ended alerts are never described as examples", async ({ page }) => {
    await page.goto("/alerty");
    await expect(page.getByText(/Wszystkich alertów|Brak aktualnych alertów/).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("main")).not.toContainText("przykłady");
  });
});

test.describe("ended alert — source link caveat", () => {
  test("an ended alert's detail page warns that the publisher may have removed the notice", async ({ page }) => {
    await page.goto("/alerty");
    await expect(page.getByText(/Wszystkich alertów|Brak aktualnych alertów/).first()).toBeVisible({ timeout: 15_000 });
    // FINAL-2: ended alerts live in a collapsed history section — open it first.
    const showEnded = page.getByRole("button", { name: /Pokaż zakończone/ });
    if (await showEnded.count()) await showEnded.click();
    const endedCard = page.locator("main article").filter({ hasText: "Zakończone" }).first();
    test.skip((await endedCard.count()) === 0, "no ended alert is published right now");
    await endedCard.getByRole("link", { name: /Otwórz alert/ }).click();
    await expect(page.locator("h1")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/wydawca mógł usunąć lub przenieść/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Zobacz oficjalny komunikat/ })).toBeVisible();
  });
});

test.describe("LR-6 — closed pilot: first screen and problem reports", () => {
  test("Dzisiaj says in one line what the app is — visible on a phone without scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const line = page.getByText(/z oficjalnych źródeł, w jednym miejscu/);
    await expect(line).toBeVisible();
    const box = await line.boundingBox();
    expect(box!.y + box!.height).toBeLessThan(300);
    // …and it does not push the day's main state below the fold.
    const calm = page.getByText("Brak pilnych alertów w tej chwili.");
    const anyCard = page.locator("main article").first();
    await expect(calm.or(anyCard)).toBeVisible({ timeout: 15_000 });
    const main = await calm.or(anyCard).first().boundingBox();
    expect(main!.y).toBeLessThan(420);
  });
});
