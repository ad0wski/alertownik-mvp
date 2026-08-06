import type { AlertCategory, AlertSeverity } from "@/types/alert";
import { PILOT_LOCALITIES } from "@/lib/officialSourceChecklist";
import { detectCandidateCategory } from "@/lib/candidateVerifier";
import { MONTHS_PL, normalizeForCompare } from "@/lib/candidateWarnings";
import {
  classifyProposalAgainstExisting,
  type DedupComparisonItem,
  type AutoPublishAlertInsertPayload,
  type PendingAutoPublishCandidateRow,
  type ScheduledSourceWriter,
} from "@/lib/scheduledWriter";
import { SAFE_CHECK_SOURCE_IDS } from "@/lib/sourceCheck";
import { isSyntheticAutomationContent } from "@/lib/testContentGuard";

// Sprint 180C — Trusted Source Auto-Publish v1.
//
// CLAUDE.md Security Rule #10 (amended this sprint) makes this an explicit,
// narrow, revocable EXCEPTION to "every draft needs a manual admin click" —
// not a general-purpose automation. Every function below is pure and
// deterministic; nothing here ever guesses a field it cannot derive with
// confidence. Any single missing/ambiguous signal fails the WHOLE
// candidate closed (stays `pending`) — there is no "publish with a blank
// field" path, by construction: AutoPublishEligibility is a discriminated
// union, and the `eligible: true` branch is the only one carrying an
// AutoPublishAlertFields payload at all.
//
// Reuses, never reimplements: classifyProposalAgainstExisting (the SAME
// cross-table dedup classifier write-candidates already uses),
// detectCandidateCategory (candidateVerifier.ts), PILOT_LOCALITIES
// (officialSourceChecklist.ts), MONTHS_PL/normalizeForCompare
// (candidateWarnings.ts). No second dedup algorithm, no second category
// keyword list, no second locality list exists anywhere in this module.

// ── Fail-closed configuration gates (mirrors scheduledWriter.ts's own
// pattern exactly: isWriteModeEnabled / getAllowedWriteSourceIds) ──────────

export function isAutoPublishEnabled(flagValue: string | undefined): boolean {
  return flagValue === "true";
}

export const DEFAULT_AUTO_PUBLISH_SOURCE_IDS: readonly string[] = ["pruszkow-aktualnosci"];

/** Any value supplied via the env var is still filtered through
 *  SAFE_CHECK_SOURCE_IDS — this can only ever narrow within the existing
 *  safe allowlist, never add an arbitrary source (same guarantee as
 *  getAllowedWriteSourceIds in scheduledWriter.ts). */
export function getAutoPublishSourceIds(): readonly string[] {
  const raw = process.env.SCHEDULED_AUTO_PUBLISH_SOURCE_IDS;
  if (!raw) return DEFAULT_AUTO_PUBLISH_SOURCE_IDS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
      const filtered = parsed.filter((id) => (SAFE_CHECK_SOURCE_IDS as readonly string[]).includes(id));
      return filtered.length > 0 ? filtered : DEFAULT_AUTO_PUBLISH_SOURCE_IDS;
    }
  } catch {
    // fall through to default
  }
  return DEFAULT_AUTO_PUBLISH_SOURCE_IDS;
}

export const DEFAULT_MAX_AUTO_PUBLISH_PER_INVOCATION = 1;

export function getMaxAutoPublishPerInvocation(): number {
  const raw = process.env.SCHEDULED_AUTO_PUBLISH_MAX_PER_RUN;
  if (!raw) return DEFAULT_MAX_AUTO_PUBLISH_PER_INVOCATION;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_MAX_AUTO_PUBLISH_PER_INVOCATION;
  return Math.floor(parsed);
}

// ── candidate_url safety check ───────────────────────────────────────────────

/** A direct, safe, public http(s) permalink — never a `/wp-json/` API
 *  endpoint (which is a data payload, not a page a resident can open and
 *  read), never missing. */
export function isDirectSafePermalink(url: string | null | undefined): boolean {
  if (!url || !url.trim()) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (parsed.pathname.includes("/wp-json/")) return false;
  return true;
}

// ── Deterministic Polish date extraction (day + named month + year,
// optional "od godz. HH:MM") — reuses MONTHS_PL, the exact same month
// list detectDateInText already validates presence with, so a text that
// passes detectDateInText and a text this function can parse are governed
// by one shared vocabulary, never two that could silently drift apart. ──

