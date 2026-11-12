import { test, expect, type Page } from "@playwright/test";

// LR-8A — opt-in UI states in a real browser. Push APIs are replaced with
// fakes (headless Chromium has no push service), and /api/push/* is
// intercepted, so no subscription is ever stored anywhere.

interface FakeOptions {
  permission?: "default" | "granted" | "denied";
  promptResult?: "granted" | "denied" | "default";
  existingSubscription?: boolean;
  noPushManager?: boolean;
}

async function installPushFakes(page: Page, opts: FakeOptions = {}) {
  await page.addInitScript((o: FakeOptions) => {
    const w = window as unknown as Record<string, unknown>;
    const log = { prompts: 0, subscribes: 0, unsubscribes: 0 };
    w.__pushLog = log;
    let permission = o.permission ?? "default";
    const endpoint = "https://fcm.googleapis.com/fcm/send/test-endpoint";
    let current: unknown = null;
    const makeSub = () => ({
      endpoint,
      toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: "B".padEnd(87, "A"), auth: "A".repeat(22) } }),
      unsubscribe: async () => {
        log.unsubscribes++;
        current = null;
        return true;
      },
    });
    if (o.existingSubscription) current = makeSub();
    const pushManager = {
      getSubscription: async () => current,
      subscribe: async () => {
        log.subscribes++;
        current = makeSub();
        return current;
      },
    };
    const reg = { pushManager };
    w.Notification = {
      get permission() {
        return permission;
      },
      requestPermission: async () => {
        log.prompts++;
        permission = o.promptResult ?? "granted";
        return permission;
      },
    };
    if (!o.noPushManager) w.PushManager = function PushManager() {};
    else delete w.PushManager;
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        getRegistration: async () => reg,
        register: async () => reg,
        ready: Promise.resolve(reg),
        addEventListener: () => undefined,
        controller: null,
      },
    });
  }, opts);
}

async function interceptApi(page: Page, status = 200) {
  const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
  await page.route("**/api/push/**", async (route) => {
    const req = route.request();
    calls.push({ path: new URL(req.url()).pathname, body: req.postDataJSON() });
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ ok: status === 200 }) });
  });
  return calls;
}

const pushLog = (page: Page) => page.evaluate(() => (window as unknown as { __pushLog: Record<string, number> }).__pushLog);

