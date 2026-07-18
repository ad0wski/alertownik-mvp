import { promises as dns } from "dns";
import net from "net";

// Sprint 161 — SSRF defense for src/app/api/sources/fetch-preview/route.ts,
// the one route that fetches a URL supplied directly by the (authenticated)
// admin rather than a server-side allowlist. Blocks the request from ever
// reaching a private, loopback, link-local, multicast, unspecified, CGNAT,
// documentation/test, or cloud-metadata address — including the
// IPv4-mapped-IPv6 form of each — and re-validates on every redirect hop
// instead of trusting the first check alone.

export type SsrfCheckResult = { ok: true } | { ok: false; reason: string };

const BLOCKED_HOSTNAME_SUFFIXES = [".local", ".internal", ".localhost"];

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return true; // unparseable — fail closed
  }
  const [a, b, c] = parts;
  if (a === 0) return true; // 0.0.0.0/8 "this network" / unspecified
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local, incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 carrier-grade NAT
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 documentation (TEST-NET-1)
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 documentation (TEST-NET-2)
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 documentation (TEST-NET-3)
  if (a >= 224) return true; // 224.0.0.0/4 multicast, 240.0.0.0/4 reserved, 255.255.255.255 broadcast
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1") return true; // loopback
  if (lower === "::") return true; // unspecified
  // fe80::/10 link-local
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;
  // fc00::/7 unique local
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true;
  // ff00::/8 multicast
  if (lower.startsWith("ff")) return true;
  // IPv4-mapped ::ffff:a.b.c.d (and the rarer ::a.b.c.d form)
  const mapped = lower.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

export function isPublicIp(ip: string): boolean {
  if (net.isIPv4(ip)) return !isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return !isPrivateIPv6(ip);
  return false; // not a recognizable IP literal — fail closed
}

/**
 * Validates a URL is http(s), carries no embedded credentials, doesn't
 * target a blocked hostname suffix, and resolves (fully — every address a
 * lookup returns, not just the first) to only public IP addresses.
 *
 * Known residual limitation (documented, not silently ignored): this
 * performs its own DNS lookup ahead of the fetch call. Node's built-in
 * fetch resolves the hostname again internally when it opens the
 * connection, so a DNS answer that changes between this check and that
 * connection (classic "DNS rebinding") is not fully closed by this
 * function alone — see docs/SPRINT_161_CRITICAL_SECURITY_HARDENING_V1.md
 * for why closing that gap completely needs either a new dependency
 * (an HTTP client that accepts a pinned-IP dispatcher) or a lower-level
 * TCP client, and was treated as a separate, explicitly-flagged decision
 * rather than something to fake here.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<SsrfCheckResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "unsupported_protocol" };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, reason: "credentials_in_url" };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || BLOCKED_HOSTNAME_SUFFIXES.some((s) => hostname.endsWith(s))) {
    return { ok: false, reason: "blocked_hostname" };
  }

  if (net.isIP(hostname)) {
    return isPublicIp(hostname) ? { ok: true } : { ok: false, reason: "private_ip" };
  }

  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    return { ok: false, reason: "dns_resolution_failed" };
  }

  if (addresses.length === 0) {
    return { ok: false, reason: "dns_resolution_failed" };
  }

  for (const { address } of addresses) {
    if (!isPublicIp(address)) {
      return { ok: false, reason: "private_ip" };
    }
  }

  return { ok: true };
}

// ── Guarded fetch: SSRF-checked URL + re-validated redirects + size cap ────

export interface GuardedFetchOk {
  ok: true;
  response: Response;
  finalUrl: string;
}
export type GuardedFetchResult = GuardedFetchOk | { ok: false; reason: string };

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_REDIRECTS = 3;
const REQUEST_USER_AGENT = "Alertownik-Monitor/1.0 (admin source check)";

/**
 * Fetches a URL only after it (and every subsequent redirect target) passes
 * assertPublicHttpUrl. Never forwards client-supplied headers, cookies, or
 * Authorization to the target host — only a fixed User-Agent/Accept pair.
 * Follows redirects itself (redirect: "manual") instead of letting the
 * platform auto-follow, specifically so each hop can be re-checked.
 */
export async function guardedFetch(
  startUrl: string,
  opts: { timeoutMs?: number; maxRedirects?: number } = {},
): Promise<GuardedFetchResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  let currentUrl = startUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const check = await assertPublicHttpUrl(currentUrl);
    if (!check.ok) return { ok: false, reason: check.reason };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          "User-Agent": REQUEST_USER_AGENT,
          Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        },
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        return { ok: false, reason: "timeout" };
      }
      return { ok: false, reason: "fetch_error" };
    }
    clearTimeout(timeoutId);

    const isRedirect = response.status >= 300 && response.status < 400;
    if (isRedirect) {
      const location = response.headers.get("location");
      if (!location) return { ok: false, reason: "redirect_without_location" };
      try {
        currentUrl = new URL(location, currentUrl).toString();
      } catch {
        return { ok: false, reason: "invalid_redirect_target" };
      }
      continue;
    }

    return { ok: true, response, finalUrl: currentUrl };
  }

  return { ok: false, reason: "too_many_redirects" };
}

/**
 * Reads a Response body as text, aborting once maxBytes is exceeded — a
 * server that keeps sending data past the cap never gets fully buffered
 * into memory.
 */
export async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return (await response.text()).slice(0, maxBytes);
  }

  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      const overshoot = received - maxBytes;
      const keep = value.byteLength - overshoot;
      if (keep > 0) text += decoder.decode(value.slice(0, keep));
      await reader.cancel().catch(() => {});
      break;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text;
}
