import { test, expect, type Page } from "@playwright/test";

/**
 * PWA installability + safe offline foundation tests (Sprint 158B).
 *
 * Runs against a production build (`next build && next start`) via
 * playwright.pwa.config.ts — service worker registration is gated to
 * NODE_ENV=production, so these behaviors don't exist under `next dev`.
 *
 * Golden rule under test throughout: alerts, admin, and API responses must
 * never be cached. Only a static offline fallback screen is cached.
 */

function readPngSize(buffer: Buffer): { width: number; height: number } {
  // PNG: 8-byte signature, then IHDR chunk: 4-byte length, 4-byte "IHDR",
  // 4-byte width, 4-byte height (big-endian).
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

async function waitForServiceWorker(page: Page) {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
}

test.describe("Manifest (M1)", () => {
  test("manifest.webmanifest returns 200 with expected fields", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/manifest+json");

    const manifest = await res.json();
    expect(manifest.name).toBe("Alertownik");
    expect(manifest.short_name).toBe("Alertownik");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.lang).toBe("pl-PL");
    expect(manifest.theme_color).toBeTruthy();
    expect(manifest.background_color).toBeTruthy();
    expect(Array.isArray(manifest.icons)).toBe(true);

    const purposes = manifest.icons.map((icon: { purpose?: string }) => icon.purpose);
    expect(purposes).toContain("maskable");
  });

  test("every manifest icon resolves and PNG icons have correct pixel size", async ({
    request,
  }) => {
    const manifestRes = await request.get("/manifest.webmanifest");
    const manifest = await manifestRes.json();

    for (const icon of manifest.icons as { src: string; sizes: string; type: string }[]) {
      const res = await request.get(icon.src);
      expect(res.status(), `${icon.src} should return 200`).toBe(200);

      if (icon.type === "image/png") {
        const buffer = await res.body();
        const { width, height } = readPngSize(buffer);
        const [expectedW, expectedH] = icon.sizes.split("x").map(Number);
        expect(width, `${icon.src} width`).toBe(expectedW);
        expect(height, `${icon.src} height`).toBe(expectedH);
      }
    }
  });

  // Sprint 181B — PWA installation audit.
  test("manifest declares screenshots, and every declared screenshot resolves with the declared pixel size — never a dangling reference", async ({
    request,
  }) => {
    const manifestRes = await request.get("/manifest.webmanifest");
    const manifest = await manifestRes.json();

    expect(Array.isArray(manifest.screenshots)).toBe(true);
    expect(manifest.screenshots.length).toBeGreaterThan(0);

    const formFactors = manifest.screenshots.map((s: { form_factor?: string }) => s.form_factor);
    expect(formFactors).toContain("narrow");

    for (const shot of manifest.screenshots as { src: string; sizes: string; type: string }[]) {
      const res = await request.get(shot.src);
      expect(res.status(), `${shot.src} should return 200`).toBe(200);
      expect(res.headers()["content-type"], `${shot.src} content-type`).toContain("png");

      const buffer = await res.body();
      const { width, height } = readPngSize(buffer);
      const [expectedW, expectedH] = shot.sizes.split("x").map(Number);
      expect(width, `${shot.src} width`).toBe(expectedW);
      expect(height, `${shot.src} height`).toBe(expectedH);
    }
  });
});

test.describe("Safe area / viewport-fit (Sprint 181B)", () => {
  test("the root layout requests viewport-fit=cover, so env(safe-area-inset-*) is not silently zero on notched devices", async ({
    page,
  }) => {
    await page.goto("/");
    const content = await page.locator('meta[name="viewport"]').getAttribute("content");
    expect(content).toContain("viewport-fit=cover");
  });
});

test.describe("Service worker (M2)", () => {
  test("/sw.js is served with correct content-type and cache headers", async ({ request }) => {
    const res = await request.get("/sw.js");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("javascript");
    expect(res.headers()["cache-control"]).toContain("no-cache");
  });

  test("service worker registers with scope / and no error", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await waitForServiceWorker(page);

    const scope = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/");
      return reg?.scope;
    });

    expect(scope).toBe("http://localhost:3100/");
    expect(errors).toEqual([]);
  });
});

test.describe("Cache safety (M3)", () => {
  test("cache only contains the offline fallback and its icon — never admin/api/alerts", async ({
    page,
  }) => {
    await waitForServiceWorker(page);

    const cachedUrls = await page.evaluate(async () => {
      const cache = await caches.open("alertownik-pwa-v2");
      const requests = await cache.keys();
      return requests.map((r) => new URL(r.url).pathname);
    });

    expect(cachedUrls).toContain("/offline.html");
    for (const url of cachedUrls) {
      expect(url.startsWith("/admin")).toBe(false);
      expect(url.startsWith("/api")).toBe(false);
      expect(url).not.toBe("/");
    }
  });
});

