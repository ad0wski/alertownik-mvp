import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { textSimilarity, normalizeForCompare } from "@/lib/candidateWarnings";
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

// ── Cross-table dedup (Sprint 177D/177E) ─────────────────────────────────────
//
// Sprints 175D and 177C independently found the same gap: the classifier
// above only ever sees OTHER candidates (from findExistingCandidateTexts,
// itself scoped to one source_key) — an existing alert (draft, published,
// or archived) is never part of the comparison pool at all, so a source
// re-publishing (or a different source re-describing) the same official
// notice could be proposed again as if it were brand new. Sprint 177D
// closed this for published alerts only, via a temporary anon-client
// workaround (removed in 177E — see findExistingAlertComparisons below).
// Sprint 177E closes it for draft/published/archived alike, through a
// proposed, NOT YET APPLIED RLS migration (docs/sql/PROPOSED_SPRINT_177_
// AUTOMATION_ALERT_READ_POLICY_V1.sql) granting the scheduled-writer
// identity a narrow, SELECT-only policy on `alerts`.
//
// Deliberately does NOT introduce a new similarity threshold or a
// same-road/same-town heuristic: doing so risks exactly the false-positive
// this project has explicitly ruled out (a new, unrelated phase of
// roadworks on the same street must still be allowed through). Two
// independent, conservative signals only:
//   1. Exact-URL match against a published alert's own source_url — the
//      strongest possible signal (the identical article, re-scraped), and
//   2. The EXISTING word-overlap thresholds (DUPLICATE_CONFIDENCE_THRESHOLD /
//      AMBIGUOUS_SIMILARITY_THRESHOLD), simply given a wider pool of
//      existing texts to compare against — never a new threshold value.

export interface DedupComparisonItem {
  text: string;
  url?: string | null;
}

/** Trim + strip exactly one trailing slash, nothing else — never touches
 *  scheme, host, path segments, or query string in any way that could
 *  cause two genuinely different articles to compare equal. Matches the
 *  minimal, conservative normalization this sprint's brief calls for. */
