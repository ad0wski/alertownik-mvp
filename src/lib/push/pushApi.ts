import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PushServerConfig } from "@/lib/push/pushConfig";
import { validateSubscribeBody, validateUnsubscribeBody, type PushAlertRow } from "@/lib/push/pushPolicy";
import { sendAlertPush, type PushStore, type PushTransport, type SendSummary } from "@/lib/push/pushSender";

// LR-8A — request handlers for the push API, written against injected
// dependencies so every branch is testable without a database or a push
// service. The route files only wire real dependencies in.
//
// Write path for anonymous visitors: browser → same-origin route (this
// file: origin check, size cap, rate limit, strict validation) → Postgres
// SECURITY DEFINER function push_subscribe/push_unsubscribe (validates
// again) → table. The anon role has NO direct grant on the table: it can
// neither read, list nor modify subscriptions (see the LR-8A SQL file).
// LR-8A.1: the functions also require a server-only gateway token, added
// by pushRuntime.createGatewayRpc — so calling them directly with the
// public anon key (bypassing this file) fails.

export const MAX_BODY_BYTES = 4096;

type Json = Record<string, unknown>;
const json = (body: Json, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export type RpcError = { code?: string; message?: string } | null;
export type RpcCall = (fn: "push_subscribe" | "push_unsubscribe", args: Record<string, string>) => Promise<{ error: RpcError }>;

/** Maps a database refusal to an HTTP answer without leaking details. */
function rpcFailure(error: NonNullable<RpcError>, fallback: string): NextResponse {
  // 54000 = global throttle in push_subscribe (all instances together).
  if (error.code === "54000") return json({ ok: false, error: "rate_limited" }, 429);
  // 42501 = gateway token refused: a server misconfiguration, not the user.
  if (error.code === "42501") {
    console.error("[push] gateway token refused by the database");
    return json({ ok: false, error: "push_unavailable" }, 503);
  }
  return json({ ok: false, error: fallback }, 500);
}

export interface PublicPushDeps {
  config: PushServerConfig;
  rpc: RpcCall | null;
  allowRequest: (key: string) => boolean;
}

/** Same-origin only: a browser always sends Origin on a cross-site POST,
 *  so a missing or foreign Origin is refused (fail closed). */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

function clientKey(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
}

async function readJson(req: Request): Promise<{ ok: true; body: unknown } | { ok: false; res: NextResponse }> {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return { ok: false, res: json({ ok: false, error: "unsupported_media_type" }, 415) };
  }
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return { ok: false, res: json({ ok: false, error: "payload_too_large" }, 413) };
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) return { ok: false, res: json({ ok: false, error: "payload_too_large" }, 413) };
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, res: json({ ok: false, error: "invalid_json" }, 400) };
  }
}

async function guard(req: Request, deps: PublicPushDeps, requireEnabled: boolean) {
  if (!sameOrigin(req)) return json({ ok: false, error: "forbidden_origin" }, 403);
  if (requireEnabled && !deps.config.enabled) return json({ ok: false, error: "push_disabled" }, 503);
  if (!deps.rpc) return json({ ok: false, error: "push_unavailable" }, 503);
  if (!deps.allowRequest(clientKey(req))) return json({ ok: false, error: "rate_limited" }, 429);
  return null;
}

export async function handleSubscribe(req: Request, deps: PublicPushDeps): Promise<NextResponse> {
  const blocked = await guard(req, deps, true);
  if (blocked) return blocked;
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.res;
  const v = validateSubscribeBody(parsed.body);
  if (!v.ok) return json({ ok: false, error: v.error }, 400);
  const { error } = await deps.rpc!("push_subscribe", {
    p_endpoint: v.value.endpoint,
    p_p256dh: v.value.p256dh,
    p_auth: v.value.auth,
    p_locality: v.value.locality,
  });
  if (error) return rpcFailure(error, "subscribe_failed");
  return json({ ok: true, locality: v.value.locality });
}

/** Unsubscribe stays available even with the kill switch off, so a user
 *  can always remove their data. */
export async function handleUnsubscribe(req: Request, deps: PublicPushDeps): Promise<NextResponse> {
  const blocked = await guard(req, deps, false);
  if (blocked) return blocked;
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.res;
  const v = validateUnsubscribeBody(parsed.body);
  if (!v.ok) return json({ ok: false, error: v.error }, 400);
  const { error } = await deps.rpc!("push_unsubscribe", { p_endpoint: v.value.endpoint });
  if (error) return rpcFailure(error, "unsubscribe_failed");
  return json({ ok: true });
}

// ── Admin: notify after a manual publish ─────────────────────────────────────

export interface AdminPushDeps {
  config: PushServerConfig;
  requireAdmin: (req: Request) => Promise<{ ok: true; client: SupabaseClient } | { ok: false; response: NextResponse }>;
  loadAlert: (client: SupabaseClient, slug: string) => Promise<PushAlertRow | null>;
  storeFor: (client: SupabaseClient) => PushStore;
  transport: PushTransport;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,159}$/;

export async function handleAlertPublished(req: Request, deps: AdminPushDeps): Promise<NextResponse> {
  const auth = await deps.requireAdmin(req);
  if (!auth.ok) return auth.response;
  if (!deps.config.enabled) return json({ ok: true, skipped: "push_disabled" });
  const parsed = await readJson(req);
  if (!parsed.ok) return parsed.res;
  const slug = (parsed.body as Json | null)?.slug;
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) return json({ ok: false, error: "invalid_slug" }, 400);

  let alert: PushAlertRow | null;
  try {
    alert = await deps.loadAlert(auth.client, slug);
  } catch {
    return json({ ok: false, error: "alert_read_failed" }, 500);
  }
  if (!alert) return json({ ok: false, error: "alert_not_found" }, 404);

  let summary: SendSummary;
  try {
    summary = await sendAlertPush(alert, {
      store: deps.storeFor(auth.client),
      transport: deps.transport,
      vapid: deps.config.vapid,
    });
  } catch {
    // e.g. subscriptions unreadable. The alert itself stays published.
    console.error("[push] send failed for alert", slug);
    return json({ ok: false, error: "push_send_failed" }, 502);
  }
  if (!summary.eligibility.eligible) return json({ ok: true, skipped: summary.eligibility.reason });
  if (summary.failed > 0) console.error("[push] partial failure", { slug, failed: summary.failed });
  return json({
    ok: true,
    matched: summary.matched,
    sent: summary.sent,
    failed: summary.failed,
    gone: summary.gone,
    alreadyDelivered: summary.alreadyDelivered,
  });
}

// ── Best-effort rate limiter (per server instance) ───────────────────────────

export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const t = now();
    const recent = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(t);
    hits.set(key, recent);
    if (hits.size > 10_000) hits.clear(); // bound memory
    return true;
  };
}
