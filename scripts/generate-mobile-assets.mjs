// Renders the PWA/store icon set from the Alertownik brand mark
// (public/icon.svg: blue rounded square + white dot) using the Chromium
// bundled with Playwright — no extra dependencies.
//
// Usage: node scripts/generate-mobile-assets.mjs
//
// Outputs:
//   public/icon-192.png            — manifest icon (purpose: any, transparent corners)
//   public/icon-512.png            — manifest icon (purpose: any, transparent corners)
//   public/icon-maskable-512.png   — manifest icon (purpose: maskable, FULL-BLEED —
//                                    no transparent corners; the OS mask crops it)
//   src/app/apple-icon.png         — 180×180 apple-touch-icon (full-bleed; iOS
//                                    applies its own corner rounding)
//   assets/store/play-icon-512.png — Google Play app icon (full-bleed square)
//   assets/store/feature-graphic-1024x500.png — Google Play feature graphic
//
// Store assets in assets/store/ are NOT served by the app — they exist only
// for a future Play listing. Review every output visually before committing.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const BRAND_BLUE = "#2563eb";
const BRAND_BG = "#f0f9ff";
const BRAND_DARK = "#1e3a8a";

// Same geometry as public/icon.svg (viewBox 0 0 192 192, rx 40, dot r 28),
// scaled to the requested size. fullBleed drops the corner radius and
// transparency — required for maskable/Apple/Play variants, where the
// platform applies its own mask and transparent corners would show through.
function iconSvg(size, { fullBleed = false } = {}) {
  const rx = fullBleed ? 0 : Math.round((40 / 192) * size);
  const r = Math.round((28 / 192) * size);
  const c = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${rx}" fill="${BRAND_BLUE}"/>
  <circle cx="${c}" cy="${c}" r="${r}" fill="white" opacity="0.95"/>
</svg>`;
}

// Google Play feature graphic: calm, local, trustworthy. Brand mark +
// wordmark + honest tagline. System fonts only; no institution logos,
// no store badges, no claims of official affiliation.
function featureGraphicHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1024px; height: 500px;
    background: ${BRAND_BG};
    display: flex; align-items: center; justify-content: center; gap: 56px;
    font-family: "Segoe UI", system-ui, -apple-system, Arial, sans-serif;
  }
  .mark { flex: 0 0 auto; }
  .text { display: flex; flex-direction: column; gap: 14px; max-width: 620px; }
  h1 { font-size: 84px; font-weight: 700; color: ${BRAND_DARK}; letter-spacing: -1px; }
  p.tagline { font-size: 34px; color: #334155; }
  p.area { font-size: 24px; color: #64748b; }
  </style></head><body>
    <div class="mark">${iconSvg(180)}</div>
    <div class="text">
      <h1>Alertownik</h1>
      <p class="tagline">Lokalne alerty w jednym miejscu</p>
      <p class="area">Transport &middot; woda &middot; pr&#261;d &middot; odpady &middot; komunikaty gminne</p>
    </div>
  </body></html>`;
}

async function renderSvgToPng(page, svg, size, outPath) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<!doctype html><html><head><style>*{margin:0;padding:0}body{background:transparent}</style></head><body>${svg}</body></html>`
  );
  await page.screenshot({
    path: outPath,
    omitBackground: true,
    clip: { x: 0, y: 0, width: size, height: size },
  });
  console.log("wrote", path.relative(root, outPath));
}

async function main() {
  await mkdir(path.join(root, "assets", "store"), { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  // Manifest icons (purpose: any) — keep the brand's rounded corners.
  await renderSvgToPng(page, iconSvg(192), 192, path.join(root, "public", "icon-192.png"));
  await renderSvgToPng(page, iconSvg(512), 512, path.join(root, "public", "icon-512.png"));

  // Full-bleed variants — the platform masks these itself.
  await renderSvgToPng(
    page,
    iconSvg(512, { fullBleed: true }),
    512,
    path.join(root, "public", "icon-maskable-512.png")
  );
  await renderSvgToPng(
    page,
    iconSvg(180, { fullBleed: true }),
    180,
    path.join(root, "src", "app", "apple-icon.png")
  );
  await renderSvgToPng(
    page,
    iconSvg(512, { fullBleed: true }),
    512,
    path.join(root, "assets", "store", "play-icon-512.png")
  );

  // Feature graphic 1024×500 (Play listing only).
  await page.setViewportSize({ width: 1024, height: 500 });
  await page.setContent(featureGraphicHtml());
  await page.screenshot({
    path: path.join(root, "assets", "store", "feature-graphic-1024x500.png"),
    clip: { x: 0, y: 0, width: 1024, height: 500 },
  });
  console.log("wrote", path.join("assets", "store", "feature-graphic-1024x500.png"));

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
