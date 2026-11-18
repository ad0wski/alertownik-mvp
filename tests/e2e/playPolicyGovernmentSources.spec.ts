import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";
import { INDEPENDENCE_DISCLAIMER, OFFICIAL_INFORMATION_SOURCES } from "@/lib/officialInformationSources";

/**
 * Google Play policy fix (18.11.2026) — Misleading Claims: "Missing Source
 * Link for Government Information". Google flagged the in-app "O projekcie"
 * page and the pl-PL full description. These tests keep both compliant:
 * a prominent independence disclaimer + clickable official HTTPS sources,
 * a direct source link on every public alert, and a store text that lists
 * the same sources the app shows.
 */

const OFFICIAL_HOSTS = new Set(OFFICIAL_INFORMATION_SOURCES.map((s) => new URL(s.url).hostname.replace(/^www\./, "")));

function readPlayFullDescription(): string {
  const md = readFileSync(path.join(process.cwd(), "docs/google-play/V1_STORE_COPY.md"), "utf8").replace(/\r\n?/g, "\n");
  const match = md.match(/<!-- PLAY-FULL-DESCRIPTION:START -->\n([\s\S]*?)\n<!-- PLAY-FULL-DESCRIPTION:END -->/);
  expect(match, "V1_STORE_COPY.md must contain the PLAY-FULL-DESCRIPTION markers").not.toBeNull();
  return (match as RegExpMatchArray)[1];
}

test.describe("official source registry", () => {
  test("every official source is a valid HTTPS URL with an institution name", () => {
    expect(OFFICIAL_INFORMATION_SOURCES.length).toBeGreaterThan(0);
    for (const source of OFFICIAL_INFORMATION_SOURCES) {
      expect(source.institution.trim().length).toBeGreaterThan(0);
      expect(new URL(source.url).protocol).toBe("https:");
    }
    expect(OFFICIAL_INFORMATION_SOURCES.map((s) => s.url)).toContain(
      "https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty"
    );
  });

  test("the disclaimer says the app is independent and not an official app of any public institution", () => {
    expect(INDEPENDENCE_DISCLAIMER).toMatch(/niezależnym projektem/);
    expect(INDEPENDENCE_DISCLAIMER).toMatch(/Nie jest oficjalną aplikacją ani przedstawicielem Gminy Michałowice/);
    expect(INDEPENDENCE_DISCLAIMER).toMatch(/żadnej innej instytucji publicznej/);
  });
});

test.describe("O projekcie — disclaimer and official sources (in-app experience Google reviewed)", () => {
  test("the independence disclaimer is visible on a phone without scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/about");
    const disclaimer = page.getByText(INDEPENDENCE_DISCLAIMER);
    await expect(disclaimer).toBeVisible();
    const box = await disclaimer.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  });

  test("'Oficjalne źródła informacji' lists every source as a visible, clickable HTTPS link", async ({ page }) => {
    await page.goto("/about");
    const section = page.locator("#zrodla");
    await expect(section.getByRole("heading", { name: "Oficjalne źródła informacji" })).toBeVisible();
    await expect(section).toContainText("bezpośredni link do konkretnego komunikatu");
    for (const source of OFFICIAL_INFORMATION_SOURCES) {
      await expect(section).toContainText(source.institution);
      const link = section.getByRole("link", { name: source.url, exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", source.url);
      expect(source.url.startsWith("https://")).toBe(true);
    }
  });

  test("disclaimer and sources come before the pilot details, with no institutional logos", async ({ page }) => {
    await page.goto("/about");
    const disclaimerBox = await page.locator("#niezaleznosc").boundingBox();
    const sourcesBox = await page.locator("#zrodla").boundingBox();
    const pilotBox = await page.getByRole("heading", { name: "Lokalny pilotaż" }).boundingBox();
    expect(disclaimerBox!.y).toBeLessThan(sourcesBox!.y);
    expect(sourcesBox!.y).toBeLessThan(pilotBox!.y);
    await expect(page.locator("#niezaleznosc img, #zrodla img")).toHaveCount(0);
  });

  test("no longer says Pruszków/WKD information 'appears less often' without naming the source", async ({ page }) => {
    await page.goto("/about");
    await expect(page.locator("main")).not.toContainText("pojawiają się rzadziej");
  });
});

