// LR-8A — browser side of push opt-in. No secrets here: only the PUBLIC
// VAPID key (NEXT_PUBLIC_VAPID_PUBLIC_KEY) is ever read in the browser.

export const PUSH_STORAGE_KEY = "alertownik-push";

export type PushUiState =
  | { kind: "hidden" }
  | { kind: "unsupported" }
  | { kind: "ios-needs-install" }
  | { kind: "denied" }
  | { kind: "default" }
  | { kind: "stale"; locality: string }
  | { kind: "subscribed"; locality: string };

export function isPushUiEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_PUSH_NOTIFICATIONS_ENABLED === "true" &&
    Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)
  );
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports as Mac; touch points tell it apart.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

function hasPushApis(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

interface StoredPush {
  locality: string;
  endpoint: string;
}

function readStored(): StoredPush | null {
  try {
    const raw = localStorage.getItem(PUSH_STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<StoredPush>;
    return typeof v.locality === "string" && typeof v.endpoint === "string" ? (v as StoredPush) : null;
  } catch {
    return null;
  }
}

function writeStored(v: StoredPush | null) {
  try {
    if (v) localStorage.setItem(PUSH_STORAGE_KEY, JSON.stringify(v));
    else localStorage.removeItem(PUSH_STORAGE_KEY);
  } catch {
    // storage blocked — the server-side subscription still works
  }
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  return existing ?? null;
}

// ── LR-8B.3 — service worker lifecycle ──────────────────────────────────────
// Push events are delivered to the registration's ACTIVE worker. A returning
// visitor can still have an older /sw.js active (one without a "push"
// listener) while the new one sits in "waiting" — sw.js deliberately does
// not skipWaiting() on install (PwaController lets the user choose when to
// update). Subscribing in that state succeeds and the push service accepts
// messages, but nothing is ever shown. So before subscribing — and whenever
// a subscribed visitor comes back — the newest worker is made the active one
// with the existing SKIP_WAITING message. No page reload is needed: the
// worker only provides the offline screen and push handling, and
// PwaController reloads only when the user asked for it.

/** Upper bound for a worker to install/activate before we give up. */
export const SW_ACTIVATION_TIMEOUT_MS = 10_000;

type WorkerState = ServiceWorker["state"];

/** Resolves with the first of `targets` the worker reaches, or "timeout".
 *  Event-driven (statechange), no polling. */
function waitForWorkerState(worker: ServiceWorker, targets: WorkerState[], timeoutMs: number): Promise<WorkerState | "timeout"> {
  if (targets.includes(worker.state)) return Promise.resolve(worker.state);
  return new Promise((resolve) => {
    const finish = (result: WorkerState | "timeout") => {
      clearTimeout(timer);
      worker.removeEventListener("statechange", onChange);
      resolve(result);
    };
    const onChange = () => {
      if (targets.includes(worker.state)) finish(worker.state);
    };
    const timer = setTimeout(() => finish("timeout"), timeoutMs);
    worker.addEventListener("statechange", onChange);
  });
}

/** Asks a worker whether it handles push (sw.js answers the
 *  ALERTOWNIK_PUSH_PING since LR-8B.3; older versions never answer). */
function workerHandlesPush(worker: ServiceWorker, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      resolve(false);
    }, timeoutMs);
    channel.port1.onmessage = (e) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(e.data === "ALERTOWNIK_PUSH_READY");
    };
    try {
      worker.postMessage("ALERTOWNIK_PUSH_PING", [channel.port2]);
    } catch {
      clearTimeout(timer);
      resolve(false);
    }
  });
}

/** Triggers an update check and resolves once a newer worker shows up
 *  (installing/waiting), or false at the deadline. Event-driven. */
function waitForNewerWorker(reg: ServiceWorkerRegistration, timeoutMs: number): Promise<boolean> {
  if (reg.installing || reg.waiting) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = (found: boolean) => {
      clearTimeout(timer);
      reg.removeEventListener("updatefound", onFound);
      resolve(found);
    };
    const onFound = () => finish(true);
    const timer = setTimeout(() => finish(Boolean(reg.installing || reg.waiting)), timeoutMs);
    reg.addEventListener("updatefound", onFound);
    reg.update().then(
      () => {
        if (reg.installing || reg.waiting) finish(true);
      },
      () => undefined
    );
  });
}

/** How long one capability ping may take before the worker counts as old. */
const PUSH_PING_TIMEOUT_MS = 1500;

