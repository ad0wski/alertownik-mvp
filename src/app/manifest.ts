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
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      // "maskable" added Sprint 97 — same file, separate manifest entry,
      // since Next.js's manifest type only accepts one purpose value per
      // entry (the W3C spec's space-separated multi-value form isn't
      // representable here). The icon's actual visible content (a small
      // centered dot) sits well inside the safe zone any OS mask would
      // crop to, and the background is already a full-bleed rounded
      // square — exactly the shape a maskable icon is supposed to provide.
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
      {
        src: "/favicon.ico",
        sizes: "48x48",
        type: "image/x-icon",
      },
    ],
  };
}
