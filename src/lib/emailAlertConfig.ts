// Sprint 166E-1 — Preview Email Alerting Provider Foundation.
//
// Server-only configuration surface for the (still fully disabled)
// operational email alerting feature. Mirrors the exact existing
// convention already used throughout this codebase (isWriteModeEnabled /
// isScheduledChecksEnabled in cronCheckSources.ts / scheduledWriter.ts,
// getScheduledWriterCredentials's "read env, null if incomplete" shape):
//
//   - A boolean-flag reader (isEmailAlertsEnabled) — string-in, boolean-out,
//     no I/O, fully unit-testable without touching real env vars.
//   - A credentials reader (getResendCredentialsFromEnv, in
//     resendNotificationAdapter.ts, not this file) that reads the actual
//     secret value — kept in the adapter module itself, never exported
//     from here, so this status-builder module can never accidentally leak
//     a secret even by an incorrect future import.
//
// This module's own exports are all safe-by-construction: every field is a
// boolean or a closed-set string literal, exactly like automationStatus.ts's
// own "nothing here could become a secret" guarantee — no field here could
// ever carry an API key, an email address, or any other credential.

export const EMAIL_ALERT_PROVIDER_NONE = "none" as const;
export const EMAIL_ALERT_PROVIDER_RESEND = "resend" as const;

export type EmailAlertProvider = typeof EMAIL_ALERT_PROVIDER_NONE | typeof EMAIL_ALERT_PROVIDER_RESEND;

/** Same convention as isWriteModeEnabled/isScheduledChecksEnabled: exact
 *  string match against "true", nothing else — never a truthy-string
 *  coercion that could be tripped by "false", "0", or whitespace. */
export function isEmailAlertsEnabled(flagValue: string | undefined): boolean {
  return flagValue === "true";
}

export interface EmailAlertConfigStatusInput {
  enabled: boolean;
  /** Presence only — never the key value itself. */
  apiKeyConfigured: boolean;
  /** Presence only — never the address itself. */
  fromConfigured: boolean;
  /** Presence only — never the address itself. */
  toConfigured: boolean;
}

export interface EmailAlertConfigStatus {
  enabled: boolean;
  provider: EmailAlertProvider;
  /** True only when every required piece of server-side config is present.
   *  Never implies a message was ever sent — see runtime NotificationStatus
   *  for that (still always "disabled" or "no_adapter_configured" this
   *  sprint, since nothing calls the real adapter yet). */
  configComplete: boolean;
}

/** Pure builder — the only caller (GET /api/admin/automation-status) reads
 *  process.env presence booleans and passes them in here, matching the
 *  exact same split already used by buildAutomationStatus(): env access
 *  stays in the route, every pure function downstream only ever sees
 *  booleans. */
export function buildEmailAlertConfigStatus(input: EmailAlertConfigStatusInput): EmailAlertConfigStatus {
  const configComplete = input.apiKeyConfigured && input.fromConfigured && input.toConfigured;
  return {
    enabled: input.enabled,
    provider: input.enabled ? EMAIL_ALERT_PROVIDER_RESEND : EMAIL_ALERT_PROVIDER_NONE,
    configComplete,
  };
}

// ── Copy (pinned by tests, same anti-drift convention as automationStatus.ts) ──

export const EMAIL_ALERT_STATUS_TITLE = "Alerty e-mail (fundament)";

export const EMAIL_ALERT_INFO_ONLY_NOTE =
  "Ten panel jest wyłącznie informacyjny — nie ma tu przycisku wysyłającego " +
  "test ani żadną wiadomość. Wysyłka jest sterowana wyłącznie zmienną " +
  "środowiskową OPERATIONAL_EMAIL_ALERTS_ENABLED po stronie serwera.";

/** Shown when alerty e-mail są wyłączone (enabled === false) — the
 *  structurally-safe default state; matches 166D-1's original claim,
 *  narrowed to only the case it's still true for. */
export const EMAIL_ALERT_DISABLED_NOTE =
  "Alerty e-mail: wyłączone — nic nie jest ani nie było wysyłane.";

/** Shown when enabled === true but configComplete === false — honestly
 *  distinct from "disabled": an admin turned this on, but the required
 *  server-side configuration is incomplete, so sending still cannot
 *  happen. Never implies a message could be sent right now. */
export const EMAIL_ALERT_MISCONFIGURED_NOTE =
  "Alerty e-mail: włączone, ale konfiguracja jest niekompletna — nic nie " +
  "zostanie wysłane, dopóki brakująca konfiguracja serwera nie zostanie uzupełniona.";

/** Shown when enabled === true and configComplete === true. Still true
 *  this sprint: no live route calls the configured adapter's send() yet
 *  (see Etap 7) — the foundation exists, but nothing is wired to trigger
 *  it, so nothing is sent automatically regardless of this state. */
export const EMAIL_ALERT_READY_NOT_WIRED_NOTE =
  "Alerty e-mail: włączone i skonfigurowane, ale żaden przepływ jeszcze " +
  "ich nie wywołuje — nic nie jest wysyłane automatycznie w tym sprincie.";
