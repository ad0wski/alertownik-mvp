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
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    lang: "pl-PL",
    // Sprint 162 — kept as the light-mode brand values. The Web App
    // Manifest spec has no dark-mode variant for background_color/theme_color
    // (unlike the HTML `<meta name="theme-color" media="...">` pair in
    // layout.tsx, which does support it) — the OS install/splash surfaces
    // that read this manifest use these fixed values regardless of theme.
    // This is a real, documented gap (see docs/SPRINT_162_..._V1.md), not an
    // oversight.
    background_color: "#f0f9ff",
    theme_color: "#2563eb",
    // Sprint 186A — Store Readiness audit. Optional field, harmless to add
    // now: browsers with a richer install UI (and, later, a TWA wrapper
    // reading this same manifest for Play Console) use `categories` as a
    // hint — closest real fit for a civic-alerts app, not a guess at
    // official Play/App Store taxonomy (that's chosen later, in the actual
    // store listing form, not here).
    categories: ["news", "utilities"],
    icons: [
      // Sprint 128 — PNG icons rendered from the brand master via
      // scripts/generate-mobile-assets.mjs.
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
      // the OS applies its own mask shape over the whole canvas.
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/favicon.ico",
        sizes: "48x48",
        type: "image/x-icon",
      },
    ],
    // Sprint 181B — PWA installation audit. Real captures of the live
    // public site (Production, 2026-07-28) at a phone viewport (390×844)
    // and a desktop viewport (1280×800) — never fabricated data, never an
    // admin/private surface. Enables the richer Android/desktop install UI
    // (a preview carousel in the install prompt); optional per spec, so
    // its absence was never a hard installability blocker, but its
    // presence is checked by PWA audit tooling and improves the install
    // decision for a first-time visitor.
    screenshots: [
      {
        src: "/screenshots/home-narrow.png",
        sizes: "390x844",
        type: "image/png",
        form_factor: "narrow",
        label: "Strona główna — dzisiejsze alerty",
      },
      {
        src: "/screenshots/alerty-narrow.png",
        sizes: "390x844",
        type: "image/png",
        form_factor: "narrow",
        label: "Lista alertów z filtrowaniem",
      },
      {
        src: "/screenshots/home-wide.png",
        sizes: "1280x800",
        type: "image/png",
        form_factor: "wide",
        label: "Strona główna na komputerze",
      },
    ],
  };
}
