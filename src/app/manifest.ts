import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Alertownik",
    short_name: "Alertownik",
    description: "Lokalne alerty w jednym miejscu",
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
      {
        src: "/favicon.ico",
        sizes: "48x48",
        type: "image/x-icon",
      },
    ],
  };
}
