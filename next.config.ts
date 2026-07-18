import type { NextConfig } from "next";

// Sprint 161 — replaces the previous `worker-src 'self'`-only CSP fragment
// with a real, site-wide policy, plus the standard header set that was
// entirely missing before.
//
// This is the next.config.js "without nonces" approach that Next's own docs
// recommend (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md)
// for apps that don't need to selectively allow specific inline scripts.
// The nonce-based alternative requires forcing every page into dynamic
// rendering (no static generation, no ISR, no CDN caching) — a much larger
// architectural change than this hardening sprint's scope, and not
// something to take on silently. `script-src` and `style-src` keep
// 'unsafe-inline' because Next.js App Router injects its own inline
// bootstrap/streaming scripts (the `self.__next_f.push(...)` chunks used to
// stream RSC payloads) regardless of app code — those are Next's, not
// ours, and removing 'unsafe-inline' without nonces would break every page.
// `unsafe-eval` is added only in development (React's own dev-mode error
// reconstruction needs it; Next's docs flag the same exception) and is
// never present in the production header.
const isDev = process.env.NODE_ENV === "development";

const supabaseOrigin = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  try {
    return raw ? new URL(raw).origin : "";
  } catch {
    return "";
  }
})();

const cspDirectives = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob:`,
  `font-src 'self'`,
  `connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin}` : ""}`,
  `worker-src 'self'`,
  `manifest-src 'self'`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
];
// upgrade-insecure-requests would force the dev server's own http://localhost
// sub-resource requests to https and break `next dev` entirely — production
// is HTTPS-only on Vercel already, so this only needs to apply there.
if (!isDev) cspDirectives.push("upgrade-insecure-requests");

const contentSecurityPolicy = cspDirectives.join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Fallback for browsers that don't yet honor frame-ancestors.
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];
if (!isDev) {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  });
}

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
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
