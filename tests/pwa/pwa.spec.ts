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
      const cache = await caches.open("alertownik-pwa-v1");
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
      const cache = await caches.open("alertownik-pwa-v1");
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