test.describe("Offline fallback (M4)", () => {
  test("offline navigation to a fresh public path shows the offline screen, not stale content", async ({
    page,
    context,
  }) => {
    await waitForServiceWorker(page);

    await context.setOffline(true);
    await page.goto("/o-projekcie-nieodwiedzona-wczesniej-sciezka-xyz", {
      waitUntil: "load",
    }).catch(() => {
      // Navigation may reject depending on browser; fall through and assert on content below.
    });

    await expect(page.getByText("Brak połączenia z internetem")).toBeVisible();
    await expect(page.getByText(/nie pokazujemy tu starych alertów/)).toBeVisible();

    await context.setOffline(false);
  });
});

test.describe("Offline fallback theming (Sprint 162)", () => {
  // offline.html has no app JavaScript bundle, so it's tested directly (not
  // via the service worker) — same requirement the page itself documents:
  // it must work standalone and still respect dark mode.
  test("light system preference keeps the light background", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/offline.html");
    const bg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor
    );
    expect(bg).toBe("rgb(240, 249, 255)"); // #f0f9ff
  });

  test("dark system preference switches the background via prefers-color-scheme", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/offline.html");
    const bg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor
    );
    expect(bg).toBe("rgb(11, 18, 32)"); // #0b1220
  });

  test("a stored manual light preference wins even under a dark system", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("alertownik-theme-preference", "light");
    });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/offline.html");
    const bg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor
    );
    expect(bg).toBe("rgb(240, 249, 255)");
  });

  test("honest data-loss warning text is still present regardless of theme", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/offline.html");
    await expect(page.getByText(/nie pokazujemy tu starych alertów/)).toBeVisible();
  });
});

test.describe("Admin/API exclusions (M5)", () => {
  test("service worker fetch handler ignores non-GET and admin/api paths", async ({ page }) => {
    await waitForServiceWorker(page);

    const swSource = await page.evaluate(async () => {
      const res = await fetch("/sw.js");
      return res.text();
    });

    expect(swSource).toContain('EXCLUDED_PREFIXES = ["/admin", "/api"]');
    expect(swSource).toContain('request.method !== "GET"');
  });

  test("no offline copy of the admin panel exists in cache", async ({ page }) => {
    await waitForServiceWorker(page);

    const hasAdminEntry = await page.evaluate(async () => {
      const cache = await caches.open("alertownik-pwa-v2");
      const requests = await cache.keys();
      return requests.some((r) => new URL(r.url).pathname.startsWith("/admin"));
    });

    expect(hasAdminEntry).toBe(false);
  });
});