const MONTH_INDEX: Record<string, number> = {
  stycznia: 0,
  lutego: 1,
  marca: 2,
  kwietnia: 3,
  maja: 4,
  czerwca: 5,
  lipca: 6,
  sierpnia: 7,
  wrzesnia: 8,
  pazdziernika: 9,
  listopada: 10,
  grudnia: 11,
};

// Sprint 192 (F3B-S2RF) — `(?!\d)` added directly after the year group: a
// review found the un-anchored `(\d{4})` could partially match the first
// four digits of a longer digit run (e.g. a typo'd 5-digit year, or a
// reference number sharing this shape) instead of requiring the year to
// end exactly where the text says it does. Purely additive — inserted
// immediately after the existing capture, nothing else in this line
// changed, so every previously-valid named-month case still matches
// exactly as before.
const START_DATE_RE = new RegExp(
  `\\b(\\d{1,2})\\s+(${MONTHS_PL})\\b[^\\d]{0,10}(\\d{4})(?!\\d)(?:[^\\d]{0,20}godz\\.?\\s*(\\d{1,2})(?:[:.](\\d{2}))?)?`,
  "i"
);

// Sprint 192 (F3B-S2R/F3B-S2RF) — numeric Polish date format, the second
// real form official municipal notices actually use alongside the
// named-month one above (e.g. pruszkow.pl: "10.08.2026 r., godz. 7:00").
// D.M.RRRR or DD.MM.RRRR (either half may be one or two digits — a real
// notice is not guaranteed to zero-pad). Deliberately dot-separated only —
// a slash-separated M/D/YYYY (US-style) string never matches this pattern
// at all, so no format this function accepts is ever ambiguous between
// D/M and M/D.
//
// This regex matches ONLY the date itself plus its literal Polish suffix
// (optional "r"/"r." and/or a comma, in any of the combinations real
// notices use, with any amount of surrounding whitespace) — deliberately
// NOT the time clause. `(?!\d)` after the year rejects a longer digit run
// (e.g. "10.08.20260", "10.08.20261234") for the same reason as the
// named-month regex above. `[\s,]*` (not `[^\d]{0,N}`) is intentionally
// narrow: it accepts only whitespace and commas around "r."/"r", never an
// arbitrary word or stray separator, so the suffix can't accidentally
// swallow unrelated text on its way to a "godz." clause that isn't really
// there.
const NUMERIC_DATE_PREFIX_RE = /\b(\d{1,2})\.(\d{1,2})\.(\d{4})(?!\d)[\s,]*r?\.?[\s,]*/i;

// Matches the literal "godz."/"od godz." keyword, anchored (via `^`) to
// the exact position immediately following NUMERIC_DATE_PREFIX_RE's own
// match — never scans forward into unrelated prose. Its ABSENCE at that
// exact position means "no time clause was written at all" (case 1 below,
// valid — defaults to midnight); its PRESENCE commits the remainder of
// the text to being a complete, well-formed time value or the whole
// candidate must be rejected (cases 2/3 below) — never a silent fallback
// to midnight just because what follows didn't parse.
const NUMERIC_TIME_KEYWORD_RE = /^(?:od\s+)?godz\.?\s*/i;

/** Parses a numeric H[:MM] time value from the text immediately following
 *  a matched "godz."/"od godz." keyword. Returns null for anything that
 *  isn't a complete, well-formed time token — this is what distinguishes
 *  case 2 (present + valid) from case 3 (present + invalid) once
 *  NUMERIC_TIME_KEYWORD_RE has already confirmed the clause exists at
 *  all. Never truncates a multi-digit hour/minute to its first two digits
 *  (`(?!\d)` after each numeric group rejects "123:00" and "07:000"
 *  outright) and never silently drops a malformed minute clause to fall
 *  back to hour-only (a ":"/"." separator, once seen, makes a valid
 *  two-digit minute mandatory — "7:5" is rejected, not reinterpreted as
 *  "7:00"). Range validity (0–23 / 0–59) is intentionally NOT checked
 *  here — that stays the single responsibility of
 *  buildValidatedStartDateIso below, so there is exactly one place in
 *  this module that decides whether an hour/minute value is in range. */
