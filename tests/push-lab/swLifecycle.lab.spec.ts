import { test, expect, type BrowserContext, type Page, type CDPSession } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// LR-8B.3 — real Chromium, real production build, real /sw.js, real
// PwaController and real pushClient.enablePush(). Reproduces the LR-8B.2
// Production failure (returning visitor: pre-push service worker active, new
// one waiting → push accepted by the push service but nothing shown) and
// proves the fix.
//
// Only two things are replaced: PushManager.subscribe/getSubscription (the
// test Chromium has no Google push service) and /api/push/* (nothing is
// stored anywhere). Push messages are injected with the DevTools protocol
// (ServiceWorker.deliverPushMessage) straight into the active worker.

const UPSTREAM = "http://localhost:3200";
const OLD_SW = readFileSync(join(__dirname, "fixtures", "sw-pre-lr8a.js"), "utf8"); // sw.js before LR-8A: no "push" listener
type SwMode = "current" | "old" | "stuck";
let swMode: SwMode = "current";
let proxy: Server;
let ORIGIN = "";

const PAYLOAD = {
  v: 1,
  title: "Brak wody",
  body: "Reguły, ul. Wiejska · 13.11.2026, 10:00 – 16:00",
  url: "/alerts/brak-wody-reguly-ul-wiejska",
  tag: "alert-brak-wody-reguly-ul-wiejska",
};

async function currentSw(): Promise<string> {
  return (await fetch(`${UPSTREAM}/sw.js`, { cache: "no-store" })).text();
}

/** The current worker minus its SKIP_WAITING handler: a new version that
 *  never activates, to prove enablePush fails closed instead of lying. */
async function stuckSw(): Promise<string> {
  const src = await currentSw();
  const stuck = src.replace(/self\.addEventListener\("message"[\s\S]*?\n\}\);\n/, "// message handler removed (test)\n");
  if (stuck === src) throw new Error("could not build the stuck worker variant");
  return stuck;
}

test.beforeAll(async () => {
  // Same-origin proxy in front of `next start`: everything is forwarded,
  // except /sw.js which follows swMode.
  proxy = createServer(async (req, res) => {
    try {
      const path = req.url ?? "/";
      if (path.split("?")[0] === "/sw.js") {
        const body = swMode === "old" ? OLD_SW : swMode === "stuck" ? await stuckSw() : await currentSw();
        res.writeHead(200, { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store" });
        res.end(body);
        return;
      }
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string" && !["host", "content-length", "connection"].includes(k)) headers[k] = v;
      const up = await fetch(UPSTREAM + path, {
        method: req.method,
        headers,
        body: chunks.length ? Buffer.concat(chunks) : undefined,
        redirect: "manual",
      });
      const out: Record<string, string> = {};
      up.headers.forEach((v, k) => {
        if (!["content-encoding", "content-length", "transfer-encoding", "connection"].includes(k)) out[k] = v;
      });
      res.writeHead(up.status, out);
      res.end(Buffer.from(await up.arrayBuffer()));
    } catch {
      res.writeHead(502);
      res.end();
    }
  });
  await new Promise<void>((r) => proxy.listen(0, "127.0.0.1", r));
  const addr = proxy.address();
  ORIGIN = `http://localhost:${typeof addr === "object" && addr ? addr.port : 0}`;
});

test.afterAll(async () => {
  await new Promise<void>((r) => proxy.close(() => r()));
});

test.beforeEach(() => {
  swMode = "current";
});

interface Lab {
  ctx: BrowserContext;
  page: Page;
  cdp: CDPSession;
  apiCalls: string[];
  registrationId: () => string;
}

async function openLab(browser: import("@playwright/test").Browser, opts: { existingSubscription?: boolean } = {}): Promise<Lab> {
  const ctx = await browser.newContext();
  await ctx.grantPermissions(["notifications"], { origin: ORIGIN });
  const apiCalls: string[] = [];
  await ctx.route("**/api/push/**", async (route) => {
    apiCalls.push(new URL(route.request().url()).pathname);
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
  await ctx.addInitScript((existing: boolean) => {
    const w = window as unknown as Record<string, unknown>;
    const log = { subscribes: 0 };
    w.__pushLab = log;
    const endpoint = "https://fcm.googleapis.com/fcm/send/push-lab";
    const makeSub = () => ({
      endpoint,
      toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: "B".padEnd(87, "A"), auth: "A".repeat(22) } }),
      unsubscribe: async () => true,
    });
    let current: unknown = existing ? makeSub() : null;
    PushManager.prototype.subscribe = async function () {
      log.subscribes++;
      current = makeSub();
      return current as PushSubscription;
    };
    PushManager.prototype.getSubscription = async function () {
      return current as PushSubscription | null;
    };
    if (existing) {
      localStorage.setItem("alertownik-push", JSON.stringify({ locality: "Reguły", endpoint }));
    }
  }, Boolean(opts.existingSubscription));
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  let regId = "";
  cdp.on("ServiceWorker.workerRegistrationUpdated", (e) => {
    for (const r of e.registrations) if (!r.isDeleted && r.scopeURL === `${ORIGIN}/`) regId = r.registrationId;
  });
  await cdp.send("ServiceWorker.enable");
  return { ctx, page, cdp, apiCalls, registrationId: () => regId };
}

const swState = (page: Page) =>
  page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration("/");
    return {
      active: r?.active?.state ?? null,
      waiting: Boolean(r?.waiting),
      installing: Boolean(r?.installing),
      controlled: Boolean(navigator.serviceWorker.controller),
    };
  });

