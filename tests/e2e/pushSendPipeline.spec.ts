import { test, expect } from "@playwright/test";
import { NextResponse } from "next/server";
import { createECDH, generateKeyPairSync } from "node:crypto";
import type { PushHttpRequest } from "@/lib/push/webPushRequest";

const base64UrlEncode = (b: Uint8Array) => Buffer.from(b).toString("base64url");
const base64UrlDecode = (s: string) => Buffer.from(s, "base64url");
import {
  buildPushPayload,
  evaluatePushEligibility,
  validateSubscribeBody,
  type PushAlertRow,
} from "@/lib/push/pushPolicy";
import { sendAlertPush, type PushStore, type PushSubscriptionRecord, type DeliveryStatus } from "@/lib/push/pushSender";
import { handleSubscribe, handleUnsubscribe, handleAlertPublished, createRateLimiter } from "@/lib/push/pushApi";
import { getPushServerConfig } from "@/lib/push/pushConfig";
import { describePushResult } from "@/lib/push/pushAdminClient";
import { createGatewayRpc, gatewayPushRpc, MIN_GATEWAY_TOKEN_LENGTH } from "@/lib/push/pushRuntime";

// LR-8A — send pipeline and API handlers, all against in-memory fakes.
// Nothing here talks to Supabase or to a real push service.

const DAY = 24 * 3600 * 1000;
const future = (days: number) => new Date(Date.now() + days * DAY).toISOString();

function vapid() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pub = publicKey.export({ format: "jwk" }) as { x: string; y: string };
  const priv = privateKey.export({ format: "jwk" }) as { d: string };
  return {
    publicKey: base64UrlEncode(Buffer.concat([Buffer.from([4]), base64UrlDecode(pub.x), base64UrlDecode(pub.y)])),
    privateKey: priv.d,
    subject: "mailto:test@example.invalid",
  };
}
const VAPID = vapid();

function browserKeys() {
  const ua = createECDH("prime256v1");
  ua.generateKeys();
  return { p256dh: base64UrlEncode(ua.getPublicKey()), auth: base64UrlEncode(Buffer.alloc(16, 3)) };
}

function sub(id: string, locality: string, endpoint = `https://fcm.googleapis.com/fcm/send/${id}`): PushSubscriptionRecord {
  return { id, endpoint, locality, ...browserKeys() };
}

function alert(over: Partial<PushAlertRow> = {}): PushAlertRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "brak-wody-granica",
    title: "Brak wody - Granica",
    place: "Granica",
    category: "water",
    status: "published",
    starts_at: future(1),
    ends_at: future(1.2),
    ...over,
  };
}

/** In-memory store with the same unique (alert, subscription) rule as SQL. */
function memoryStore(subs: PushSubscriptionRecord[]) {
  const deliveries = new Map<string, DeliveryStatus | "claimed">();
  const disabled = new Set<string>();
  const store: PushStore = {
    async listEnabledSubscriptions(localities) {
      return subs.filter((s) => !disabled.has(s.id) && localities.includes(s.locality));
    },
    async claimDelivery(a, s) {
      const k = `${a}|${s}`;
      if (deliveries.has(k)) return false;
      deliveries.set(k, "claimed");
      return true;
    },
    async finishDelivery(a, s, status) {
      deliveries.set(`${a}|${s}`, status);
    },
    async disableSubscription(id) {
      disabled.add(id);
    },
  };
  return { store, deliveries, disabled };
}

function recordingTransport(statusFor: (url: string) => number | Error = () => 201) {
  const sent: PushHttpRequest[] = [];
  return {
    sent,
    transport: async (req: PushHttpRequest) => {
      const s = statusFor(req.url);
      if (s instanceof Error) throw s;
      sent.push(req);
      return { status: s };
    },
  };
}

