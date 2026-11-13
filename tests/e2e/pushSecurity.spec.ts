import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { PILOT_LOCALITIES } from "@/lib/officialSourceChecklist";
import { isAllowedPushEndpoint } from "@/lib/push/pushPolicy";

// LR-8A — static security guarantees that a code review should not have
// to re-derive: secrets stay server-side, the SQL gives anon nothing but
// two validating functions, and the API exposes no listing route.

const ROOT = join(__dirname, "..", "..");
const SQL = readFileSync(join(ROOT, "docs", "sql", "PROPOSED_LR8A_PUSH_SUBSCRIPTIONS_V1.sql"), "utf-8");
const SQL_CODE = SQL.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const SRC_FILES = walk(join(ROOT, "src")).filter((f) => /\.(ts|tsx)$/.test(f));
const read = (f: string) => readFileSync(f, "utf-8");
const isClient = (f: string) => /^\s*["']use client["']/.test(read(f));

test.describe("LR-8A push security", () => {
  test("VAPID private key is never exposed to the browser", () => {
    for (const f of SRC_FILES) {
      const src = read(f);
      expect(src, relative(ROOT, f)).not.toMatch(/NEXT_PUBLIC_VAPID_PRIVATE|NEXT_PUBLIC_[A-Z_]*PRIVATE|NEXT_PUBLIC_PUSH_GATEWAY/);
      if (isClient(f) || f.endsWith("pushClient.ts")) {
        expect(src, relative(ROOT, f)).not.toContain("VAPID_PRIVATE_KEY");
        expect(src, relative(ROOT, f)).not.toContain("PUSH_GATEWAY_TOKEN");
        expect(src, relative(ROOT, f)).not.toMatch(/from ["']web-push["']/);
        expect(src, relative(ROOT, f)).not.toMatch(/from ["']@\/lib\/push\/(webPushRequest|pushConfig|pushSender|pushRuntime|pushApi)["']/);
      }
    }
    // The client helper reads only the public key.
    expect(read(join(ROOT, "src/lib/push/pushClient.ts"))).toContain("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
  });

  test("no client file imports the server push modules transitively through a component", () => {
    const card = read(join(ROOT, "src/components/PushNotificationsCard.tsx"));
    expect(card).toContain('"use client"');
    expect(card).not.toMatch(/pushConfig|pushSender|webPushRequest|pushRuntime|pushApi"/);
  });

  test("SQL: anon gets no table grant and no policy; only the two functions", () => {
    expect(SQL_CODE).toMatch(/revoke all on table public\.push_subscriptions\s+from anon, authenticated, public;/);
    expect(SQL_CODE).toMatch(/revoke all on table public\.push_deliveries\s+from anon, authenticated, public;/);
    expect(SQL_CODE).toMatch(/revoke all on table public\.push_gateway_secret\s+from anon, authenticated, public;/);
    expect(SQL_CODE).not.toMatch(/grant [a-z, ]+ on table public\.push_gateway_secret/i);
    expect(SQL_CODE).not.toMatch(/grant [a-z, ]+ on table public\.push_\w+\s+to [^;]*anon/i);
    expect(SQL_CODE).not.toMatch(/create policy[^;]*\bto\s+(anon|public)\b/i);
    const policies = SQL_CODE.match(/create policy[^;]+;/g) ?? [];
    expect(policies).toHaveLength(6);
    for (const p of policies) {
      expect(p).toMatch(/to authenticated/);
      expect(p).toMatch(/admin_profiles\.user_id = auth\.uid\(\)/);
      expect(p).not.toMatch(/using\s*\(\s*true\s*\)/i);
    }
    expect(SQL_CODE).toMatch(/enable row level security/g);
    expect(SQL_CODE.match(/security definer/g)).toHaveLength(2);
    expect(SQL_CODE.match(/set search_path = public, pg_temp/g)).toHaveLength(2);
    expect(SQL_CODE).toMatch(/grant execute on function public\.push_subscribe\(text, text, text, text, text\)\s+to anon;/);
    expect(SQL_CODE).toMatch(/grant execute on function public\.push_unsubscribe\(text, text\)\s+to anon;/);
    // LR-8A.1: both functions check the gateway token FIRST (before any read
    // or write), so the public anon key alone cannot use them.
    for (const fn of SQL_CODE.match(/create or replace function public\.push_\w+[\s\S]+?\$\$;/g) ?? []) {
      const body = fn.slice(fn.indexOf("begin"));
      expect(body.indexOf("push_gateway_secret")).toBeGreaterThan(-1);
      expect(body.indexOf("push_gateway_secret")).toBeLessThan(body.search(/insert into|delete from|select count/));
      expect(body).toContain("sha256(convert_to(p_token, 'UTF8'))");
      expect(body).toContain("errcode = '42501'");
    }
    // Unsubscribe returns nothing → cannot be used to probe whether an endpoint exists.
    expect(SQL_CODE).toMatch(/push_unsubscribe\(p_token text, p_endpoint text\) returns void/);
    expect(SQL_CODE).toContain("unique (alert_id, subscription_id)");
    expect(SQL_CODE).not.toMatch(/service_role/);
  });

  test("SQL and TypeScript agree on localities and push-service hosts", () => {
    for (const l of PILOT_LOCALITIES) expect(SQL_CODE).toContain(`'${l}'`);
    const sqlRe = new RegExp(SQL_CODE.match(/p_endpoint !~ '([^']+)'/)![1]);
    const samples = [
      "https://fcm.googleapis.com/fcm/send/x",
      "https://updates.push.services.mozilla.com/wpush/v2/x",
      "https://web.push.apple.com/QF3/x",
      "https://wns2-par02p.notify.windows.com/w/?token=x",
      "https://evil.example/fcm/send/x",
      "http://fcm.googleapis.com/x",
      "https://fcm.googleapis.com.evil.example/x",
      "https://169.254.169.254/latest",
    ];
    for (const s of samples) expect(sqlRe.test(s), s).toBe(isAllowedPushEndpoint(s));
  });

  test("API: public push routes are POST-only, no route lists subscriptions", () => {
    for (const r of ["src/app/api/push/subscribe/route.ts", "src/app/api/push/unsubscribe/route.ts", "src/app/api/admin/push/alert-published/route.ts"]) {
      const src = read(join(ROOT, r));
      expect(src).toMatch(/export async function POST/);
      expect(src).not.toMatch(/export (async )?function (GET|PUT|PATCH|DELETE)/);
    }
    const anyRead = SRC_FILES.filter((f) => read(f).includes('from("push_subscriptions")'));
    expect(anyRead.map((f) => relative(ROOT, f))).toEqual(["src/lib/push/pushSender.ts"]);
    expect(read(join(ROOT, "src/app/api/admin/push/alert-published/route.ts"))).toContain("requireAdminSession");
  });

  test("no custom Web Push crypto in src/: encryption and VAPID come from web-push", () => {
    expect(existsSync(join(ROOT, "src/lib/push/webPushCrypto.ts"))).toBe(false);
    const pushSrc = SRC_FILES.filter((f) => f.includes(join("src", "lib", "push")));
    for (const f of pushSrc) {
      expect(read(f), relative(ROOT, f)).not.toMatch(/createCipheriv|hkdfSync|createECDH|dsaEncoding|aes-128-gcm/);
    }
    expect(read(join(ROOT, "src/lib/push/webPushRequest.ts"))).toContain('from "web-push"');
    const pkg = JSON.parse(read(join(ROOT, "package.json")));
    expect(pkg.dependencies["web-push"]).toBe("3.6.7"); // pinned exactly
  });

  test("push is never wired into auto-publish or the scheduled writer", () => {
    for (const f of ["src/lib/trustedSourceAutoPublish.ts", "src/lib/scheduledWriter.ts", "src/app/api/cron/auto-publish-trusted-source/route.ts"]) {
      expect(read(join(ROOT, f))).not.toMatch(/push\/|alert-published|sendAlertPush/);
    }
  });

  test("no real VAPID private key or push secret is committed", () => {
    for (const f of [...SRC_FILES, join(ROOT, "playwright.config.ts")]) {
      expect(read(f), relative(ROOT, f)).not.toMatch(/VAPID_PRIVATE_KEY\s*[:=]\s*["'][A-Za-z0-9_-]{40,}/);
      expect(read(f), relative(ROOT, f)).not.toMatch(/PUSH_GATEWAY_TOKEN\s*[:=]\s*["'][A-Za-z0-9_-]{20,}/);
    }
    // The SQL stores only a hash placeholder, never a token or a real hash.
    expect(SQL).not.toMatch(/decode\('[0-9a-f]{64}'/);
    if (existsSync(join(ROOT, ".env.example"))) {
      expect(read(join(ROOT, ".env.example"))).not.toMatch(/VAPID_PRIVATE_KEY=[A-Za-z0-9_-]{40,}/);
      expect(read(join(ROOT, ".env.example"))).not.toMatch(/PUSH_GATEWAY_TOKEN=\S+/);
    }
  });
});