/** Visit with the pre-LR-8A worker and wait until it controls the page. */
async function becomeReturningVisitor(lab: Lab) {
  swMode = "old";
  await lab.page.goto(`${ORIGIN}/`);
  await lab.page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 30_000 });
}

/** Injects one push into the active worker; returns what is displayed. */
async function pushAndRead(lab: Lab) {
  await lab.page.evaluate(async () => {
    for (const n of await (await navigator.serviceWorker.getRegistration("/"))!.getNotifications()) n.close();
  });
  await lab.cdp.send("ServiceWorker.deliverPushMessage", {
    origin: `${ORIGIN}/`,
    registrationId: lab.registrationId(),
    data: JSON.stringify(PAYLOAD),
  });
  await lab.page.waitForTimeout(1500);
  return lab.page.evaluate(async () =>
    (await (await navigator.serviceWorker.getRegistration("/"))!.getNotifications()).map((n) => ({
      title: n.title,
      body: n.body,
      url: (n.data as { url?: string } | null)?.url ?? null,
    }))
  );
}

const subscribes = (page: Page) => page.evaluate(() => (window as unknown as { __pushLab: { subscribes: number } }).__pushLab.subscribes);
const EXPECTED = [{ title: PAYLOAD.title, body: PAYLOAD.body, url: PAYLOAD.url }];