test.describe("LR-8A push eligibility", () => {
  test("water, roads and waste in the right locality are eligible", () => {
    for (const category of ["water", "roads", "waste"]) {
      expect(evaluatePushEligibility(alert({ category }))).toEqual({ eligible: true, localities: ["Granica"] });
    }
  });

  test("other categories, unpublished and ended alerts are not", () => {
    for (const category of ["transport", "power", "announcement", "municipal"]) {
      expect(evaluatePushEligibility(alert({ category }))).toEqual({ eligible: false, reason: "category" });
    }
    expect(evaluatePushEligibility(alert({ status: "draft" }))).toEqual({ eligible: false, reason: "not_published" });
    expect(
      evaluatePushEligibility(alert({ starts_at: future(-5), ends_at: future(-4) }))
    ).toEqual({ eligible: false, reason: "ended" });
  });

  test("locality comes from place, then title; 'gmina Michałowice' is not a locality", () => {
    expect(evaluatePushEligibility(alert({ place: "ul. Królewska", title: "Brak wody - Reguły" }))).toEqual({
      eligible: true,
      localities: ["Reguły"],
    });
    expect(
      evaluatePushEligibility(alert({ place: "gmina Michałowice", title: "Brak wody" }))
    ).toEqual({ eligible: false, reason: "no_locality" });
    expect(evaluatePushEligibility(alert({ place: "Komorów, gm. Michałowice", title: "Brak wody" }))).toEqual({
      eligible: true,
      localities: ["Komorów"],
    });
    expect(evaluatePushEligibility(alert({ place: "Granica i Nowa Wieś", title: "Brak wody" }))).toEqual({
      eligible: true,
      localities: ["Nowa Wieś", "Granica"],
    });
  });

  test("payload holds only public alert fields and a relative alert URL", () => {
    const p = buildPushPayload(alert());
    expect(p.url).toBe("/alerts/brak-wody-granica");
    expect(p.title).toBe("Brak wody - Granica");
    expect(p.body).toContain("Granica");
    expect(Object.keys(p).sort()).toEqual(["body", "tag", "title", "url", "v"]);
  });
});

test.describe("LR-8A send fan-out", () => {
  test("same locality gets a push, other localities do not", async () => {
    const subs = [sub("a", "Granica"), sub("b", "Granica"), sub("c", "Komorów")];
    const { store } = memoryStore(subs);
    const t = recordingTransport();
    const s = await sendAlertPush(alert(), { store, transport: t.transport, vapid: VAPID });
    expect(s).toMatchObject({ matched: 2, sent: 2, failed: 0, gone: 0 });
    expect(t.sent.map((r) => r.url).sort()).toEqual([subs[0].endpoint, subs[1].endpoint].sort());
  });

  for (const category of ["water", "roads", "waste"]) {
    test(`${category} → send`, async () => {
      const { store } = memoryStore([sub("a", "Granica")]);
      const t = recordingTransport();
      const s = await sendAlertPush(alert({ category }), { store, transport: t.transport, vapid: VAPID });
      expect(s.sent).toBe(1);
    });
  }

  test("unsupported category and ended alert send nothing", async () => {
    const { store } = memoryStore([sub("a", "Granica")]);
    const t = recordingTransport();
    await sendAlertPush(alert({ category: "transport" }), { store, transport: t.transport, vapid: VAPID });
    await sendAlertPush(alert({ starts_at: future(-3), ends_at: future(-2) }), { store, transport: t.transport, vapid: VAPID });
    expect(t.sent).toHaveLength(0);
  });

  test("404 and 410 disable the subscription; others stay", async () => {
    const subs = [sub("a", "Granica"), sub("b", "Granica"), sub("c", "Granica")];
    const { store, disabled, deliveries } = memoryStore(subs);
    const t = recordingTransport((url) => (url.endsWith("/a") ? 404 : url.endsWith("/b") ? 410 : 201));
    const s = await sendAlertPush(alert(), { store, transport: t.transport, vapid: VAPID });
    expect(s).toMatchObject({ sent: 1, gone: 2 });
    expect([...disabled].sort()).toEqual(["a", "b"]);
    expect(deliveries.get(`${alert().id}|a`)).toBe("gone");
  });

  test("provider failure is contained and counted, not thrown", async () => {
    const { store, deliveries } = memoryStore([sub("a", "Granica"), sub("b", "Granica")]);
    const t = recordingTransport((url) => (url.endsWith("/a") ? new Error("network") : 500));
    const s = await sendAlertPush(alert(), { store, transport: t.transport, vapid: VAPID });
    expect(s).toMatchObject({ sent: 0, failed: 2 });
    expect(deliveries.get(`${alert().id}|a`)).toBe("failed");
  });

  test("a retry (or double click) never sends the same alert twice to one subscription", async () => {
    const { store } = memoryStore([sub("a", "Granica"), sub("b", "Granica")]);
    const t = recordingTransport();
    const [first, second] = await Promise.all([
      sendAlertPush(alert(), { store, transport: t.transport, vapid: VAPID }),
      sendAlertPush(alert(), { store, transport: t.transport, vapid: VAPID }),
    ]);
    const third = await sendAlertPush(alert(), { store, transport: t.transport, vapid: VAPID });
    expect(t.sent).toHaveLength(2);
    expect(first.sent + second.sent).toBe(2);
    expect(third).toMatchObject({ sent: 0, alreadyDelivered: 2 });
  });

  test("a claim that cannot be recorded is not sent", async () => {
    const { store } = memoryStore([sub("a", "Granica")]);
    store.claimDelivery = async () => {
      throw new Error("db down");
    };
    const t = recordingTransport();
    const s = await sendAlertPush(alert(), { store, transport: t.transport, vapid: VAPID });
    expect(t.sent).toHaveLength(0);
    expect(s.failed).toBe(1);
  });

  test("an endpoint outside the push-service allowlist is never contacted", async () => {
    const { store } = memoryStore([sub("x", "Granica", "https://169.254.169.254/latest/meta-data")]);
    const t = recordingTransport();
    const s = await sendAlertPush(alert(), { store, transport: t.transport, vapid: VAPID });
    expect(t.sent).toHaveLength(0);
    expect(s.failed).toBe(1);
  });
});