function parseNumericTimeValue(text: string): { hour: number; minute: number } | null {
  const hourMatch = /^(\d{1,2})(?!\d)/.exec(text);
  if (!hourMatch) return null;
  const hour = Number(hourMatch[1]);
  const afterHour = text.slice(hourMatch[0].length);
  if (!/^[:.]/.test(afterHour)) {
    // No minute separator at all — a bare hour is a complete, valid
    // clause (preserves the pre-existing "godz. 7" → 7:00 convention).
    return { hour, minute: 0 };
  }
  // A ":"/"." separator IS present, so a minute value is now REQUIRED —
  // exactly two digits, with no further digit trailing. If it doesn't
  // parse, the whole clause is malformed (case 3), never silently
  // downgraded to "no minute" (case 1's behavior) just because the
  // separator was seen.
  const minuteMatch = /^[:.](\d{2})(?!\d)/.exec(afterHour);
  if (!minuteMatch) return null;
  return { hour, minute: Number(minuteMatch[1]) };
}

/** Shared construction + validation for both date formats above — never
 *  called with a guessed/defaulted day, month, or year, only with values a
 *  regex has already extracted from the text. Returns null for anything
 *  that isn't a real calendar date/time, never a best-effort guess. */
function buildValidatedStartDateIso(
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute: number
): string | null {
  // Explicit range check — Date.UTC silently normalizes an out-of-range
  // hour/minute into the next hour/day (e.g. minute=60 becomes +1 hour,
  // same day) rather than failing, which the day/month/year round-trip
  // check below would then miss entirely. Checked before construction, not
  // inferred from a round-trip, so "godz. 24:00" and "godz. 7:60" are
  // rejected outright rather than silently reinterpreted as valid times.
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  const date = new Date(Date.UTC(year, monthIndex, day, hour, minute));
  if (Number.isNaN(date.getTime())) return null;
  // Sanity check: the constructed date must round-trip to the same
  // day/month/year — Date.UTC silently rolls over an invalid day (e.g.
  // "31 lutego") into the next month instead of failing, so this catches
  // that rather than publishing a nonsensical date.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== monthIndex ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString();
}

/** Returns an ISO datetime for the first recognized Polish date pattern
 *  found — either "D miesiąca RRRR[, od godz. H:MM]" (named month) or
 *  "D.M.RRRR r.[, ][od ]godz. H[:MM]" (numeric) — or null when neither is
 *  present, never a guessed/partial date. Time defaults to 00:00 UTC when
 *  no "godz." clause is present at all (matches this project's existing
 *  convention of a date-only ISO string being valid, e.g. the DW 719
 *  alert's own `starts_at: "2026-07-09 00:00:00+00"`); when a "godz."
 *  clause IS present, it must parse completely and validly or this
 *  function returns null for the whole candidate — never a silent
 *  fallback to midnight for a clause that was written but malformed. The
 *  named-month pattern is tried first and, when it matches, behaves
 *  exactly as before this function gained numeric-date support. */
export function extractStartDateIso(text: string): string | null {
  const wordMatch = START_DATE_RE.exec(text);
  if (wordMatch) {
    const day = Number(wordMatch[1]);
    const monthWord = normalizeForCompare(wordMatch[2]).replace(/\s+/g, "");
    const year = Number(wordMatch[3]);
    const monthIndex = MONTH_INDEX[monthWord];
    if (monthIndex === undefined) return null;
    const hour = wordMatch[4] ? Number(wordMatch[4]) : 0;
    const minute = wordMatch[5] ? Number(wordMatch[5]) : 0;
    return buildValidatedStartDateIso(year, monthIndex, day, hour, minute);
  }

  const dateMatch = NUMERIC_DATE_PREFIX_RE.exec(text);
  if (dateMatch) {
    const day = Number(dateMatch[1]);
    const monthIndex = Number(dateMatch[2]) - 1;
    const year = Number(dateMatch[3]);
    const remainder = text.slice(dateMatch.index + dateMatch[0].length);

    const keywordMatch = NUMERIC_TIME_KEYWORD_RE.exec(remainder);
    if (!keywordMatch) {
      // Case 1: no "godz."/"od godz." clause at all — date-only, valid,
      // defaults to midnight UTC.
      return buildValidatedStartDateIso(year, monthIndex, day, 0, 0);
    }

    const timeValue = parseNumericTimeValue(remainder.slice(keywordMatch[0].length));
    if (!timeValue) {
      // Case 3: the clause is present but malformed — fail the whole
      // candidate closed, never fall back to case 1's midnight default.
      return null;
    }
    // Case 2: a complete, well-formed time clause.
    return buildValidatedStartDateIso(year, monthIndex, day, timeValue.hour, timeValue.minute);
  }

  return null;
}

// ── Place extraction — exact match against the known pilot locality list,
// never a fuzzy/invented location. ──────────────────────────────────────────

