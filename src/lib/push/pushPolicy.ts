import { PILOT_LOCALITIES } from "@/lib/officialSourceChecklist";
import { extractEventPlaces } from "@/lib/candidateWarnings";
import { getAlertTimeStatus } from "@/lib/getAlertTimeStatus";
import { formatAlertRange } from "@/lib/formatAlertDate";

// LR-8A — pure push policy: which subscriptions are acceptable, which
// alerts may notify whom, and what the notification says. No I/O here;
// shared by the API routes, the sender and the tests.

/** v1 notifies only about things a resident has to act on. */
export const PUSH_CATEGORIES = ["water", "roads", "waste"] as const;
export type PushCategory = (typeof PUSH_CATEGORIES)[number];

/** Same list the writer uses to read localities out of notices. */
export const PUSH_LOCALITIES: readonly string[] = PILOT_LOCALITIES;

/**
 * Push services the server is allowed to POST to. The endpoint URL comes
 * from an anonymous browser, so without this list the send pipeline would
 * be an SSRF primitive (the server making requests to any URL a visitor
 * stores). Same list is enforced again in SQL (push_subscribe).
 */
const PUSH_SERVICE_HOSTS: readonly RegExp[] = [
  /^fcm\.googleapis\.com$/, // Chrome, Android Chrome, Android TWA (Chrome-delegated), Edge Android
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /^web\.push\.apple\.com$/, // Safari macOS 13+, iOS/iPadOS 16.4+ Home Screen web apps
  /^[a-z0-9-]+\.notify\.windows\.com$/, // Edge on Windows (WNS)
];

export const MAX_ENDPOINT_LENGTH = 1024;

export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length === 0 || endpoint.length > MAX_ENDPOINT_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  return PUSH_SERVICE_HOSTS.some((re) => re.test(url.hostname));
}

const B64URL = /^[A-Za-z0-9_-]+$/;

/** p256dh = base64url of a 65-byte uncompressed P-256 point (87 chars). */
function isValidP256dh(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 86 || value.length > 88 || !B64URL.test(value)) return false;
  const bytes = Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  return bytes.length === 65 && bytes[0] === 0x04;
}

/** auth = base64url of 16 random bytes (22 chars). */
function isValidAuth(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 21 || value.length > 24 || !B64URL.test(value)) return false;
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").length === 16;
}

export function isPushLocality(value: unknown): value is string {
  return typeof value === "string" && PUSH_LOCALITIES.includes(value);
}

export interface SubscribeInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  locality: string;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Accepts exactly the browser's PushSubscription.toJSON() shape plus a locality. */
export function validateSubscribeBody(body: unknown): ValidationResult<SubscribeInput> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "invalid_body" };
  const b = body as Record<string, unknown>;
  const keys = b.keys as Record<string, unknown> | undefined;
  if (!isAllowedPushEndpoint(b.endpoint)) return { ok: false, error: "invalid_endpoint" };
  if (!keys || typeof keys !== "object" || !isValidP256dh(keys.p256dh) || !isValidAuth(keys.auth)) {
    return { ok: false, error: "invalid_keys" };
  }
  if (!isPushLocality(b.locality)) return { ok: false, error: "invalid_locality" };
  return { ok: true, value: { endpoint: b.endpoint, p256dh: keys.p256dh, auth: keys.auth, locality: b.locality } };
}

export function validateUnsubscribeBody(body: unknown): ValidationResult<{ endpoint: string }> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "invalid_body" };
  const endpoint = (body as Record<string, unknown>).endpoint;
  if (!isAllowedPushEndpoint(endpoint)) return { ok: false, error: "invalid_endpoint" };
  return { ok: true, value: { endpoint } };
}

// ── Alert eligibility ────────────────────────────────────────────────────────

export interface PushAlertRow {
  id: string;
  slug: string;
  title: string;
  place: string | null;
  category: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
}

export type PushEligibility =
  | { eligible: true; localities: string[] }
  | { eligible: false; reason: "not_published" | "category" | "ended" | "no_locality" | "invalid_slug" };

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,159}$/;

export function evaluatePushEligibility(alert: PushAlertRow): PushEligibility {
  if (alert.status !== "published") return { eligible: false, reason: "not_published" };
  if (!(PUSH_CATEGORIES as readonly string[]).includes(alert.category)) return { eligible: false, reason: "category" };
  if (!SLUG_RE.test(alert.slug)) return { eligible: false, reason: "invalid_slug" };
  const time = getAlertTimeStatus(alert.starts_at ?? undefined, alert.ends_at ?? undefined);
  if (time === "ended") return { eligible: false, reason: "ended" };
  // Place first (what the admin typed into "Gdzie"), title as a backup —
  // "Brak wody – Granica" often names the village only in the title.
  // "gm. Michałowice" / "Urząd Gminy Michałowice" name the municipality, not
  // the village Michałowice; extractEventPlaces already ignores the full
  // "gmina Michałowice" form, the abbreviation is stripped here so a
  // Komorów notice never reaches Michałowice subscribers.
  const text = `${alert.place ?? ""} ${alert.title}`.replace(/\bgm\.?\s+Michałowice/gi, " ");
  const localities = extractEventPlaces(text);
  if (localities.length === 0) return { eligible: false, reason: "no_locality" };
  return { eligible: true, localities };
}

// ── Payload ──────────────────────────────────────────────────────────────────

export interface PushPayload {
  v: 1;
  title: string;
  body: string;
  url: string;
  tag: string;
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

/** Only public alert fields; never anything about the recipient. */
export function buildPushPayload(alert: PushAlertRow): PushPayload {
  let when = "";
  try {
    when = alert.starts_at ? formatAlertRange(alert.starts_at, alert.ends_at ?? undefined) : "";
  } catch {
    when = "";
  }
  const body = [alert.place?.trim(), when].filter(Boolean).join(" · ");
  return {
    v: 1,
    title: clip(alert.title || "Alertownik", 100),
    body: clip(body || "Nowy alert w Alertowniku", 160),
    url: `/alerts/${alert.slug}`,
    tag: `alert-${alert.slug}`.slice(0, 64),
  };
}
