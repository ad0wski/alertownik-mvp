import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { textSimilarity } from "@/lib/candidateWarnings";
import type { CheckProposal } from "@/lib/sourceCheck";
import { SAFE_CHECK_SOURCE_IDS } from "@/lib/sourceCheck";

// Sprint 147 — Scheduled Writer Foundation v1.
//
// Server-only module. No Client Component may import this file — nothing
// here is safe to bundle into the browser (it reads server-only
// environment variables and, when actually invoked, would hold a signed-in
// Supabase session in memory for the duration of one request). Next.js
// never bundles a file that no Client Component imports into the client
// build; this project's existing convention already relies on that
// guarantee for its other server-only secret (`ANTHROPIC_API_KEY` in
// src/app/api/ai/draft-alert/route.ts, never imported by any "use client"
// file) rather than the `server-only` npm package, which is not a
// dependency of this project. Adding it would be a new package addition —
// against this project's standing rule to add packages only with
// explicit confirmation — for a guarantee Next.js's module boundary
// already provides here. See docs/SCHEDULED_WRITER_FOUNDATION_V1.md §H
// for the full reasoning, and
// tests/e2e/scheduledWriterRoute.spec.ts's static audit, which greps
// every "use client" file in the repo and confirms none imports this
// module — enforced by test, not merely by convention.
//
// This module is the server-side write path a scheduled check would use
// to persist candidates and check-history rows, built against the RLS
// design applied and verified live in Sprint 146
// (docs/SCHEDULED_WRITER_RLS_DEPLOYMENT_RESULT_V1.md —
// public.automation_identities + narrow scheduled-writer policies on
// source_notice_candidates/source_checks; public.alerts and
// the existing admin-membership table left untouched).
//
// DEFAULT-DISABLED, AT EVERY LAYER, INDEPENDENTLY:
//   1. isWriteModeEnabled() — SCHEDULED_WRITES_ENABLED, a dedicated
//      write-mode switch, separate from the existing dry-run endpoint's
//      SCHEDULED_CHECKS_ENABLED. No value is set for this anywhere as
//      part of Sprint 147.
//   2. getScheduledWriterCredentials() — returns null unless both
//      SUPABASE_SCHEDULED_WRITER_EMAIL and
//      SUPABASE_SCHEDULED_WRITER_PASSWORD are set. Neither exists in any
//      environment as part of Sprint 147 — no technical Supabase Auth
//      account was created, so even a real value here would have
//      nothing to sign in as.
//   3. Even with both of the above somehow set, the RLS policies applied
//      and verified in Sprint 146 grant nothing to a session unless that
//      session's auth.uid() is a row in public.automation_identities —
//      which has zero rows today (Sprint 147 does not add one).
// All three gates must be true simultaneously for any write to occur;
// today, none of them are. RLS remains the actual database enforcement
// boundary regardless of what this application code does or doesn't
// check — even a bug in every layer above would still be stopped at the
// database, because the policies (not this module) are what a
// PostgREST/Data API request is ultimately evaluated against.
//
// This module never imports any alert-publishing helper, Builder/draft
// helper, or candidate-approval helper, never constructs a privileged
// bypass-RLS client, and never touches the admin membership table — it
// only ever signs in as a distinct, narrowly-scoped identity and writes
// through the same RLS-governed Data API the browser already uses.

// ── Fail-closed configuration gates ──────────────────────────────────────────

export function isWriteModeEnabled(flagValue: string | undefined): boolean {
  return flagValue === "true";
}

export interface ScheduledWriterCredentials {
  email: string;
  password: string;
}

/** Reads credentials from env only — never hardcoded, never logged. Returns
 *  null (not an empty-string credential) when either half is missing, so
 *  callers fail closed rather than attempting a sign-in that could never
 *  succeed. Never reveals WHICH half is missing in any value returned to
 *  a caller — the boolean-or-null shape is deliberately uninformative. */
export function getScheduledWriterCredentials(): ScheduledWriterCredentials | null {
  const email = process.env.SUPABASE_SCHEDULED_WRITER_EMAIL;
  const password = process.env.SUPABASE_SCHEDULED_WRITER_PASSWORD;
  if (!email || !password) return null;
  return { email, password };
}

