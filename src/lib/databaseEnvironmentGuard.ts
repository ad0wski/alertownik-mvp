import { getServerEnvironmentIdentity, resolveEnvironmentIdentity, type EnvironmentIdentity } from "@/lib/environmentIdentity";

// Sprint 165B — Fail-closed database/environment pairing guard.
// Sprint 165B-2 — corrected to independently confirm actual Supabase
// project identity, not just a self-reported environment tag.
//
// Sprint 164C's read-only audit found Preview and Production currently
// share one Supabase project. Sprint 165A designed genuine isolation (a
// separate Preview-only Supabase project). This module is the code half
// of that design's item C.9/C.10.
//
// SPRINT 165B-2 CORRECTION — a real gap, found by re-audit, not merely
// theoretical: the original version of this guard compared ONLY two
// self-reported labels — the resolved Vercel environment and a
// SUPABASE_ENVIRONMENT_TAG value — and never looked at which Supabase
// project was actually configured via NEXT_PUBLIC_SUPABASE_URL at all.
// That meant a misconfiguration where VERCEL_ENV=preview,
// SUPABASE_ENVIRONMENT_TAG=preview, but NEXT_PUBLIC_SUPABASE_URL still
// pointed at the Production project, would have passed this guard
// incorrectly — two matching LABELS are not proof of which DATABASE is
// actually wired up. This version closes that gap by independently
// deriving the actual project identity from the connection string in use
// and comparing it against a separately-configured expected value — four
// independent signals, not two.
//
// WHAT THIS DOES NOT DO, deliberately:
//   - It never reads or exposes any secret, credential, key, or full
//     connection string. The only thing derived from
//     NEXT_PUBLIC_SUPABASE_URL is its project-ref subdomain label (e.g.
//     the `abcdefghij` in `https://abcdefghij.supabase.co`) — itself not
//     a secret (Supabase's own client-side anon key already ships this
//     value to every browser via the public URL), but still never logged,
//     never returned in any API response, and never included in the
//     guard's generic error message.
//   - It never talks to Supabase, Postgres, or the network — deriving the
//     project ref is pure string/URL parsing, no I/O, so this remains the
//     cheapest possible check and stays Layer 0 (first, before the
//     existing kill switches).
//
// HOW IT WORKS — four independent signals, ALL required:
//   1. Resolved application environment (environmentIdentity.ts —
//      VERCEL_ENV-derived, single source of truth, shared with the admin
//      badge). Must not be "unknown".
//   2. SUPABASE_ENVIRONMENT_TAG — a human-asserted label for "which
//      environment does the Supabase project wired up here believe it
//      serves." Must be configured, must resolve to a known value, and
//      must equal signal 1.
//   3. The ACTUAL Supabase project identity, derived independently from
//      NEXT_PUBLIC_SUPABASE_URL's hostname (`<project-ref>.supabase.co`).
//      Must be present and parse as a well-formed Supabase project host.
//   4. SUPABASE_EXPECTED_PROJECT_REF — a separately-configured value
//      naming which project ref this environment scope is supposed to be
//      wired to. Must be configured, and must equal signal 3.
//
// Any missing, malformed, "unknown", or mismatched signal fails closed.
// Passing all four is still not sufficient on its own to allow a write —
// this guard is Layer 0 of four total layers; layers 1-3 (the two
// SCHEDULED_* kill switches and the technical-account credentials) remain
// fully required, unchanged, unweakened — see write-candidates/route.ts.
//
// NO VALUE for SUPABASE_ENVIRONMENT_TAG or SUPABASE_EXPECTED_PROJECT_REF
// is set anywhere as part of this sprint — see
// docs/SPRINT_165B_ISOLATED_PREVIEW_CODE_SAFETY_PACKAGE_V1.md. This means
// every environment, including Production, still fails this guard today
// (now with reason "database_tag_not_configured", reached before the
// project-ref checks even run). This is intentional and safe:
//   - This guard is only ever consulted by write-capable automation
//     routes (currently only GET /api/cron/write-candidates) — never by
//     any read path, so Production's existing read behavior is completely
//     unaffected, and remains read-only-safe exactly as before.
//   - write-candidates was ALREADY unreachable in every environment
//     before this sprint (SCHEDULED_WRITES_ENABLED has no value anywhere
//     — see the Sprint 148/150 orphaned-env-variable cleanups).
//   - The two dry-run cron routes (check-sources, check-michalowice)
//     never import this module or the scheduled-writer module at all —
//     their zero-write guarantee is structural, unchanged.

export type DatabaseEnvironmentGuardResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "environment_unknown"
        | "database_tag_not_configured"
        | "database_tag_unknown"
        | "environment_mismatch"
        | "supabase_url_missing_or_invalid"
        | "expected_project_ref_not_configured"
        | "project_ref_mismatch";
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

const SUPABASE_HOST_SUFFIX = ".supabase.co";

/** Extracts the project-ref subdomain label from a Supabase project URL
 *  (`https://<ref>.supabase.co` → `<ref>`), without exposing the URL
 *  itself to any caller. Returns null for anything that doesn't parse as
 *  a URL, doesn't end in the expected Supabase host suffix, or whose
 *  label itself contains an embedded dot (which would indicate an
 *  unexpected multi-level host this code doesn't recognize as a single
 *  project ref) — every one of those is a deliberate "invalid → fail
 *  closed" case, never a best-effort guess. */
function extractSupabaseProjectRef(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (!host.endsWith(SUPABASE_HOST_SUFFIX)) return null;
  const ref = host.slice(0, -SUPABASE_HOST_SUFFIX.length);
  if (!ref || ref.includes(".")) return null;
  return ref;
}

/** The actual Supabase project identity currently wired up, derived
 *  independently from the connection URL itself — never from a
 *  self-reported label. Never logged by this function; callers must
 *  treat the return value the same way (never included in a response or
 *  log line). */
export function getActualSupabaseProjectRef(): string | null {
  return extractSupabaseProjectRef(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

/** The expected Supabase project identity for this environment scope, a
 *  NEW, separate, server-only configuration value — never derived from,
 *  or required to equal, any other variable. No value is set anywhere as
 *  part of this sprint. */
export function getExpectedSupabaseProjectRef(): string | null {
  const raw = process.env.SUPABASE_EXPECTED_PROJECT_REF;
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  return normalized || null;
}

/** The guard itself — four independent signals, all required, all
 *  fail-closed. `appEnvironment` may be injected for testing; production
 *  call sites always get the real, current Vercel environment. Never
 *  throws, never performs network I/O. */
export function checkDatabaseEnvironmentGuard(
  appEnvironment: EnvironmentIdentity = getServerEnvironmentIdentity()
): DatabaseEnvironmentGuardResult {
  // Signal 1: resolved application environment.
  if (appEnvironment === "unknown") {
    return { ok: false, reason: "environment_unknown" };
  }

  // Signal 2: self-reported database-environment tag, must match signal 1.
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

  // Signal 3: the ACTUAL Supabase project identity, independently derived
  // from the connection URL currently in use — not a label, a fact.
  const actualProjectRef = getActualSupabaseProjectRef();
  if (!actualProjectRef) {
    return { ok: false, reason: "supabase_url_missing_or_invalid" };
  }

  // Signal 4: the expected Supabase project identity for this scope.
  const expectedProjectRef = getExpectedSupabaseProjectRef();
  if (!expectedProjectRef) {
    return { ok: false, reason: "expected_project_ref_not_configured" };
  }

  if (actualProjectRef !== expectedProjectRef) {
    return { ok: false, reason: "project_ref_mismatch" };
  }

  return { ok: true };
}

/** Single generic message for every guard failure. Callers must never
 *  surface `reason`, the resolved environment, the configured tag, the
 *  actual project ref, or the expected project ref in any HTTP response
 *  or log line — this string carries zero infrastructure detail, matching
 *  the existing generic-error convention already used by the sign-in-
 *  failure and kill-switch responses in write-candidates/route.ts. */
export const DATABASE_ENVIRONMENT_GUARD_GENERIC_ERROR = "Zapis jest tymczasowo niedostępny.";
