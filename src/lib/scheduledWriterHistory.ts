import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildRunHistoryOpenInsert,
  buildRunHistoryCloseUpdate,
  RUN_LOCK_STALE_AFTER_MS,
  type RunHistoryWriter,
  type RunTrigger,
} from "@/lib/scheduledWriterRunSafety";

// Sprint 166C, Stage 2b — the real, Supabase-backed implementation of
// RunHistoryWriter, targeting the atomic SECURITY DEFINER functions
// proposed in docs/sql/PROPOSED_SPRINT_166C_ATOMIC_LOCK_MIGRATION_V2.sql
// (NOT YET EXECUTED against alertownik-preview or any other project).
//
// openRun/closeRun call .rpc(), never .from(table).insert()/.update()
// directly — the atomic-lock migration drops the old direct-table
// writer_insert/writer_close RLS policies, so a direct table write would
// simply be denied from here on. Both functions internally re-check
// automation_identities membership themselves (SECURITY DEFINER bypasses
// RLS, so the function body is now the authorization boundary) and
// return only a boolean, never a row — no SELECT grant is needed or
// added for the writer identity anywhere in this file.

export function createSupabaseScheduledWriterHistory(client: SupabaseClient): RunHistoryWriter {
  return {
    async openRun(id: string, trigger: RunTrigger, environmentTag: string) {
      const { data, error } = await client.rpc("open_scheduled_writer_run", {
        p_id: id,
        p_trigger: trigger,
        p_environment_tag: environmentTag,
        p_stale_after_seconds: Math.floor(RUN_LOCK_STALE_AFTER_MS / 1000),
      });
      // Any error (unexpected failure calling the function, network
      // issue, etc.) is treated identically to "did not open" — the
      // caller must fail closed either way, never distinguishing the two
      // in a way that could tempt it to proceed anyway.
      return { opened: !error && data === true };
    },
    async closeRun(id, payload) {
      const { error } = await client.rpc("close_scheduled_writer_run", {
        p_id: id,
        p_outcome: payload.outcome,
        p_sources_checked: payload.sources_checked,
        p_sources_failed: payload.sources_failed,
        p_candidates_inserted: payload.candidates_inserted,
        p_duplicates_skipped: payload.duplicates_skipped,
        p_ambiguous_candidates: payload.ambiguous_candidates,
        p_capped_skipped: payload.capped_skipped,
        p_duplicates_prevented_by_database: payload.duplicates_prevented_by_database,
        p_error_summary: payload.error_summary,
      });
      return { ok: !error };
    },
  };
}

// Re-exported for the route's convenience so it only needs one import
// site for both builders (buildRunHistoryOpenInsert is no longer used by
// this file's own implementation — it remains the documented shape of
// an "open" row for tests/reference — but buildRunHistoryCloseUpdate's
// shape maps directly onto close_scheduled_writer_run's parameters).
export { buildRunHistoryOpenInsert, buildRunHistoryCloseUpdate };