test.describe("Współpraca page — no claims about sources the app does not use", () => {
  test("does not present PGE Dystrybucja or the county as current sources, and links to the source list", async ({ page }) => {
    await page.goto("/partnerzy");
    const main = page.locator("main");
    await expect(main).not.toContainText("PGE Dystrybucja");
    await expect(main).not.toContainText("dostawach wody i prądu");
    await expect(main).toContainText("nie jest oficjalną aplikacją ani przedstawicielem żadnej instytucji publicznej");
    await expect(main.getByRole("link", { name: "Oficjalne źródła informacji" })).toHaveAttribute("href", "/about#zrodla");
  });
});

test.describe("Google Play pl-PL full description", () => {
  test("starts with the independence disclaimer and lists every official source URL literally", () => {
    const text = readPlayFullDescription();
    expect(text.slice(0, 300)).toContain(INDEPENDENCE_DISCLAIMER);
    for (const source of OFFICIAL_INFORMATION_SOURCES) expect(text).toContain(source.url);
    expect(text).toMatch(/bezpośredni link do konkretnego oficjalnego komunikatu/);
  });

  test("fits Play's 4000-character limit and makes no v1 over-promises", () => {
    const text = readPlayFullDescription();
    expect(text.length).toBeLessThanOrEqual(4000);
    expect(text).not.toMatch(/prąd|powiadomie|push|cał(a|ej) Polsk|rzadziej/i);
    // Every URL in the text is HTTPS and belongs to a listed official source.
    for (const url of text.match(/https?:\/\/\S+/g) ?? []) {
      expect(url.startsWith("https://")).toBe(true);
      expect(OFFICIAL_HOSTS.has(new URL(url).hostname.replace(/^www\./, ""))).toBe(true);
    }
  });
});

// ── Public alerts — real Production data, read through the app's own anon
// request (no extra credentials). Fail-closed: a published alert without an
// HTTPS source link, or from an institution not listed above, fails. ──

async function loadPublishedAlertRows(page: Page): Promise<Array<{ slug: string; source_url: string | null }>> {
  const responsePromise = page.waitForResponse(
    (r) => r.url().includes("/rest/v1/alerts") && !r.url().includes("slug=eq.") && r.request().method() === "GET",
    { timeout: 20_000 }
  );
  await page.goto("/alerty");
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  return response.json();
}

test.describe("public alerts — every one links to an official source", () => {
  test("every published alert has an HTTPS source_url on a listed official domain", async ({ page }) => {
    const rows = await loadPublishedAlertRows(page);
    test.skip(rows.length === 0, "no published alerts right now");
    const problems = rows
      .filter((row) => {
        if (!row.source_url) return true;
        try {
          const url = new URL(row.source_url);
          return url.protocol !== "https:" || !OFFICIAL_HOSTS.has(url.hostname.replace(/^www\./, ""));
        } catch {
          return true;
        }
      })
      .map((row) => `${row.slug}: ${row.source_url ?? "(brak)"}`);
    expect(problems, "published alerts without an official HTTPS source").toEqual([]);
  });

  test("an alert detail page shows the source name and a link to the official notice", async ({ page }) => {
    await page.goto("/alerty");
    await expect(page.getByText(/Wszystkich alertów|Brak aktualnych alertów/).first()).toBeVisible({ timeout: 15_000 });
    const showEnded = page.getByRole("button", { name: /Pokaż zakończone/ });
    if (await showEnded.count()) await showEnded.click();
    const firstCardLink = page.locator("main article").getByRole("link", { name: /Otwórz alert/ }).first();
    test.skip((await firstCardLink.count()) === 0, "no published alert to open");
    await firstCardLink.click();
    await expect(page.getByText("Źródło komunikatu")).toBeVisible({ timeout: 15_000 });
    const sourceLink = page.getByRole("link", { name: /Zobacz oficjalny komunikat/ });
    await expect(sourceLink).toBeVisible();
    expect(await sourceLink.getAttribute("href")).toMatch(/^https:\/\//);
  });
});