export type SignInResult =
  | { ok: true; client: SupabaseClient; userId: string }
  | { ok: false; reason: "not_configured" | "sign_in_failed" };

/** Signs in as the scheduled-writer technical account fresh, per
 *  invocation, using a non-persisted, ephemeral client (the anon/
 *  publishable key — never a privileged bypass-RLS key) — never the
 *  shared browser-facing `supabase` singleton from supabaseClient.ts.
 *  `persistSession: false` and `autoRefreshToken: false` mean no session
 *  or refresh token is ever written to any storage (there is no browser
 *  storage on the server anyway, but this also prevents supabase-js from
 *  attempting to schedule a background refresh timer that would outlive
 *  the request). The caller is responsible for letting `client` and
 *  `userId` fall out of scope once the request completes — nothing here
 *  caches or reuses a session across invocations. */
export async function signInScheduledWriter(
  credentials: ScheduledWriterCredentials
): Promise<SignInResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { ok: false, reason: "not_configured" };

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.auth.signInWithPassword(credentials);
  if (error || !data.session || !data.user) {
    return { ok: false, reason: "sign_in_failed" };
  }

  // Never logged, never returned — data.session.access_token/refresh_token
  // are deliberately not read here at all; only the user id is retained.
  return { ok: true, client, userId: data.user.id };
}

// ── Deduplication — conservative, best-effort, three-way ─────────────────────
//
// The current schema has no guaranteed unique fingerprint for a notice
// (no content hash, no unique index on source+title) — this is a known,
// documented limitation (docs/SCHEDULED_WRITER_AUTHORIZATION_AUDIT_V1.md
// §7), not fixed by this module. What follows is a conservative
// best-effort classifier using the same word-overlap heuristic
// (textSimilarity, src/lib/candidateWarnings.ts) the existing browser
// flow already relies on — reused, not reinvented, and given TWO
// thresholds instead of one so an uncertain match is never silently
// resolved either way:
//   - score >= DUPLICATE_CONFIDENCE_THRESHOLD → confident duplicate,
//     skip silently (this is genuinely the same notice already known).
//   - AMBIGUOUS_SIMILARITY_THRESHOLD <= score < DUPLICATE_CONFIDENCE_THRESHOLD
//     → ambiguous: NOT inserted, but reported distinctly in the run's
//     result (not silently dropped, not silently inserted) — a human (or
//     a future run, if the candidate persists on the source) gets the
//     chance to resolve it.
//   - score < AMBIGUOUS_SIMILARITY_THRESHOLD → not a duplicate, insert.
// This does not claim perfect idempotency — it claims never to silently
// insert something uncertain, and never to silently discard something
// that might be genuinely new.

export const DUPLICATE_CONFIDENCE_THRESHOLD = 0.9;
export const AMBIGUOUS_SIMILARITY_THRESHOLD = 0.6;

export type DuplicateClassification = "new" | "duplicate" | "ambiguous";

export function classifyCandidateAgainstExisting(
  candidateText: string,
  existingTexts: string[]
): DuplicateClassification {
  let bestScore = 0;
  for (const existing of existingTexts) {
    if (!existing) continue;
    const score = textSimilarity(candidateText, existing);
    if (score > bestScore) bestScore = score;
  }
  if (bestScore >= DUPLICATE_CONFIDENCE_THRESHOLD) return "duplicate";
  if (bestScore >= AMBIGUOUS_SIMILARITY_THRESHOLD) return "ambiguous";
  return "new";
}

// ── Insert payload builders ──────────────────────────────────────────────────
// These functions are the actual safety mechanism for the sensitive
// candidate columns: none of the RLS-constrained fields (status,
// verification_status, confidence_score, risk_level, verification_notes,
// checked_at, duplicate_of_alert_id, converted_alert_id, ai_draft_json)
// appear as parameters here at all — a caller cannot pass a different
// value for them even by mistake, because there is no parameter to pass
// one through. The exact values below match the live-verified WITH CHECK
// constraints (Sprint 146) exactly; even if they didn't, the database
// would still reject a mismatched insert — this is belt-and-suspenders,
// not the only guarantee.

