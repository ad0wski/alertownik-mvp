import { getSafeCheckSource } from "@/lib/sourceCheck";
import { notConfiguredRunHistorySnapshot, type RunHistorySnapshot } from "@/lib/runHistoryStatus";
import { buildEmailAlertConfigStatus, type EmailAlertConfigStatus, type EmailAlertConfigStatusInput } from "@/lib/emailAlertConfig";

// Sprint 164B — Safe Auto-Candidate Canary Foundation.
//
// Pure, testable status-snapshot builder for the admin-only automation
// status panel (src/components/AutomationStatusPanel.tsx, rendered via
// GET /api/admin/automation-status). Takes already-resolved booleans/
// counts as input — never reads process.env itself — so tests exercise
// every combination without touching real environment variables, and so
// the route (the only caller that may read process.env) stays the single
// place secret PRESENCE is checked.
//
// Deliberately narrow: every field here is either a boolean, a count, or
// a public source name/id already visible elsewhere in the admin UI
// (the same allowlist getSafeCheckSource already exposes). Nothing here
// is, or could become, a secret value — there is no field this module
// could add that would leak a token, password, or URL credential, because
// no such value is ever passed in as an input in the first place.

export interface AutomationStatusInput {
  checksEnabled: boolean;
  writesEnabled: boolean;
  cronSecretConfigured: boolean;
  writerCredentialsConfigured: boolean;
  /** Source ids from getAllowedWriteSourceIds() — already narrowed to the
   *  safe-check allowlist by that function; never caller-widened. */
  allowedWriteSourceIds: readonly string[];
  maxCandidatesPerRun: number;
  fingerprintProtectionEnabled: boolean;
  /** Sprint 166D-2B — optional so every existing call site (and test)
   *  keeps compiling unchanged; omitting it yields the honest
   *  "not configured" snapshot, never a guess. The route is the only
   *  caller that ever supplies a real value, built from an already
   *  environment-tag-filtered scheduled_writer_runs read. */
  runHistory?: RunHistorySnapshot;
  /** Sprint 166E-1 — same optionality convention as runHistory above:
   *  omitting it yields the honest "disabled, unconfigured" snapshot. The
   *  route builds this from process.env presence booleans only — never
   *  the secret values themselves. */
  emailAlertConfig?: EmailAlertConfigStatusInput;
  /** Sprint 166N-A — same optionality convention as runHistory/emailAlertConfig
   *  above: omitting it yields the honest "disabled" default. Reflects
   *  OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED (operationalNotificationRuntimeConfig.ts)
   *  — the single flag gating whether the writer ever attempts ledger
   *  claim/finish orchestration at all. Deliberately separate from
   *  emailAlertConfig.enabled (OPERATIONAL_EMAIL_ALERTS_ENABLED): a run can
   *  claim/finish a ledger event with this true while email stays fully
   *  noop, exactly as Sprint 166G-1 designed it. */
  operationalNotificationRuntimeEnabled?: boolean;
  /** Sprint 180C — same optionality convention as every other block above:
   *  omitting it yields the honest "disabled, default allowlist" snapshot.
   *  Reflects the trusted-source auto-publish exception (CLAUDE.md Security
   *  Rule #10 amendment) — a SEPARATE mechanism from writesEnabled/
   *  candidate creation above: this one CAN create a published `alerts`
   *  row, but only for an allowlisted source and only when every fail-closed
   *  condition in trustedSourceAutoPublish.ts holds. */
  autoPublish?: AutoPublishStatusInput;
}

export interface AutoPublishStatusInput {
  enabled: boolean;
  /** From getAutoPublishSourceIds() — already narrowed to the safe-check
   *  allowlist, same guarantee as allowedWriteSourceIds above. */
  allowlistedSourceIds: readonly string[];
  maxPerRun: number;
}

export interface AutoPublishStatusSnapshot {
  enabled: boolean;
  allowlistedSources: CanarySourceInfo[];
  /** True only when exactly one source is allowlisted — mirrors
   *  isSingleSourceCanary's own meaning for this separate mechanism. */
  isSingleSourceAllowlist: boolean;
  maxPerRun: number;
}

export interface CanarySourceInfo {
  id: string;
  name: string;
}

export interface AutomationStatusSnapshot {
  checksEnabled: boolean;
  writesEnabled: boolean;
  /** Both gates must be true for a write to ever be attempted — surfaced
   *  as one combined flag so the panel doesn't need to duplicate the AND
   *  logic every route already applies independently. */
  writeAttemptsPossible: boolean;
  cronSecretConfigured: boolean;
  writerCredentialsConfigured: boolean;
  canarySources: CanarySourceInfo[];
  /** True only when exactly one source is allowlisted for writing — the
   *  literal meaning of "canary": a single, deliberately narrow source. */
  isSingleSourceCanary: boolean;
  maxCandidatesPerRun: number;
  fingerprintProtectionEnabled: boolean;
  runHistory: RunHistorySnapshot;
  emailAlertConfig: EmailAlertConfigStatus;
  operationalNotificationRuntimeEnabled: boolean;
  autoPublish: AutoPublishStatusSnapshot;
}

