import { getSafeCheckSource } from "@/lib/sourceCheck";

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
}

export function buildAutomationStatus(input: AutomationStatusInput): AutomationStatusSnapshot {
  const canarySources: CanarySourceInfo[] = input.allowedWriteSourceIds.map((id) => {
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
  };
}

// ── Copy (pinned by tests, same anti-drift convention as writerCandidateActivity.ts) ──

export const AUTOMATION_STATUS_TITLE = "Stan automatyzacji (canary)";

export const AUTOMATION_STATUS_NO_PUBLISH_NOTE =
  "Automat nigdy nie publikuje, nie edytuje ani nie archiwizuje alertów, i nigdy nie " +
  "tworzy wiersza w tabeli alerts. Może wyłącznie zapisać maksymalnie jednego nowego " +
  "kandydata ze statusem „pending” na jedno uruchomienie — każdy taki kandydat wymaga " +
  "ręcznej weryfikacji administratora w kolejce, dokładnie tak jak kandydat zapisany ręcznie.";

export const AUTOMATION_STATUS_INFO_ONLY_NOTE =
  "Ten panel jest wyłącznie informacyjny — nie ma tu przycisku uruchamiającego " +
  "automatyzację ani aktywującego cron na Production. Oba wyłączniki są sterowane " +
  "wyłącznie zmiennymi środowiskowymi po stronie serwera.";