export interface PendingCandidateInput {
  sourceId: string | null;
  sourceKey: string;
  sourceName: string;
  /** Hard project rule (existing, unchanged): no source link = no candidate. */
  sourceUrl: string;
  title: string;
  excerpt: string;
  rawText: string;
}

export function buildPendingCandidateInsert(input: PendingCandidateInput) {
  return {
    source_id: input.sourceId,
    source_key: input.sourceKey,
    source_name: input.sourceName,
    source_url: input.sourceUrl,
    title: input.title,
    excerpt: input.excerpt,
    raw_text: input.rawText,
    status: "pending",
    verification_status: "unverified",
    confidence_score: null,
    risk_level: null,
    verification_notes: null,
    checked_at: null,
    duplicate_of_alert_id: null,
    converted_alert_id: null,
    ai_draft_json: null,
  } as const;
}

/** Matches the live-verified source_checks WITH CHECK exactly: result
 *  restricted to the two outcomes an automated check can honestly claim
 *  (never 'alert_created'/'needs_followup' — both are human-judgment
 *  outcomes), related_alert_id forced null, created_by self-attributed
 *  via the signed-in writer's own uid. */
export interface AutomatedSourceCheckInput {
  sourceId: string;
  writerUserId: string;
  result: "no_changes" | "found_notice";
}

export function buildAutomatedSourceCheckInsert(input: AutomatedSourceCheckInput) {
  return {
    source_id: input.sourceId,
    result: input.result,
    related_alert_id: null,
    created_by: input.writerUserId,
  } as const;
}

// ── First-live-write safety caps — server-side, never caller-controlled ────
//
// Sprint 148 audit finding: without these, a single call could insert up
// to MAX_CHECK_PROPOSALS (6, src/lib/sourceCheck.ts) candidates in one
// invocation, and a bare call (no `?sourceKey=`) would attempt to write
// for BOTH allowlisted sources — including WKD, which this sprint's
// approval explicitly excludes from the first live write. Both caps
// below are read from environment variables that only Adam controls
// (via Vercel's dashboard), never from the incoming HTTP request itself
// (no query parameter or header can raise either limit) — this is the
// literal meaning of "enforced server-side, not by a caller-supplied
// parameter." Neither variable needs to be set for the safe default to
// apply: an unconfigured deployment is automatically the most
// conservative one.

/** Default, conservative cap on how many NEW candidates a single
 *  invocation may insert — deliberately 1 for the first controlled live
 *  write. Proposals beyond this cap are neither inserted nor silently
 *  dropped: they are counted separately (`cappedSkipped`) and reported
 *  in the response, the same "never silently resolve an uncertain case"
 *  principle already applied to ambiguous-duplicate handling. */
export const DEFAULT_MAX_CANDIDATES_PER_INVOCATION = 1;

export function getMaxCandidatesPerInvocation(): number {
  const raw = process.env.SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN;
  if (!raw) return DEFAULT_MAX_CANDIDATES_PER_INVOCATION;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_MAX_CANDIDATES_PER_INVOCATION;
  return Math.floor(parsed);
}

/** Default, conservative source restriction for the WRITE route
 *  specifically — narrower than the dry-run route's full
 *  SAFE_CHECK_SOURCE_IDS allowlist. Defaults to Michałowice only,
 *  regardless of what `resolveCronSources()` would otherwise resolve
 *  (which still includes WKD, correctly, for the harmless dry-run
 *  route). Any value supplied via the env var is still filtered through
 *  SAFE_CHECK_SOURCE_IDS — this can only ever narrow within the existing
 *  safe allowlist, never add an arbitrary source. */
export const DEFAULT_ALLOWED_WRITE_SOURCE_IDS: readonly string[] = ["michalowice-komunikaty"];

