import { supabase } from "./supabaseClient";
import type {
  AlertSource,
  AlertSourceInput,
  SourceCheck,
  SourceCheckInput,
  SourceCheckResult,
} from "@/types/alertSource";
import type { AlertCategory } from "@/types/alert";

export interface SourcesResult {
  sources: AlertSource[];
  error?: string;
}

export interface SaveResult {
  ok: boolean;
  error?: string;
}

function rowToAlertSource(row: Record<string, unknown>): AlertSource {
  return {
    id: row.id as string,
    name: row.name as string,
    url: row.url as string,
    category: row.category as AlertCategory,
    sourceType: row.source_type as AlertSource["sourceType"],
    isActive: row.is_active as boolean,
    notes: (row.notes as string) || undefined,
    lastCheckedAt: (row.last_checked_at as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function getAlertSources(): Promise<SourcesResult> {
  if (!supabase) {
    return { sources: [], error: "Brak połączenia z Supabase." };
  }

  const { data, error } = await supabase
    .from("alert_sources")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Alertownik] getAlertSources error:", error.message);
    return { sources: [], error: error.message };
  }

  return { sources: (data ?? []).map(rowToAlertSource) };
}

export async function createAlertSource(input: AlertSourceInput): Promise<SaveResult> {
  if (!supabase) {
    return { ok: false, error: "Brak połączenia z Supabase." };
  }

  const { error } = await supabase.from("alert_sources").insert({
    name: input.name.trim(),
    url: input.url.trim(),
    category: input.category,
    source_type: input.sourceType,
    notes: input.notes?.trim() || null,
  });

  if (error) {
    console.error("[Alertownik] createAlertSource error:", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function updateAlertSource(
  id: string,
  input: AlertSourceInput
): Promise<SaveResult> {
  if (!supabase) {
    return { ok: false, error: "Brak połączenia z Supabase." };
  }

  const { error } = await supabase
    .from("alert_sources")
    .update({
      name: input.name.trim(),
      url: input.url.trim(),
      category: input.category,
      source_type: input.sourceType,
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("[Alertownik] updateAlertSource error:", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function deleteAlertSource(id: string): Promise<SaveResult> {
  if (!supabase) {
    return { ok: false, error: "Brak połączenia z Supabase." };
  }

  const { error } = await supabase
    .from("alert_sources")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[Alertownik] deleteAlertSource error:", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function toggleAlertSourceActive(
  id: string,
  isActive: boolean
): Promise<SaveResult> {
  if (!supabase) {
    return { ok: false, error: "Brak połączenia z Supabase." };
  }

  const { error } = await supabase
    .from("alert_sources")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("[Alertownik] toggleAlertSourceActive error:", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function markAlertSourceChecked(id: string): Promise<SaveResult> {
  return createSourceCheck({ sourceId: id, result: "no_changes" });
}

// ── Source check history ──────────────────────────────────────────────────────

export interface SourceChecksResult {
  checks: SourceCheck[];
  error?: string;
}

export interface RecentSourceCheck {
  id: string;
  sourceId: string;
  sourceName: string;
  checkedAt: string;
  result: SourceCheckResult;
  notes?: string;
}

function rowToSourceCheck(row: Record<string, unknown>): SourceCheck {
  return {
    id: row.id as string,
    sourceId: row.source_id as string,
    checkedAt: row.checked_at as string,
    result: row.result as SourceCheckResult,
    notes: (row.notes as string) || undefined,
    relatedAlertId: (row.related_alert_id as string) || undefined,
    createdBy: (row.created_by as string) || undefined,
    createdAt: row.created_at as string,
  };
}

export async function getSourceChecks(sourceId?: string, limit = 200): Promise<SourceChecksResult> {
  if (!supabase) {
    return { checks: [], error: "Brak połączenia z Supabase." };
  }

  let query = supabase
    .from("source_checks")
    .select("*")
    .order("checked_at", { ascending: false })
    .limit(limit);

  if (sourceId) {
    query = query.eq("source_id", sourceId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[Alertownik] getSourceChecks error:", error.message);
    return { checks: [], error: error.message };
  }

  return { checks: (data ?? []).map(rowToSourceCheck) };
}

export async function getRecentSourceChecks(limit = 3): Promise<{ checks: RecentSourceCheck[]; error?: string }> {
  if (!supabase) {
    return { checks: [], error: "Brak połączenia z Supabase." };
  }

  const { data, error } = await supabase
    .from("source_checks")
    .select("id, source_id, checked_at, result, notes, alert_sources(name)")
    .order("checked_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[Alertownik] getRecentSourceChecks error:", error.message);
    return { checks: [], error: error.message };
  }

  return {
    checks: (data ?? []).map((row) => ({
      id: row.id as string,
      sourceId: row.source_id as string,
      sourceName: ((row.alert_sources as unknown as { name: string } | null)?.name) ?? "Nieznane źródło",
      checkedAt: row.checked_at as string,
      result: row.result as SourceCheckResult,
      notes: (row.notes as string) || undefined,
    })),
  };
}

export async function createSourceCheck(input: SourceCheckInput): Promise<SaveResult> {
  if (!supabase) {
    return { ok: false, error: "Brak połączenia z Supabase." };
  }

  const { data: { user } } = await supabase.auth.getUser();
  const now = new Date().toISOString();

  const { error: insertError } = await supabase.from("source_checks").insert({
    source_id: input.sourceId,
    result: input.result,
    notes: input.notes?.trim() || null,
    related_alert_id: input.relatedAlertId ?? null,
    created_by: user?.id ?? null,
    checked_at: now,
  });

  if (insertError) {
    console.error("[Alertownik] createSourceCheck error:", insertError.message);
    return { ok: false, error: insertError.message };
  }

  // Update last_checked_at on the source — best effort, don't fail if this errors
  await supabase
    .from("alert_sources")
    .update({ last_checked_at: now, updated_at: now })
    .eq("id", input.sourceId);

  return { ok: true };
}

// ── Candidate queue (V0 — built on source_checks, no schema change) ───────────
// "Candidates" are source_checks the admin marked as having found something
// worth turning into an alert. There is no persisted title/url/excerpt or
// ignore/archive status yet — see docs/supabase_source_notice_candidates.sql
// for the proposed table that would add those. Until that's applied, status
// is derived: a candidate with no relatedAlertId is "pending", one with a
// relatedAlertId is "converted" (resolve the alert separately to display it).

const CANDIDATE_RESULTS: SourceCheckResult[] = ["found_notice", "needs_followup"];

export interface SourceCandidate {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  sourceCategory: AlertCategory;
  checkedAt: string;
  result: SourceCheckResult;
  notes?: string;
  relatedAlertId?: string;
}

export interface SourceCandidatesResult {
  candidates: SourceCandidate[];
  error?: string;
}

export async function getSourceCandidates(limit = 100): Promise<SourceCandidatesResult> {
  if (!supabase) {
    return { candidates: [], error: "Brak połączenia z Supabase." };
  }

  const { data, error } = await supabase
    .from("source_checks")
    .select("id, source_id, checked_at, result, notes, related_alert_id, alert_sources(name, url, category)")
    .in("result", CANDIDATE_RESULTS)
    .order("checked_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[Alertownik] getSourceCandidates error:", error.message);
    return { candidates: [], error: error.message };
  }

  return {
    candidates: (data ?? []).map((row) => {
      const src = row.alert_sources as unknown as
        | { name: string; url: string; category: AlertCategory }
        | null;
      return {
        id: row.id as string,
        sourceId: row.source_id as string,
        sourceName: src?.name ?? "Nieznane źródło",
        sourceUrl: src?.url ?? "",
        sourceCategory: src?.category ?? "municipal",
        checkedAt: row.checked_at as string,
        result: row.result as SourceCheckResult,
        notes: (row.notes as string) || undefined,
        relatedAlertId: (row.related_alert_id as string) || undefined,
      };
    }),
  };
}

export async function deleteSourceCheck(id: string): Promise<SaveResult> {
  if (!supabase) {
    return { ok: false, error: "Brak połączenia z Supabase." };
  }

  const { error } = await supabase.from("source_checks").delete().eq("id", id);

  if (error) {
    console.error("[Alertownik] deleteSourceCheck error:", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
