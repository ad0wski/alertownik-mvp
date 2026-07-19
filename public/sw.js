// Alertownik service worker — Sprint 158B.
//
// Scope: safe offline fallback for public navigations only. Alerts must
// always be fresh, so this worker deliberately does NOT cache the homepage,
// alert list, alert detail pages, admin routes, or any API/Supabase traffic.
// It only guarantees that a public page request made while offline resolves
// to an honest "no connection" screen instead of a stale cached alert.

// Sprint 162 — bumped v1 -> v2 only because offline.html's content changed
// (dark-mode support). The caching strategy/policy itself is unchanged:
// same precache list, same excluded prefixes, same activate-time cleanup of
// stale "alertownik-pwa-*" caches below. Without this bump, browsers with
// an already-installed v1 worker would keep serving the old light-only
// offline.html indefinitely (the cache key never changes on its own).
const CACHE_NAME = "alertownik-pwa-v2";
const OFFLINE_URL = "/offline.html";
const OFFLINE_ICON = "/icon-192.png";
const PRECACHE_URLS = [OFFLINE_URL, OFFLINE_ICON];

const EXCLUDED_PREFIXES = ["/admin", "/api"];

function isExcludedPath(pathname) {
  return EXCLUDED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("alertownik-pwa-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only ever handle same-origin GET requests. Everything else (POST/PUT/
  // PATCH/DELETE, cross-origin calls to Supabase or elsewhere) passes
  // straight through to the network, untouched.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isExcludedPath(url.pathname) || url.pathname.startsWith("/_next/")) return;

  // Only intercept top-level page navigations. Never intercept or cache
  // fetch/XHR-style requests for JSON, assets, etc. — those should fail
  // normally offline rather than being silently swapped for cached bytes.
  if (request.mode !== "navigate") return;

  event.respondWith(
    fetch(request).catch(() =>
      caches.open(CACHE_NAME).then((cache) => cache.match(OFFLINE_URL))
    )
  );
});