export function getAllowedWriteSourceIds(): readonly string[] {
  const raw = process.env.SCHEDULED_WRITER_ALLOWED_SOURCE_IDS;
  if (!raw) return DEFAULT_ALLOWED_WRITE_SOURCE_IDS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
      const filtered = parsed.filter((id) => (SAFE_CHECK_SOURCE_IDS as readonly string[]).includes(id));
      return filtered.length > 0 ? filtered : DEFAULT_ALLOWED_WRITE_SOURCE_IDS;
    }
  } catch {
    // fall through to default
  }
  return DEFAULT_ALLOWED_WRITE_SOURCE_IDS;
}

// ── Registry source id resolution (NOT a database read) ─────────────────────
//
// `source_checks.source_id` is NOT NULL (docs/supabase_source_checks.sql) —
// unlike source_notice_candidates.source_id, which is nullable and already
// has an accepted "no match → null" path, logging a check absolutely
// requires a real alert_sources row id. The scheduled writer has ZERO
// access to alert_sources (Sprint 146's applied design deliberately
// grants it nothing there, not even SELECT — that remains correct and is
// not reopened by this module). Resolving the id therefore cannot be a
// database query for this identity.
//
// Instead: a small, explicit, human-maintained mapping from sourceKey to
// its known alert_sources.id, read from a single environment variable as
// JSON (e.g. '{"michalowice-komunikaty":"<uuid>"}'). Until Adam configures
// this (or a future, SEPARATELY-approved migration grants the writer a
// narrow SELECT on alert_sources instead), this returns null and
// check-logging for that source is skipped gracefully — candidate
// creation is unaffected, since its own source_id is nullable. No value
// is set for SCHEDULED_WRITER_SOURCE_REGISTRY_IDS anywhere as part of
// Sprint 147.
export function getRegistrySourceId(sourceKey: string): string | null {
  const raw = process.env.SCHEDULED_WRITER_SOURCE_REGISTRY_IDS;
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const value = (parsed as Record<string, unknown>)[sourceKey];
    return typeof value === "string" && value ? value : null;
  } catch {
    return null;
  }
}

// ── Writer interface — narrow, no generic access ─────────────────────────────
//
// Deliberately NOT a generic Supabase client wrapper. Exactly three
// operations exist, matching the three the scheduled writer's RLS
// policies actually allow: look up existing candidate text for dedup,
// insert a pending candidate, insert a check-history row. No update, no
// delete, no arbitrary table access, no raw query execution, no alert
// access — none of those have a method here to call, structurally, not
// just by policy.

export interface ScheduledSourceWriter {
  findExistingCandidateTexts(sourceKey: string): Promise<string[]>;
  insertPendingCandidate(payload: ReturnType<typeof buildPendingCandidateInsert>): Promise<{ ok: boolean }>;
  insertSourceCheck(payload: ReturnType<typeof buildAutomatedSourceCheckInsert>): Promise<{ ok: boolean }>;
}

interface CandidateTextRow {
  title?: string;
  excerpt?: string;
  raw_text?: string;
}

/** The only real (Supabase-backed) implementation of ScheduledSourceWriter.
 *  Tests never construct this — they hand-write a fake ScheduledSourceWriter
 *  instead, so the decision logic in writeCandidatesForSource() is fully
 *  testable with no network involved. */
export function createSupabaseScheduledWriter(client: SupabaseClient): ScheduledSourceWriter {
  return {
    async findExistingCandidateTexts(sourceKey) {
      const { data } = await client
        .from("source_notice_candidates")
        .select("title, excerpt, raw_text")
        .eq("source_key", sourceKey)
        .order("detected_at", { ascending: false })
        .limit(50);
      return ((data as CandidateTextRow[] | null) ?? [])
        .map((r) => r.raw_text || r.excerpt || r.title || "")
        .filter(Boolean);
    },
    async insertPendingCandidate(payload) {
      const { error } = await client.from("source_notice_candidates").insert(payload);
      return { ok: !error };
    },
    async insertSourceCheck(payload) {
      const { error } = await client.from("source_checks").insert(payload);
      return { ok: !error };
    },
  };
}

// ── Per-source write orchestration (pure aside from the injected writer —
// this is the function tests exercise directly, with a hand-written fake
// ScheduledSourceWriter, no network involved) ──────────────────────────────