export function extractPlace(text: string): string | null {
  for (const locality of PILOT_LOCALITIES) {
    if (text.includes(locality)) return locality;
  }
  return null;
}

// ── Slug (mirrors src/app/builder/page.tsx's own generateSlug() exactly —
// duplicated, not imported, because that file is a Client Component and
// this module must stay server-only/pure; the two are pinned to the same
// output by tests/e2e/trustedSourceAutoPublish.spec.ts). A short id-derived
// suffix is appended so a title collision with an unrelated existing alert
// can never silently overwrite it — this module only ever INSERTs, never
// upserts, so a genuine slug collision fails closed (unique constraint)
// rather than overwriting, but the suffix makes that vanishingly unlikely
// in the first place. ────────────────────────────────────────────────────

const POLISH_SLUG_MAP: Record<string, string> = {
  ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z",
  Ą: "a", Ć: "c", Ę: "e", Ł: "l", Ń: "n", Ó: "o", Ś: "s", Ź: "z", Ż: "z",
};

export function slugifyTitle(title: string): string {
  const slug = title
    .split("")
    .map((c) => POLISH_SLUG_MAP[c] ?? c)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "alert";
}

export function buildAutoPublishSlug(title: string, candidateId: string): string {
  const shortId = candidateId.replace(/-/g, "").slice(0, 8);
  return `${slugifyTitle(title)}-${shortId}`;
}

// ── Category-specific standard "co zrobić" copy — deterministic, never
// invented per-notice, matching the existing manual convention (the real
// DW 719 alert uses exactly the "roads" phrase below verbatim). ───────────

export const STANDARD_ACTION_BY_CATEGORY: Record<AlertCategory, string> = {
  roads: "Zachowaj ostrożność i stosuj się do tymczasowego oznakowania.",
  water: "Przygotuj zapas wody na czas przerwy i sprawdź szczegóły w oficjalnym komunikacie.",
  power: "Sprawdź szczegóły w oficjalnym komunikacie i przygotuj się na czasowy brak zasilania.",
  waste: "Sprawdź zaktualizowany harmonogram i przygotuj pojemniki zgodnie z komunikatem.",
  transport: "Sprawdź aktualny rozkład jazdy przed podróżą.",
  municipal: "Sprawdź szczegóły w oficjalnym komunikacie urzędu.",
};

// ── Eligibility evaluation — the single fail-closed gate ─────────────────────

const MIN_TITLE_LENGTH = 10;
const MIN_TEXT_LENGTH = 40;
/** How far into the past a notice's own start date may already be and
 *  still count as "current" — covers a notice whose effective date has
 *  just passed but is still practically relevant (e.g. checked hours
 *  after the stated start time), without accepting something genuinely
 *  stale. */
const PAST_GRACE_MS = 24 * 60 * 60 * 1000;

/** Re-exported for callers of this module — the canonical definition lives
 *  in scheduledWriter.ts (see PendingAutoPublishCandidateRow) so the
 *  writer interface never needs to import from this feature module. */
export type AutoPublishCandidateInput = PendingAutoPublishCandidateRow;

export interface AutoPublishAlertFields {
  slug: string;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  place: string;
  startsAt: string;
  change: string;
  action: string;
  sourceName: string;
  sourceUrl: string;
}

export type AutoPublishEligibility =
  | { eligible: true; fields: AutoPublishAlertFields }
  | { eligible: false; reason: AutoPublishIneligibleReason };

export type AutoPublishIneligibleReason =
  | "not_pending_or_already_converted"
  | "source_not_on_auto_publish_allowlist"
  | "missing_or_unsafe_candidate_url"
  | "blocked_synthetic_content"
  | "duplicate"
  | "ambiguous"
  | "category_not_detected"
  | "place_not_detected"
  | "start_date_not_detected"
  | "notice_expired"
  | "title_missing_or_too_short"
  | "text_too_short"
  | "missing_source_url"
  | "missing_source_name";

/** The single fail-closed gate every auto-publish decision goes through.
 *  Every check is independent and short-circuits on first failure — no
 *  check is ever skipped because an earlier one passed, and no field is
 *  ever populated with a fallback/guessed value. `existingItems` must be a
 *  FRESH read (candidates + alerts) — same requirement
 *  writeCandidatesForSource already has for its own dedup pool, so callers
 *  reuse the same `findExistingAlertComparisons`/`findExistingCandidateTexts`
 *  writer methods, not a second implementation. */
