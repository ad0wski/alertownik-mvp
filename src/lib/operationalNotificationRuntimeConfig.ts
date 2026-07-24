// Sprint 166G-1 — the single flag controlling whether the runtime
// scheduled writer ever attempts operational notification ledger
// orchestration at all (claim/finish/adapter). Deliberately separate from
// OPERATIONAL_EMAIL_ALERTS_ENABLED (emailAlertConfig.ts), which only
// decides whether the adapter would actually send an email — see
// docs/SPRINT_166G_RUNTIME_LEDGER_INTEGRATION_AUDIT_AND_DESIGN_V1.md §C
// for the full rationale. Never NEXT_PUBLIC_*, never read anywhere except
// server-side route code. Not set in any Vercel environment by this
// sprint — default is false everywhere.

/** Same convention as isWriteModeEnabled/isScheduledChecksEnabled/
 *  isEmailAlertsEnabled: exact string match against "true", nothing else —
 *  absent, empty, or any other value is always false. */
export function isOperationalNotificationRuntimeEnabled(flagValue: string | undefined): boolean {
  return flagValue === "true";
}
