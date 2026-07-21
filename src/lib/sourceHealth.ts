import {
  OFFICIAL_SOURCE_CHECKS,
  type OfficialSourceCheck,
} from "@/lib/officialSourceChecklist";
import {
  SAFE_CHECK_SOURCE_IDS,
  findMatchingRegistrySource,
} from "@/lib/sourceCheck";
import type { SourceCheckResult } from "@/types/alertSource";

// Sprint 137 — Source Health Dashboard v1, deterministic layer.
//
// Pure functions that combine three inputs the admin pages already load
// (official checklist config, alert_sources registry rows, source_checks
// history, persistent candidates) into per-source health rows. No fetching,
// no Supabase calls, no schema changes — tests run on plain mocked arrays
// with an injectable clock.
//
// This is a FOUNDATION for scheduled checks (Automation Plan stage A5+):
// before any cron exists, the admin needs to see which sources are covered,
// which are stale and which have never been checked. The dashboard itself
// automates nothing — every check is still triggered by hand, and the copy
// constants below are pinned by tests so the UI can never quietly start
// promising automation that does not exist.

// ── Tunables ──────────────────────────────────────────────────────────────────

/** A check older than this many days counts as stale. */
export const HEALTH_STALE_DAYS = 7;

/** Candidates detected within this many days count as "recent". */
export const RECENT_CANDIDATE_DAYS = 14;

// ── Types ─────────────────────────────────────────────────────────────────────

export type SourceHealthStatus =
  | "checked_recently" // latest check within HEALTH_STALE_DAYS
  | "stale" // has a check, but older than HEALTH_STALE_DAYS
  | "never_checked" // registered in alert_sources, zero check history
  | "unregistered"; // no alert_sources row matches the official URL

export const HEALTH_STATUS_LABELS: Record<SourceHealthStatus, string> = {
  checked_recently: "sprawdzone niedawno",
  stale: `dawno nie sprawdzane (>${HEALTH_STALE_DAYS} dni)`,
  never_checked: "nigdy nie sprawdzone",
  unregistered: "brak w rejestrze — historia niedostępna",
};

export interface SourceHealthRow {
  /** Checklist id (officialSourceChecklist.ts), e.g. "michalowice-komunikaty". */
  checklistId: string;
  name: string;
  category: OfficialSourceCheck["category"];
  officialUrl: string;
  /** True only for sources on the safe-check allowlist (Sprint 139: two). */
  apiSupported: boolean;
  /** Matched alert_sources row id, or null when the source isn't registered. */
  registrySourceId: string | null;
  status: SourceHealthStatus;
  /** ISO timestamp of the most recent check, or null if never checked. */
  lastCheckAt: string | null;
  /** Result of the most recent source_checks row, or null when the only
   *  signal is alert_sources.last_checked_at (no history row loaded). */
  lastCheckResult: SourceCheckResult | null;
  /** Persistent candidates attached to this source within RECENT_CANDIDATE_DAYS. */
  recentCandidateCount: number;
}

// Minimal structural inputs — the real types (AlertSource, SourceCheck,
// SourceNoticeCandidate) all satisfy these, and tests can pass plain objects.
export interface HealthRegistrySource {
  id: string;
  url: string | null;
  lastCheckedAt?: string;
}

export interface HealthSourceCheck {
  sourceId: string;
  checkedAt: string;
  result: SourceCheckResult;
}

export interface HealthCandidate {
  sourceId?: string | null;
  detectedAt: string;
}

export interface BuildHealthRowsArgs {
  checklist?: OfficialSourceCheck[];
  registrySources: HealthRegistrySource[];
  checks: HealthSourceCheck[];
  candidates: HealthCandidate[];
  now?: Date;
}

// ── Row building ──────────────────────────────────────────────────────────────

function daysBetween(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / 86_400_000;
}

