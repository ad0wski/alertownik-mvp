import {
  createCipheriv,
  createECDH,
  createPrivateKey,
  hkdfSync,
  randomBytes,
  sign,
  type KeyObject,
} from "node:crypto";

// LR-8A — Web Push message encryption (RFC 8291, "aes128gcm" content
// encoding, RFC 8188) and VAPID authentication (RFC 8292), built only on
// node:crypto. No npm dependency: the repo rule is that packages need an
// explicit approval, and these two RFCs are small enough to implement and
// verify against the RFC 8291 Appendix A test vector (see
// tests/e2e/pushWebPushCrypto.spec.ts).
//
// SERVER-ONLY. This module needs the VAPID private key; it must never be
// imported from a "use client" file (guarded by tests).

export function base64UrlEncode(buf: Uint8Array): string {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized + "=".repeat((4 - (normalized.length % 4)) % 4), "base64");
}

/** Record size written into the aes128gcm header. One record is enough for
 *  every payload we send (capped far below 4 KB by pushPayload.ts). */
const RECORD_SIZE = 4096;
/** Push services must accept at least 4096 bytes of body; keep a margin. */
export const MAX_PLAINTEXT_BYTES = 3000;

export interface EncryptOptions {
  /** Test-only: fixed salt (16 bytes). Production always uses a random one. */
  salt?: Uint8Array;
  /** Test-only: fixed sender (application server) private key, 32 bytes. */
  senderPrivateKey?: Uint8Array;
}

/**
 * Encrypts `plaintext` for one push subscription (RFC 8291 §3–4).
 * `uaPublicKey` is the subscription's p256dh (65-byte uncompressed P-256
 * point) and `authSecret` its 16-byte auth secret.
 */
export function encryptWebPushPayload(
  plaintext: Uint8Array,
  uaPublicKey: Uint8Array,
  authSecret: Uint8Array,
  options: EncryptOptions = {}
): Buffer {
  if (uaPublicKey.length !== 65 || uaPublicKey[0] !== 0x04) {
    throw new Error("invalid_p256dh");
  }
  if (authSecret.length !== 16) throw new Error("invalid_auth_secret");
  if (plaintext.length > MAX_PLAINTEXT_BYTES) throw new Error("payload_too_large");

  const ecdh = createECDH("prime256v1");
  if (options.senderPrivateKey) ecdh.setPrivateKey(Buffer.from(options.senderPrivateKey));
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const ecdhSecret = ecdh.computeSecret(Buffer.from(uaPublicKey));

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0x00 || ua_public || as_public, 32)
  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0", "utf8"),
    Buffer.from(uaPublicKey),
    asPublic,
  ]);
  const ikm = Buffer.from(hkdfSync("sha256", ecdhSecret, Buffer.from(authSecret), keyInfo, 32));

  const salt = options.salt ? Buffer.from(options.salt) : randomBytes(16);
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0", "utf8"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0", "utf8"), 12));

  // Single (last) record: plaintext followed by the 0x02 delimiter, no padding.
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.concat([Buffer.from(plaintext), Buffer.from([0x02])])),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  const header = Buffer.alloc(16 + 4 + 1);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, ciphertext]);
}

export interface VapidKeys {
  /** base64url, 65-byte uncompressed P-256 public key */
  publicKey: string;
  /** base64url, 32-byte P-256 private scalar — SERVER SECRET */
  privateKey: string;
}

function vapidPrivateKeyObject(keys: VapidKeys): KeyObject {
  const pub = base64UrlDecode(keys.publicKey);
  const d = base64UrlDecode(keys.privateKey);
  if (pub.length !== 65 || pub[0] !== 0x04 || d.length !== 32) throw new Error("invalid_vapid_keys");
  return createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      d: base64UrlEncode(d),
      x: base64UrlEncode(pub.subarray(1, 33)),
      y: base64UrlEncode(pub.subarray(33, 65)),
    },
    format: "jwk",
  });
}

/** VAPID JWT (RFC 8292 §2): ES256, aud = push service origin, exp ≤ 24 h. */
export function createVapidJwt(
  audience: string,
  subject: string,
  keys: VapidKeys,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  ttlSeconds = 12 * 60 * 60
): string {
  const header = base64UrlEncode(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = base64UrlEncode(
    Buffer.from(JSON.stringify({ aud: audience, exp: nowSeconds + ttlSeconds, sub: subject }))
  );
  const signingInput = `${header}.${payload}`;
  const signature = sign("sha256", Buffer.from(signingInput), {
    key: vapidPrivateKeyObject(keys),
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${base64UrlEncode(signature)}`;
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
  const endpoint = new URL(subscription.endpoint);
  const body = encryptWebPushPayload(
    Buffer.from(payload, "utf8"),
    base64UrlDecode(subscription.p256dh),
    base64UrlDecode(subscription.auth)
  );
  const jwt = createVapidJwt(endpoint.origin, vapid.subject, vapid);
  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    "Content-Encoding": "aes128gcm",
    "Content-Length": String(body.length),
    TTL: String(options.ttlSeconds ?? 12 * 60 * 60),
    Urgency: options.urgency ?? "high",
    Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
  };
  // Topic (RFC 8030 §5.4): a newer message with the same topic replaces an
  // undelivered older one; max 32 base64url chars.
  if (options.topic && /^[A-Za-z0-9_-]{1,32}$/.test(options.topic)) headers.Topic = options.topic;
  return { url: endpoint.toString(), headers, body };
}
