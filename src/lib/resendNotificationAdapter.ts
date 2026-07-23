import type { NotificationAdapter, AlertNotificationInput, NotificationSendResult } from "@/lib/notificationAdapter";

// Sprint 166E-1 — server-only Resend-backed NotificationAdapter.
//
// SERVER-ONLY: this file must never be imported from a "use client"
// component. It never reads a secret except via getResendCredentialsFromEnv
// (below), which is only ever called by the adapter factory
// (notificationAdapterFactory.ts), itself never imported by any client
// component. No message is ever sent during module import or adapter
// construction — send() is the only method that performs I/O, and nothing
// in this sprint calls it outside of tests (see Etap 7 — the factory is not
// wired into any live route yet).
//
// Testability without real network: create*() takes an already-constructed
// `client` matching ResendLikeClient — the minimal shape this file actually
// calls. Tests inject a fake object satisfying this shape; the real
// `Resend` class from the "resend" package (constructed only in
// notificationAdapterFactory.ts, with a real API key) happens to satisfy it
// structurally, so no adapter code needs to change between a real and a
// fake client.

export interface ResendLikeSendResult {
  data: { id: string } | null;
  error: { message: string; statusCode: number | null; name: string } | null;
}

export interface ResendLikeClient {
  emails: {
    send(payload: { from: string; to: string; subject: string; text: string }): Promise<ResendLikeSendResult>;
  };
}

export interface ResendCredentials {
  apiKey: string;
  from: string;
  to: string;
}

/** Mirrors getScheduledWriterCredentials()'s exact shape/convention
 *  (scheduledWriter.ts): read env, return null unless every required value
 *  is present. Never logs, never returns a partial object. */
export function getResendCredentialsFromEnv(): ResendCredentials | null {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.OPERATIONAL_ALERT_EMAIL_FROM;
  const to = process.env.OPERATIONAL_ALERT_EMAIL_TO;
  if (!apiKey || !from || !to) return null;
  return { apiKey, from, to };
}

/** Closed, safe-to-log vocabulary a provider error is classified into.
 *  Never includes the provider's own message text — only its `name` (a
 *  fixed enum Resend itself documents) and `statusCode` (a number) ever
 *  feed this function; both are already non-secret, structural facts about
 *  the failure, never free-text. */
export type ResendErrorCategory =
  | "validation_error"
  | "auth_error"
  | "rate_limited"
  | "transient_error"
  | "unknown_error";

const VALIDATION_ERROR_NAMES = new Set([
  "validation_error",
  "missing_required_field",
  "invalid_parameter",
  "invalid_attachment",
  "invalid_from_address",
  "invalid_region",
  "invalid_idempotency_key",
  "invalid_idempotent_request",
]);

const AUTH_ERROR_NAMES = new Set([
  "missing_api_key",
  "invalid_api_key",
  "restricted_api_key",
  "invalid_access",
  "security_error",
]);

const RATE_LIMIT_NAMES = new Set(["rate_limit_exceeded", "monthly_quota_exceeded", "daily_quota_exceeded"]);

const TRANSIENT_ERROR_NAMES = new Set(["internal_server_error", "application_error", "concurrent_idempotent_requests"]);

/** Pure, testable classifier — never touches `error.message`, only the
 *  structural `name`/`statusCode` fields Resend's own SDK types declare.
 *  Exported so tests can exercise every category directly, independent of
 *  the adapter's send() plumbing. */
export function classifyResendError(name: string | undefined, statusCode: number | null | undefined): ResendErrorCategory {
  if (name && VALIDATION_ERROR_NAMES.has(name)) return "validation_error";
  if (name && AUTH_ERROR_NAMES.has(name)) return "auth_error";
  if (name && RATE_LIMIT_NAMES.has(name)) return "rate_limited";
  if (name && TRANSIENT_ERROR_NAMES.has(name)) return "transient_error";
  if (typeof statusCode === "number" && statusCode >= 500) return "transient_error";
  if (typeof statusCode === "number" && statusCode === 401) return "auth_error";
  if (typeof statusCode === "number" && statusCode === 429) return "rate_limited";
  if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) return "validation_error";
  return "unknown_error";
}

/** How long this adapter waits for the provider before giving up. The
 *  Resend SDK does not expose a native timeout/AbortSignal option on
 *  emails.send() (confirmed by reading its own published type
 *  definitions) — rather than patch the SDK or its underlying fetch (a
 *  risky, unsupported workaround), this wraps the call in a plain
 *  Promise.race. This bounds how long the caller waits; it does not abort
 *  the underlying HTTP request itself. */
export const RESEND_SEND_TIMEOUT_MS = 10_000;

class ResendSendTimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ResendSendTimeoutError("resend_send_timeout")), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/** Creates the real send-capable adapter. `client` is injected (never
 *  constructed here) so tests never touch the real "resend" package or any
 *  real network — see notificationAdapterFactory.ts for the only call site
 *  that ever passes a real `Resend` instance. Never logs `credentials`,
 *  the provider's raw error object, or the notification's own subject/body
 *  content — only the closed-vocabulary classification result. Never
 *  retries automatically (a single attempt, honestly reported as
 *  send_failed on any failure) — bounded, no loop. */
export function createResendNotificationAdapter(
  client: ResendLikeClient,
  credentials: Pick<ResendCredentials, "from" | "to">,
  timeoutMs: number = RESEND_SEND_TIMEOUT_MS
): NotificationAdapter {
  return {
    async send(notification: AlertNotificationInput): Promise<NotificationSendResult> {
      try {
        const result = await withTimeout(
          client.emails.send({
            from: credentials.from,
            to: credentials.to,
            subject: notification.subject,
            text: notification.textBody,
          }),
          timeoutMs
        );
        if (result.error) {
          // Classified for potential future telemetry — never returned or
          // logged raw; the caller only ever sees the safe, closed status.
          classifyResendError(result.error.name, result.error.statusCode);
          return { ok: false, status: "send_failed" };
        }
        return { ok: true, status: "sent" };
      } catch {
        // Covers the timeout above and any network-level throw — same
        // "never leak detail" convention already used throughout this
        // codebase's other catch blocks (e.g. write-candidates/route.ts).
        return { ok: false, status: "send_failed" };
      }
    },
  };
}
