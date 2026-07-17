import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Sprint 158B — the service worker file itself must be revalidated
        // on every request, otherwise browsers/CDNs can serve a stale sw.js
        // and a real update can silently never reach installed clients.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/(.*)",
        headers: [{ key: "Content-Security-Policy", value: "worker-src 'self'" }],
      },
    ];
  },
};

export default nextConfig;
