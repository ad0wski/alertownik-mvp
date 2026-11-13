import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

// LR-8A — runs the real public/sw.js in an isolated VM with a fake
// ServiceWorkerGlobalScope, then fires push / notificationclick events.

const ORIGIN = "https://alertownik.example";

function loadWorker(windows: Array<{ url: string; navigate?: (u: string) => Promise<unknown> }> = []) {
  const handlers: Record<string, (e: unknown) => void> = {};
  const shown: Array<{ title: string; options: Record<string, unknown> }> = [];
  const opened: string[] = [];
  const navigated: string[] = [];
  const self = {
    addEventListener: (type: string, fn: (e: unknown) => void) => (handlers[type] = fn),
    location: { origin: ORIGIN },
    registration: {
      showNotification: async (title: string, options: Record<string, unknown>) => void shown.push({ title, options }),
    },
    clients: {
      matchAll: async () =>
        windows.map((w) => ({
          url: w.url,
          focus: async () => w,
          navigate: w.navigate ?? (async (u: string) => (navigated.push(u), w)),
        })),
      openWindow: async (u: string) => void opened.push(u),
      claim: async () => undefined,
    },
    skipWaiting: () => undefined,
  } as Record<string, unknown>;
  const context = vm.createContext({ self, caches: {}, fetch: () => Promise.reject(), URL, console });
  vm.runInContext(readFileSync(join(__dirname, "..", "..", "public", "sw.js"), "utf-8"), context);

  async function fire(type: string, event: Record<string, unknown>) {
    let pending: Promise<unknown> = Promise.resolve();
    handlers[type]({ ...event, waitUntil: (p: Promise<unknown>) => (pending = p) });
    await pending;
  }
  return { handlers, shown, opened, navigated, fire, self };
}

const data = (value: unknown) => ({ json: () => (typeof value === "string" ? JSON.parse(value) : value) });

test.describe("LR-8A service worker push", () => {
  test("keeps the existing install/activate/fetch/message handlers", () => {
    const w = loadWorker();
    for (const t of ["install", "activate", "message", "fetch", "push", "notificationclick"]) {
      expect(typeof w.handlers[t]).toBe("function");
    }
  });

  test("valid payload shows the alert as a notification with its URL", async () => {
    const w = loadWorker();
    await w.fire("push", {
      data: data({ v: 1, title: "Brak wody - Granica", body: "Granica · 13.11.2026, 09:00 – 13:00", url: "/alerts/brak-wody-granica", tag: "alert-brak-wody-granica" }),
    });
    expect(w.shown).toHaveLength(1);
    expect(w.shown[0].title).toBe("Brak wody - Granica");
    expect(w.shown[0].options).toMatchObject({
      body: "Granica · 13.11.2026, 09:00 – 13:00",
      tag: "alert-brak-wody-granica",
      data: { url: "/alerts/brak-wody-granica" },
      icon: "/icon-192.png",
    });
  });

  test("malformed, empty or hostile payloads fall back to a neutral notification", async () => {
    const cases = [
      { json: () => { throw new SyntaxError("bad"); } },
      null,
      data("not an object"),
      data({ title: 42, body: ["x"], url: "https://evil.example/phish" }),
      data({ title: "T", body: "B", url: "javascript:alert(1)" }),
      data({ title: "T", body: "B", url: "//evil.example/x" }),
      data({ title: "T", body: "B", url: "/alerts/../../admin" }),
    ];
    for (const c of cases) {
      const w = loadWorker();
      await w.fire("push", { data: c });
      expect(w.shown).toHaveLength(1);
      expect(w.shown[0].options.data).toEqual({ url: expect.stringMatching(/^\/(alerts\/[a-z0-9-]+)?$/) });
      expect((w.shown[0].options.data as { url: string }).url).not.toContain("evil");
    }
    const huge = loadWorker();
    await huge.fire("push", { data: data({ title: "x".repeat(500), body: "y".repeat(500), url: "/alerts/a" }) });
    expect((huge.shown[0].title as string).length).toBe(100);
    expect((huge.shown[0].options.body as string).length).toBe(160);
  });

  test("click opens the exact alert URL when no window is open", async () => {
    const w = loadWorker();
    let closed = false;
    await w.fire("notificationclick", { notification: { close: () => (closed = true), data: { url: "/alerts/brak-wody-granica" } } });
    expect(closed).toBe(true);
    expect(w.opened).toEqual([`${ORIGIN}/alerts/brak-wody-granica`]);
  });

  test("click reuses an open Alertownik window and navigates it", async () => {
    const w = loadWorker([{ url: `${ORIGIN}/` }]);
    await w.fire("notificationclick", { notification: { close: () => undefined, data: { url: "/alerts/brak-wody-granica" } } });
    expect(w.navigated).toEqual([`${ORIGIN}/alerts/brak-wody-granica`]);
    expect(w.opened).toEqual([]);
  });

  test("click never leaves the origin, even with hostile notification data", async () => {
    for (const url of ["https://evil.example/", "//evil.example", "javascript:alert(1)", undefined]) {
      const w = loadWorker();
      await w.fire("notificationclick", { notification: { close: () => undefined, data: { url } } });
      expect(w.opened).toEqual([`${ORIGIN}/`]);
    }
  });

  test("an uncontrolled window that cannot navigate falls back to a new window", async () => {
    const w = loadWorker([{ url: `${ORIGIN}/`, navigate: () => Promise.reject(new TypeError("not controlled")) }]);
    await w.fire("notificationclick", { notification: { close: () => undefined, data: { url: "/alerts/a" } } });
    expect(w.opened).toEqual([`${ORIGIN}/alerts/a`]);
  });
});

// LR-8B.3 — the page activates a newer worker before subscribing when the
// active one does not answer this ping (older sw.js versions never do).
test.describe("LR-8B.3 service worker push capability ping", () => {
  test("answers ALERTOWNIK_PUSH_PING on the given port; SKIP_WAITING still works; other messages ignored", () => {
    const w = loadWorker();
    const replies: unknown[] = [];
    let skipped = 0;
    (w.self as { skipWaiting: () => void }).skipWaiting = () => void skipped++;
    const port = { postMessage: (m: unknown) => replies.push(m) };
    w.handlers.message({ data: "ALERTOWNIK_PUSH_PING", ports: [port] });
    expect(replies).toEqual(["ALERTOWNIK_PUSH_READY"]);
    w.handlers.message({ data: "ALERTOWNIK_PUSH_PING", ports: [] }); // no port → no crash, no reply
    w.handlers.message({ data: "SOMETHING_ELSE", ports: [port] });
    expect(replies).toHaveLength(1);
    w.handlers.message({ data: "SKIP_WAITING" });
    expect(skipped).toBe(1);
  });

  test("the pre-LR-8A worker (fixture) has no push listener and never answers the ping", () => {
    const old = readFileSync(join(__dirname, "..", "push-lab", "fixtures", "sw-pre-lr8a.js"), "utf-8");
    expect(old).not.toContain('addEventListener("push"');
    expect(old).not.toContain("ALERTOWNIK_PUSH_PING");
  });
});
