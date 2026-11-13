import type { VapidKeys } from "@/lib/push/webPushRequest";

const B64URL = /^[A-Za-z0-9_-]+$/;
const decode = (value: string) => {
  if (!B64URL.test(value)) throw new Error("not_base64url");
  return Buffer.from(value, "base64url");
};

// LR-8A — server-side push configuration. SERVER-ONLY (reads the VAPID
// private key). Two independent switches, both default OFF:
//
//   PUSH_NOTIFICATIONS_ENABLED=true              server kill switch: subscribe
//                                                + send. Flip to anything else
//                                                and redeploy = instant stop.
//   NEXT_PUBLIC_PUSH_NOTIFICATIONS_ENABLED=true  shows the opt-in UI.
//
// Keys: NEXT_PUBLIC_VAPID_PUBLIC_KEY (client-safe), VAPID_PRIVATE_KEY
// (secret, never NEXT_PUBLIC_), VAPID_SUBJECT (mailto: or https: contact
// the push services may use; required by RFC 8292).

export type PushServerConfig =
  | { enabled: true; vapid: VapidKeys & { subject: string } }
  | { enabled: false; reason: "disabled" | "missing_keys" | "invalid_keys" | "invalid_subject" };

export function getPushServerConfig(env: Record<string, string | undefined> = process.env): PushServerConfig {
  if (env.PUSH_NOTIFICATIONS_ENABLED !== "true") return { enabled: false, reason: "disabled" };
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  const subject = env.VAPID_SUBJECT;
  if (!publicKey || !privateKey) return { enabled: false, reason: "missing_keys" };
  try {
    const pub = decode(publicKey);
    const priv = decode(privateKey);
    if (pub.length !== 65 || pub[0] !== 0x04 || priv.length !== 32) return { enabled: false, reason: "invalid_keys" };
  } catch {
    return { enabled: false, reason: "invalid_keys" };
  }
  if (!subject || !/^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/.test(subject)) {
    return { enabled: false, reason: "invalid_subject" };
  }
  return { enabled: true, vapid: { publicKey, privateKey, subject } };
}
