import { SAFE_CHECK_SOURCE_IDS, type SafeCheckSourceId } from "@/lib/sourceCheck";

// Sprint 149 — Scheduled Writer Monitoring v1.
//
// Pure functions only, mirroring src/lib/sourceHealth.ts's shape: no
// Supabase calls, no new schema, no new fetch — fed from data the admin
// page already loads (persistent candidates via getSourceCandidateNotices).
//
// WHAT THIS CAN HONESTLY SHOW (derived from source_notice_candidates,
// already-existing schema):
//   - Candidates the scheduled writer itself created, identified by
//     source_key being set — a column ONLY the writer's insert path ever
//     populates (src/lib/scheduledWriter.ts buildPendingCandidateInsert);
//     the admin's own manual "Zapisz jako kandydata" save
//     (src/lib/supabaseCandidateWrites.ts createSourceCandidateNotice)
//     never sets it. No ambiguity, no guessing.
//   - How many of those are still pending vs already actioned by an admin
//     (status moves off 'pending' only via admin/verifier action — the
//     writer has no UPDATE policy at all).
//   - The timestamp of the most recent one.
//
// WHAT THIS CANNOT HONESTLY SHOW WITHOUT A SCHEMA CHANGE (documented,
// not faked — see the *_NOTE constants below, surfaced directly in the
// admin UI so this limitation is visible, not hidden):
//   - Per-run counters (proposalsFound, duplicatesSkipped,
//     ambiguousCandidates, cappedSkipped, successfulSources/
//     failedSources) — these exist ONLY in the single HTTP JSON response
//     of one invocation of /api/cron/write-candidates. Nothing persists
//     them. A historical log would require a new table (e.g. a future
//     `scheduled_writer_runs` audit log) — out of scope for this sprint.
//   - WHO (which identity) authored a given source_checks row for a
//     source_check-only run (no new candidate, result=no_changes) — the
//     writer and the admin both set source_checks.created_by to their own
//     auth.uid(), and automation_identities' own RLS policy is
//     self-row-only ("auth.uid() = user_id" — see
//     docs/sql/PROPOSED_SCHEDULED_WRITER_RLS_MIGRATION_V1.sql §2), so an
//     admin's browser session cannot read the writer's row to compare —
//     by design, not a bug. Only source_notice_candidates.source_key
//     avoids this problem, because it is written directly onto the row
//     the admin CAN already read under the existing admin SELECT policy.

export interface WriterActivityCandidateInput {
  sourceKey?: string;
  status: string;
  detectedAt: string;
}

export interface ScheduledWriterSourceActivity {
  sourceKey: SafeCheckSourceId;
  /** All-time count within whatever window the caller's candidate fetch
   *  already covers (matches the existing admin page's own fetch limit —
   *  this module does not impose a separate one). */
  totalCandidates: number;
  pendingCandidates: number;
  /** ISO timestamp of the most recent writer-created candidate, or null
   *  if none exist yet in the loaded data. */
  lastCandidateAt: string | null;
}

export function buildScheduledWriterActivity(
  candidates: WriterActivityCandidateInput[]
): ScheduledWriterSourceActivity[] {
  return SAFE_CHECK_SOURCE_IDS.map((sourceKey) => {
    const own = candidates.filter((c) => c.sourceKey === sourceKey);
    let lastCandidateAt: string | null = null;
    for (const c of own) {
      if (!lastCandidateAt || c.detectedAt > lastCandidateAt) lastCandidateAt = c.detectedAt;
    }
    return {
      sourceKey,
      totalCandidates: own.length,
      pendingCandidates: own.filter((c) => c.status === "pending").length,
      lastCandidateAt,
    };
  });
}

// ── Copy (pinned by tests, same anti-drift convention as sourceHealth.ts) ───

export const WRITER_MONITORING_TITLE = "Scheduled Writer — aktywność";

export const WRITER_MONITORING_NO_PUBLISH_NOTE =
  "Scheduled Writer nigdy nie publikuje alertów. Każdy zapisany kandydat ma " +
  "status „pending” i wymaga ręcznej weryfikacji w kolejce — tak samo jak " +
  "kandydat zapisany ręcznie przez admina.";

export const WRITER_MONITORING_KILL_SWITCH_NOTE =
  "Tryb zapisu jest sterowany wyłącznie przez zmienne środowiskowe dostępne " +
  "tylko po stronie serwera (SCHEDULED_CHECKS_ENABLED, " +
  "SCHEDULED_WRITES_ENABLED) — domyślnie wyłączony, nigdy widoczny ani " +
  "ustawialny z tego panelu czy z przeglądarki.";

export const WRITER_MONITORING_UNTRACKED_NOTE =
  "Liczniki pojedynczego uruchomienia (znalezione komunikaty, pominięte " +
  "duplikaty, niejednoznaczne dopasowania, ograniczenie limitu na run) nie " +
  "są nigdzie zapisywane w bazie — widoczne wyłącznie w odpowiedzi tego " +
  "jednego wywołania. Trwały log uruchomień wymagałby nowej tabeli — " +
  "świadomie odłożone, nie ukryte (przyszły enhancement).";