export function evaluateAutoPublishEligibility(
  candidate: AutoPublishCandidateInput,
  existingItems: DedupComparisonItem[],
  now: Date = new Date()
): AutoPublishEligibility {
  if (candidate.status !== "pending" || candidate.convertedAlertId !== null) {
    return { eligible: false, reason: "not_pending_or_already_converted" };
  }
  if (!getAutoPublishSourceIds().includes(candidate.sourceKey)) {
    return { eligible: false, reason: "source_not_on_auto_publish_allowlist" };
  }
  if (!isDirectSafePermalink(candidate.candidateUrl)) {
    return { eligible: false, reason: "missing_or_unsafe_candidate_url" };
  }

  // Sprint 191 — checked before dedup/category/date extraction so a
  // synthetic candidate never reaches (and never risks matching) any
  // later step; fail-closed by construction, same as every other check in
  // this function (see testContentGuard.ts for why this is a separate,
  // narrower list than the human-facing testContentDetection.ts warning).
  if (isSyntheticAutomationContent({ title: candidate.title ?? "", text: candidate.text })) {
    return { eligible: false, reason: "blocked_synthetic_content" };
  }

  const classification = classifyProposalAgainstExisting(
    { text: candidate.text, url: candidate.candidateUrl ?? undefined },
    existingItems
  );
  if (classification === "duplicate") return { eligible: false, reason: "duplicate" };
  if (classification === "ambiguous") return { eligible: false, reason: "ambiguous" };

  const category = detectCandidateCategory(candidate.text);
  if (!category) return { eligible: false, reason: "category_not_detected" };

  const place = extractPlace(candidate.text);
  if (!place) return { eligible: false, reason: "place_not_detected" };

  const startsAt = extractStartDateIso(candidate.text);
  if (!startsAt) return { eligible: false, reason: "start_date_not_detected" };
  if (new Date(startsAt).getTime() < now.getTime() - PAST_GRACE_MS) {
    return { eligible: false, reason: "notice_expired" };
  }

  const title = candidate.title?.trim() ?? "";
  if (title.length < MIN_TITLE_LENGTH) {
    return { eligible: false, reason: "title_missing_or_too_short" };
  }

  const change = candidate.text?.trim() ?? "";
  if (change.length < MIN_TEXT_LENGTH) {
    return { eligible: false, reason: "text_too_short" };
  }

  if (!candidate.sourceUrl?.trim()) {
    return { eligible: false, reason: "missing_source_url" };
  }

  // Sprint 180D — same "no blank required field, ever" guarantee as the
  // title/text/source_url checks just above, closing the one field that
  // was previously passed through unchecked: an empty/whitespace-only
  // sourceName would otherwise reach buildAutoPublishAlertInsert and only
  // then be rejected by the RLS WITH CHECK clause (source_name is not
  // null and length(trim(source_name)) > 0) — this makes the same
  // guarantee explicit and fail-closed at the application layer too,
  // instead of relying solely on the database as the backstop.
  const sourceName = candidate.sourceName?.trim() ?? "";
  if (!sourceName) {
    return { eligible: false, reason: "missing_source_name" };
  }

  return {
    eligible: true,
    fields: {
      slug: buildAutoPublishSlug(title, candidate.id),
      category,
      severity: "info",
      title,
      place,
      startsAt,
      change,
      action: STANDARD_ACTION_BY_CATEGORY[category],
      sourceName,
      sourceUrl: candidate.sourceUrl,
    },
  };
}

// ── Insert payload builder — mirrors buildPendingCandidateInsert's own
// "only known-safe fields can ever be passed" shape: status/published_at
// are never parameters here, always the same literal values. ─────────────

export function buildAutoPublishAlertInsert(fields: AutoPublishAlertFields): AutoPublishAlertInsertPayload {
  return {
    slug: fields.slug,
    category: fields.category,
    severity: fields.severity,
    title: fields.title,
    place: fields.place,
    starts_at: fields.startsAt,
    change: fields.change,
    action: fields.action,
    source_name: fields.sourceName,
    source_url: fields.sourceUrl,
    source_id: null,
    status: "published",
    published_at: new Date().toISOString(),
  } as const;
}

// ── Orchestration — the only place all the pieces above are wired
// together, and the only place any actual write happens. ─────────────────

export type AutoPublishOutcomeStatus =
  | "published"
  | "no_eligible_candidate"
  | "insert_failed"
  | "mark_converted_failed";

