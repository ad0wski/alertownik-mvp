import { supabase } from "./supabaseClient";
import type {
  SourceNoticeCandidate,
  SourceNoticeCandidateInput,
  SourceCandidateStatus,
} from "@/types/sourceCandidate";

// Reads/writes for the `source_notice_candidates` table (v2 schema:
// docs/sprint132_candidate_persistence_schema_proposal.sql — approved and
// run manually by Adam in Sprint 133, 2026-07-08). The missing-table
// detection below stays: it is what let this code ship before the
// migration, and it still covers the one realistic post-migration case
// (PostgREST schema cache not yet reloaded, PGRST205) plus any future
// environment where the migration hasn't been run — every function
// returns a calm, explanatory error instead of throwing, so /admin/queue
// and /admin/sources keep working either way.

const TABLE_MISSING_HINT =
  "Supabase nie widzi tabeli „source_notice_candidates”. Jeśli migracja " +
  "(docs/sprint132_candidate_persistence_schema_proposal.sql) została właśnie uruchomiona, " +
  "cache schematu PostgREST może potrzebować chwili — odśwież stronę za moment " +
  "(migracja kończy się poleceniem notify pgrst, 'reload schema'). " +
  "Jeśli migracja nie była uruchamiana, tabela wymaga ręcznego utworzenia w SQL Editorze.";

interface SupabaseErrorLike {
  code?: string;
  message?: string;
}

// Exported for unit tests (tests/e2e/candidateQueue.spec.ts) — this is the
// table-detection logic the whole pre/post-migration behavior hinges on.
export function isMissingTableError(error: SupabaseErrorLike | null): boolean {
  if (!error) return false;
  // Postgres: 42P01 = undefined_table. PostgREST: PGRST205 = table not in
  // its schema cache (the common case right after a migration hasn't run
  // yet, or ran but the cache wasn't reloaded).
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return /relation .* does not exist|could not find the table/i.test(error.message ?? "");
}

export interface CandidateSaveResult {
  ok: boolean;
  error?: string;
  id?: string;
  tableMissing?: boolean;
}

export interface CandidateNoticesResult {
  candidates: SourceNoticeCandidate[];
  error?: string;
  tableMissing?: boolean;
}

// Exported for unit tests (tests/e2e/candidateQueue.spec.ts) — verifies the
// v2 column mapping against the shape the Sprint 132 migration created.
export function rowToCandidate(row: Record<string, unknown>): SourceNoticeCandidate {
  return {
    id: row.id as string,
    sourceId: (row.source_id as string) || null,
    sourceName: row.source_name as string,
    sourceUrl: (row.source_url as string) || undefined,
    candidateUrl: (row.candidate_url as string) || undefined,
    title: row.title as string,
    excerpt: (row.excerpt as string) || undefined,
    rawText: (row.raw_text as string) || undefined,
    detectedAt: row.detected_at as string,
    status: row.status as SourceCandidateStatus,
    convertedAlertId: (row.converted_alert_id as string) || null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    // v2 columns (schema proposal, Sprint 132) — mapped defensively so the
    // same code works before the migration (columns absent → undefined)
    // and starts surfacing them in the UI the moment the table exists.
    sourceKey: (row.source_key as string) || undefined,
    officialDomain: (row.official_domain as string) || undefined,
    rawTitle: (row.raw_title as string) || undefined,
    category: (row.category as string) || null,
    severity: (row.severity as string) || null,
    locality: (row.locality as string) || null,
    place: (row.place as string) || null,
    startsAt: (row.starts_at as string) || null,
    endsAt: (row.ends_at as string) || null,
    change: (row.change as string) || null,
    action: (row.action as string) || null,
    confidenceScore:
      typeof row.confidence_score === "number" ? row.confidence_score : null,
    riskLevel: (row.risk_level as SourceNoticeCandidate["riskLevel"]) || null,
    verificationStatus:
      (row.verification_status as SourceNoticeCandidate["verificationStatus"]) ||
      undefined,
    verificationNotes: (row.verification_notes as string) || null,
    duplicateOfAlertId: (row.duplicate_of_alert_id as string) || null,
    checkedAt: (row.checked_at as string) || null,
  };
}

export async function getSourceCandidateNotices(): Promise<CandidateNoticesResult> {
  if (!supabase) return { candidates: [], error: "Brak połączenia z Supabase." };

  const { data, error } = await supabase
    .from("source_notice_candidates")
    .select("*")
    .order("detected_at", { ascending: false })
    .limit(200);

  if (error) {
    if (isMissingTableError(error)) {
      return { candidates: [], error: TABLE_MISSING_HINT, tableMissing: true };
    }
    console.error("[Alertownik] getSourceCandidateNotices error:", error.message);
    return { candidates: [], error: error.message };
  }

  return { candidates: (data ?? []).map(rowToCandidate) };
}

export async function createSourceCandidateNotice(
  input: SourceNoticeCandidateInput
): Promise<CandidateSaveResult> {
  if (!supabase) return { ok: false, error: "Brak połączenia z Supabase." };

  // v2 schema makes source_url NOT NULL (hard project rule: no source link
  // = no candidate) — guard here so the failure is a clear message, not a
  // Postgres constraint error.
  if (!input.sourceUrl?.trim()) {
    return { ok: false, error: "Kandydat wymaga adresu źródła (source_url)." };
  }

  const { data, error } = await supabase
    .from("source_notice_candidates")
    .insert({
      source_id: input.sourceId ?? null,
      source_name: input.sourceName,
      source_url: input.sourceUrl.trim(),
      candidate_url: input.candidateUrl?.trim() || null,
      title: input.title.trim(),
      excerpt: input.excerpt?.trim() || null,
      raw_text: input.rawText?.trim() || null,
    })
    .select("id")
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      return { ok: false, error: TABLE_MISSING_HINT, tableMissing: true };
    }
    console.error("[Alertownik] createSourceCandidateNotice error:", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true, id: (data?.id as string) || undefined };
}

export async function updateCandidateStatus(
  id: string,
  status: SourceCandidateStatus
): Promise<CandidateSaveResult> {
  if (!supabase) return { ok: false, error: "Brak połączenia z Supabase." };

  const { error } = await supabase
    .from("source_notice_candidates")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    if (isMissingTableError(error)) {
      return { ok: false, error: TABLE_MISSING_HINT, tableMissing: true };
    }
    console.error("[Alertownik] updateCandidateStatus error:", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

// Called from Builder after a candidate-sourced draft/publish actually
// succeeds (see src/app/builder/page.tsx) — best-effort: a failure here
// must never block or roll back the alert save that already happened.
// v2 statuses: a draft save marks the candidate `converted_to_draft`;
// `published` is set ONLY by the manual publish click in Builder — this is
// the single allowed path to that status (no automated path exists).
export async function markCandidateConverted(
  id: string,
  convertedAlertId?: string | null,
  status: "converted_to_draft" | "published" = "converted_to_draft"
): Promise<CandidateSaveResult> {
  if (!supabase) return { ok: false, error: "Brak połączenia z Supabase." };

  const { error } = await supabase
    .from("source_notice_candidates")
    .update({
      status,
      converted_alert_id: convertedAlertId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    if (isMissingTableError(error)) {
      return { ok: false, error: TABLE_MISSING_HINT, tableMissing: true };
    }
    console.error("[Alertownik] markCandidateConverted error:", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
