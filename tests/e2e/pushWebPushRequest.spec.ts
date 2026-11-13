import { test, expect } from "@playwright/test";
import { createDecipheriv, createECDH, createPublicKey, generateKeyPairSync, hkdfSync, verify } from "node:crypto";
import { createRequire } from "node:module";
import { buildWebPushRequest, MAX_PLAINTEXT_BYTES } from "@/lib/push/webPushRequest";

// LR-8A.1 — encryption and VAPID now come from the `web-push` library
// (no custom crypto in src/). These tests pin its behaviour: a push service
// silently drops anything a browser cannot decrypt, so this is the only
// place a regression would be visible before Production.

const b64u = (b: Uint8Array) => Buffer.from(b).toString("base64url");
const unb64u = (s: string) => Buffer.from(s, "base64url");

const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  authSecret: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  expected:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

/** Independent receiver-side decryption (what the browser does, RFC 8291). */
function decrypt(body: Buffer, uaPrivate: Buffer, uaPublic: Buffer, auth: Buffer): string {
  const salt = body.subarray(0, 16);
  const idlen = body.readUInt8(20);
  const asPublic = body.subarray(21, 21 + idlen);
  const ct = body.subarray(21 + idlen);
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(uaPrivate);
  const secret = ecdh.computeSecret(asPublic);
  const ikm = Buffer.from(
    hkdfSync("sha256", secret, auth, Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]), 32)
  );
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const d = createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  expect(plain[plain.length - 1]).toBe(0x02);
  return plain.subarray(0, plain.length - 1).toString("utf8");
}

function vapidKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pub = publicKey.export({ format: "jwk" }) as { x: string; y: string };
  const priv = privateKey.export({ format: "jwk" }) as { d: string };
  return {
    publicKey: b64u(Buffer.concat([Buffer.from([4]), unb64u(pub.x), unb64u(pub.y)])),
    privateKey: priv.d,
    subject: "mailto:test@example.invalid",
    keyObject: publicKey,
  };
}

function browser() {
  const ua = createECDH("prime256v1");
  ua.generateKeys();
  const auth = Buffer.alloc(16, 7);
  return { ua, auth, sub: { p256dh: b64u(ua.getPublicKey()), auth: b64u(auth) } };
}

test.describe("LR-8A.1 web-push library request", () => {
  test("the library's encryption layer reproduces the RFC 8291 Appendix A ciphertext", () => {
    // http_ece is what web-push calls for aes128gcm; with the RFC's fixed
    // salt and sender key it must produce the RFC bytes exactly.
    const ece = createRequire(__filename)("http_ece");
    const sender = createECDH("prime256v1");
    sender.setPrivateKey(unb64u(RFC.asPrivate));
    const out = ece.encrypt(Buffer.from(RFC.plaintext), {
      version: "aes128gcm",
      dh: RFC.uaPublic,
      privateKey: sender,
      salt: RFC.salt,
      authSecret: RFC.authSecret,
      rs: 4096,
    });
    expect(b64u(out)).toBe(RFC.expected);
  });

  test("request body decrypts in an independent RFC 8291 receiver (Polish payload)", () => {
    const keys = vapidKeys();
    const { ua, auth, sub } = browser();
    const text = JSON.stringify({ title: "Brak wody – Reguły", body: "Przerwa 11:00–15:00, ul. Królewska" });
    const req = buildWebPushRequest({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", ...sub }, text, keys);
    expect(decrypt(req.body, ua.getPrivateKey(), ua.getPublicKey(), auth)).toBe(text);
    // Fresh salt and sender key every time.
    const again = buildWebPushRequest({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", ...sub }, text, keys);
    expect(again.body.equals(req.body)).toBe(false);
  });

  test("headers: aes128gcm, TTL, high urgency, topic, VAPID with push-service audience", () => {
    const keys = vapidKeys();
    const { sub } = browser();
    const req = buildWebPushRequest(
      { endpoint: "https://web.push.apple.com/QAbc", ...sub },
      '{"t":1}',
      keys,
      { topic: "brak-wody-reguly" }
    );
    expect(req.url).toBe("https://web.push.apple.com/QAbc");
    expect(req.headers["Content-Encoding"]).toBe("aes128gcm");
    expect(req.headers["Content-Type"]).toBe("application/octet-stream");
    expect(req.headers.TTL).toBe(String(12 * 3600));
    expect(req.headers.Urgency).toBe("high");
    expect(req.headers.Topic).toBe("brak-wody-reguly");
    expect(req.headers["Content-Length"]).toBe(String(req.body.length));

    const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(req.headers.Authorization);
    expect(m).not.toBeNull();
    const [, h, p, s, k] = m!;
    expect(k).toBe(keys.publicKey);
    expect(req.headers.Authorization).not.toContain(keys.privateKey);
    expect(JSON.parse(unb64u(h).toString())).toEqual({ typ: "JWT", alg: "ES256" });
    const claims = JSON.parse(unb64u(p).toString());
    expect(claims.aud).toBe("https://web.push.apple.com");
    expect(claims.sub).toBe("mailto:test@example.invalid");
    const now = Math.floor(Date.now() / 1000);
    expect(claims.exp).toBeGreaterThan(now);
    expect(claims.exp).toBeLessThanOrEqual(now + 24 * 3600);
    const signingInput = Buffer.from(`${h}.${p}`);
    expect(verify("sha256", signingInput, { key: keys.keyObject, dsaEncoding: "ieee-p1363" }, unb64u(s))).toBe(true);
    const other = vapidKeys();
    expect(verify("sha256", signingInput, { key: other.keyObject, dsaEncoding: "ieee-p1363" }, unb64u(s))).toBe(false);
    // The JWT key in "k=" is the one that verifies.
    const pub = unb64u(k);
    const jwk = { kty: "EC", crv: "P-256", x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) };
    expect(verify("sha256", signingInput, { key: createPublicKey({ key: jwk, format: "jwk" }), dsaEncoding: "ieee-p1363" }, unb64u(s))).toBe(true);
  });

  test("invalid topic is dropped, never sent", () => {
    const { sub } = browser();
    const req = buildWebPushRequest({ endpoint: "https://fcm.googleapis.com/fcm/send/x", ...sub }, "{}", vapidKeys(), {
      topic: "has spaces/and slashes",
    });
    expect(req.headers.Topic).toBeUndefined();
  });

  test("rejects oversized payloads and malformed keys", () => {
    const keys = vapidKeys();
    const { sub } = browser();
    const endpoint = "https://fcm.googleapis.com/fcm/send/x";
    expect(() => buildWebPushRequest({ endpoint, ...sub }, "a".repeat(MAX_PLAINTEXT_BYTES + 1), keys)).toThrow("payload_too_large");
    expect(() => buildWebPushRequest({ endpoint, p256dh: b64u(Buffer.alloc(65)), auth: sub.auth }, "{}", keys)).toThrow();
    expect(() => buildWebPushRequest({ endpoint, p256dh: sub.p256dh, auth: b64u(Buffer.alloc(8)) }, "{}", keys)).toThrow();
    expect(() => buildWebPushRequest({ endpoint, ...sub }, "{}", { ...keys, privateKey: "short" })).toThrow();
    expect(() => buildWebPushRequest({ endpoint, ...sub }, "{}", { ...keys, subject: "not-a-contact" })).toThrow();
  });
});
