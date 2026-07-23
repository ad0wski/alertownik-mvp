import type { AutomationErrorCategory, AutomationSeverity, RetryState, AdminActionRequired } from "@/lib/automationAlerting";

// Sprint 166D-1 — email alert content, drafted for future review. This
// module never sends anything and is never called by any live route —
// see notificationAdapter.ts for the (no-op) send path. Only non-secret,
// already-admin-visible fields are used (source name, category, severity,
// retry state, admin-action reason) — no URL, token, or credential is
// ever referenced here.

const CATEGORY_LABELS: Record<AutomationErrorCategory, string> = {
  transient_fetch: "chwilowy błąd pobierania",
  permanent_fetch: "trwały błąd pobierania",
  write_error: "błąd zapisu",
  lock_held: "poprzednie uruchomienie wciąż trwa",
  environment_guard_blocked: "zablokowane przez zabezpieczenie środowiska",
  credentials_not_configured: "brak skonfigurowanych danych logowania",
  kill_switch_disabled: "automatyzacja wyłączona",
  unexpected_error: "nieoczekiwany błąd",
  none: "brak błędu",
};

const SEVERITY_LABELS: Record<AutomationSeverity, string> = {
  info: "informacja",
  warning: "ostrzeżenie",
  critical: "krytyczne",
};

const ADMIN_ACTION_REASON_LABELS: Record<NonNullable<AdminActionRequired["reason"]>, string> = {
  permanent_failure: "trwały błąd wymaga przeglądu źródła",
  stuck_lock: "blokada uruchomienia utrzymuje się zbyt długo",
  consecutive_failures: "kilka kolejnych nieudanych uruchomień pod rząd",
  credentials_missing: "brak skonfigurowanych danych konta automatyzacji",
};

export interface AlertEmailContentInput {
  sourceName: string;
  category: AutomationErrorCategory;
  severity: AutomationSeverity;
  retry: RetryState;
  adminAction: AdminActionRequired;
  environmentTag: string;
}

export interface AlertEmailContent {
  subject: string;
  textBody: string;
}

export function buildAlertEmailContent(input: AlertEmailContentInput): AlertEmailContent {
  const categoryLabel = CATEGORY_LABELS[input.category];
  const severityLabel = SEVERITY_LABELS[input.severity];

  const subject = `Alertownik — automatyzacja (${input.environmentTag}): ${categoryLabel} — ${input.sourceName}`;

  const retryLine = input.retry.willRetryWithinRun
    ? `Kolejna próba w tym samym uruchomieniu: tak (próba ${input.retry.attemptsMade + 1} z ${input.retry.maxAttemptsPerRun}).`
    : `Kolejna próba w tym samym uruchomieniu: nie (wykorzystano ${input.retry.attemptsMade} z ${input.retry.maxAttemptsPerRun}).`;

  const nextRunLine = "Brak harmonogramu cron — kolejne uruchomienie nastąpi dopiero po ręcznym wywołaniu.";

  const adminActionLine = input.adminAction.required
    ? `Wymagana akcja administratora: tak — ${ADMIN_ACTION_REASON_LABELS[input.adminAction.reason as NonNullable<AdminActionRequired["reason"]>]}.`
    : "Wymagana akcja administratora: nie.";

  const textBody = [
    `Środowisko: ${input.environmentTag}`,
    `Źródło: ${input.sourceName}`,
    `Kategoria: ${categoryLabel}`,
    `Poziom ważności: ${severityLabel}`,
    retryLine,
    nextRunLine,
    adminActionLine,
    "",
    "Ta wiadomość jest wyłącznie szablonem przygotowanym w ramach Sprintu 166D-1 — żaden dostawca poczty nie jest podłączony i wiadomość nigdy nie została wysłana.",
  ].join("\n");

  return { subject, textBody };
}

// ── Sprint 166E-2A — controlled Preview operational-email test content ──────
//
// A separate, deliberately stable template — buildAlertEmailContent above
// is shaped for automation-failure alerts (category/severity/retry/
// admin-action) and would be the wrong shape for a plain manual test
// message. This one takes only a server-generated timestamp; no source
// name, category, severity, or any other variable field — so its content
// can never accidentally carry a real error detail.

export const OPERATIONAL_EMAIL_TEST_SUBJECT = "[PREVIEW TEST] Alertownik — test alertowania operacyjnego";

export function buildOperationalEmailTestContent(generatedAtIso: string): AlertEmailContent {
  const textBody = [
    "To jest ręczny, kontrolowany test mechanizmu alertowania operacyjnego.",
    "Wiadomość pochodzi ze środowiska Preview.",
    "Nie oznacza to prawdziwej awarii ani problemu w Production.",
    `Wygenerowano po stronie serwera: ${generatedAtIso}`,
    "",
    "Ta wiadomość nie zawiera żadnych danych źródeł, kandydatów ani szczegółów błędów.",
  ].join("\n");

  return { subject: OPERATIONAL_EMAIL_TEST_SUBJECT, textBody };
}
