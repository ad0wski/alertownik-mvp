import { supabase } from "./supabaseClient";
import type {
  SourceNoticeCandidate,
  SourceNoticeCandidateInput,
  SourceCandidateStatus,
} from "@/types/sourceCandidate";

// Reads/writes for the proposed `source_notice_candidates` table (Sprint 78
// — see docs/supabase_source_notice_candidates.sql). That migration is NOT
// applied automatically — every function here detects a missing table and
// returns a calm, explanatory error instead of throwing, so /admin/queue
// and /admin/sources keep working (showing the existing source_checks-based
// view) whether or not the admin has run the migration yet.

const TABLE_MISSING_HINT =
  "Tabela „source_notice_candidates” jeszcze nie istnieje w Supabase. " +
  "Uruchom migrację z docs/supabase_source_notice_candidates.sql, aby włączyć trwałych kandydatów.";

interface SupabaseErrorLike {
  code?: string;
  message?: string;
}

function isMissingTableError(error: SupabaseErrorLike | null): boolean {
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

function rowToCandidate(row: Record<string, unknown>): SourceNoticeCandidate {
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

  const { data, error } = await supabase
    .from("source_notice_candidates")
    .insert({
      source_id: input.sourceId ?? null,
      source_name: input.sourceName,
      source_url: input.sourceUrl?.trim() || null,
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
export async function markCandidateConverted(
  id: string,
  convertedAlertId?: string | null
): Promise<CandidateSaveResult> {
  if (!supabase) return { ok: false, error: "Brak połączenia z Supabase." };

  const { error } = await supabase
    .from("source_notice_candidates")
    .update({
      status: "converted",
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