function normalizeUrlForCompare(url: string): string {
  const trimmed = url.trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

/** Given a proposal (its raw text and, when the parser found one, its
 *  direct permalink) and the merged pool of existing comparison items
 *  (other candidates for this source + readable published alerts),
 *  decides new / duplicate / ambiguous. An exact URL match against any
 *  existing item is treated as a confident duplicate regardless of text
 *  drift (SAME article, re-scraped or re-worded); otherwise falls back to
 *  the existing, unmodified classifyCandidateAgainstExisting() over the
 *  merged text pool — same thresholds, same algorithm, wider input. */
export function classifyProposalAgainstExisting(
  proposal: { text: string; url?: string },
  existingItems: DedupComparisonItem[]
): DuplicateClassification {
  if (proposal.url) {
    const normalizedProposalUrl = normalizeUrlForCompare(proposal.url);
    const urlMatch = existingItems.some(
      (item) => item.url && normalizeUrlForCompare(item.url) === normalizedProposalUrl
    );
    if (urlMatch) return "duplicate";
  }
  return classifyCandidateAgainstExisting(
    proposal.text,
    existingItems.map((item) => item.text)
  );
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
  /** Direct public permalink to the specific article, when the parser
   *  found one (CheckProposal.url, sourceCheck.ts). Absent for
   *  HTML-scraped sources with no reliable per-item link — stored as
   *  null in that case, matching the existing manual "Zapisz jako
   *  kandydata" write path (supabaseCandidateWrites.ts), never an empty
   *  string. */
  candidateUrl?: string;
}

// Sprint 150A — race-condition closure (proposal, not yet migrated: see
// docs/SPRINT_150_RACE_CONDITION_DEPLOYMENT_RUNBOOK_V1.md). Two
// concurrent invocations both fetch-and-parse the SAME live page
// independently, so a genuine race produces two candidates whose
// content is identical (or effectively identical) after normalization —
// this is a narrower, EXACT-match notion of "duplicate" than the
// existing fuzzy classifyCandidateAgainstExisting() above, and that is
// intentional: a DB-level unique constraint can only ever enforce exact
// equality, never a similarity score. Reuses normalizeForCompare()
// (src/lib/candidateWarnings.ts) verbatim — the SAME function the
// in-memory fuzzy classifier already relies on — so there is exactly one
// definition of "normalized text" in this codebase, never a second one
// (e.g. in SQL) that could silently drift out of sync. SHA-256 keeps the
// stored value a fixed 64 hex characters regardless of how long the
// source notice's raw text ever gets — safe to index unconditionally,
// unlike the raw text itself.
export function computeContentFingerprint(input: Pick<PendingCandidateInput, "title" | "excerpt" | "rawText">): string {
  const basis = input.rawText || input.excerpt || input.title;
  return createHash("sha256").update(normalizeForCompare(basis)).digest("hex");
}

/** Expand/contract deploy safety (Sprint 150A): `content_fingerprint`
 *  does not exist as a column on the live database until the proposed
 *  migration (docs/sql/PROPOSED_SPRINT_150_RACE_CONDITION_MIGRATION_V1.sql)
 *  is actually run — NOT done as part of this sprint. Sending an unknown
 *  column to Supabase's insert would fail every single write. This flag
 *  therefore defaults OFF (identical behavior to before this sprint) and
 *  must only ever be flipped on AFTER Adam has verified the migration is
 *  live (docs/sql/VERIFY_SPRINT_150_RACE_CONDITION_MIGRATION_READ_ONLY_V1.sql).
 *  This is the "expand" step's code half — schema first, this flag second,
 *  never the reverse. */
export function isContentFingerprintEnabled(): boolean {
  return process.env.SCHEDULED_WRITER_FINGERPRINT_ENABLED === "true";
}

export function buildPendingCandidateInsert(input: PendingCandidateInput) {
  return {
    source_id: input.sourceId,
    source_key: input.sourceKey,
    source_name: input.sourceName,
    source_url: input.sourceUrl,
    candidate_url: input.candidateUrl?.trim() || null,
    title: input.title,
    excerpt: input.excerpt,
    raw_text: input.rawText,
    // Only included once the migration is confirmed live AND the flag is
    // explicitly turned on — see isContentFingerprintEnabled() above.
    // Spreading an empty object when disabled means the key is entirely
    // absent from the payload (not `content_fingerprint: undefined`,
    // which some client libraries still serialize) — old-schema-safe by
    // construction, not just by convention.
    ...(isContentFingerprintEnabled() ? { content_fingerprint: computeContentFingerprint(input) } : {}),
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

// Sprint 150A: insertPendingCandidate's result distinguishes a database-
// enforced unique-constraint conflict (Postgres error code 23505 — the
// proposed migration's partial unique index rejecting a genuine race
// loss) from any other insert failure. This is "duplicate_prevented_by_
// database" — distinct from the EXISTING "duplicate_detected_before_
// insert" case, which is the in-memory classifyCandidateAgainstExisting()
// call already skipping a proposal before ever attempting an insert (see
// writeCandidatesForSource below). Both are safe, both skip silently
// from the caller's perspective (no retry, no crash), but they are
// counted separately in the result so a human reading the response can
// tell "we saw this coming" apart from "we lost a race."
export type InsertPendingCandidateResult =
  | { ok: true }
  | { ok: false; reason: "duplicate_prevented_by_database" | "unknown_error" };

/** Sprint 180C — Trusted Source Auto-Publish. Distinct from
 *  InsertPendingCandidateResult: this insert either fully succeeds (and
 *  returns the new alert's id) or fully fails — there is no
 *  "partially inserted" outcome, matching the fail-closed requirement
 *  the whole trustedSourceAutoPublish.ts module is built around. */
export type InsertPublishedAlertResult =
  | { ok: true; id: string }
  | { ok: false; reason: "duplicate_prevented_by_database" | "unknown_error" };

/** Shape of the row trustedSourceAutoPublish.ts's buildAutoPublishAlertInsert()
 *  produces — defined here (the module ScheduledSourceWriter itself lives
 *  in) rather than imported from trustedSourceAutoPublish.ts, so the
 *  import direction stays one-way (feature module depends on this core
 *  module, never the reverse). */
/** A pending candidate row shaped for trustedSourceAutoPublish.ts's own
 *  evaluateAutoPublishEligibility() — defined here for the same
 *  one-way-import reason as AutoPublishAlertInsertPayload below. */
export interface PendingAutoPublishCandidateRow {
  id: string;
  sourceKey: string;
  sourceName: string;
  sourceUrl: string;
  candidateUrl: string | null;
  title: string;
  text: string;
  status: string;
  convertedAlertId: string | null;
}

export interface AutoPublishAlertInsertPayload {
  slug: string;
  category: string;
  severity: string;
  title: string;
  place: string;
  starts_at: string;
  change: string;
  action: string;
  source_name: string;
  source_url: string;
  source_id: null;
  status: "published";
  published_at: string;
}

export interface ScheduledSourceWriter {
  /** Sprint 180C fix — `excludeCandidateId` (optional, defaults to no
   *  exclusion) lets a caller that is re-evaluating an ALREADY-EXISTING
   *  candidate row (trustedSourceAutoPublish.ts) exclude that row's own
   *  id from the comparison pool. writeCandidatesForSource's own regular
   *  call site never needs this — the proposal it checks doesn't exist in
   *  the table yet — so it keeps calling this with only two arguments,
   *  unchanged. Without this, a pending candidate's own text is
   *  trivially "duplicate" against itself (real Production incident,
   *  2026-07-28: both canary candidates were wrongly skipped as
   *  self-duplicates). */
  findExistingCandidateTexts(
    sourceKey: string,
    registrySourceId: string | null,
    excludeCandidateId?: string
  ): Promise<string[]>;
  /** Sprint 177D/177E — optional so every existing hand-written fake
   *  writer in the test suite keeps compiling and passing unmodified:
   *  when a fake doesn't implement it, writeCandidatesForSource treats
   *  the result as "no alerts available for comparison" (empty list),
   *  the exact same behavior as before this method existed. Real
   *  (createSupabaseScheduledWriter) call sites always implement it. */
  findExistingAlertComparisons?(): Promise<DedupComparisonItem[]>;
  insertPendingCandidate(payload: ReturnType<typeof buildPendingCandidateInsert>): Promise<InsertPendingCandidateResult>;
  insertSourceCheck(payload: ReturnType<typeof buildAutomatedSourceCheckInsert>): Promise<{ ok: boolean }>;
  /** Sprint 180C — both optional for the same reason findExistingAlertComparisons
   *  is: every pre-existing hand-written fake writer keeps compiling and
   *  passing unmodified. Requires the (not yet applied — see
   *  docs/sql/PROPOSED_SPRINT_180C_TRUSTED_SOURCE_AUTO_PUBLISH_RLS_V1.sql)
   *  INSERT-on-alerts / UPDATE-on-source_notice_candidates policies to
   *  actually succeed against Production; until that migration is applied,
   *  the real implementation's calls fail closed with a Postgres 42501,
   *  surfaced as `{ ok: false, reason: "unknown_error" }` — never a crash,
   *  never a partial write. */
  insertPublishedAlert?(payload: AutoPublishAlertInsertPayload): Promise<InsertPublishedAlertResult>;
  markCandidateAutoPublished?(candidateId: string, alertId: string): Promise<{ ok: boolean }>;
  /** Bounded read (never unbounded) of `pending`, not-yet-converted
   *  candidates whose source_key is in `sourceIds` — the writer's existing
   *  unrestricted (non source-scoped) SELECT policy on
   *  source_notice_candidates already permits this, no new read grant
   *  needed. Ordered oldest-first so a long-pending candidate is
   *  considered before a just-created one. */
  findPendingAutoPublishCandidates?(sourceIds: readonly string[]): Promise<PendingAutoPublishCandidateRow[]>;
}

/** Postgres unique_violation — the exact code the proposed migration's
 *  partial unique index would raise on a genuine race loss. Checked by
 *  code, never by parsing the error message text (message wording is not
 *  a stable contract; the SQLSTATE code is). */
const POSTGRES_UNIQUE_VIOLATION = "23505";

interface CandidateTextRow {
  title?: string;
  excerpt?: string;
  raw_text?: string;
}

interface PendingCandidateFullRow {
  id: string;
  source_key: string;
  source_name: string;
  source_url: string;
  candidate_url?: string | null;
  title?: string;
  excerpt?: string;
  raw_text?: string;
  status: string;
  converted_alert_id?: string | null;
}

interface ExistingAlertRow {
  title?: string;
  change?: string;
  source_url?: string;
}

/** Bounds the alert comparison pool the same way
 *  findExistingCandidateTexts already bounds its own query (limit 50) —
 *  a single, capped read per source per invocation, never unbounded
 *  history, never one query per proposal. */
const EXISTING_ALERT_COMPARISON_LIMIT = 200;

/** The only real (Supabase-backed) implementation of ScheduledSourceWriter.
 *  Tests never construct this — they hand-write a fake ScheduledSourceWriter
 *  instead, so the decision logic in writeCandidatesForSource() is fully
 *  testable with no network involved. */
export function createSupabaseScheduledWriter(client: SupabaseClient): ScheduledSourceWriter {
  return {
    // Sprint 149 idempotency hardening: the writer's SELECT policy on
    // source_notice_candidates (docs/sql/PROPOSED_SCHEDULED_WRITER_RLS_
    // MIGRATION_V1.sql §3) is not filtered by source_key — it grants
    // read access to every row, admin-created or writer-created alike.
    // The original query only ever compared against OTHER
    // writer-created rows (source_key match), leaving a blind spot: a
    // notice an admin had already saved manually via "Zapisz jako
    // kandydata" (which never sets source_key, per
    // src/lib/supabaseCandidateWrites.ts) was invisible to this dedup
    // check. Matching on source_id as well (when a registry id is
    // configured) closes that gap without any RLS/schema change — pure
    // widening of an already-permitted read.
    async findExistingCandidateTexts(sourceKey, registrySourceId, excludeCandidateId) {
      let query = client
        .from("source_notice_candidates")
        .select("title, excerpt, raw_text")
        .order("detected_at", { ascending: false })
        .limit(50);
      query = registrySourceId
        ? query.or(`source_key.eq.${sourceKey},source_id.eq.${registrySourceId}`)
        : query.eq("source_key", sourceKey);
      if (excludeCandidateId) query = query.neq("id", excludeCandidateId);
      const { data } = await query;
      return ((data as CandidateTextRow[] | null) ?? [])
        .map((r) => r.raw_text || r.excerpt || r.title || "")
        .filter(Boolean);
    },
    async insertPendingCandidate(payload) {
      const { error } = await client.from("source_notice_candidates").insert(payload);
      if (!error) return { ok: true };
      if (error.code === POSTGRES_UNIQUE_VIOLATION) {
        return { ok: false, reason: "duplicate_prevented_by_database" };
      }
      return { ok: false, reason: "unknown_error" };
    },
    async insertSourceCheck(payload) {
      const { error } = await client.from("source_checks").insert(payload);
      return { ok: !error };
    },
    // Sprint 180C — relies on the (not yet applied — see
    // docs/sql/PROPOSED_SPRINT_180C_TRUSTED_SOURCE_AUTO_PUBLISH_RLS_V1.sql)
    // narrow INSERT policy on `alerts`. Until that migration is applied,
    // every call here fails at the database with 42501, surfaced below as
    // `unknown_error` — the same safe, generic-diagnostic convention every
    // other write path in this file already follows. `.insert()`, never
    // `.upsert()`: a genuine slug collision with an unrelated existing
    // alert must fail closed (unique_violation), never silently overwrite.
    async insertPublishedAlert(payload) {
      const { data, error } = await client.from("alerts").insert(payload).select("id").single();
      if (!error) return { ok: true, id: (data?.id as string) ?? "" };
      if (error.code === POSTGRES_UNIQUE_VIOLATION) {
        return { ok: false, reason: "duplicate_prevented_by_database" };
      }
      return { ok: false, reason: "unknown_error" };
    },
    // Sprint 180C — relies on the same not-yet-applied migration's narrow
    // UPDATE policy on `source_notice_candidates` (pending → published
    // only). Always called AFTER insertPublishedAlert succeeds, never
    // before — see writeCandidatesForSource's own sibling function in
    // trustedSourceAutoPublish.ts for the exact ordering and why a failure
    // here does not risk a double-publish on retry (the exact-URL dedup
    // check against the now-published alert's own source_url is the real
    // idempotency guarantee, not this update's own success).
    async markCandidateAutoPublished(candidateId, alertId) {
      const { error } = await client
        .from("source_notice_candidates")
        .update({ status: "published", converted_alert_id: alertId })
        .eq("id", candidateId);
      return { ok: !error };
    },
    async findPendingAutoPublishCandidates(sourceIds) {
      if (sourceIds.length === 0) return [];
      const { data } = await client
        .from("source_notice_candidates")
        .select("id, source_key, source_name, source_url, candidate_url, title, excerpt, raw_text, status, converted_alert_id")
        .eq("status", "pending")
        .in("source_key", [...sourceIds])
        .order("created_at", { ascending: true })
        .limit(20);
      return ((data as PendingCandidateFullRow[] | null) ?? []).map((row) => ({
        id: row.id,
        sourceKey: row.source_key,
        sourceName: row.source_name,
        sourceUrl: row.source_url,
        candidateUrl: row.candidate_url ?? null,
        title: row.title ?? "",
        text: row.raw_text || row.excerpt || row.title || "",
        status: row.status,
        convertedAlertId: row.converted_alert_id ?? null,
      }));
    },
    // Sprint 177E — reads through the writer's OWN authenticated session
    // (the same `client` this factory was constructed with), relying on
    // the proposed, not-yet-applied "Scheduled writer can select alerts
    // for deduplication" SELECT policy (docs/sql/PROPOSED_SPRINT_177_
    // AUTOMATION_ALERT_READ_POLICY_V1.sql) rather than Sprint 177D's
    // anon-client workaround. Until that migration is applied on
    // Production, this query is silently RLS-filtered to zero rows —
    // safe (no crash, no privilege escalation, degrades to "no alerts
    // available for comparison", identical to a missing/optional
    // implementation) but NOT a substitute for actually applying the
    // migration first. Deployment ordering matters: this code must not
    // reach Production before the migration does, or it would regress
    // even the published-only comparison Sprint 177D already achieved
    // (that anon-client path is removed by this change, on purpose —
    // duplicating both approaches indefinitely would leave two ways to
    // read `alerts`, one of them permanently dead weight once the
    // migration lands). No error-vs-empty distinction is surfaced in the
    // run result here — matches this file's own pre-existing convention
    // for findExistingCandidateTexts just above, which also does not
    // distinguish "zero relevant rows" from "read failed". A dedicated
    // diagnostic (e.g. counting RLS-denied reads in the run history) is
    // future work, not part of this change.
    async findExistingAlertComparisons() {
      const { data } = await client
        .from("alerts")
        .select("title, change, source_url")
        .order("created_at", { ascending: false })
        .limit(EXISTING_ALERT_COMPARISON_LIMIT);
      return ((data as ExistingAlertRow[] | null) ?? [])
        .map((row) => ({
          text: [row.title, row.change].filter(Boolean).join(" ").trim(),
          url: row.source_url || null,
        }))
        .filter((item) => item.text.length > 0);
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
  /** Sprint 150A: count of inserts rejected by the database's own unique
   *  constraint (once the proposed migration is live and
   *  SCHEDULED_WRITER_FINGERPRINT_ENABLED=true) — a genuine concurrent-
   *  invocation race loss, distinct from duplicatesSkipped (which is the
   *  in-memory fuzzy check catching a duplicate BEFORE ever attempting an
   *  insert). Always 0 today, since the migration has not been applied
   *  and the flag defaults off. */
  duplicatesPreventedByDatabase: number;
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
    return {
      candidatesInserted: 0,
      duplicatesSkipped: 0,
      ambiguousCandidates: 0,
      cappedSkipped: 0,
      sourceChecksInserted,
      duplicatesPreventedByDatabase: 0,
    };
  }

  const existingTexts = await writer.findExistingCandidateTexts(input.sourceKey, input.registrySourceId);
  // Sprint 177D/177E — one bounded read per source per invocation (never
  // per proposal), same call-once shape as findExistingCandidateTexts
  // above. A missing method (older/test fakes) or a failed read degrades
  // to "no alerts available for comparison" — never breaks candidate
  // creation, per this sprint's own requirement.
  let existingAlerts: DedupComparisonItem[] = [];
  if (writer.findExistingAlertComparisons) {
    try {
      existingAlerts = await writer.findExistingAlertComparisons();
    } catch {
      existingAlerts = [];
    }
  }
  const existingItems: DedupComparisonItem[] = [
    ...existingTexts.map((text) => ({ text })),
    ...existingAlerts,
  ];

  let candidatesInserted = 0;
  let duplicatesSkipped = 0;
  let ambiguousCandidates = 0;
  let cappedSkipped = 0;
  let duplicatesPreventedByDatabase = 0;
  for (const proposal of input.proposals) {
    const text = proposal.rawText || proposal.excerpt || proposal.title;
    const classification = classifyProposalAgainstExisting({ text, url: proposal.url }, existingItems);

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
        candidateUrl: proposal.url,
      })
    );
    if (result.ok) {
      candidatesInserted++;
      existingItems.push({ text, url: proposal.url });
    } else if (result.reason === "duplicate_prevented_by_database") {
      // A genuine race loss: our in-memory check said "new" (it could not
      // see the other invocation's not-yet-committed row), but the
      // database's own unique constraint caught it. Safe by design: no
      // retry (the other invocation already has this content pending),
      // no 500, no draft, no publish, no update to the row that won —
      // just counted, honestly, as a distinct outcome from an ordinary
      // in-memory duplicate. Deliberately does NOT count against
      // maxCandidatesToInsert — zero rows were created by this attempt.
      duplicatesPreventedByDatabase++;
    }
    // result.reason === "unknown_error": silently not inserted, not
    // counted anywhere — identical to this function's pre-Sprint-150A
    // behavior for any other Postgrest error, unchanged.
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

  return {
    candidatesInserted,
    duplicatesSkipped,
    ambiguousCandidates,
    cappedSkipped,
    sourceChecksInserted,
    duplicatesPreventedByDatabase,
  };
}
