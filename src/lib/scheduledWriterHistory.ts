import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildRunHistoryOpenInsert,
  buildRunHistoryCloseUpdate,
  type RunHistoryWriter,
  type RunLockRow,
} from "@/lib/scheduledWriterRunSafety";

// Sprint 166C — the real, Supabase-backed implementation of
// RunHistoryWriter, targeting the live public.scheduled_writer_runs
// table on alertownik-preview (migrated — see
// docs/sql/PROPOSED_SPRINT_166C_RUN_HISTORY_MIGRATION_V1.sql). Mirrors
// createSupabaseScheduledWriter's shape (src/lib/scheduledWriter.ts):
// a narrow set of operations matching exactly what the writer
// identity's RLS policies allow, nothing generic.
//
// openRun/closeRun never rely on INSERT/UPDATE ... RETURNING to learn
// anything back — the writer identity has no SELECT grant on this
// table, and Postgres RLS filters RETURNING output through SELECT
// policies, so a RETURNING clause here would come back empty regardless
// of whether the write itself succeeded. The caller-generated id
// (crypto.randomUUID(), see the route) is the only handle needed to
// later close the exact same row.

export function createSupabaseScheduledWriterHistory(client: SupabaseClient): RunHistoryWriter {
  return {
    async openRun(payload) {
      const { error } = await client.from("scheduled_writer_runs").insert(payload);
      return { ok: !error };
    },
    async closeRun(id, payload) {
      // The migrated UPDATE policy (scheduled_writer_runs_writer_close)
      // only allows this to affect a row that is still open
      // (finished_at is null) — attempting to close an already-closed
      // or nonexistent row simply updates zero rows, never errors.
      const { error } = await client.from("scheduled_writer_runs").update(payload).eq("id", id);
      return { ok: !error };
    },
    async findActiveLock(): Promise<RunLockRow | null> {
      // See RunHistoryWriter.findActiveLock's doc comment
      // (src/lib/scheduledWriterRunSafety.ts): the writer identity has
      // no SELECT grant on this table under the currently-migrated RLS,
      // so this SELECT is expected to be denied/empty every time today
      // — a structural no-op, not a bug in this function. Any Postgrest
      // error (including an RLS-denied empty result) or an empty result
      // set is treated identically: no lock detected, never throws, never
      // blocks the caller.
      const { data, error } = await client
        .from("scheduled_writer_runs")
        .select("started_at, finished_at")
        .is("finished_at", null)
        .order("started_at", { ascending: false })
        .limit(1);
      if (error || !data || data.length === 0) return null;
      const row = data[0] as { started_at: string; finished_at: string | null };
      return { startedAt: row.started_at, finishedAt: row.finished_at };
    },
  };
}

// Re-exported for the route's convenience so it only needs one import
// site for both builders.
export { buildRunHistoryOpenInsert, buildRunHistoryCloseUpdate };
