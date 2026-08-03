// Renders the PWA/store icon set from the Alertownik brand mark
// (assets/brand/alertownik-logo-master.png: the approved "concept 2" logo —
// white location-pin with a bell inside, symmetric blue sound waves, navy
// background with faint map lines) using the Chromium bundled with
// Playwright — no extra dependencies.
//
// Usage: node scripts/generate-mobile-assets.mjs
//
// The master file is a full-bleed, edge-to-edge navy square (no canvas
// margin, no presentational shadow, no rounded corners baked in) — that is
// the reproducible source of truth for every output below. Do not
// hand-edit the generated files; regenerate them from the master instead.
//
// Outputs:
//   public/icon-192.png            — manifest icon (purpose: any, transparent corners)
//   public/icon-512.png            — manifest icon (purpose: any, transparent corners)
//   public/icon-maskable-512.png   — manifest icon (purpose: maskable, FULL-BLEED,
//                                    symbol inset to the standard (large) safe zone —
//                                    the OS applies its own mask over the whole canvas)
//   src/app/apple-icon.png         — 180×180 apple-touch-icon (full-bleed; iOS
//                                    applies its own corner rounding, not a safe-zone crop)
//   assets/store/play-icon-512.png — Google Play store listing icon (full-bleed,
//                                    small breathing-room margin only — NOT the
//                                    maskable safe-zone inset; Play isn't an
//                                    adaptive icon, it just displays this image)
//   assets/store/feature-graphic-1024x500.png — Google Play feature graphic
//
// There is no public/icon.svg — it was removed once nothing referenced it
// (see AppHeader.tsx and src/app/manifest.ts, both PNG-only now). If a
// vector/SVG brand mark is needed again later, regenerate it deliberately
// rather than reviving this file.
//
// Store assets in assets/store/ are NOT served by the app — they exist only
// for a future Play listing. Review every output visually before committing.

import { chromium } from "playwright";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const MASTER_PATH = path.join(root, "assets", "brand", "alertownik-logo-master.png");
const BRAND_BG = "#f0f9ff";
const BRAND_DARK = "#1e3a8a";
// Sampled directly from the master's own edge tone (see assets/brand
// generation notes) so the safe-zone padding on maskable/Play variants
// blends into the master's navy background instead of showing a seam.
const MASTER_EDGE_NAVY = "#03142f";
// Same geometry ratio as the pre-Sprint-190 brand mark (rx 40 of 192) —
// kept so the "purpose: any" icons still read as a rounded-square glyph.
const ROUNDED_RATIO = 40 / 192;
// Standard maskable-icon guidance: keep all meaningful content inside the
// centered ~80%-diameter safe circle. 0.72 gives a comfortable margin.
const SAFE_ZONE_SCALE = 0.72;
// Google Play store listing icon — not an adaptive/maskable icon, so the
// large maskable safe-zone inset doesn't apply. Just a small, conventional
// breathing-room margin so the mark isn't cropped edge-to-edge.
const PLAY_ICON_SCALE = 0.94;

