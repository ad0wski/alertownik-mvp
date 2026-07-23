import type { AutomationStatusSnapshot } from "@/lib/automationStatus";
import type {
  AutomationSeverity,
  AutomationErrorCategory,
  AutomationHealthEvent,
  RetryState,
} from "@/lib/automationAlerting";
import {
  AUTOMATION_ERROR_CATEGORY_LABELS_PL as CATEGORY_LABELS_PL,
  AUTOMATION_SEVERITY_LABELS_PL as SEVERITY_LABELS_PL,
} from "@/lib/automationErrorClassifier";

// Sprint 166D-1 — simplified operational status formatter. Pure function,
// combines only data already available elsewhere in the admin UI today
// (AutomationStatusSnapshot from automationStatus.ts, plus an optional
// per-source AutomationHealthEvent the caller may already know) — no new
// Supabase query, no new fetch. See
// docs/SPRINT_166D_OPERATIONAL_MONITORING_ALERTING_AUDIT_AND_DESIGN_V1.md
// §C.3. Sprint 166D-2B superseded this module's live wiring: the real
// per-run history now comes from src/lib/runHistoryStatus.ts (a genuine,
// environment_tag-filtered read of scheduled_writer_runs), rendered
// directly in AutomationStatusPanel.tsx as one aggregate block, not a
// per-source list (this table has no per-source breakdown). The
// per-source model below is kept — still correct, still tested — as a
// reusable formatter for a future per-source event source, but its
// former standalone component (OperationalHealthPanel.tsx) was deleted
// as dead code once its functionality was consciously superseded.
//
// HONEST LIMITATION: nothing in this codebase today feeds a per-source
// AutomationHealthEvent into this function from a live route — the write
// route's per-invocation results are never persisted per-source (only
// aggregate counts land in scheduled_writer_runs). Until a future sprint
// wires that read, `sourceEvents` will always be called with `event: null`
// for every source, and this function honestly reports "nieznany" rather
// than fabricating a status.

const SEVERITY_RANK: Record<AutomationSeverity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

function maxSeverity(a: AutomationSeverity, b: AutomationSeverity): AutomationSeverity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

export interface OperationalHealthSourceInput {
  sourceKey: string;
  sourceName: string;
  /** null when no live event is known yet (see module header) — the
   *  formatter never guesses a category/severity in that case. */
  event: AutomationHealthEvent | null;
}

export interface OperationalHealthSourceRow {
  sourceKey: string;
  sourceName: string;
  known: boolean;
  severity: AutomationSeverity;
  category: AutomationErrorCategory | null;
  adminActionRequired: boolean;
  /** null when `known` is false — no live event, so no retry state either. */
  retry: RetryState | null;
}

export interface OperationalHealthSummary {
  automationActive: boolean;
  overallSeverity: AutomationSeverity;
  sources: OperationalHealthSourceRow[];
}

export function buildOperationalHealthSummary(input: {
  automationStatus: AutomationStatusSnapshot;
  sourceEvents: OperationalHealthSourceInput[];
}): OperationalHealthSummary {
  const automationActive = input.automationStatus.writeAttemptsPossible;

  const sources: OperationalHealthSourceRow[] = input.sourceEvents.map((s) => {
    if (!s.event) {
      return {
        sourceKey: s.sourceKey,
        sourceName: s.sourceName,
        known: false,
        severity: "info",
        category: null,
        adminActionRequired: false,
        retry: null,
      };
    }
    return {
      sourceKey: s.sourceKey,
      sourceName: s.sourceName,
      known: true,
      severity: s.event.severity,
      category: s.event.category,
      adminActionRequired: s.event.adminAction.required,
      retry: s.event.retry,
    };
  });

  // Kill-switch-off is an expected, "info" state regardless of per-source
  // events — mirrors classifyAutomationEvent's own severityForCategory
  // treatment of "kill_switch_disabled".
  const overallSeverity = automationActive
    ? sources.reduce<AutomationSeverity>((acc, row) => maxSeverity(acc, row.severity), "info")
    : "info";

  return { automationActive, overallSeverity, sources };
}

// ── Copy (pinned by tests, same anti-drift convention as sourceHealth.ts) ───

