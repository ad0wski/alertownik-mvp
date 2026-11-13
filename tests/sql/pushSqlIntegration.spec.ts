import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { createDecipheriv, createECDH, createHash, createHmac, generateKeyPairSync, hkdfSync, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { handleAlertPublished, handleSubscribe, handleUnsubscribe } from "@/lib/push/pushApi";
import { getPushServerConfig } from "@/lib/push/pushConfig";
import { createGatewayRpc, loadAlertForPush } from "@/lib/push/pushRuntime";
import { supabasePushStore, type PushTransport } from "@/lib/push/pushSender";
import type { PushHttpRequest } from "@/lib/push/webPushRequest";

// LR-8A.1 — REAL database test of the push migration, RLS, grants, the
// SECURITY DEFINER functions, the route handlers via supabase-js and the
// rollback. Runs only through tests/sql/run-push-sql-integration.sh, which
// starts a throwaway supabase/postgres 17.6 + PostgREST on 127.0.0.1 and
// deletes them afterwards. Nothing here can reach Production.

const ENABLED_RUN = process.env.LR8A1_SQL_IT === "1";
test.skip(!ENABLED_RUN, "needs the throwaway DB from tests/sql/run-push-sql-integration.sh");
test.describe.configure({ mode: "serial" });

const ROOT = join(__dirname, "..", "..");
const PG = process.env.LR8A1_PG_CONTAINER ?? "";
const REST = process.env.LR8A1_REST_URL ?? "";
const JWT_SECRET = process.env.LR8A1_JWT_SECRET ?? "";
const ADMIN = "00000000-0000-4000-8000-00000000a001";
const WRITER = "00000000-0000-4000-8000-00000000b001";
const ORIGIN = "https://alertownik.example";
const GATEWAY_TOKEN = randomBytes(32).toString("base64url");

// ── helpers ──────────────────────────────────────────────────────────────────

function psql(sql: string, user = "postgres") {
  const r = spawnSync("docker", ["exec", "-i", PG, "psql", "-U", user, "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"], {
    input: sql,
    encoding: "utf8",
  });
  // NOTICE lines (e.g. "drop … if exists, skipping") are informational, not errors.
  const err = (r.stderr ?? "")
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("NOTICE:"))
    .join("\n")
    .trim();
  return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err };
}
const must = (sql: string, user?: string) => {
  const r = psql(sql, user);
  expect(r.err, sql).toBe("");
  expect(r.ok, sql).toBe(true);
  return r.out;
};
/** Runs one statement as a Supabase API role inside a rolled-back transaction. */
function asRole(role: "anon" | "authenticated", sql: string, sub?: string) {
  const claims = sub ? `set local request.jwt.claims = '{"sub":"${sub}","role":"${role}"}';` : "";
  return psql(`begin; set local role ${role}; ${claims} ${sql}; rollback;`);
}
const count = (table: string) => Number(must(`select count(*) from public.${table}`));

function jwt(claims: Record<string, unknown>) {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const body = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ ...claims, exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  return `${body}.${createHmac("sha256", JWT_SECRET).update(body).digest("base64url")}`;
}
const ANON_KEY = () => jwt({ role: "anon", iss: "supabase" });
const userKey = (sub: string) => jwt({ role: "authenticated", sub, aud: "authenticated", iss: "supabase" });

/** supabase-js calls <url>/rest/v1/*; PostgREST serves at /. Tiny local proxy. */
let proxy: Server;
let proxyUrl = "";
async function startProxy() {
  proxy = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string" && k !== "host" && k !== "content-length") headers[k] = v;
    const upstream = await fetch(REST + (req.url ?? "/").replace(/^\/rest\/v1/, ""), {
      method: req.method,
      headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
    });
    const out: Record<string, string> = {};
    upstream.headers.forEach((v, k) => {
      if (k !== "content-encoding" && k !== "content-length" && k !== "transfer-encoding") out[k] = v;
    });
    res.writeHead(upstream.status, out);
    res.end(Buffer.from(await upstream.arrayBuffer()));
  });
  await new Promise<void>((r) => proxy.listen(0, "127.0.0.1", r));
  const addr = proxy.address();
  proxyUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
}

const client = (bearer: string): SupabaseClient =>
  createClient(proxyUrl, ANON_KEY(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });

