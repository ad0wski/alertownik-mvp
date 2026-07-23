import { AUTOMATION_SEVERITY_LABELS_PL } from "@/lib/automationErrorClassifier";
import type { OperationalNotificationEventType } from "@/lib/operationalNotificationPolicy";
import type { OperationalNotificationStatus } from "@/lib/operationalNotificationLedger";
import type { AutomationSeverity } from "@/lib/automationAlerting";

// Sprint 166F-1 — design for how a future admin panel would display the
// persistent notification ledger. Types and pure formatters ONLY — no
// query against operational_notification_events (the table does not
// exist yet; this file imports no Supabase client at all), and no
// component renders this data yet. See design doc §Etap 7. Wiring an
// actual query and a new AutomationStatusPanel.tsx section is explicitly
// OUT of scope for this sprint — it requires the migration in
// docs/sql/PROPOSED_SPRINT_166F_OPERATIONAL_NOTIFICATION_LEDGER_V1.sql to
// be applied first.

/** The shape a future GET /api/admin/automation-status (or a dedicated
 *  route) would add once the ledger table exists — mirrors the existing
 *  RunHistorySnapshot convention (runHistoryStatus.ts): one row
 *  representing "the most recent notification event", never a raw
 *  database row shape leaked into the client. */
export interface LatestOperationalNotificationSnapshot {
  eventType: OperationalNotificationEventType;
  status: OperationalNotificationStatus;
  severity: AutomationSeverity;
  suppressedReason: string | null;
  cooldownUntil: string | null;
  attemptCount: number;
  scheduledWriterRunId: string | null;
  sourceId: string | null;
  adminActionRequired: boolean;
  safeSummary: string | null;
}

export const OPERATIONAL_NOTIFICATION_EVENT_TYPE_LABELS_PL: Record<OperationalNotificationEventType, string> = {
  run_success: "brak błędu",
  abandoned_run: "porzucone uruchomienie",
  lock_held: "poprzednie uruchomienie wciąż trwa",
  transient_fetch: "chwilowy błąd pobierania",
  permanent_fetch: "trwały błąd pobierania",
  write_error: "błąd zapisu",
  credentials_not_configured: "brak skonfigurowanych danych logowania",
  environment_guard_blocked: "zablokowane przez zabezpieczenie środowiska",
  kill_switch_disabled: "automatyzacja wyłączona",
  unexpected_error: "nieoczekiwany błąd",
};

export const OPERATIONAL_NOTIFICATION_STATUS_LABELS_PL: Record<OperationalNotificationStatus, string> = {
  claimed: "zgłoszone, oczekuje na wysyłkę",
  sent: "wysłano",
  failed: "błąd wysyłki",
  suppressed: "pominięto",
  abandoned: "porzucone",
};

export const OPERATIONAL_NOTIFICATION_SUPPRESSED_REASON_LABELS_PL: Record<string, string> = {
  suppress_retry_pending: "oczekuje na kolejną próbę w tym uruchomieniu",
  suppress_lock_held: "poprzednie uruchomienie wciąż trwa",
  suppress_duplicate: "identyczne zgłoszenie już oczekuje",
  suppress_cooldown: "w okresie wyciszenia (cooldown)",
  suppress_success: "brak błędu — nic do zgłoszenia",
  suppress_not_actionable: "automatyzacja świadomie wyłączona",
};

/** Formats a snapshot for display — every field passed through a closed
 *  label map, never a raw enum value or a raw suppressedReason string
 *  rendered directly. Falls back to the neutral "brak danych" label
 *  (mirrors formatOperationalHealthRow's own OPERATIONAL_HEALTH_NO_DATA_LABEL
 *  convention) rather than guessing at an unrecognized value. */
export const OPERATIONAL_NOTIFICATION_NO_DATA_LABEL = "brak danych";

export interface FormattedOperationalNotificationRow {
  eventType: string;
  status: string;
  severity: string;
  suppressedReason: string;
  cooldownUntil: string;
  attemptCount: string;
  adminActionRequired: string;
  safeSummary: string;
}

export function formatLatestOperationalNotification(
  snapshot: LatestOperationalNotificationSnapshot | null
): FormattedOperationalNotificationRow {
  if (!snapshot) {
    return {
      eventType: OPERATIONAL_NOTIFICATION_NO_DATA_LABEL,
      status: OPERATIONAL_NOTIFICATION_NO_DATA_LABEL,
      severity: OPERATIONAL_NOTIFICATION_NO_DATA_LABEL,
      suppressedReason: OPERATIONAL_NOTIFICATION_NO_DATA_LABEL,
      cooldownUntil: OPERATIONAL_NOTIFICATION_NO_DATA_LABEL,
      attemptCount: OPERATIONAL_NOTIFICATION_NO_DATA_LABEL,
      adminActionRequired: OPERATIONAL_NOTIFICATION_NO_DATA_LABEL,
      safeSummary: OPERATIONAL_NOTIFICATION_NO_DATA_LABEL,
    };
  }
  return {
    eventType: OPERATIONAL_NOTIFICATION_EVENT_TYPE_LABELS_PL[snapshot.eventType],
    status: OPERATIONAL_NOTIFICATION_STATUS_LABELS_PL[snapshot.status],
    severity: AUTOMATION_SEVERITY_LABELS_PL[snapshot.severity],
    suppressedReason: snapshot.suppressedReason
      ? (OPERATIONAL_NOTIFICATION_SUPPRESSED_REASON_LABELS_PL[snapshot.suppressedReason] ??
        OPERATIONAL_NOTIFICATION_NO_DATA_LABEL)
      : "nie dotyczy",
    cooldownUntil: snapshot.cooldownUntil ?? "brak aktywnego wyciszenia",
    attemptCount: String(snapshot.attemptCount),
    adminActionRequired: snapshot.adminActionRequired ? "tak" : "nie",
    safeSummary: snapshot.safeSummary ?? "brak podsumowania",
  };
}
