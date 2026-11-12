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