function browserSubscription(id: string) {
  const ua = createECDH("prime256v1");
  ua.generateKeys();
  const auth = randomBytes(16);
  return {
    ua,
    auth,
    body: {
      endpoint: `https://fcm.googleapis.com/fcm/send/it-${id}`,
      expirationTime: null,
      keys: { p256dh: ua.getPublicKey().toString("base64url"), auth: auth.toString("base64url") },
    },
  };
}
const post = (path: string, body: unknown) =>
  new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify(body),
  });

function decrypt(body: Buffer, uaPrivate: Buffer, uaPublic: Buffer, auth: Buffer): string {
  const salt = body.subarray(0, 16);
  const idlen = body.readUInt8(20);
  const asPublic = body.subarray(21, 21 + idlen);
  const ct = body.subarray(21 + idlen);
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(uaPrivate);
  const ikm = Buffer.from(hkdfSync("sha256", ecdh.computeSecret(asPublic), auth, Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]), 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const d = createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  return plain.subarray(0, plain.length - 1).toString("utf8");
}

function testVapidEnv() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pub = publicKey.export({ format: "jwk" }) as { x: string; y: string };
  const priv = privateKey.export({ format: "jwk" }) as { d: string };
  return {
    PUSH_NOTIFICATIONS_ENABLED: "true",
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, "base64url"), Buffer.from(pub.y, "base64url")]).toString("base64url"),
    VAPID_PRIVATE_KEY: priv.d,
    VAPID_SUBJECT: "mailto:test@example.invalid",
  };
}
const CONFIG = getPushServerConfig(testVapidEnv());
const gatewayDeps = (token = GATEWAY_TOKEN) => ({
  config: CONFIG,
  rpc: createGatewayRpc(client(ANON_KEY()), token),
  allowRequest: () => true,
});

// ── lifecycle ────────────────────────────────────────────────────────────────

test.beforeAll(async () => {
  await startProxy();
});
test.afterAll(async () => {
  await new Promise<void>((r) => (proxy ? proxy.close(() => r()) : r()));
});