export function buildSourceHealthRows({
  checklist = OFFICIAL_SOURCE_CHECKS,
  registrySources,
  checks,
  candidates,
  now = new Date(),
}: BuildHealthRowsArgs): SourceHealthRow[] {
  // Latest check per registry source id (input order is not trusted).
  const latestCheck = new Map<string, HealthSourceCheck>();
  for (const check of checks) {
    const current = latestCheck.get(check.sourceId);
    if (!current || check.checkedAt > current.checkedAt) {
      latestCheck.set(check.sourceId, check);
    }
  }

  // Recent-candidate counts per registry source id. Candidates without a
  // sourceId (saved before the source was registered) can't be attributed
  // to a checklist row — skipped, not guessed.
  const recentCandidates = new Map<string, number>();
  for (const candidate of candidates) {
    if (!candidate.sourceId) continue;
    if (daysBetween(candidate.detectedAt, now) > RECENT_CANDIDATE_DAYS) continue;
    recentCandidates.set(
      candidate.sourceId,
      (recentCandidates.get(candidate.sourceId) ?? 0) + 1
    );
  }

  return checklist.map((source) => {
    const registryMatch = findMatchingRegistrySource(registrySources, source.officialUrl);
    const check = registryMatch ? latestCheck.get(registryMatch.id) : undefined;

    // createSourceCheck also bumps alert_sources.last_checked_at, so the two
    // signals normally agree — but a source can carry last_checked_at without
    // a loaded history row (older data, history query limit). Prefer the
    // history row (it has a result); fall back to the registry timestamp.
    const lastCheckAt = check?.checkedAt ?? registryMatch?.lastCheckedAt ?? null;

    let status: SourceHealthStatus;
    if (!registryMatch) {
      status = "unregistered";
    } else if (!lastCheckAt) {
      status = "never_checked";
    } else {
      status = daysBetween(lastCheckAt, now) > HEALTH_STALE_DAYS ? "stale" : "checked_recently";
    }

    return {
      checklistId: source.id,
      name: source.name,
      category: source.category,
      officialUrl: source.officialUrl,
      apiSupported: (SAFE_CHECK_SOURCE_IDS as readonly string[]).includes(source.id),
      registrySourceId: registryMatch?.id ?? null,
      status,
      lastCheckAt,
      lastCheckResult: check?.result ?? null,
      recentCandidateCount: registryMatch
        ? (recentCandidates.get(registryMatch.id) ?? 0)
        : 0,
    };
  });
}

// ── Summary ───────────────────────────────────────────────────────────────────

export interface SourceHealthSummary {
  total: number;
  apiSupported: number;
  checkedRecently: number;
  needsAttention: number; // stale + never_checked + unregistered
}

export function summarizeSourceHealth(rows: SourceHealthRow[]): SourceHealthSummary {
  return {
    total: rows.length,
    apiSupported: rows.filter((r) => r.apiSupported).length,
    checkedRecently: rows.filter((r) => r.status === "checked_recently").length,
    needsAttention: rows.filter((r) => r.status !== "checked_recently").length,
  };
}

// ── Copy (pinned by tests against automation-promise drift) ──────────────────
// Sprint 137 requirement: the dashboard must say, in so many words, that
// checking is manual, no cron exists yet, and publishing needs a human.

export const HEALTH_BADGE_MANUAL = "ręczne sprawdzanie";
export const HEALTH_BADGE_NO_CRON = "cron jeszcze nieaktywny";

export const HEALTH_DASHBOARD_DISCLAIMER =
  "Przegląd stanu oficjalnych źródeł — wyłącznie do wglądu. Wszystkie sprawdzenia " +
  "uruchamiasz ręcznie (cron jeszcze nieaktywny), a publikacja nadal wymaga człowieka: " +
  "zawsze przez szkic w Kreatorze. Alertownik nie jest oficjalną aplikacją " +
  "WKD, PGE ani żadnej gminy.";

export const HEALTH_API_SUPPORT_NOTE =
  "Check przez aplikację działa dziś dla dokładnie dwóch źródeł: " +
  "„Gmina Michałowice — komunikaty” oraz „WKD — aktualności”. Pozostałe " +
  "źródła sprawdzasz ręcznie w przeglądarce według checklisty.";

// Honest fallback for "last error" (Sprint 137 req. 9): failed fetches are
// shown in the moment of the check but are NOT persisted anywhere —
// source_checks has no error result and adding one would be a schema change,
// which this sprint deliberately avoids.
export const HEALTH_ERROR_FALLBACK_NOTE =
  "Błędy pobierania (np. timeout, HTTP 403) nie są zapisywane w bazie — widać je " +
  "tylko w chwili sprawdzenia. Trwały zapis błędów wymagałby zmiany schematu " +
  "i jest świadomie odłożony na sprint przygotowujący cron.";

export const HEALTH_API_SUPPORTED_LABEL = "check przez aplikację";
export const HEALTH_MANUAL_ONLY_LABEL = "tylko ręczna checklista";
