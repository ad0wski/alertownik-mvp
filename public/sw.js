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
  // LR-8B.3 — capability check used by the push opt-in: only a worker that
  // has the "push" listener below answers. Older versions stay silent, so
  // the page knows it must activate a newer worker before subscribing.
  if (event.data === "ALERTOWNIK_PUSH_PING" && event.ports && event.ports[0]) {
    event.ports[0].postMessage("ALERTOWNIK_PUSH_READY");
  }
});

// ── LR-8A — Web Push ───────────────────────────────────────────────────────
// Payload (sent by /api/admin/push/alert-published, only public alert
// fields): { v: 1, title, body, url: "/alerts/<slug>", tag }.
// Anything malformed still shows a neutral notification — browsers require
// a visible notification for every push — and opens the home page.

const PUSH_FALLBACK = {
  title: "Alertownik",
  body: "Nowy alert w Twojej okolicy.",
  url: "/",
  tag: "alertownik",
};
const ALERT_PATH_RE = /^\/alerts\/[a-z0-9][a-z0-9-]{0,159}$/;

function clip(value, max) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

// Exposed on self for tests; pure function, no side effects.
function parsePushPayload(data) {
  let raw = null;
  try {
    raw = data ? data.json() : null;
  } catch (_) {
    raw = null;
  }
  if (!raw || typeof raw !== "object") return PUSH_FALLBACK;
  const url = typeof raw.url === "string" && ALERT_PATH_RE.test(raw.url) ? raw.url : "/";
  return {
    title: clip(raw.title, 100) || PUSH_FALLBACK.title,
    body: clip(raw.body, 160) || PUSH_FALLBACK.body,
    url,
    tag: clip(raw.tag, 64) || PUSH_FALLBACK.tag,
  };
}
self.parsePushPayload = parsePushPayload;

self.addEventListener("push", (event) => {
  const msg = parsePushPayload(event.data);
  event.waitUntil(
    self.registration.showNotification(msg.title, {
      body: msg.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: msg.tag,
      data: { url: msg.url },
    })
  );
});

// Same-origin only: the target is rebuilt from a validated path, never
// taken as a full URL from the payload (no open redirect).
function notificationTarget(data) {
  const path = data && typeof data.url === "string" && ALERT_PATH_RE.test(data.url) ? data.url : "/";
  return new URL(path, self.location.origin).href;
}
self.notificationTarget = notificationTarget;

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = notificationTarget(event.notification.data);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          // navigate() only works on windows this worker controls; fall
          // back to a new window rather than doing nothing.
          return client
            .navigate(target)
            .then((c) => (c && typeof c.focus === "function" ? c : client).focus())
            .catch(() => self.clients.openWindow(target));
        }
      }
      return self.clients.openWindow(target);
    })
  );
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
