import { test, expect } from "@playwright/test";
import { createDecipheriv, createECDH, generateKeyPairSync, hkdfSync, verify } from "node:crypto";
import {
  base64UrlDecode,
  base64UrlEncode,
  buildWebPushRequest,
  createVapidJwt,
  encryptWebPushPayload,
} from "@/lib/push/webPushCrypto";

// LR-8A — the encryption must match RFC 8291 byte for byte; a push service
// silently drops anything a browser cannot decrypt, so this is the only
// place a mistake would be visible before Production.

const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  authSecret: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  expected:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

/** Independent receiver-side decryption (what the browser does). */
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

function testVapidKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwkPub = publicKey.export({ format: "jwk" }) as { x: string; y: string };
  const jwkPriv = privateKey.export({ format: "jwk" }) as { d: string };
  const pub = Buffer.concat([Buffer.from([4]), base64UrlDecode(jwkPub.x), base64UrlDecode(jwkPub.y)]);
  return { publicKey: base64UrlEncode(pub), privateKey: jwkPriv.d, keyObject: publicKey };
}

test.describe("LR-8A web push crypto", () => {
  test("reproduces the RFC 8291 Appendix A ciphertext exactly", () => {
    const body = encryptWebPushPayload(
      Buffer.from(RFC.plaintext),
      base64UrlDecode(RFC.uaPublic),
      base64UrlDecode(RFC.authSecret),
      { salt: base64UrlDecode(RFC.salt), senderPrivateKey: base64UrlDecode(RFC.asPrivate) }
    );
    expect(base64UrlEncode(body)).toBe(RFC.expected);
  });

  test("round-trips with random keys and a Polish payload", () => {
    const ua = createECDH("prime256v1");
    ua.generateKeys();
    const auth = Buffer.from("0123456789abcdef");
    const text = JSON.stringify({ title: "Brak wody – Reguły", body: "Przerwa 11:00–15:00, ul. Królewska" });
    const body = encryptWebPushPayload(Buffer.from(text), ua.getPublicKey(), auth);
    expect(decrypt(body, ua.getPrivateKey(), ua.getPublicKey(), auth)).toBe(text);
    // Fresh salt and sender key each time — two encryptions never match.
    expect(encryptWebPushPayload(Buffer.from(text), ua.getPublicKey(), auth).equals(body)).toBe(false);
  });

  test("rejects malformed keys and oversized payloads", () => {
    const ua = createECDH("prime256v1");
    ua.generateKeys();
    const auth = Buffer.alloc(16, 1);
    expect(() => encryptWebPushPayload(Buffer.from("x"), Buffer.alloc(65, 0), auth)).toThrow("invalid_p256dh");
    expect(() => encryptWebPushPayload(Buffer.from("x"), ua.getPublicKey(), Buffer.alloc(8))).toThrow("invalid_auth_secret");
    expect(() => encryptWebPushPayload(Buffer.alloc(5000, 97), ua.getPublicKey(), auth)).toThrow("payload_too_large");
  });

  test("VAPID JWT is a valid ES256 signature with push-service audience", () => {
    const keys = testVapidKeys();
    const jwt = createVapidJwt("https://fcm.googleapis.com", "mailto:test@example.invalid", keys, 1_800_000_000);
    const [h, p, s] = jwt.split(".");
    expect(JSON.parse(base64UrlDecode(h).toString())).toEqual({ typ: "JWT", alg: "ES256" });
    expect(JSON.parse(base64UrlDecode(p).toString())).toEqual({
      aud: "https://fcm.googleapis.com",
      exp: 1_800_000_000 + 12 * 3600,
      sub: "mailto:test@example.invalid",
    });
    const ok = verify("sha256", Buffer.from(`${h}.${p}`), { key: keys.keyObject, dsaEncoding: "ieee-p1363" }, base64UrlDecode(s));
    expect(ok).toBe(true);
    // Signature from a different key must not verify.
    const other = testVapidKeys();
    expect(
      verify("sha256", Buffer.from(`${h}.${p}`), { key: other.keyObject, dsaEncoding: "ieee-p1363" }, base64UrlDecode(s))
    ).toBe(false);
  });

  test("push request carries aes128gcm body and vapid authorization", () => {
    const keys = testVapidKeys();
    const ua = createECDH("prime256v1");
    ua.generateKeys();
    const auth = Buffer.alloc(16, 7);
    const req = buildWebPushRequest(
      { endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: base64UrlEncode(ua.getPublicKey()), auth: base64UrlEncode(auth) },
      '{"t":1}',
      { ...keys, subject: "mailto:test@example.invalid" },
      { topic: "brak-wody-reguly" }
    );
    expect(req.url).toBe("https://fcm.googleapis.com/fcm/send/abc");
    expect(req.headers["Content-Encoding"]).toBe("aes128gcm");
    expect(req.headers.Authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
    expect(req.headers.Authorization).not.toContain(keys.privateKey);
    expect(req.headers.Topic).toBe("brak-wody-reguly");
    expect(decrypt(req.body, ua.getPrivateKey(), ua.getPublicKey(), auth)).toBe('{"t":1}');
  });
});