// ── API handlers ─────────────────────────────────────────────────────────────

const ORIGIN = "https://alertownik.example";
function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
const ENABLED = getPushServerConfig({
  PUSH_NOTIFICATIONS_ENABLED: "true",
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: VAPID.publicKey,
  VAPID_PRIVATE_KEY: VAPID.privateKey,
  VAPID_SUBJECT: VAPID.subject,
});

function validBody(locality = "Granica") {
  const k = browserKeys();
  return { endpoint: "https://fcm.googleapis.com/fcm/send/abc123", expirationTime: null, keys: k, locality };
}

function rpcSpy() {
  const calls: Array<{ fn: string; args: Record<string, string> }> = [];
  return { calls, rpc: async (fn: "push_subscribe" | "push_unsubscribe", args: Record<string, string>) => (calls.push({ fn, args }), { error: null }) };
}

test.describe("LR-8A subscribe / unsubscribe API", () => {
  test("config: disabled by default, enabled only with valid keys and subject", () => {
    expect(getPushServerConfig({})).toEqual({ enabled: false, reason: "disabled" });
    expect(getPushServerConfig({ PUSH_NOTIFICATIONS_ENABLED: "true" })).toEqual({ enabled: false, reason: "missing_keys" });
    expect(
      getPushServerConfig({ PUSH_NOTIFICATIONS_ENABLED: "true", NEXT_PUBLIC_VAPID_PUBLIC_KEY: "abc", VAPID_PRIVATE_KEY: "def", VAPID_SUBJECT: "mailto:a@b.c" })
    ).toEqual({ enabled: false, reason: "invalid_keys" });
    expect(ENABLED.enabled).toBe(true);
  });

  test("valid subscribe reaches the RPC with exactly the validated fields", async () => {
    const spy = rpcSpy();
    const body = validBody();
    const res = await handleSubscribe(post("/api/push/subscribe", body), { config: ENABLED, rpc: spy.rpc, allowRequest: () => true });
    expect(res.status).toBe(200);
    expect(spy.calls).toEqual([
      { fn: "push_subscribe", args: { p_endpoint: body.endpoint, p_p256dh: body.keys.p256dh, p_auth: body.keys.auth, p_locality: "Granica" } },
    ]);
  });

  test("duplicate subscribe is idempotent (same upsert call, both succeed)", async () => {
    const spy = rpcSpy();
    const body = validBody();
    for (let i = 0; i < 2; i++) {
      const res = await handleSubscribe(post("/api/push/subscribe", body), { config: ENABLED, rpc: spy.rpc, allowRequest: () => true });
      expect(res.status).toBe(200);
    }
    expect(spy.calls[0]).toEqual(spy.calls[1]);
  });

  test("invalid endpoint, keys, locality and body are rejected before any write", async () => {
    const spy = rpcSpy();
    const deps = { config: ENABLED, rpc: spy.rpc, allowRequest: () => true };
    const bad = [
      { ...validBody(), endpoint: "http://fcm.googleapis.com/fcm/send/x" },
      { ...validBody(), endpoint: "https://evil.example/fcm/send/x" },
      { ...validBody(), endpoint: "https://user@fcm.googleapis.com/x" },
      { ...validBody(), endpoint: "https://fcm.googleapis.com:8443/x" },
      { ...validBody(), keys: { p256dh: "abc", auth: "def" } },
      { ...validBody(), locality: "Kraków" },
      { ...validBody(), locality: "Opacz" },
      [],
      null,
    ];
    for (const b of bad) {
      const res = await handleSubscribe(post("/api/push/subscribe", b as never), deps);
      expect(res.status).toBe(400);
    }
    expect((await handleSubscribe(post("/api/push/subscribe", "{not json"), deps)).status).toBe(400);
    expect(spy.calls).toHaveLength(0);
  });

  test("fails closed: foreign/missing origin, wrong content type, oversized body, rate limit, kill switch", async () => {
    const spy = rpcSpy();
    const deps = { config: ENABLED, rpc: spy.rpc, allowRequest: () => true };
    expect((await handleSubscribe(post("/api/push/subscribe", validBody(), { origin: "https://evil.example" }), deps)).status).toBe(403);
    const noOrigin = new Request(`${ORIGIN}/api/push/subscribe`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect((await handleSubscribe(noOrigin, deps)).status).toBe(403);
    expect((await handleSubscribe(post("/api/push/subscribe", validBody(), { "content-type": "text/plain" }), deps)).status).toBe(415);
    expect((await handleSubscribe(post("/api/push/subscribe", JSON.stringify({ pad: "x".repeat(5000) })), deps)).status).toBe(413);
    expect((await handleSubscribe(post("/api/push/subscribe", validBody()), { ...deps, allowRequest: () => false })).status).toBe(429);
    expect(
      (await handleSubscribe(post("/api/push/subscribe", validBody()), { ...deps, config: getPushServerConfig({}) })).status
    ).toBe(503);
    expect((await handleSubscribe(post("/api/push/subscribe", validBody()), { ...deps, rpc: null })).status).toBe(503);
    expect(spy.calls).toHaveLength(0);
  });

  test("unsubscribe works, even with the kill switch off", async () => {
    const spy = rpcSpy();
    const res = await handleUnsubscribe(post("/api/push/unsubscribe", { endpoint: "https://fcm.googleapis.com/fcm/send/abc123" }), {
      config: getPushServerConfig({}),
      rpc: spy.rpc,
      allowRequest: () => true,
    });
    expect(res.status).toBe(200);
    expect(spy.calls).toEqual([{ fn: "push_unsubscribe", args: { p_endpoint: "https://fcm.googleapis.com/fcm/send/abc123" } }]);
    const bad = await handleUnsubscribe(post("/api/push/unsubscribe", { endpoint: "https://evil.example/x" }), {
      config: ENABLED,
      rpc: spy.rpc,
      allowRequest: () => true,
    });
    expect(bad.status).toBe(400);
  });

  test("validateSubscribeBody accepts the browser's PushSubscription.toJSON() shape", () => {
    expect(validateSubscribeBody(validBody("Komorów")).ok).toBe(true);
  });

  test("rate limiter allows the limit then blocks within the window", () => {
    let now = 0;
    const allow = createRateLimiter(2, 1000, () => now);
    expect([allow("ip"), allow("ip"), allow("ip")]).toEqual([true, true, false]);
    now = 1001;
    expect(allow("ip")).toBe(true);
  });
});

test.describe("LR-8A admin alert-published API", () => {
  const fakeClient = {} as never;
  function deps(over: Partial<Parameters<typeof handleAlertPublished>[1]> = {}) {
    const { store } = memoryStore([sub("a", "Granica")]);
    const t = recordingTransport();
    return {
      t,
      d: {
        config: ENABLED,
        requireAdmin: async () => ({ ok: true as const, client: fakeClient }),
        loadAlert: async () => alert(),
        storeFor: () => store,
        transport: t.transport,
        ...over,
      },
    };
  }

  test("non-admin gets the auth response and nothing is sent", async () => {
    const { t, d } = deps({ requireAdmin: async () => ({ ok: false as const, response: NextResponse.json({ ok: false }, { status: 401 }) }) });
    const res = await handleAlertPublished(post("/api/admin/push/alert-published", { slug: "brak-wody-granica" }), d);
    expect(res.status).toBe(401);
    expect(t.sent).toHaveLength(0);
  });

  test("kill switch off → skipped, nothing sent", async () => {
    const { t, d } = deps({ config: getPushServerConfig({}) });
    const res = await handleAlertPublished(post("/api/admin/push/alert-published", { slug: "brak-wody-granica" }), d);
    expect(await res.json()).toEqual({ ok: true, skipped: "push_disabled" });
    expect(t.sent).toHaveLength(0);
  });

  test("published water alert → sent; summary reported", async () => {
    const { t, d } = deps();
    const res = await handleAlertPublished(post("/api/admin/push/alert-published", { slug: "brak-wody-granica" }), d);
    expect(await res.json()).toMatchObject({ ok: true, matched: 1, sent: 1 });
    expect(t.sent).toHaveLength(1);
  });

  test("bad slug and missing alert fail closed", async () => {
    const { d } = deps({ loadAlert: async () => null });
    expect((await handleAlertPublished(post("/api/admin/push/alert-published", { slug: "../etc" }), d)).status).toBe(400);
    expect((await handleAlertPublished(post("/api/admin/push/alert-published", { slug: "nie-ma" }), d)).status).toBe(404);
  });

  test("subscription read failure returns 502 and never throws (publish is already done)", async () => {
    const { d } = deps({
      storeFor: () => ({
        listEnabledSubscriptions: async () => {
          throw new Error("rls");
        },
        claimDelivery: async () => true,
        finishDelivery: async () => undefined,
        disableSubscription: async () => undefined,
      }),
    });
    const res = await handleAlertPublished(post("/api/admin/push/alert-published", { slug: "brak-wody-granica" }), d);
    expect(res.status).toBe(502);
  });

  test("Builder notice wording", () => {
    expect(describePushResult(true, { ok: true, skipped: "push_disabled" })).toBeNull();
    expect(describePushResult(false, null)).toContain("pozostaje opublikowany");
    expect(describePushResult(true, { ok: true, skipped: "category" })).toContain("tylko woda, drogi, odpady");
    expect(describePushResult(true, { ok: true, matched: 0, sent: 0 })).toContain("brak subskrybentów");
    expect(describePushResult(true, { ok: true, matched: 2, sent: 0, alreadyDelivered: 2 })).toContain("nie wysłano ponownie");
    expect(describePushResult(true, { ok: true, matched: 3, sent: 2, gone: 1 })).toBe("Powiadomienia: wysłano 2 (wygasłe subskrypcje: 1).");
  });
});

// LR-8A.1 — the database functions require a server-only gateway token, so
// the public anon key alone cannot subscribe (closes the direct-RPC bypass of
// this route's rate limit). Real database behaviour: tests/sql/.
test.describe("LR-8A.1 gateway token", () => {
  test("no RPC client at all without a long enough PUSH_GATEWAY_TOKEN (fail closed → 503)", async () => {
    const base = { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "anon" };
    expect(gatewayPushRpc(base)).toBeNull();
    expect(gatewayPushRpc({ ...base, PUSH_GATEWAY_TOKEN: "short" })).toBeNull();
    expect(gatewayPushRpc({ ...base, PUSH_GATEWAY_TOKEN: "t".repeat(MIN_GATEWAY_TOKEN_LENGTH) })).not.toBeNull();
    const res = await handleSubscribe(post("/api/push/subscribe", validBody()), {
      config: ENABLED,
      rpc: gatewayPushRpc(base),
      allowRequest: () => true,
    });
    expect(res.status).toBe(503);
  });

  test("every RPC call carries the token, added server-side, never from the request", async () => {
    const seen: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const fakeClient = { rpc: async (fn: string, args: Record<string, unknown>) => (seen.push({ fn, args }), { error: null }) };
    const rpc = createGatewayRpc(fakeClient as never, "g".repeat(40));
    const body = { ...validBody(), p_token: "attacker-supplied" };
    expect((await handleSubscribe(post("/api/push/subscribe", body), { config: ENABLED, rpc, allowRequest: () => true })).status).toBe(200);
    expect(seen[0].args.p_token).toBe("g".repeat(40));
    expect(Object.keys(seen[0].args).sort()).toEqual(["p_auth", "p_endpoint", "p_locality", "p_p256dh", "p_token"]);
  });

  test("database refusals map to honest HTTP answers without details", async () => {
    const failing = (code: string) => async () => ({ error: { code, message: "detail that must not leak" } });
    const deps = (code: string) => ({ config: ENABLED, rpc: failing(code), allowRequest: () => true });
    const r429 = await handleSubscribe(post("/api/push/subscribe", validBody()), deps("54000"));
    expect(r429.status).toBe(429);
    const r503 = await handleSubscribe(post("/api/push/subscribe", validBody()), deps("42501"));
    expect(r503.status).toBe(503);
    const r500 = await handleSubscribe(post("/api/push/subscribe", validBody()), deps("22023"));
    expect(r500.status).toBe(500);
    expect(JSON.stringify(await r500.json())).not.toContain("detail");
  });
});