test.describe("LR-8A push opt-in UI", () => {
  test("permission is asked only after the click; subscribe, then unsubscribe", async ({ page }) => {
    await installPushFakes(page);
    const calls = await interceptApi(page);
    await page.addInitScript(() => localStorage.setItem("alertownik-user-preferences", JSON.stringify({ locationKeywords: "Granica", categories: [] })));
    await page.goto("/ustawienia");
    const card = page.getByTestId("push-card");
    await expect(card).toHaveAttribute("data-state", "default");
    await expect(card).toContainText("Powiadomimy Cię tylko o ważnych alertach: woda, drogi i odpady.");
    expect((await pushLog(page)).prompts).toBe(0);

    await card.getByRole("button", { name: "Włącz powiadomienia dla Granica" }).click();
    await expect(card).toContainText("Powiadomienia włączone dla: Granica");
    expect(await pushLog(page)).toMatchObject({ prompts: 1, subscribes: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe("/api/push/subscribe");
    expect(calls[0].body).toMatchObject({ endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint", locality: "Granica" });
    expect(Object.keys(calls[0].body).sort()).toEqual(["endpoint", "expirationTime", "keys", "locality"]);

    await page.getByRole("button", { name: "Wyłącz powiadomienia" }).click();
    await expect(page.getByTestId("push-card")).toHaveAttribute("data-state", "default");
    expect(calls.at(-1)).toEqual({ path: "/api/push/unsubscribe", body: { endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint" } });
  });

  test("returning visitor with a live subscription sees it as enabled", async ({ page }) => {
    await installPushFakes(page, { permission: "granted", existingSubscription: true });
    await page.addInitScript(() =>
      localStorage.setItem("alertownik-push", JSON.stringify({ locality: "Komorów", endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint" }))
    );
    await page.goto("/ustawienia");
    const card = page.getByTestId("push-card");
    await expect(card).toHaveAttribute("data-state", "subscribed");
    await expect(card).toContainText("Powiadomienia włączone dla: Komorów");
  });

  test("the chosen locality is what gets subscribed", async ({ page }) => {
    await installPushFakes(page);
    const calls = await interceptApi(page);
    await page.goto("/ustawienia");
    await page.getByTestId("push-card").getByRole("combobox").selectOption("Reguły");
    await page.getByRole("button", { name: "Włącz powiadomienia dla Reguły" }).click();
    await expect(page.getByTestId("push-card")).toHaveAttribute("data-state", "subscribed");
    expect(calls[0].body.locality).toBe("Reguły");
  });

  test("user declines the browser prompt → denied state, nothing stored", async ({ page }) => {
    await installPushFakes(page, { promptResult: "denied" });
    const calls = await interceptApi(page);
    await page.goto("/ustawienia");
    await page.getByRole("button", { name: /Włącz powiadomienia dla/ }).click();
    await expect(page.getByTestId("push-card")).toHaveAttribute("data-state", "denied");
    await expect(page.getByTestId("push-card")).toContainText("zablokowane w ustawieniach przeglądarki");
    expect(calls).toHaveLength(0);
  });

  test("already-denied permission shows how to change it, no button", async ({ page }) => {
    await installPushFakes(page, { permission: "denied" });
    await page.goto("/ustawienia");
    const card = page.getByTestId("push-card");
    await expect(card).toHaveAttribute("data-state", "denied");
    await expect(card.getByRole("button")).toHaveCount(0);
  });

  test("unsupported browser says so", async ({ page }) => {
    await installPushFakes(page, { noPushManager: true });
    await page.goto("/ustawienia");
    await expect(page.getByTestId("push-card")).toHaveAttribute("data-state", "unsupported");
  });

  test("stale subscription (stored locally, gone in the browser) asks to re-enable", async ({ page }) => {
    await installPushFakes(page, { permission: "granted" });
    await page.addInitScript(() =>
      localStorage.setItem("alertownik-push", JSON.stringify({ locality: "Komorów", endpoint: "https://fcm.googleapis.com/fcm/send/old" }))
    );
    await page.goto("/ustawienia");
    const card = page.getByTestId("push-card");
    await expect(card).toHaveAttribute("data-state", "stale");
    await expect(card).toContainText("przestały działać");
  });

  test("server refusal removes the browser subscription and shows an error", async ({ page }) => {
    await installPushFakes(page);
    await interceptApi(page, 503);
    await page.goto("/ustawienia");
    await page.getByRole("button", { name: /Włącz powiadomienia dla/ }).click();
    await expect(page.getByTestId("push-card").getByRole("alert")).toContainText("Nie udało się włączyć");
    expect((await pushLog(page)).unsubscribes).toBe(1);
    await expect(page.getByTestId("push-card")).toHaveAttribute("data-state", "default");
  });

  test("Dzisiaj shows the card only after the visitor has set an area", async ({ page }) => {
    await installPushFakes(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dzisiaj" })).toBeVisible();
    await expect(page.getByTestId("push-card")).toHaveCount(0);
    await page.evaluate(() => localStorage.setItem("alertownik-user-preferences", JSON.stringify({ locationKeywords: "Granica", categories: [] })));
    await page.reload();
    await expect(page.getByRole("button", { name: "Włącz powiadomienia dla Granica" })).toBeVisible();
  });
});

test.describe("LR-8A push opt-in UI — iPhone not installed", () => {
  test.use({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" });
  test("explains that iOS needs Add to Home Screen", async ({ page }) => {
    await installPushFakes(page);
    await page.goto("/ustawienia");
    const card = page.getByTestId("push-card");
    await expect(card).toHaveAttribute("data-state", "ios-needs-install");
    await expect(card.getByRole("link", { name: /Jak to zrobić/ })).toHaveAttribute("href", "/instalacja");
  });
});