test.describe("LR-8A.1 push SQL on a real PostgreSQL 17.6", () => {
  test("migration applies cleanly as postgres (as in the SQL editor)", () => {
    const sql = readFileSync(join(ROOT, "docs/sql/PROPOSED_LR8A_PUSH_SUBSCRIPTIONS_V1.sql"), "utf8");
    must(sql);
    must("notify pgrst, 'reload schema'");
    expect(count("push_subscriptions")).toBe(0);
  });

  test("before the token hash is set, even the real server path fails closed (503)", async () => {
    await new Promise((r) => setTimeout(r, 1500)); // PostgREST schema reload
    const res = await handleSubscribe(post("/api/push/subscribe", { ...browserSubscription("x").body, locality: "Granica" }), gatewayDeps());
    expect(res.status).toBe(503);
    expect(count("push_subscriptions")).toBe(0);
  });

  test("LR-8B step: store only the SHA-256 of the gateway token", () => {
    const hex = createHash("sha256").update(GATEWAY_TOKEN).digest("hex");
    must(`insert into public.push_gateway_secret (token_sha256) values (decode('${hex}', 'hex'))`);
    // Singleton: a second row is impossible.
    expect(psql(`insert into public.push_gateway_secret (id, token_sha256) values (2, decode('${hex}', 'hex'))`).ok).toBe(false);
  });

  test("catalog: RLS on, no anon table grants, 6 admin-only policies, definer functions, execute only for anon", () => {
    expect(must(`select string_agg(tablename || '=' || rowsecurity, ',' order by tablename) from pg_tables where schemaname='public' and tablename like 'push_%'`)).toBe(
      "push_deliveries=true,push_gateway_secret=true,push_subscriptions=true"
    );
    for (const role of ["anon", "authenticated"]) {
      for (const priv of ["select", "insert", "update", "delete"]) {
        expect(must(`select has_table_privilege('${role}', 'public.push_gateway_secret', '${priv}')`)).toBe("f");
      }
    }
    for (const t of ["push_subscriptions", "push_deliveries"]) {
      for (const priv of ["select", "insert", "update", "delete", "truncate", "references", "trigger"]) {
        expect(must(`select has_table_privilege('anon', 'public.${t}', '${priv}')`), `${t} ${priv}`).toBe("f");
      }
    }
    expect(must(`select has_table_privilege('authenticated', 'public.push_subscriptions', 'insert')`)).toBe("f");
    const policies = must(
      `select count(*) || ':' || bool_and(roles = '{authenticated}') || ':' || bool_and(coalesce(qual, with_check) like '%admin_profiles%') from pg_policies where schemaname='public' and tablename like 'push_%'`
    );
    expect(policies).toBe("6:true:true");
    expect(
      must(`select string_agg(proname || ':' || prosecdef || ':' || array_to_string(proconfig, ';') || ':' || pg_get_function_identity_arguments(oid), ' | ' order by proname) from pg_proc where pronamespace = 'public'::regnamespace and proname like 'push_%'`)
    ).toBe(
      "push_subscribe:true:search_path=public, pg_temp:p_token text, p_endpoint text, p_p256dh text, p_auth text, p_locality text | push_unsubscribe:true:search_path=public, pg_temp:p_token text, p_endpoint text"
    );
    for (const fn of ["push_subscribe(text,text,text,text,text)", "push_unsubscribe(text,text)"]) {
      expect(must(`select has_function_privilege('anon', 'public.${fn}', 'execute')`)).toBe("t");
      expect(must(`select has_function_privilege('authenticated', 'public.${fn}', 'execute')`)).toBe("f");
      expect(must(`select array_to_string(proacl, ',') like '%=X/%' and array_to_string(proacl, ',') not like '%,=X/%' and array_to_string(proacl, ',') not like '=X/%' from pg_proc where oid = 'public.${fn}'::regprocedure`)).toBe("t");
    }
    expect(must(`select count(*) from pg_constraint where conname = 'push_deliveries_alert_subscription_key' and contype = 'u'`)).toBe("1");
    expect(
      must(`select string_agg(confrelid::regclass::text || ':' || confdeltype::text, ',' order by confrelid::regclass::text) from pg_constraint where conrelid = 'public.push_deliveries'::regclass and contype = 'f'`)
    ).toBe("alerts:c,push_subscriptions:c");
  });

  test("anon cannot SELECT/INSERT/UPDATE/DELETE any push table directly (SQL role)", () => {
    for (const sql of [
      "select * from public.push_subscriptions",
      "insert into public.push_subscriptions (endpoint, p256dh, auth, locality) values ('https://fcm.googleapis.com/x', repeat('A',87), repeat('A',22), 'Granica')",
      "update public.push_subscriptions set enabled = false",
      "delete from public.push_subscriptions",
      "select * from public.push_deliveries",
      "select * from public.push_gateway_secret",
      "delete from public.push_gateway_secret",
    ]) {
      const r = asRole("anon", sql);
      expect(r.ok, sql).toBe(false);
      expect(r.err, sql).toContain("permission denied");
    }
  });

  test("direct anon RPC without / with a wrong token fails; nothing is written", async () => {
    const anon = client(ANON_KEY());
    const sub = browserSubscription("direct").body;
    const args = { p_endpoint: sub.endpoint, p_p256dh: sub.keys.p256dh, p_auth: sub.keys.auth, p_locality: "Granica" };
    const noToken = await anon.rpc("push_subscribe", args);
    expect(noToken.error).not.toBeNull(); // no 4-argument function exists any more
    for (const p_token of ["", "x", "y".repeat(43), GATEWAY_TOKEN.slice(0, -1) + (GATEWAY_TOKEN.endsWith("A") ? "B" : "A")]) {
      const r = await anon.rpc("push_subscribe", { p_token, ...args });
      expect(r.error?.code, p_token).toBe("42501");
    }
    const unsub = await anon.rpc("push_unsubscribe", { p_token: "y".repeat(43), p_endpoint: sub.endpoint });
    expect(unsub.error?.code).toBe("42501");
    // REST table endpoints are closed to anon as well.
    const list = await anon.from("push_subscriptions").select("*");
    expect(list.error?.code).toBe("42501");
    const secret = await anon.from("push_gateway_secret").select("*");
    expect(secret.error?.code).toBe("42501");
    expect(count("push_subscriptions")).toBe(0);
  });

  test("the real server path subscribes; repeat = upsert; SQL validates again behind the route", async () => {
    const a = browserSubscription("a");
    const res = await handleSubscribe(post("/api/push/subscribe", { ...a.body, locality: "Granica" }), gatewayDeps());
    expect(res.status).toBe(200);
    expect(must(`select locality || ':' || enabled from public.push_subscriptions where endpoint = '${a.body.endpoint}'`)).toBe("Granica:true");
    const again = await handleSubscribe(post("/api/push/subscribe", { ...a.body, locality: "Komorów" }), gatewayDeps());
    expect(again.status).toBe(200);
    expect(count("push_subscriptions")).toBe(1);
    expect(must(`select locality from public.push_subscriptions where endpoint = '${a.body.endpoint}'`)).toBe("Komorów");
    // Even with the token, the function re-checks every field (defence in depth).
    const rpc = createGatewayRpc(client(ANON_KEY()), GATEWAY_TOKEN);
    const bad: Array<[Record<string, string>, string]> = [
      [{ p_endpoint: "https://evil.example/x", p_p256dh: a.body.keys.p256dh, p_auth: a.body.keys.auth, p_locality: "Granica" }, "invalid_endpoint"],
      [{ p_endpoint: "https://fcm.googleapis.com.evil.example/x", p_p256dh: a.body.keys.p256dh, p_auth: a.body.keys.auth, p_locality: "Granica" }, "invalid_endpoint"],
      [{ p_endpoint: a.body.endpoint, p_p256dh: "short", p_auth: a.body.keys.auth, p_locality: "Granica" }, "invalid_p256dh"],
      [{ p_endpoint: a.body.endpoint, p_p256dh: a.body.keys.p256dh, p_auth: "!", p_locality: "Granica" }, "invalid_auth"],
      [{ p_endpoint: a.body.endpoint, p_p256dh: a.body.keys.p256dh, p_auth: a.body.keys.auth, p_locality: "Opacz" }, "invalid_locality"],
    ];
    for (const [args, message] of bad) {
      const { error } = await rpc("push_subscribe", args);
      expect(error?.code).toBe("22023");
      expect(error?.message).toBe(message);
    }
    expect(must(`select locality from public.push_subscriptions where endpoint = '${a.body.endpoint}'`)).toBe("Komorów");
  });

  test("non-admin authenticated (scheduled writer identity) sees and changes nothing", async () => {
    const writer = client(userKey(WRITER));
    expect((await writer.from("push_subscriptions").select("*")).data).toEqual([]);
    const ins = await writer.from("push_deliveries").insert({ alert_id: ADMIN, subscription_id: ADMIN, status: "claimed" });
    expect(ins.error).not.toBeNull();
    const upd = await writer.from("push_subscriptions").update({ enabled: false }).neq("locality", "x").select();
    expect(upd.data ?? []).toEqual([]);
    expect((await writer.from("push_gateway_secret").select("*")).error?.code).toBe("42501");
    const rpc = await writer.rpc("push_subscribe", { p_token: GATEWAY_TOKEN, p_endpoint: "https://fcm.googleapis.com/fcm/send/w", p_p256dh: "A".repeat(87), p_auth: "A".repeat(22), p_locality: "Granica" });
    expect(rpc.error).not.toBeNull();
    expect(must(`select count(*) from public.push_subscriptions where enabled`)).toBe("1");
  });

  test("admin send path: real store, one push per device, idempotent retry, encrypted payload decrypts", async () => {
    const g = browserSubscription("granica");
    expect((await handleSubscribe(post("/api/push/subscribe", { ...g.body, locality: "Granica" }), gatewayDeps())).status).toBe(200);
    const other = browserSubscription("reguly");
    expect((await handleSubscribe(post("/api/push/subscribe", { ...other.body, locality: "Reguły" }), gatewayDeps())).status).toBe(200);

    const admin = client(userKey(ADMIN));
    expect((await admin.from("push_gateway_secret").select("*")).error?.code).toBe("42501"); // even admins
    const sent: PushHttpRequest[] = [];
    const transport: PushTransport = async (req) => (sent.push(req), { status: 201 });
    const deps = {
      config: CONFIG,
      requireAdmin: async () => ({ ok: true as const, client: admin }),
      loadAlert: loadAlertForPush,
      storeFor: supabasePushStore,
      transport,
    };
    const res = await handleAlertPublished(post("/api/admin/push/alert-published", { slug: "test-brak-wody-granica" }), deps);
    const summary = await res.json();
    expect(summary).toMatchObject({ ok: true, matched: 1, sent: 1, failed: 0, alreadyDelivered: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe(g.body.endpoint);
    const payload = JSON.parse(decrypt(sent[0].body, g.ua.getPrivateKey(), g.ua.getPublicKey(), g.auth));
    expect(payload).toMatchObject({ v: 1, title: "Brak wody – Granica", url: "/alerts/test-brak-wody-granica" });
    expect(must(`select status || ':' || http_status from public.push_deliveries`)).toBe("sent:201");

    // Retry / double click / second tab: unique key → nothing sent again.
    const [r1, r2] = await Promise.all([
      handleAlertPublished(post("/api/admin/push/alert-published", { slug: "test-brak-wody-granica" }), deps),
      handleAlertPublished(post("/api/admin/push/alert-published", { slug: "test-brak-wody-granica" }), deps),
    ]);
    expect((await r1.json()).alreadyDelivered + (await r2.json()).alreadyDelivered).toBe(2);
    expect(sent).toHaveLength(1);
    expect(count("push_deliveries")).toBe(1);

    // Drafts never notify.
    const draft = await handleAlertPublished(post("/api/admin/push/alert-published", { slug: "test-szkic-komorow" }), deps);
    expect(await draft.json()).toMatchObject({ ok: true, skipped: "not_published" });
  });

  test("410 from the push service disables the subscription (admin RLS update works)", async () => {
    must(`delete from public.push_deliveries`);
    const admin = client(userKey(ADMIN));
    const res = await handleAlertPublished(post("/api/admin/push/alert-published", { slug: "test-brak-wody-granica" }), {
      config: CONFIG,
      requireAdmin: async () => ({ ok: true as const, client: admin }),
      loadAlert: loadAlertForPush,
      storeFor: supabasePushStore,
      transport: async () => ({ status: 410 }),
    });
    expect(await res.json()).toMatchObject({ gone: 1, sent: 0 });
    expect(must(`select enabled || ':' || disabled_reason || ':' || (disabled_at is not null) from public.push_subscriptions where locality = 'Granica'`)).toBe(
      "false:gone:true"
    );
    expect(must(`select status || ':' || http_status from public.push_deliveries`)).toBe("gone:410");
  });

  test("unsubscribe deletes the row and its deliveries; unknown endpoint is indistinguishable", async () => {
    const endpoint = must(`select endpoint from public.push_subscriptions where locality = 'Granica'`);
    const res = await handleUnsubscribe(post("/api/push/unsubscribe", { endpoint }), { ...gatewayDeps(), config: getPushServerConfig({}) });
    expect(res.status).toBe(200);
    expect(must(`select count(*) from public.push_subscriptions where endpoint = '${endpoint}'`)).toBe("0");
    expect(count("push_deliveries")).toBe(0);
    const unknown = await handleUnsubscribe(post("/api/push/unsubscribe", { endpoint: "https://fcm.googleapis.com/fcm/send/never-existed" }), gatewayDeps());
    expect(unknown.status).toBe(200);
    expect(await unknown.json()).toEqual(await res.clone().json().catch(() => ({ ok: true })));
  });

  test("global throttle: 60 new subscriptions per minute across all instances → 429", async () => {
    must(`update public.push_subscriptions set created_at = now() - interval '5 minutes'`);
    const before = count("push_subscriptions");
    const tok = GATEWAY_TOKEN;
    const batch = (from: number, to: number) =>
      `select public.push_subscribe('${tok}', 'https://fcm.googleapis.com/fcm/send/burst-' || g, repeat('B', 87), repeat('A', 22), 'Pruszków') from generate_series(${from}, ${to}) g`;
    // One statement of 61 fails as a whole at the 61st (statement rolled back).
    const tooMany = asRole("anon", batch(1, 61).replace(/;?$/, ""));
    expect(tooMany.ok).toBe(false);
    expect(tooMany.err).toContain("rate_limited");
    // Committed: 60 pass, the 61st (new endpoint) is refused with 54000.
    must(`begin; set local role anon; ${batch(1, 60)}; commit;`);
    expect(count("push_subscriptions")).toBe(before + 60);
    const res = await handleSubscribe(post("/api/push/subscribe", { ...browserSubscription("61").body, locality: "Pruszków" }), gatewayDeps());
    expect(res.status).toBe(429);
    // Re-subscribing an EXISTING endpoint is still allowed (not a new row).
    must(`begin; set local role anon; ${batch(1, 1)}; commit;`);
    must(`delete from public.push_subscriptions where endpoint like 'https://fcm.googleapis.com/fcm/send/burst-%'`);
  });

  test("capacity ceiling: 20 000 rows → new endpoints refused, existing ones still update", async () => {
    must(
      `insert into public.push_subscriptions (endpoint, p256dh, auth, locality, created_at) select 'https://fcm.googleapis.com/fcm/send/cap-' || g, repeat('B', 87), repeat('A', 22), 'Pruszków', now() - interval '1 day' from generate_series(1, 20000 - (select count(*) from public.push_subscriptions)::int) g`
    );
    expect(count("push_subscriptions")).toBe(20000);
    const r = asRole("anon", `select public.push_subscribe('${GATEWAY_TOKEN}', 'https://fcm.googleapis.com/fcm/send/over', repeat('B', 87), repeat('A', 22), 'Granica')`);
    expect(r.err).toContain("capacity_reached");
    const existing = asRole("anon", `select public.push_subscribe('${GATEWAY_TOKEN}', 'https://fcm.googleapis.com/fcm/send/cap-1', repeat('B', 87), repeat('A', 22), 'Granica')`);
    expect(existing.ok).toBe(true);
    must(`delete from public.push_subscriptions where endpoint like 'https://fcm.googleapis.com/fcm/send/cap-%'`);
  });

  test("retention SQL from the migration file deletes exactly what it says", () => {
    const sql = readFileSync(join(ROOT, "docs/sql/PROPOSED_LR8A_PUSH_SUBSCRIPTIONS_V1.sql"), "utf8");
    const retention = sql
      .slice(sql.indexOf("-- ── Retention"))
      .split("\n")
      .filter((l) => l.startsWith("--   "))
      .map((l) => l.slice(5))
      .join("\n")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(retention).toHaveLength(2);
    const alertId = must(`select id from public.alerts where slug = 'test-brak-wody-granica'`);
    must(`insert into public.push_subscriptions (endpoint, p256dh, auth, locality, enabled, disabled_reason, disabled_at) values
      ('https://fcm.googleapis.com/fcm/send/old-gone', repeat('B',87), repeat('A',22), 'Granica', false, 'gone', now() - interval '31 days'),
      ('https://fcm.googleapis.com/fcm/send/new-gone', repeat('B',87), repeat('A',22), 'Granica', false, 'gone', now() - interval '29 days'),
      ('https://fcm.googleapis.com/fcm/send/live', repeat('B',87), repeat('A',22), 'Granica', true, null, null)`);
    must(`insert into public.push_deliveries (alert_id, subscription_id, status, created_at)
      select '${alertId}', id, 'sent', case when endpoint like '%live' then now() - interval '91 days' else now() end
      from public.push_subscriptions where endpoint in ('https://fcm.googleapis.com/fcm/send/live', 'https://fcm.googleapis.com/fcm/send/new-gone')`);
    for (const stmt of retention) must(stmt);
    expect(must(`select string_agg(substr(endpoint, 37), ',' order by endpoint) from public.push_subscriptions where endpoint like '%/send/%-gone' or endpoint like '%/send/live'`)).toBe("live,new-gone");
    expect(count("push_deliveries")).toBe(1);
  });

  test("rollback removes every push object and leaves alerts/admin data untouched", () => {
    const alertsBefore = count("alerts");
    must(readFileSync(join(ROOT, "docs/sql/ROLLBACK_LR8A_PUSH_SUBSCRIPTIONS_V1.sql"), "utf8"));
    expect(must(`select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname like 'push_%'`)).toBe("0");
    expect(must(`select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname like 'push_%'`)).toBe("0");
    expect(count("alerts")).toBe(alertsBefore);
    expect(count("admin_profiles")).toBe(1);
    // Re-runnable: a second rollback is a no-op, and the migration applies again.
    must(readFileSync(join(ROOT, "docs/sql/ROLLBACK_LR8A_PUSH_SUBSCRIPTIONS_V1.sql"), "utf8"));
    must(readFileSync(join(ROOT, "docs/sql/PROPOSED_LR8A_PUSH_SUBSCRIPTIONS_V1.sql"), "utf8"));
    must(readFileSync(join(ROOT, "docs/sql/ROLLBACK_LR8A_PUSH_SUBSCRIPTIONS_V1.sql"), "utf8"));
  });
});
