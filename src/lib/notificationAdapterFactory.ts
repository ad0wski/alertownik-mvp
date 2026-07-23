import { Resend } from "resend";
import { createNoopNotificationAdapter, createMisconfiguredNotificationAdapter, type NotificationAdapter } from "@/lib/notificationAdapter";
import { isEmailAlertsEnabled } from "@/lib/emailAlertConfig";
import { getResendCredentialsFromEnv, createResendNotificationAdapter } from "@/lib/resendNotificationAdapter";

// Sprint 166E-1 — the single, centralized place that decides which
// NotificationAdapter implementation to use, based only on server-side
// config. NOT wired into GET /api/cron/write-candidates, the scheduled
// writer, or any other live route this sprint (see Etap 7) — the only
// callers today are this sprint's own tests. Calling this function never
// sends anything by itself; only a caller that later calls the returned
// adapter's .send() could ever perform I/O, and nothing in this sprint
// does that outside tests (which always inject a fake client — see
// resendNotificationAdapter.spec.ts).
//
// The real `Resend` client is constructed HERE ONLY, and only in the one
// branch where config is fully complete — never at module load, never
// speculatively. Importing this module (or any module that imports it)
// never constructs a Resend client and never reads the API key value
// unless this function is actually called.

export type NotificationAdapterKind = "noop" | "misconfigured" | "resend";

/** Pure decision logic, separated from adapter construction so tests can
 *  verify which branch a given env configuration selects WITHOUT
 *  constructing a real `Resend` client or ever calling .send() — even
 *  constructing the client with a fake test key is harmless on its own,
 *  but this separation means a test never needs to go anywhere near that
 *  path at all. Mirrors the existing project convention of separating a
 *  decision (e.g. checkDatabaseEnvironmentGuard) from the I/O a caller
 *  might perform afterward. */
export function decideNotificationAdapterKind(): NotificationAdapterKind {
  if (!isEmailAlertsEnabled(process.env.OPERATIONAL_EMAIL_ALERTS_ENABLED)) {
    return "noop";
  }
  return getResendCredentialsFromEnv() ? "resend" : "misconfigured";
}

export function createConfiguredNotificationAdapter(): NotificationAdapter {
  const kind = decideNotificationAdapterKind();

  if (kind === "noop") {
    return createNoopNotificationAdapter();
  }
  if (kind === "misconfigured") {
    return createMisconfiguredNotificationAdapter();
  }

  // kind === "resend" — decideNotificationAdapterKind() already confirmed
  // credentials are present; re-reading here (rather than threading the
  // value through) keeps this function's own contract simple and matches
  // getResendCredentialsFromEnv()'s existing "read env directly" pattern.
  const credentials = getResendCredentialsFromEnv();
  /* c8 ignore next 3 -- unreachable: kind === "resend" only when credentials resolved above */
  if (!credentials) {
    return createMisconfiguredNotificationAdapter();
  }

  const client = new Resend(credentials.apiKey);
  return createResendNotificationAdapter(client, { from: credentials.from, to: credentials.to });
}