async function loadMasterDataUrl() {
  const buf = await readFile(MASTER_PATH);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

async function renderMaster(page, dataUrl, size, outPath, { rounded = false, insetScale } = {}) {
  const rx = rounded ? Math.round(ROUNDED_RATIO * size) : 0;
  const hasInset = typeof insetScale === "number";
  const inset = hasInset ? Math.round((size * (1 - insetScale)) / 2) : 0;
  const drawSize = size - inset * 2;

  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!doctype html><html><head><style>
    *{margin:0;padding:0}
    body{background:transparent}
    canvas{display:block}
  </style></head><body>
    <canvas id="c" width="${size}" height="${size}"></canvas>
    <img id="src" src="${dataUrl}" style="display:none">
  </body></html>`);
  await page.waitForFunction(() => {
    const img = document.getElementById("src");
    return img.complete && img.naturalWidth > 0;
  });
  await page.evaluate(
    ({ size, rx, hasInset, inset, drawSize, fill }) => {
      const img = document.getElementById("src");
      const c = document.getElementById("c");
      const ctx = c.getContext("2d");
      ctx.clearRect(0, 0, size, size);
      if (hasInset) {
        // Fill the full-bleed canvas with the master's own navy edge tone,
        // then draw the (unmodified) logo scaled down by `inset` — padding
        // only, the artwork itself is never redrawn or distorted. Used for
        // the maskable safe zone (large inset) and the Play store icon's
        // small breathing-room margin (small inset) alike.
        ctx.fillStyle = fill;
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, inset, inset, drawSize, drawSize);
      } else {
        ctx.save();
        if (rx > 0) {
          ctx.beginPath();
          ctx.roundRect(0, 0, size, size, rx);
          ctx.clip();
        }
        ctx.drawImage(img, 0, 0, size, size);
        ctx.restore();
      }
    },
    { size, rx, hasInset, inset, drawSize, fill: MASTER_EDGE_NAVY }
  );
  const el = await page.$("#c");
  await el.screenshot({ path: outPath, omitBackground: true });
  console.log("wrote", path.relative(root, outPath));
}

function featureGraphicHtml(markDataUrl) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1024px; height: 500px;
    background: ${BRAND_BG};
    display: flex; align-items: center; justify-content: center; gap: 56px;
    font-family: "Segoe UI", system-ui, -apple-system, Arial, sans-serif;
  }
  .mark { flex: 0 0 auto; width: 180px; height: 180px; border-radius: ${Math.round(ROUNDED_RATIO * 180)}px; overflow: hidden; }
  .mark img { width: 100%; height: 100%; display: block; }
  .text { display: flex; flex-direction: column; gap: 14px; max-width: 620px; }
  h1 { font-size: 84px; font-weight: 700; color: ${BRAND_DARK}; letter-spacing: -1px; }
  p.tagline { font-size: 34px; color: #334155; }
  p.area { font-size: 24px; color: #64748b; }
  </style></head><body>
    <div class="mark"><img src="${markDataUrl}"></div>
    <div class="text">
      <h1>Alertownik</h1>
      <p class="tagline">Lokalne alerty w jednym miejscu</p>
      <p class="area">Transport &middot; woda &middot; pr&#261;d &middot; odpady &middot; komunikaty gminne</p>
    </div>
  </body></html>`;
}

async function main() {
  await mkdir(path.join(root, "assets", "store"), { recursive: true });

  const dataUrl = await loadMasterDataUrl();

  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  // Manifest icons (purpose: any) — rounded corners, transparent outside.
  await renderMaster(page, dataUrl, 192, path.join(root, "public", "icon-192.png"), { rounded: true });
  await renderMaster(page, dataUrl, 512, path.join(root, "public", "icon-512.png"), { rounded: true });

  // Maskable + Apple — full-bleed, platform applies its own mask. Maskable
  // insets the symbol to the standard (large) safe zone; Apple only rounds
  // corners (no safe-zone crop), so no inset needed.
  await renderMaster(page, dataUrl, 512, path.join(root, "public", "icon-maskable-512.png"), { insetScale: SAFE_ZONE_SCALE });
  await renderMaster(page, dataUrl, 180, path.join(root, "src", "app", "apple-icon.png"), {});

  // Google Play store listing icon — NOT a maskable/adaptive icon, so it
  // deliberately does not use SAFE_ZONE_SCALE: bigger artwork, only a small
  // breathing-room margin, distinct on purpose from icon-maskable-512.png.
  await renderMaster(page, dataUrl, 512, path.join(root, "assets", "store", "play-icon-512.png"), { insetScale: PLAY_ICON_SCALE });

  // Feature graphic 1024×500 (Play listing only) — same mark, text unchanged.
  await page.setViewportSize({ width: 1024, height: 500 });
  await page.setContent(featureGraphicHtml(dataUrl));
  await page.waitForFunction(() => {
    const img = document.querySelector(".mark img");
    return img.complete && img.naturalWidth > 0;
  });
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