/**
 * Makes sure the registration's ACTIVE worker is one that handles push:
 * a newer worker that is installing or waiting is always activated first
 * (SKIP_WAITING); then the active worker must answer the capability ping.
 * If it does not (an older version), an update is fetched and activated.
 * Returns false at the deadline — fail closed: the caller must not report
 * a working subscription.
 */
export async function activateLatestWorker(
  reg: ServiceWorkerRegistration,
  timeoutMs: number = SW_ACTIVATION_TIMEOUT_MS
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  const left = () => Math.max(0, deadline - Date.now());

  for (let round = 0; left() > 0; round++) {
    // Let the browser update reg.installing/waiting/active between rounds.
    if (round > 0) await new Promise((r) => setTimeout(r, 0));
    const installing = reg.installing;
    if (installing) {
      const state = await waitForWorkerState(installing, ["installed", "activating", "activated", "redundant"], left());
      if (state === "timeout") return false;
      continue; // re-read: it is now waiting, active, or gone
    }

    const waiting = reg.waiting;
    if (waiting) {
      waiting.postMessage("SKIP_WAITING");
      const state = await waitForWorkerState(waiting, ["activated", "redundant"], left());
      if (state === "timeout") return false;
      continue;
    }

    if (!reg.active) {
      // First visit: the very first worker activates on its own.
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([navigator.serviceWorker.ready, new Promise((r) => (timer = setTimeout(r, left())))]);
      clearTimeout(timer);
      if (!reg.active) return false;
      continue;
    }

    const active = reg.active;
    if (active.state !== "activated") {
      const state = await waitForWorkerState(active, ["activated", "redundant"], left());
      if (state !== "activated") continue;
    }
    if (await workerHandlesPush(active, Math.min(PUSH_PING_TIMEOUT_MS, left()))) return true;

    // An older worker without push support is active: get the new version.
    if (!(await waitForNewerWorker(reg, left()))) return false;
  }
  return false;
}

/**
 * For a visitor who already has a push subscription: make sure the active
 * worker handles push (activating a newer one if needed). Never creates or
 * changes a subscription. Safe on every visit; cheap when up to date.
 */
export async function ensureLatestWorkerForPush(): Promise<void> {
  if (!isPushUiEnabled() || !hasPushApis()) return;
  try {
    const reg = await getRegistration();
    if (!reg || !(await reg.pushManager.getSubscription())) return;
    await activateLatestWorker(reg);
  } catch {
    // Best effort: the next visit tries again.
  }
}

export async function readPushState(): Promise<PushUiState> {
  if (!isPushUiEnabled()) return { kind: "hidden" };
  if (!hasPushApis()) return isIos() && !isStandalone() ? { kind: "ios-needs-install" } : { kind: "unsupported" };
  if (isIos() && !isStandalone()) return { kind: "ios-needs-install" };
  if (Notification.permission === "denied") return { kind: "denied" };
  const stored = readStored();
  const reg = await getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (stored && sub && sub.endpoint === stored.endpoint && Notification.permission === "granted") {
    return { kind: "subscribed", locality: stored.locality };
  }
  if (stored) return { kind: "stale", locality: stored.locality };
  return { kind: "default" };
}

function applicationServerKey(): Uint8Array {
  const b64 = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export type SubscribeResult = { ok: true } | { ok: false; state: "denied" | "default" | "error" };

/** MUST be called directly from a click handler: the permission prompt is
 *  requested first, before any await, so the user gesture is preserved
 *  (iOS and Chrome both require it). */
export async function enablePush(locality: string): Promise<SubscribeResult> {
  const permission = await Notification.requestPermission();
  if (permission === "denied") return { ok: false, state: "denied" };
  if (permission !== "granted") return { ok: false, state: "default" };
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    // LR-8B.3 — the worker that will receive pushes must be the current
    // one (with the "push" listener), not an older active version.
    if (!(await activateLatestWorker(reg))) return { ok: false, state: "error" };
    await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey() as BufferSource,
      }));
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...sub.toJSON(), locality }),
    });
    if (!res.ok) {
      // Server refused → do not leave a browser subscription nobody knows about.
      await sub.unsubscribe().catch(() => undefined);
      writeStored(null);
      return { ok: false, state: "error" };
    }
    writeStored({ locality, endpoint: sub.endpoint });
    return { ok: true };
  } catch {
    return { ok: false, state: "error" };
  }
}

export async function disablePush(): Promise<boolean> {
  const stored = readStored();
  try {
    const reg = await getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    const endpoint = sub?.endpoint ?? stored?.endpoint;
    if (endpoint) {
      const res = await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
      if (!res.ok) return false;
    }
    await sub?.unsubscribe().catch(() => undefined);
    writeStored(null);
    return true;
  } catch {
    return false;
  }
}