export function buildAutomationStatus(input: AutomationStatusInput): AutomationStatusSnapshot {
  const canarySources: CanarySourceInfo[] = input.allowedWriteSourceIds.map((id) => {
    const source = getSafeCheckSource(id);
    return { id, name: source?.name ?? id };
  });

  const autoPublishInput = input.autoPublish ?? { enabled: false, allowlistedSourceIds: [], maxPerRun: 0 };
  const allowlistedSources: CanarySourceInfo[] = autoPublishInput.allowlistedSourceIds.map((id) => {
    const source = getSafeCheckSource(id);
    return { id, name: source?.name ?? id };
  });

  return {
    checksEnabled: input.checksEnabled,
    writesEnabled: input.writesEnabled,
    writeAttemptsPossible:
      input.checksEnabled &&
      input.writesEnabled &&
      input.cronSecretConfigured &&
      input.writerCredentialsConfigured,
    cronSecretConfigured: input.cronSecretConfigured,
    writerCredentialsConfigured: input.writerCredentialsConfigured,
    canarySources,
    isSingleSourceCanary: canarySources.length === 1,
    maxCandidatesPerRun: input.maxCandidatesPerRun,
    fingerprintProtectionEnabled: input.fingerprintProtectionEnabled,
    runHistory: input.runHistory ?? notConfiguredRunHistorySnapshot(),
    operationalNotificationRuntimeEnabled: input.operationalNotificationRuntimeEnabled ?? false,
    autoPublish: {
      enabled: autoPublishInput.enabled,
      allowlistedSources,
      isSingleSourceAllowlist: allowlistedSources.length === 1,
      maxPerRun: autoPublishInput.maxPerRun,
    },
    emailAlertConfig: buildEmailAlertConfigStatus(
      input.emailAlertConfig ?? {
        enabled: false,
        apiKeyConfigured: false,
        fromConfigured: false,
        toConfigured: false,
      }
    ),
  };
}

// ── Copy (pinned by tests, same anti-drift convention as writerCandidateActivity.ts) ──

export const AUTOMATION_STATUS_TITLE = "Stan automatyzacji (canary)";

export const AUTOMATION_STATUS_NO_PUBLISH_NOTE =
  "To automatyczne tworzenie kandydatów (sekcja powyżej) nigdy nie publikuje, nie edytuje " +
  "ani nie archiwizuje alertów, i nigdy nie tworzy wiersza w tabeli alerts. Może wyłącznie " +
  "zapisać maksymalnie jednego nowego kandydata ze statusem „pending” na jedno uruchomienie " +
  "— każdy taki kandydat wymaga ręcznej weryfikacji administratora w kolejce, dokładnie tak " +
  "jak kandydat zapisany ręcznie. Jedyny wyjątek od tej reguły w całym serwisie jest opisany " +
  "osobno w sekcji „Automatyczna publikacja zaufanych źródeł” poniżej.";

export const AUTOMATION_STATUS_AUTO_PUBLISH_TITLE = "Automatyczna publikacja zaufanych źródeł";

export const AUTOMATION_STATUS_AUTO_PUBLISH_NOTE =
  "Jedyny wyjątek od zasady „każdy alert publikuje ręcznie administrator” (Sprint 180C, " +
  "CLAUDE.md Reguła Bezpieczeństwa #10). Działa wyłącznie dla źródeł z osobnej allowlisty " +
  "poniżej, w pełni deterministycznie (bez udziału AI), i tylko gdy kandydat jednocześnie: " +
  "jest wciąż „pending” i nieprzekonwertowany, ma bezpośredni bezpieczny link do źródła, " +
  "jest aktualny lub nadchodzący, ma komplet wymaganych pól, i nie jest duplikatem ani " +
  "przypadkiem niejednoznacznym. Maksymalnie jedna publikacja na jedno uruchomienie. " +
  "Wyłączane natychmiast, bez zmiany kodu, ustawieniem SCHEDULED_AUTO_PUBLISH_ENABLED=false.";

export const AUTOMATION_STATUS_INFO_ONLY_NOTE =
  "Ten panel jest wyłącznie informacyjny — nie ma tu przycisku uruchamiającego " +
  "automatyzację ani aktywującego cron na Production. Oba wyłączniki są sterowane " +
  "wyłącznie zmiennymi środowiskowymi po stronie serwera.";