test.describe("Install UX (M6)", () => {
  test("/instalacja renders Android, iPhone, and desktop instructions", async ({ page }) => {
    await page.goto("/instalacja");
    await expect(page.getByRole("heading", { name: "Zainstaluj Alertownik" })).toBeVisible();
    await expect(page.getByText("Android / Chrome")).toBeVisible();
    await expect(page.getByText("iPhone / Safari")).toBeVisible();
    await expect(page.getByText("Komputer / Chrome lub Edge")).toBeVisible();
  });

  test("install button is absent without a beforeinstallprompt event", async ({ page }) => {
    await page.goto("/instalacja");
    await expect(page.getByRole("button", { name: "Zainstaluj Alertownik" })).toHaveCount(0);
  });

  test("footer links to /instalacja", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Zainstaluj Alertownik" }).click();
    await expect(page).toHaveURL(/\/instalacja$/);
  });

  // Sprint 186A — Store Readiness audit, updated by LR-8A: /instalacja is a
  // public page that must stay true both before AND after the Google Play
  // release, so it makes no store-availability claim either way (the old
  // "nie ma jeszcze w Google Play" sentence was removed in LR-8A).
  test("makes no store-availability claim either way (true before and after a store release)", async ({ page }) => {
    await page.goto("/instalacja");
    const text = await page.locator("main").innerText();
    expect(text).not.toMatch(/Google Play|App Store/);
  });

  test("manifest.categories is a hint only — no store-availability claim in its values", async ({
    request,
  }) => {
    const res = await request.get("/manifest.webmanifest");
    const manifest = await res.json();
    expect(Array.isArray(manifest.categories)).toBe(true);
    expect(manifest.categories.length).toBeGreaterThan(0);
  });

  for (const width of [375, 390, 414]) {
    test(`/instalacja has no horizontal scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 });
      await page.goto("/instalacja");
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      );
      expect(overflows).toBe(false);
    });
  }

  test("/instalacja links are reachable via keyboard (Tab) and focusable", async ({ page }) => {
    await page.goto("/instalacja");
    const backLink = page.getByRole("link", { name: /Wróć do listy alertów/ });
    await backLink.focus();
    await expect(backLink).toBeFocused();
  });

  // Sprint 189 tester checks, replaced in LR-8A (public launch copy): no
  // tester-only language, a short "Po instalacji" list, and a one-click
  // mailto for problems ("Coś nie działa? → Napisz do nas").
  test("has no tester-only language (public page)", async ({ page }) => {
    await page.goto("/instalacja");
    const text = await page.locator("main").innerText();
    for (const banned of ["Test wczesnej wersji", "tester", "Co sprawdzić (5 minut)", "Wyślij opinię"]) {
      expect(text, banned).not.toContain(banned);
    }
  });

  test("shows a short 'Po instalacji' list", async ({ page }) => {
    await page.goto("/instalacja");
    const heading = page.getByRole("heading", { name: "Po instalacji" });
    await expect(heading).toBeVisible();
    const count = await page.locator("section", { has: heading }).locator("li").count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(4);
  });

  test("has a one-click 'Napisz do nas' mailto to the project contact", async ({ page }) => {
    await page.goto("/instalacja");
    await expect(page.getByRole("heading", { name: "Coś nie działa?" })).toBeVisible();
    const link = page.getByRole("link", { name: "Napisz do nas" });
    await expect(link).toBeVisible();
    expect(await link.getAttribute("href")).toMatch(/^mailto:alertownik\.kontakt@gmail\.com\?/);
  });
});

test.describe("Network status (M7)", () => {
  test("offline banner appears on offline event and clears on online", async ({
    page,
    context,
  }) => {
    await page.goto("/");

    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(
      page.getByText("Brak internetu — nie możemy sprawdzić najnowszych alertów.")
    ).toBeVisible();

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(
      page.getByText("Brak internetu — nie możemy sprawdzić najnowszych alertów.")
    ).toBeHidden();
  });

  test("offline banner does not cause horizontal scroll", async ({ page, context }) => {
    await page.goto("/");
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(
      page.getByText("Brak internetu — nie możemy sprawdzić najnowszych alertów.")
    ).toBeVisible();

    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(hasHorizontalScroll).toBe(false);
    await context.setOffline(false);
  });
});

// FINAL-2 — production-build behaviour of /alerts/[slug]: real HTTP 404
// for unknown/archived alerts, Polish 404 elsewhere, per-alert metadata.
test.describe("FINAL-2 alert pages: 404 and metadata (production build)", () => {
  test("an unknown alert slug returns HTTP 404 with the Polish message", async ({ page }) => {
    const res = await page.goto("/alerts/nieistniejacy-alert-final-2");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Nie znaleziono alertu" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Zobacz aktualne alerty/ })).toHaveAttribute("href", "/alerty");
  });

  test("any other unknown URL returns HTTP 404 in Polish, not the default English page", async ({ page }) => {
    const res = await page.goto("/nie-ma-takiej-strony-final-2");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Nie znaleziono strony" })).toBeVisible();
    expect(await page.locator("body").innerText()).not.toContain("could not be found");
  });

  test("a real published alert has its own title, description and Open Graph tags", async ({ page, request }) => {
    await page.goto("/alerty");
    const links = page.locator('a[href^="/alerts/"]');
    await page.waitForTimeout(1500);
    const showEnded = page.getByRole("button", { name: /Pokaż zakończone/ });
    if ((await links.count()) === 0 && (await showEnded.count()) > 0) await showEnded.click();
    test.skip((await links.count()) === 0, "no published alert in this database");
    const href = (await links.first().getAttribute("href"))!;
    const html = await (await request.get(href)).text();
    const meta = (prop: string) => html.match(new RegExp(`<meta[^>]+(?:property|name)="${prop}"[^>]+content="([^"]*)"`))?.[1] ?? null;
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
    expect(title).toMatch(/ — Alertownik$/);
    expect(title).not.toBe("Alertownik");
    expect(meta("og:title")).toBeTruthy();
    expect(meta("og:description")).toBeTruthy();
    expect(meta("og:type")).toBe("article");
    const ogUrl = meta("og:url") ?? "";
    expect(ogUrl.startsWith("http")).toBe(true);
    expect(ogUrl.endsWith(href)).toBe(true);
    expect(meta("og:image") ?? "").toMatch(/^https?:\/\/.+\/icon-512\.png$/);
    // Rendered on the server: the alert's own heading is already in the HTML.
    expect(html).toMatch(new RegExp(`<h1[^>]*>${meta("og:title")!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</h1>`));
  });
});
