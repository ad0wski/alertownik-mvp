import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Alertownik",
    short_name: "Alertownik",
    // Sprint 97 — same location-clarity fix Sprint 95 made to the hero and
    // page <meta description> (src/app/page.tsx, src/app/layout.tsx), found
    // again here during the PWA readiness audit: this text is what shows in
    // the Android install/app-info dialog, a real first-impression surface
    // for someone deciding whether to install.
    description:
      "Lokalne alerty w jednym miejscu — transport, woda, prąd, odpady i komunikaty gminne dla Komorowa, Pruszkowa i okolic.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f0f9ff",
    theme_color: "#2563eb",
    icons: [
      // Sprint 128 — PNG icons rendered from the brand SVG via
      // scripts/generate-mobile-assets.mjs. PNGs listed before the SVG:
      // some Android launchers and older WebViews ignore SVG manifest
      // icons, and fixed-size PNGs are what Play/TWA packaging expects.
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // The maskable entry must be FULL-BLEED (no transparent corners) —
      // the OS applies its own mask shape over the whole canvas. The
      // previous maskable entry reused the rounded icon.svg, whose
      // transparent corners would show through a square or squircle mask;
      // this dedicated full-bleed PNG fixes that.
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/favicon.ico",
        sizes: "48x48",
        type: "image/x-icon",
      },
    ],
  };
}
