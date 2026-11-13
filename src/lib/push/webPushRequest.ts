import webpush from "web-push";

// LR-8A.1 — builds the HTTP request for one push message using the
// `web-push` library (web-push-libs, maintained since 2016): RFC 8291
// aes128gcm payload encryption and RFC 8292 VAPID signing are NOT
// implemented here. The library only BUILDS the request
// (generateRequestDetails); sending stays in pushSender.ts on fetch with
// redirect: "manual" + a timeout, after the endpoint allowlist check, so
// the SSRF boundary remains in our code and the library never opens a
// connection or reads proxy settings.
//
// SERVER-ONLY. Needs the VAPID private key; must never be imported from a
// "use client" file (guarded by tests/e2e/pushSecurity.spec.ts).

/** Push services must accept at least 4096 bytes of body; keep a margin. */
export const MAX_PLAINTEXT_BYTES = 3000;

export interface VapidKeys {
  /** base64url, 65-byte uncompressed P-256 public key */
  publicKey: string;
  /** base64url, 32-byte P-256 private scalar — SERVER SECRET */
  privateKey: string;
}

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushHttpRequest {
  url: string;
  headers: Record<string, string>;
  body: Buffer;
}

/** Builds the HTTP request a push service expects (RFC 8030 + 8291 + 8292). */
export function buildWebPushRequest(
  subscription: PushSubscriptionKeys,
  payload: string,
  vapid: VapidKeys & { subject: string },
  options: { ttlSeconds?: number; urgency?: "normal" | "high"; topic?: string } = {}
): PushHttpRequest {
  if (Buffer.byteLength(payload, "utf8") > MAX_PLAINTEXT_BYTES) throw new Error("payload_too_large");
  const details = webpush.generateRequestDetails(
    { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
    payload,
    {
      vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
      TTL: options.ttlSeconds ?? 12 * 60 * 60,
      urgency: options.urgency ?? "high",
      contentEncoding: "aes128gcm",
      // Topic (RFC 8030 §5.4): a newer message with the same topic replaces
      // an undelivered older one; max 32 base64url chars.
      ...(options.topic && /^[A-Za-z0-9_-]{1,32}$/.test(options.topic) ? { topic: options.topic } : {}),
    }
  );
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(details.headers)) headers[name] = String(value);
  if (!details.body) throw new Error("empty_push_body");
  return { url: details.endpoint, headers, body: Buffer.from(details.body) };
}
