// Sprint 166N-B — the single, dedicated flag gating
// POST /api/admin/operational-notification-ledger-test. Deliberately
// separate from OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED
// (operationalNotificationRuntimeConfig.ts) — enabling the real writer's
// runtime ledger orchestration must never accidentally enable this
// diagnostic route, and vice versa. Not set in any Vercel environment by
// this sprint — default is false everywhere. See
// docs/SPRINT_166M_PRODUCTION_NOTIFICATION_CANARY_DESIGN_V1.md §4/5 point 4.

/** Same convention as every other flag reader in this codebase: exact
 *  string match against "true", nothing else — absent, empty, or any
 *  other value is always false. */
export function isOperationalNotificationLedgerTestEnabled(flagValue: string | undefined): boolean {
  return flagValue === "true";
}