export const OPERATIONAL_HEALTH_TITLE = "Stan operacyjny automatyzacji";

export const OPERATIONAL_HEALTH_UNKNOWN_SOURCE_NOTE =
  "Stan tego źródła jest nieznany — ten panel jeszcze nie odczytuje historii " +
  "uruchomień (scheduled_writer_runs) w czasie rzeczywistym; to świadomie " +
  "odłożone rozszerzenie, nie ukryty błąd.";

export const OPERATIONAL_HEALTH_INFO_ONLY_NOTE =
  "Ten panel jest wyłącznie informacyjny — nie wysyła żadnych powiadomień " +
  "e-mail (funkcja alertowania jest fundamentem, jeszcze nieaktywnym) i nie " +
  "ma tu przycisku uruchamiającego cokolwiek.";

// ── Sprint 166D-2A — neutral "no data" copy for fields this panel cannot
// honestly derive from data already loaded (last run outcome, retry state,
// error category/severity of any past run) without a new query against
// scheduled_writer_runs — deliberately not added this session. Pinned by
// tests so a future wiring session cannot silently start fabricating a
// value where "brak danych" is the only honest answer today. ──

export const OPERATIONAL_HEALTH_NO_DATA_LABEL = "brak danych";

export const OPERATIONAL_HEALTH_NO_RUN_HISTORY_NOTE =
  "Historia przebiegów (scheduled_writer_runs) nie jest jeszcze odczytywana " +
  "przez ten panel — wynik, czas i kategoria ostatniego przebiegu są " +
  "świadomie pokazane jako brak danych, nie zgadywane.";

export const OPERATIONAL_HEALTH_NOTIFICATIONS_DISABLED_NOTE =
  "Powiadomienia e-mail: wyłączone — fundament alertowania jest jeszcze " +
  "nieaktywny, nic nie jest ani nie było wysyłane.";

export const OPERATIONAL_HEALTH_EMAIL_NOT_CONFIGURED_NOTE =
  "Dostawca e-mail: nieskonfigurowany.";

// ── Row display formatting (Sprint 166D-2A) — pure functions, so the
// admin-facing text for every scenario (good run, transient-with-retry,
// permanent-needing-action, unknown) is unit-testable without a component
// rendering harness (this project has none — see
// tests/e2e/automationStatus.spec.ts's own structural-source-text
// convention). No longer called by AutomationStatusPanel.tsx as of Sprint
// 166D-2B (see module header) — kept as a tested, reusable formatter for
// a future per-source event source. ──

export interface OperationalHealthRowDisplay {
  sourceName: string;
  lastRunOutcome: string;
  /** Always OPERATIONAL_HEALTH_NO_DATA_LABEL today — no code path anywhere
   *  in this codebase yet supplies a real run timestamp to this row (see
   *  module header); kept as its own field so a future wiring session only
   *  needs to change this function, never any caller. */
  lastRunTime: string;
  retryState: string;
  errorCategorySeverity: string;
  adminActionRequired: string;
}

export function formatOperationalHealthRow(row: OperationalHealthSourceRow): OperationalHealthRowDisplay {
  const lastRunOutcome = row.known && row.category ? CATEGORY_LABELS_PL[row.category] : OPERATIONAL_HEALTH_NO_DATA_LABEL;

  const retryState = row.retry
    ? `próba ${row.retry.attemptsMade} z ${row.retry.maxAttemptsPerRun}, kolejna w tym uruchomieniu: ${row.retry.willRetryWithinRun ? "tak" : "nie"}`
    : OPERATIONAL_HEALTH_NO_DATA_LABEL;

  const errorCategorySeverity =
    row.known && row.category
      ? `${CATEGORY_LABELS_PL[row.category]} / ${SEVERITY_LABELS_PL[row.severity]}`
      : OPERATIONAL_HEALTH_NO_DATA_LABEL;

  const adminActionRequired = row.known ? (row.adminActionRequired ? "tak" : "nie") : OPERATIONAL_HEALTH_NO_DATA_LABEL;

  return {
    sourceName: row.sourceName,
    lastRunOutcome,
    lastRunTime: OPERATIONAL_HEALTH_NO_DATA_LABEL,
    retryState,
    errorCategorySeverity,
    adminActionRequired,
  };
}
