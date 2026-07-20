import { getServerEnvironmentIdentity, resolveEnvironmentIdentity, type EnvironmentIdentity } from "@/lib/environmentIdentity";

// Sprint 165B — Fail-closed database/environment pairing guard.
//
// Sprint 164C's read-only audit found Preview and Production currently
// share one Supabase project. Sprint 165A designed genuine isolation (a
// separate Preview-only Supabase project). This module is the code half
// of that design's item C.9/C.10 — a NEW, additive gate that will, once a
// separate Preview project exists and this variable is configured on it,
// stop a write-capable route from ever running against the wrong
// database for the environment it believes it is in.
//
// WHAT THIS DOES NOT DO, deliberately:
//   - It never parses NEXT_PUBLIC_SUPABASE_URL or extracts a Supabase
//     project ref from it. A project ref is itself a quasi-identifying
//     value not worth extracting, storing, or comparing at this layer —
//     and hostname/URL-shape parsing is exactly the "rely solely on
//     hostname" approach this guard is required NOT to use.
//   - It never reads or exposes any secret, credential, or connection
//     string. It compares two small, non-secret enum values.
//   - It never talks to Supabase, Postgres, or the network — this is a
//     pure, synchronous, environment-variable-only check, safe to call on
//     every request without adding latency or a new failure mode beyond
//     "returns false."
//
// HOW IT WORKS:
//   1. Resolve which Vercel environment this deployment is running in
//      (environmentIdentity.ts — VERCEL_ENV-derived, single source of
//      truth, shared with the admin badge).
//   2. Read a NEW, separate configuration variable —
//      SUPABASE_ENVIRONMENT_TAG — that Adam sets once per Vercel
//      environment scope (Production/Preview/Development), alongside
//      (never replacing) that scope's Supabase connection variables. Its
//      value is expected to be one of "production"/"preview"/
//      "development" — a human-asserted label for "which environment
//      does the Supabase project currently wired up here believe it
//      serves," decoupled from the URL itself.
//   3. The two must both be known (not "unknown"/missing) AND equal. Any
//      other combination fails closed.
//
// NO VALUE for SUPABASE_ENVIRONMENT_TAG is set anywhere as part of this
// sprint — see docs/SPRINT_165B_ISOLATED_PREVIEW_CODE_SAFETY_PACKAGE_V1.md.
// This means, as of this sprint, EVERY environment (including Production)
// fails this guard with reason "database_tag_not_configured". That is
// intentional and safe:
//   - This guard is only ever consulted by write-capable automation
//     routes (currently only GET /api/cron/write-candidates) — never by
//     any read path, so Production's existing read behavior (public site,
//     admin dashboard, source registry, etc.) is completely unaffected.
//   - write-candidates was ALREADY unreachable in every environment
//     before this sprint (SCHEDULED_WRITES_ENABLED has no value anywhere
//     — see the Sprint 148/150 orphaned-env-variable cleanups). Adding a
//     fourth reason it is blocked changes nothing about its current
//     (already-blocked) behavior.
//   - The two dry-run cron routes (check-sources, check-michalowice)
//     never import this module or the scheduled-writer module at all —
//     their zero-write guarantee is structural (no Supabase import),
//     unchanged by this guard's existence.

export type DatabaseEnvironmentGuardResult =
  | { ok: true }
  | {
      ok: false;
      reason: "environment_unknown" | "database_tag_not_configured" | "database_tag_unknown" | "environment_mismatch";
    };

/** Reads and resolves the configured database-environment tag, without
 *  ever returning the raw string to a caller that might log or surface
 *  it — only the resolved, closed-set EnvironmentIdentity (or null if
 *  unset). */
export function getConfiguredDatabaseEnvironmentTag(): EnvironmentIdentity | null {
  const raw = process.env.SUPABASE_ENVIRONMENT_TAG;
  if (!raw) return null;
  return resolveEnvironmentIdentity(raw);
}

/** The guard itself. Pure aside from reading two environment variables —
 *  `appEnvironment` may be injected for testing; production call sites
 *  always get the real, current Vercel environment. Never throws. */
export function checkDatabaseEnvironmentGuard(
  appEnvironment: EnvironmentIdentity = getServerEnvironmentIdentity()
): DatabaseEnvironmentGuardResult {
  if (appEnvironment === "unknown") {
    return { ok: false, reason: "environment_unknown" };
  }

  const rawTag = process.env.SUPABASE_ENVIRONMENT_TAG;
  if (!rawTag) {
    return { ok: false, reason: "database_tag_not_configured" };
  }

  const databaseEnvironment = resolveEnvironmentIdentity(rawTag);
  if (databaseEnvironment === "unknown") {
    return { ok: false, reason: "database_tag_unknown" };
  }

  if (databaseEnvironment !== appEnvironment) {
    return { ok: false, reason: "environment_mismatch" };
  }

  return { ok: true };
}

/** Single generic message for every guard failure. Callers must never
 *  surface `reason`, the resolved environment, or the configured tag in
 *  any HTTP response or log line — this string carries zero
 *  infrastructure detail, matching the existing generic-error convention
 *  already used by the sign-in-failure and kill-switch responses in
 *  write-candidates/route.ts. */
export const DATABASE_ENVIRONMENT_GUARD_GENERIC_ERROR = "Zapis jest tymczasowo niedostępny.";
