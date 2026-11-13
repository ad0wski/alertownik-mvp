// FINAL-3 — capture Google Play + PWA manifest screenshots from the REAL
// live app (no mock data, no AI-generated UI). Playwright is already a
// devDependency; no new packages.
//
//   node scripts/capture-store-screenshots.mjs                 # write into the repo
//   node scripts/capture-store-screenshots.mjs --out <dir>     # preview elsewhere
//   node scripts/capture-store-screenshots.mjs --base <url>    # other deployment
//
// Guard (fail closed): refuses to capture unless the live /alerty list shows
// at least one CURRENT or UPCOMING alert and no stale July items (ul.
// Działkowa, WKD timetable) among them — store screenshots must never show
// outdated or misleading content. --skip-guard exists only for layout
// previews written OUTSIDE the repo (it refuses to write into the repo).
//
// Output (same sizes/names as the previous set, see assets/store/README.md):
//   assets/store/screenshots/phone/phone-0{1..4}-*.png   1080×1920
//   assets/store/screenshots/tablet-7/tablet7-0{1,2}-*.png 1920×1080
//   assets/store/screenshots/tablet-10/tablet10-0{1,2}-*.png 1920×1080
//   public/screenshots/{home-narrow,alerty-narrow}.png      390×844
//   public/screenshots/home-wide.png                        1280×800

import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const BASE = arg("--base", "https://alertownik-mvp.vercel.app").replace(/\/$/, "");
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.resolve(arg("--out", REPO));
const SKIP_GUARD = args.includes("--skip-guard");
if (SKIP_GUARD && OUT === REPO) {
  console.error("--skip-guard is only allowed with --out <dir outside the repo>.");
  process.exit(2);
}
const storeDir = (sub) => (OUT === REPO ? path.join(REPO, "assets/store/screenshots", sub) : path.join(OUT, "store", sub));
const manifestDir = OUT === REPO ? path.join(REPO, "public/screenshots") : path.join(OUT, "manifest");

const STALE_PATTERNS = [/Działkow/i, /Rozkład jazdy WKD/i, /DW nr 719/i];
const NO_MOTION = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";

async function settle(page) {
  await page.waitForLoadState("networkidle");
  await page.addStyleTag({ content: NO_MOTION });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(700);
}

/** Current/upcoming alert titles shown on /alerty (cards above the "Zakończone" section). */
async function currentAlerts(page) {
  await page.goto(`${BASE}/alerty`);
  await settle(page);
  return page.evaluate(() => {
    const links = [...document.querySelectorAll('main a[href^="/alerts/"]')];
    const endedHeader = [...document.querySelectorAll("main span")].find((s) => s.textContent.trim() === "Zakończone");
    const seen = new Set();
    return links
      .filter((a) => !endedHeader || a.compareDocumentPosition(endedHeader) & Node.DOCUMENT_POSITION_FOLLOWING)
      .map((a) => ({ href: a.getAttribute("href"), card: (a.closest("article") || a.parentElement).innerText.replace(/\s+/g, " ").slice(0, 160) }))
      .filter((c) => !seen.has(c.href) && seen.add(c.href));
  });
}

/** Scrolls the first alert card near the top, so list shots show real alerts, not just filters. */
async function scrollToFirstAlert(page) {
  const first = page.locator('main a[href^="/alerts/"]').first();
  if (!(await first.count())) return;
  await first.evaluate((a) => {
    const card = a.closest("article") || a.parentElement;
    window.scrollTo(0, card.getBoundingClientRect().top + window.scrollY - 140);
  });
  await page.waitForTimeout(300);
}

const browser = await chromium.launch();
const shots = [];
async function capture({ file, route, width, height, scale, isMobile, prepare }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
    isMobile,
    hasTouch: isMobile,
    colorScheme: "light",
    locale: "pl-PL",
    serviceWorkers: "block", // no "new version" banner, no SW side effects
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE + route);
  await settle(page);
  if (prepare) await prepare(page);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file });
  if (errors.length) throw new Error(`JS error on ${route}: ${errors[0]}`);
  shots.push(path.relative(OUT, file));
  await ctx.close();
}

try {
  // ── Guard ────────────────────────────────────────────────────────────────
  const gctx = await browser.newContext({ serviceWorkers: "block" });
  const current = await currentAlerts(await gctx.newPage());
  await gctx.close();
  const stale = current.filter((c) => STALE_PATTERNS.some((re) => re.test(c.card)));
  console.log(`current/upcoming alerts on /alerty: ${current.length}`);
  if (!SKIP_GUARD && (current.length === 0 || stale.length > 0)) {
    console.error(
      current.length === 0
        ? "Guard: no current or upcoming alert is published — screenshots would show an empty list. Publish the current alerts first."
        : `Guard: stale content shown as current: ${stale.map((s) => s.card.slice(0, 60)).join(" | ")}`
    );
    process.exit(3);
  }
  const detail = (current.find((c) => /Reguły/.test(c.card)) ?? current[0])?.href ?? "/alerty";

  // ── Phone 1080×1920 (360×640 @3x) ────────────────────────────────────────
  const phone = { width: 360, height: 640, scale: 3, isMobile: true };
  await capture({ ...phone, file: path.join(storeDir("phone"), "phone-01-dzisiaj.png"), route: "/" });
  await capture({ ...phone, file: path.join(storeDir("phone"), "phone-02-alerty.png"), route: "/alerty", prepare: scrollToFirstAlert });
  await capture({ ...phone, file: path.join(storeDir("phone"), "phone-03-szczegoly-alertu.png"), route: detail });
  await capture({
    ...phone,
    file: path.join(storeDir("phone"), "phone-04-moja-okolica.png"),
    route: "/alerty",
    prepare: async (page) => {
      const btn = page.getByRole("button", { name: "Ustaw moją okolicę" }).first();
      if (await btn.count()) {
        await btn.click();
        await page.waitForTimeout(500);
        await page.getByText("Moja okolica", { exact: true }).first().scrollIntoViewIfNeeded().catch(() => undefined);
        await page.evaluate(() => window.scrollBy(0, -80));
        await page.waitForTimeout(300);
      }
    },
  });

  // ── Tablets 1920×1080 (960×540 @2x, landscape) ───────────────────────────
  const tablet = { width: 960, height: 540, scale: 2, isMobile: true };
  for (const [sub, prefix] of [["tablet-7", "tablet7"], ["tablet-10", "tablet10"]]) {
    await capture({ ...tablet, file: path.join(storeDir(sub), `${prefix}-01-dzisiaj.png`), route: "/" });
    await capture({ ...tablet, file: path.join(storeDir(sub), `${prefix}-02-alerty.png`), route: "/alerty", prepare: scrollToFirstAlert });
  }

  // ── PWA manifest screenshots (sizes declared in src/app/manifest.ts) ─────
  const narrow = { width: 390, height: 844, scale: 1, isMobile: true };
  await capture({ ...narrow, file: path.join(manifestDir, "home-narrow.png"), route: "/" });
  await capture({ ...narrow, file: path.join(manifestDir, "alerty-narrow.png"), route: "/alerty" });
  await capture({ width: 1280, height: 800, scale: 1, isMobile: false, file: path.join(manifestDir, "home-wide.png"), route: "/" });

  console.log(`captured ${shots.length} screenshots from ${BASE}:`);
  for (const s of shots) console.log("  " + s);
} finally {
  await browser.close();
}