test.describe("LR-8B.3 service worker lifecycle and push display (real Chromium)", () => {
  test("A. fresh visitor: enable → current worker active → push is shown", async ({ browser }) => {
    const lab = await openLab(browser);
    await lab.page.goto(`${ORIGIN}/ustawienia`);
    const card = lab.page.getByTestId("push-card");
    await card.getByRole("button", { name: /Włącz powiadomienia dla/ }).click();
    await expect(card).toHaveAttribute("data-state", "subscribed", { timeout: 20_000 });
    expect(await swState(lab.page)).toMatchObject({ active: "activated", waiting: false });
    expect(await pushAndRead(lab)).toEqual(EXPECTED);
    expect(lab.apiCalls).toEqual(["/api/push/subscribe"]);
    await lab.ctx.close();
  });

  test("B. returning visitor (pre-push worker active, new one waiting): enable activates it first → push is shown", async ({ browser }) => {
    const lab = await openLab(browser);
    await becomeReturningVisitor(lab);
    swMode = "current";
    await lab.page.goto(`${ORIGIN}/ustawienia`);
    await lab.page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration("/"))?.waiting), null, { timeout: 30_000 });
    // The LR-8B.2 Production condition, reproduced: push goes to the old worker → nothing shown.
    expect(await pushAndRead(lab)).toEqual([]);
    await expect(lab.page.getByText("Dostępna jest nowa wersja Alertownika.")).toBeVisible();

    const card = lab.page.getByTestId("push-card");
    await card.getByRole("button", { name: /Włącz powiadomienia dla/ }).click();
    await expect(card).toHaveAttribute("data-state", "subscribed", { timeout: 20_000 });
    expect(await swState(lab.page)).toMatchObject({ active: "activated", waiting: false, installing: false });
    expect(await pushAndRead(lab)).toEqual(EXPECTED);
    // No forced reload happened, and the now-stale update banner is gone.
    await expect(lab.page.getByText("Dostępna jest nowa wersja Alertownika.")).toHaveCount(0);
    expect(await subscribes(lab.page)).toBe(1);
    await lab.ctx.close();
  });

  test("C. existing subscriber with the pre-push worker: visiting settings activates the new worker, no second subscription", async ({ browser }) => {
    const lab = await openLab(browser, { existingSubscription: true });
    await becomeReturningVisitor(lab);
    expect(await pushAndRead(lab)).toEqual([]); // the broken state before the fix kicks in
    swMode = "current";
    await lab.page.goto(`${ORIGIN}/ustawienia`);
    const card = lab.page.getByTestId("push-card");
    await expect(card).toHaveAttribute("data-state", "subscribed", { timeout: 20_000 });
    await expect.poll(async () => (await swState(lab.page)).waiting, { timeout: 20_000 }).toBe(false);
    expect(await swState(lab.page)).toMatchObject({ active: "activated", installing: false });
    expect(await pushAndRead(lab)).toEqual(EXPECTED);
    expect(await subscribes(lab.page)).toBe(0);
    expect(lab.apiCalls).toEqual([]);
    await lab.ctx.close();
  });

  test("D. new worker never activates: enable fails closed after the timeout, nothing subscribed or stored", async ({ browser }) => {
    const lab = await openLab(browser);
    await becomeReturningVisitor(lab);
    swMode = "stuck";
    await lab.page.goto(`${ORIGIN}/ustawienia`);
    await lab.page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration("/"))?.waiting), null, { timeout: 30_000 });
    const card = lab.page.getByTestId("push-card");
    await card.getByRole("button", { name: /Włącz powiadomienia dla/ }).click();
    await expect(card.getByRole("alert")).toContainText("Nie udało się włączyć powiadomień", { timeout: 20_000 });
    await expect(card).not.toHaveAttribute("data-state", "subscribed");
    expect(await subscribes(lab.page)).toBe(0);
    expect(lab.apiCalls).toEqual([]);
    expect(await lab.page.evaluate(() => localStorage.getItem("alertownik-push"))).toBeNull();
    await lab.ctx.close();
  });

  test("E. notification click target is the alert page on the same origin", async ({ browser }) => {
    const lab = await openLab(browser);
    await lab.page.goto(`${ORIGIN}/ustawienia`);
    await lab.page.getByTestId("push-card").getByRole("button", { name: /Włącz powiadomienia dla/ }).click();
    await expect(lab.page.getByTestId("push-card")).toHaveAttribute("data-state", "subscribed", { timeout: 20_000 });
    const shown = await pushAndRead(lab);
    expect(shown).toHaveLength(1);
    // Run the worker's own click-target function on the notification it just showed.
    const worker = lab.ctx.serviceWorkers().find((w) => w.url() === `${ORIGIN}/sw.js`);
    expect(worker).toBeTruthy();
    const targets = await worker!.evaluate(async () => {
      const sw = self as unknown as { registration: ServiceWorkerRegistration; notificationTarget: (d: unknown) => string };
      const ns = await sw.registration.getNotifications();
      return ns.map((n) => sw.notificationTarget(n.data));
    });
    expect(targets).toEqual([`${ORIGIN}${PAYLOAD.url}`]);
    await lab.ctx.close();
  });
});