export interface AutoPublishOutcome {
  status: AutoPublishOutcomeStatus;
  candidateId?: string;
  alertId?: string;
  /** Present for every candidate considered but not published this run —
   *  never silently swallowed, matching this project's "never silently
   *  resolve an uncertain case" convention. */
  skipped: Array<{ candidateId: string; reason: AutoPublishIneligibleReason }>;
}

/** Considers pending candidates from the auto-publish-allowlisted sources,
 *  oldest first, and publishes AT MOST ONE of them per call (cap = 1,
 *  matching write-candidates' own per-invocation cap philosophy) — the
 *  first one `evaluateAutoPublishEligibility` accepts, using a FRESH read
 *  of the comparison pool for every candidate considered (never a stale
 *  snapshot reused across candidates in the same run, since an earlier
 *  candidate in this same loop — if ever published — must immediately
 *  count as "existing" for the next one).
 *
 *  Idempotent by construction: if `markCandidateAutoPublished` fails after
 *  `insertPublishedAlert` already succeeded, the candidate is left
 *  `pending` with `converted_alert_id` still null — but the alert it now
 *  points to (via `source_url` = the candidate's own `candidate_url`) is
 *  already `published`. Any SUBSEQUENT call re-evaluates this same
 *  candidate, and `classifyProposalAgainstExisting`'s exact-URL check
 *  against the freshly-read alert list catches it as a `duplicate` before
 *  ever attempting a second insert — no code here needs to special-case
 *  "already published, awaiting a converted_alert_id retry" for
 *  correctness, only for a slightly stale candidate.status.
 *
 *  A writer missing any of the three Sprint 180C methods (older/test
 *  fakes, or the not-yet-migrated real writer) degrades to
 *  "no_eligible_candidate" with an empty skip list — never a crash. */
export async function runTrustedSourceAutoPublish(
  writer: ScheduledSourceWriter,
  now: Date = new Date()
): Promise<AutoPublishOutcome> {
  const skipped: AutoPublishOutcome["skipped"] = [];

  if (
    !writer.findPendingAutoPublishCandidates ||
    !writer.insertPublishedAlert ||
    !writer.markCandidateAutoPublished
  ) {
    return { status: "no_eligible_candidate", skipped };
  }

  const sourceIds = getAutoPublishSourceIds();
  const candidates = await writer.findPendingAutoPublishCandidates(sourceIds);
  // getMaxAutoPublishPerInvocation() can only ever make this MORE
  // conservative (0 disables entirely) — the loop below structurally
  // returns after the first successful publish regardless of the
  // configured value, so this call is never a way to raise the cap above
  // the hard-coded "at most one publish per invocation" this function
  // implements by construction.
  if (getMaxAutoPublishPerInvocation() <= 0) return { status: "no_eligible_candidate", skipped };

  for (const candidate of candidates) {
    // Sprint 180C fix — excludeCandidateId=candidate.id: this candidate
    // ALREADY EXISTS as a row in source_notice_candidates (unlike
    // writeCandidatesForSource's own use of this same method, which
    // checks a proposal that isn't in the table yet), so without this
    // exclusion the pool always contains — and trivially self-matches —
    // the very candidate being evaluated. Confirmed against real
    // Production data 2026-07-28: both canary candidates were wrongly
    // classified "duplicate" against themselves before this fix.
    const existingTexts = writer.findExistingCandidateTexts
      ? await writer.findExistingCandidateTexts(candidate.sourceKey, null, candidate.id)
      : [];
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

    const eligibility = evaluateAutoPublishEligibility(candidate, existingItems, now);
    if (!eligibility.eligible) {
      skipped.push({ candidateId: candidate.id, reason: eligibility.reason });
      continue;
    }

    const insertResult = await writer.insertPublishedAlert(buildAutoPublishAlertInsert(eligibility.fields));
    if (!insertResult.ok) {
      return { status: "insert_failed", candidateId: candidate.id, skipped };
    }

    const markResult = await writer.markCandidateAutoPublished(candidate.id, insertResult.id);
    if (!markResult.ok) {
      // The alert is already published (see the idempotency note in this
      // function's own doc comment above) — this is reported distinctly
      // so an operator can manually reconcile the candidate row, but it is
      // NOT a failure that leaves anything partially published: the alert
      // insert already fully succeeded.
      return {
        status: "mark_converted_failed",
        candidateId: candidate.id,
        alertId: insertResult.id,
        skipped,
      };
    }

    return { status: "published", candidateId: candidate.id, alertId: insertResult.id, skipped };
  }

  return { status: "no_eligible_candidate", skipped };
}