export interface WriteCandidatesForSourceInput {
  sourceKey: string;
  sourceName: string;
  sourceUrl: string;
  proposals: CheckProposal[];
  registrySourceId: string | null;
  writerUserId: string;
}

export interface WriteCandidatesForSourceResult {
  candidatesInserted: number;
  duplicatesSkipped: number;
  ambiguousCandidates: number;
  cappedSkipped: number;
  sourceChecksInserted: number;
}

/** Given already-fetched-and-parsed proposals for one source, decides what
 *  to insert and does so through the injected writer. Contains ALL of
 *  this module's actual decision logic (three-way dedup classification,
 *  the per-invocation insert cap, no-proposals → 'no_changes' log, found
 *  proposals → 'found_notice' log, graceful skip of check-logging when no
 *  registry id is configured) — the route itself only fetches/parses
 *  pages and wires the real Supabase-backed writer in.
 *
 *  `maxCandidatesToInsert` defaults to `getMaxCandidatesPerInvocation()`
 *  (env-controlled, conservative default 1) rather than being left to the
 *  caller to remember — callers may still override it explicitly (tests
 *  do, to exercise the cap deterministically without mutating env vars),
 *  but production call sites (the route) always get the safe default
 *  unless Adam has explicitly configured a higher one. */
export async function writeCandidatesForSource(
  writer: ScheduledSourceWriter,
  input: WriteCandidatesForSourceInput,
  maxCandidatesToInsert: number = getMaxCandidatesPerInvocation()
): Promise<WriteCandidatesForSourceResult> {
  if (input.proposals.length === 0) {
    let sourceChecksInserted = 0;
    if (input.registrySourceId) {
      const result = await writer.insertSourceCheck(
        buildAutomatedSourceCheckInsert({
          sourceId: input.registrySourceId,
          writerUserId: input.writerUserId,
          result: "no_changes",
        })
      );
      if (result.ok) sourceChecksInserted = 1;
    }
    return { candidatesInserted: 0, duplicatesSkipped: 0, ambiguousCandidates: 0, cappedSkipped: 0, sourceChecksInserted };
  }

  const existingTexts = await writer.findExistingCandidateTexts(input.sourceKey);

  let candidatesInserted = 0;
  let duplicatesSkipped = 0;
  let ambiguousCandidates = 0;
  let cappedSkipped = 0;
  for (const proposal of input.proposals) {
    const text = proposal.rawText || proposal.excerpt || proposal.title;
    const classification = classifyCandidateAgainstExisting(text, existingTexts);

    if (classification === "duplicate") {
      duplicatesSkipped++;
      continue;
    }
    if (classification === "ambiguous") {
      // Deliberately NOT inserted, per the "do not silently insert likely
      // duplicates" requirement — but also not silently discarded: it is
      // counted and reported distinctly in the run's result.
      ambiguousCandidates++;
      continue;
    }

    // classification === "new" from here on.
    if (candidatesInserted >= maxCandidatesToInsert) {
      // Genuinely new, but withheld purely by the per-invocation cap —
      // not silently dropped: counted and reported distinctly, the same
      // "never silently resolve an uncertain/limited case" principle.
      cappedSkipped++;
      continue;
    }

    const result = await writer.insertPendingCandidate(
      buildPendingCandidateInsert({
        sourceId: input.registrySourceId,
        sourceKey: input.sourceKey,
        sourceName: input.sourceName,
        sourceUrl: input.sourceUrl,
        title: proposal.title,
        excerpt: proposal.excerpt,
        rawText: proposal.rawText,
      })
    );
    if (result.ok) {
      candidatesInserted++;
      existingTexts.push(text);
    }
  }

  let sourceChecksInserted = 0;
  if (input.registrySourceId) {
    const result = await writer.insertSourceCheck(
      buildAutomatedSourceCheckInsert({
        sourceId: input.registrySourceId,
        writerUserId: input.writerUserId,
        result: "found_notice",
      })
    );
    if (result.ok) sourceChecksInserted = 1;
  }

  return { candidatesInserted, duplicatesSkipped, ambiguousCandidates, cappedSkipped, sourceChecksInserted };
}
