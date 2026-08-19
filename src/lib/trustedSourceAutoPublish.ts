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
//
// Sprint 192 (F3B-S2TZF) — this regex now matches ONLY the date itself
// (day + named month + year), never the time clause — mirrors
// NUMERIC_DATE_PREFIX_RE's own split below exactly, for the same reason:
// a review found the old single-regex "date + optional time" shape let a
// malformed time clause (e.g. "godz. 123:00", "godz. 7:5") silently match
// only its first, plausible-looking digits and leave the rest
// unconsumed, instead of failing the whole candidate closed. Splitting
// date-matching from time-matching lets both formats share ONE explicit
// time-clause parser (parseExplicitTimeValue below) with the same
// fail-closed guarantee, rather than the time clause living inside an
// easily-partially-matchable optional regex group.
const START_DATE_PREFIX_RE = new RegExp(
  `\\b(\\d{1,2})\\s+(${MONTHS_PL})\\b[^\\d]{0,10}(\\d{4})(?!\\d)`,
  "i"
);

// Matches the literal "godz." keyword for the NAMED-MONTH format,
// anchored (via `^`) to the exact position immediately following
// START_DATE_PREFIX_RE's own match — mirrors NUMERIC_TIME_KEYWORD_RE's
// role exactly (its absence means "no time clause at all"; its presence
// commits the remainder to parseExplicitTimeValue below). The `[^\d]{0,20}`
// gap (rather than numeric's narrower `[\s,]*r?\.?[\s,]*`) preserves this
// format's own, pre-existing tolerance for the punctuation/words real
// named-month notices use between the year and "godz." (e.g. "r.", "r.,",
// "r. od ") — unchanged from the original single-regex version, just now
// factored out as an independently testable step.
//
// Sprint 192 (F3B-S2TZB) — `(?:godz\.?|godzina)(?!POLISH_LETTER)` added: a
// review found the bare `godz\.?` alternative, with no boundary after it,
// could match as a mere PREFIX of a longer, unrelated word — "godzina",
// "godziny", "godzinach", "pogodzenie", "uzgodzenie" all contain the
// literal substring "godz" and would otherwise be misdetected as the
// start of a time clause. The negative lookahead
// `POLISH_LETTER_LOOKAHEAD` (a-z/A-Z plus Polish diacritics) requires
// that nothing letter-like immediately follows either alternative:
//   - "godz\.?" alone fails the lookahead against "godzina" (next char
//     "i" is a letter) — falls through to the second alternative.
//   - "godzina" (the exact, standalone word — optional support per this
//     sprint's brief) matches "godzina" but fails the lookahead against
//     "godziny"/"godzinach"/"godzinami" (all share the same first 7
//     letters "godzina" but continue with more letters: "y", "ch", "mi")
//     — so only the bare, standalone word "godzina" is ever recognized,
//     never its inflected forms.
// This never changes what happens once a genuine keyword IS recognized —
// only whether one is recognized at all.
//
// Sprint 192 (F3B-S2TZC) — `POLISH_LETTER_LOOKBEHIND` added directly
// before the alternation: a review found the RIGHT-boundary lookahead
// alone was not enough — the `[^\d]{0,20}` gap has no LEFT-boundary
// check, so it could backtrack past letters of an unrelated preceding
// word right up to a "godz"/"godzina" substring embedded inside it (e.g.
// "xgodz.", "pogodz.", "uzgodz.", "abcgodzina" all contain the literal
// substring and were previously misdetected as genuine keywords, not
// safely rejected). The lookbehind requires that nothing letter-like
// immediately PRECEDES the keyword either — so it can now only ever
// match when preceded by a true word boundary (start of string,
// whitespace, digit, or punctuation), never mid-word.
const POLISH_LETTER_CLASS = "a-ząćęłńóśźżA-ZĄĆĘŁŃÓŚŹŻ";
const POLISH_LETTER_LOOKAHEAD = `(?![${POLISH_LETTER_CLASS}])`;
const POLISH_LETTER_LOOKBEHIND = `(?<![${POLISH_LETTER_CLASS}])`;
const WORD_TIME_KEYWORD_RE = new RegExp(
  `^[^\\d]{0,20}${POLISH_LETTER_LOOKBEHIND}(?:godz\\.?|godzina)${POLISH_LETTER_LOOKAHEAD}\\s*`,
  "i"
);

// Sprint 193 (F3B-XWATER-PARSE) — a SECOND, narrower named-month keyword
// regex for the one additional real-world clause shape this sprint adds:
// "20 sierpnia 2026 roku tj. czwartek, w godzinach od 9:00 do 12:00"
// (verified live: wodociagimichalowice.pl, 2026-08-18 notice). Deliberately
// NOT a change to WORD_TIME_KEYWORD_RE above and deliberately NOT a wider
// `[^\d]{0,N}` scan — "godzinach" (locative/plural) is a real Polish word
// this module must never treat as a bare "godz."/"godzina" keyword (see
// WORD_TIME_KEYWORD_RE's own boundary comment), so this is an explicit,
// fully-enumerated optional-token grammar anchored at the exact position
// immediately after the date match, matching ONLY this literal clause
// shape and nothing broader:
//   (optional "r."/"roku") (optional "tj. <polski dzień tygodnia>")
//   (optional ",") "w godzinach od "
// Every piece but the final "w godzinach od" is optional — so it also
// matches the bare "20 sierpnia 2026, w godzinach od 9:00 ..." and
// "20 sierpnia 2026 r., w godzinach od 9:00 ..." variants — but the
// grammar never skips arbitrary text: an unlisted weekday, or any word
// other than "roku"/"r." before "tj.", or anything after "od" but a time
// token, simply fails to match, falling through to the SAME "no time
// clause" (date-only, midnight) semantics as before this sprint. This is
// why "w godzinach porannych", "przez kilka godzin", and "godziny pracy
// urzędu" (none of which contain "w godzinach od ") can never match this
// regex or WORD_TIME_KEYWORD_RE above — neither is a scan, both are
// anchored, explicit grammars.
const POLISH_WEEKDAYS_RE = "poniedziałek|wtorek|środa|czwartek|piątek|sobota|niedziela";
const WORD_RANGE_TIME_KEYWORD_RE = new RegExp(
  `^\\s*(?:r\\.|roku)?\\s*(?:tj\\.\\s*(?:${POLISH_WEEKDAYS_RE})\\s*)?,?\\s*w\\s+godzinach\\s+od\\s+`,
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
//
// Sprint 192 (F3B-S2TZB/F3B-S2TZC) — same `(?:godz\.?|godzina)` +
// POLISH_LETTER_LOOKAHEAD/LOOKBEHIND boundary as WORD_TIME_KEYWORD_RE
// above, for the identical reason (both formats must apply the same
// keyword-boundary rule — see that regex's own comment for the full
// explanation). The lookbehind is a no-op here in practice (this regex
// is `^`-anchored with no gap-skipping ahead of it, so "godz"/"godzina"
// can only ever start at position 0 or right after `od\s+`, both of
// which already guarantee a non-letter precedes) — added anyway for
// structural symmetry between the two formats' keyword regexes, not
// because a left-boundary bug was ever found here.
const NUMERIC_TIME_KEYWORD_RE = new RegExp(
  `^(?:od\\s+)?${POLISH_LETTER_LOOKBEHIND}(?:godz\\.?|godzina)${POLISH_LETTER_LOOKAHEAD}\\s*`,
  "i"
);

// Sprint 193 (F3B-XWATER-PARSE) — numeric-format parity with
// WORD_RANGE_TIME_KEYWORD_RE above, for "20.08.2026 r., w godzinach od
// 9:00 do 12:00". Simpler than its named-month counterpart because
// NUMERIC_DATE_PREFIX_RE already consumes the trailing "r."/comma/
// whitespace suffix itself (see that regex's own comment) — nothing
// optional needs re-matching here, just the literal, anchored "w
// godzinach od " clause opener.
const NUMERIC_RANGE_TIME_KEYWORD_RE = /^w\s+godzinach\s+od\s+/i;

/** Parses a numeric H[:MM] time value from the text immediately following
 *  a matched "godz."/"od godz." keyword — SHARED by both the numeric and
 *  named-month date formats (Sprint 192 / F3B-S2TZF: was
 *  parseNumericTimeValue, numeric-only, until a review found the
 *  named-month regex's own inline time group had the identical
 *  partial-match gap this function was already written to close).
 *  Returns null for anything that isn't a complete, well-formed time
 *  token — this is what distinguishes case 2 (present + valid) from case
 *  3 (present + invalid) once a caller's own keyword regex
 *  (NUMERIC_TIME_KEYWORD_RE or WORD_TIME_KEYWORD_RE) has already
 *  confirmed the clause exists at all. Never truncates a multi-digit
 *  hour/minute to its first two digits (`(?!\d)` after each numeric group
 *  rejects "123:00" and "07:000" outright) and never silently drops a
 *  malformed minute clause to fall back to hour-only (a ":"/"."
 *  separator, once seen, makes a valid two-digit minute mandatory —
 *  "7:5" is rejected, not reinterpreted as "7:00"). Range validity
 *  (0–23 / 0–59) is intentionally NOT checked here — that stays the
 *  single responsibility of buildValidatedStartDateIso below, so there is
 *  exactly one place in this module that decides whether an hour/minute
 *  value is in range. */
// Sprint 192 (F3B-S2TZB) — characters allowed to immediately follow a
// fully-parsed hour[:minute] token: end of string, whitespace, or
// ordinary punctuation that separates/ends a clause (comma, period,
// semicolon, exclamation/question mark, closing parenthesis, hyphen or
// en dash for a range like "7:00–15:00"). A review found the token
// parser accepted a plausible-looking hour/minute and then silently
// ignored whatever came directly after it — this is the single place
// that closes that gap for both the bare-hour and hour:minute paths
// below. Digits and letters are deliberately absent from this set —
// those are exactly what "7abc" and "7:00abc" glue on.
//
// Sprint 192 (F3B-S2TZC) — checking only THIS first character was not
// enough: a review found "7:00.30", "7:00,30", "7:00;30", "7:00!30",
// "7:00?30", "7:00)30" all slipped through, because `.`/`,`/`;`/`!`/`?`/`)`
// were unconditionally accepted as a boundary without checking whether a
// digit immediately followed THEM too — i.e. the punctuation was real,
// but it was itself glued to a further digit run rather than genuinely
// ending the clause. `PLAIN_ENDING_PUNCTUATION` below is exactly that
// six-character set, checked separately from whitespace and from the
// dash/en-dash case (which has its own, different rule — see
// looksLikeCompleteSecondTimeToken).
const PLAIN_ENDING_PUNCTUATION_RE = /^[,.;!?)]/;
// A hyphen/en-dash right after the token is only ever a genuine range
// introducer ("7:00-15:00") — never a legitimate way to continue with
// unrelated prose starting in a digit. When NOT followed by a digit at
// all (space, letter, end of string), the dash is ordinary punctuation
// and always accepted, same as the plain set above.
const RANGE_DASH_RE = /^[\-–]/;

/** True when `text` begins with a COMPLETE second `H[:MM]` time token —
 *  used only to decide whether a dash immediately followed by a digit is
 *  a genuine range ("7:00-15:00") or a malformed digit tail
 *  ("7:00-30"). Deliberately requires the separator + two-digit minute
 *  (a bare second hour, e.g. "-15" alone, does NOT count as "complete"
 *  here — that's indistinguishable from the malformed "-30" case this
 *  function exists to reject) and does not parse or return the second
 *  hour/minute value itself — this module never needs `ends_at` from
 *  auto-publish, only confirms the FIRST token isn't part of a
 *  zniekształcony ciąg. */
function looksLikeCompleteSecondTimeToken(text: string): boolean {
  const hourMatch = /^(\d{1,2})(?!\d)/.exec(text);
  if (!hourMatch) return false;
  const afterHour = text.slice(hourMatch[0].length);
  if (!/^[:.]/.test(afterHour)) return false;
  const minuteMatch = /^(\d{2})(?!\d)/.exec(afterHour.slice(1));
  if (!minuteMatch) return false;
  const afterMinute = afterHour.slice(1 + minuteMatch[0].length);
  return afterMinute.length === 0 || !new RegExp(`^[${POLISH_LETTER_CLASS}\\d]`).test(afterMinute);
}

function hasValidTimeTokenBoundary(remainder: string): boolean {
  if (remainder.length === 0) return true;
  if (/^\s/.test(remainder)) return true;
  if (PLAIN_ENDING_PUNCTUATION_RE.test(remainder)) {
    // Real boundary punctuation, but only genuinely a boundary when it
    // isn't itself immediately followed by a digit — "7:00." is fine,
    // "7:00.30" is not.
    return !/^\d/.test(remainder.slice(1));
  }
  if (RANGE_DASH_RE.test(remainder)) {
    const afterDash = remainder.slice(1);
    if (!/^\d/.test(afterDash)) return true;
    return looksLikeCompleteSecondTimeToken(afterDash);
  }
  return false;
}

function parseExplicitTimeValue(text: string): { hour: number; minute: number } | null {
  const hourMatch = /^(\d{1,2})(?!\d)/.exec(text);
  if (!hourMatch) return null;
  const hour = Number(hourMatch[1]);
  const afterHour = text.slice(hourMatch[0].length);

  if (!/^[:.]/.test(afterHour)) {
    // No minute separator at all — a bare hour is a complete, valid
    // clause (preserves the pre-existing "godz. 7" → 7:00 convention),
    // but only when it's immediately followed by a genuine token
    // boundary — never glued directly to a letter ("7abc").
    if (!hasValidTimeTokenBoundary(afterHour)) return null;
    return { hour, minute: 0 };
  }

  const separator = afterHour[0];
  const rest = afterHour.slice(1);

  if (separator === ".") {
    // Sprint 192 (F3B-S2TZB) — the dot is genuinely ambiguous in Polish
    // notice text: it can be a minute separator ("godz. 7.30" → 7:30) OR
    // ordinary sentence-ending punctuation after a bare hour
    // ("godz. 7." → 7:00, full stop). Resolved by what follows the dot:
    //   - exactly two digits with a valid boundary after them → minute.
    //   - anything else that LOOKS like an attempted minute (starts with
    //     a digit, or with another "." or ":") → malformed, null. This
    //     is what rejects "7.3", "7.300", and "7..30" — never silently
    //     reinterpreted as "7:00".
    //   - a genuine non-digit, non-separator boundary (whitespace, other
    //     punctuation, or end of string) → the dot was just punctuation;
    //     bare hour.
    const minuteMatch = /^(\d{2})(?!\d)/.exec(rest);
    if (minuteMatch) {
      const afterMinute = rest.slice(minuteMatch[0].length);
      if (!hasValidTimeTokenBoundary(afterMinute)) return null;
      return { hour, minute: Number(minuteMatch[1]) };
    }
    if (/^[\d:.]/.test(rest)) return null;
    if (!hasValidTimeTokenBoundary(rest)) return null;
    return { hour, minute: 0 };
  }

  // separator === ":" — always a minute separator, never punctuation (a
  // bare colon is never how a real notice ends a sentence); a valid
  // two-digit minute is mandatory, and — same as the bare-hour and dot
  // paths above — must be followed by a genuine token boundary, never
  // glued directly to more digits/letters/separators ("7:00abc",
  // "7:00:30"). If it doesn't parse, the whole clause is malformed (case
  // 3), never silently downgraded to "no minute" (case 1's behavior)
  // just because the separator was seen.
  const minuteMatch = /^(\d{2})(?!\d)/.exec(rest);
  if (!minuteMatch) return null;
  const afterMinute = rest.slice(minuteMatch[0].length);
  if (!hasValidTimeTokenBoundary(afterMinute)) return null;
  return { hour, minute: Number(minuteMatch[1]) };
}

// Sprint 192 (F3B-S2TZR) — Warsaw local time → UTC conversion for an
// EXPLICIT "godz." clause. Product decision (F3B-S2TZP audit, confirmed by
// Adam): an official Polish notice's stated hour means Europe/Warsaw local
// time, not literal UTC — the public UI (formatAlertDate.ts, untouched by
// this change) already converts a stored `starts_at` to Europe/Warsaw for
// display, so storing anything other than the true UTC instant of that
// local hour would show residents the wrong clock time (confirmed
// 2-hour-wrong for the real 10.08.2026 r., godz. 7:00 pruszkow.pl notice
// before this fix). A date WITHOUT an explicit "godz." clause keeps its
// pre-existing, separate semantics unchanged — see buildValidatedStartDateIso
// below, which is the only place this distinction is actually made.
const WARSAW_TZ = "Europe/Warsaw";

// Sprint 192 (F3B-S2TZF) — a deliberate, product-level operational-year
// boundary, not a technical workaround grafted on after the fact.
// Alertownik parses dates for CURRENT and NEAR-FUTURE operational alerts
// only — it is not, and is never meant to become, a historical-date
// parser. This single bound closes two real gaps a review found:
//   1. `Date.UTC(year, ...)` for `year` 0–99 is specially remapped by the
//      JS spec to 1900–1999 (e.g. `Date.UTC(50, ...)` means 1950, never
//      year 50) — a 4-digit year string like "0050" would otherwise
//      silently produce a semantically wrong, non-null result instead of
//      being rejected.
//   2. Europe/Warsaw used non-integer-hour and otherwise-irregular UTC
//      offsets before it settled into the modern CET/CEST pattern this
//      module's WARSAW_OFFSET_HOURS_CANDIDATES assumes — this bound never
//      lets a request reach warsawLocalToUtcIso for a year where that
//      assumption might not hold.
// Both bounds are inclusive and are literal constants — never derived
// from `new Date().getFullYear()` or any other runtime clock, so this
// check's behavior never silently drifts as real time passes.
const MIN_SUPPORTED_ALERT_YEAR = 2000;
const MAX_SUPPORTED_ALERT_YEAR = 2100;

// Poland's Europe/Warsaw timezone has used exactly two standard offsets
// under the current (post-1996, still-in-force) EU DST rule: UTC+1 (CET,
// winter) and UTC+2 (CEST, summer) — never any other value, and never a
// half-hour offset. This is therefore a bounded, exhaustive 2-element
// candidate set, not a search: warsawLocalToUtcIso below tests both and
// only both, never loops over minutes/hours/days. Every real notice this
// module will ever see falls inside this regime.
const WARSAW_OFFSET_HOURS_CANDIDATES = [1, 2] as const;

interface WarsawLocalParts {
  year: number;
  monthIndex: number;
  day: number;
  hour: number;
  minute: number;
}

/** Reads the Europe/Warsaw wall-clock parts of a UTC instant. Pure and
 *  deterministic — `Intl.DateTimeFormat`'s `timeZone` option is always
 *  honored regardless of the host runtime's own default timezone, so this
 *  never depends on the system/server's configured timezone. Never uses
 *  `Date.parse` — reads structured parts via `formatToParts`, not a
 *  re-parsed string.
 *
 *  Sprint 192 (F3B-S2TZF) — `calendar`/`numberingSystem` made EXPLICIT
 *  (were previously implicit via the `"en-US"` locale's own defaults,
 *  which already resolve to exactly these values — this is defense in
 *  depth, not a behavior change): `calendar: "gregory"` guarantees the
 *  year/month/day fields this function reads are never silently
 *  interpreted against a different calendar system, and
 *  `numberingSystem: "latn"` guarantees ASCII digits, since `get()` below
 *  feeds the formatted value straight into `Number()`, which cannot
 *  parse non-ASCII digit forms. `hourCycle: "h23"` (unchanged) guarantees
 *  midnight is read back as `00`, never `24`. */
function getWarsawParts(utcInstant: Date): WarsawLocalParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: WARSAW_TZ,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(utcInstant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get("year"),
    monthIndex: get("month") - 1,
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/** Converts Europe/Warsaw local wall-clock parts to the single UTC instant
 *  that displays back as exactly those parts — or null when zero or more
 *  than one such instant exists (the two DST-transition edge cases this
 *  function must fail closed on, never guess):
 *
 *   - Spring-forward gap (e.g. Poland 2026-03-29: clocks jump from 02:00
 *     CET straight to 03:00 CEST) — a local time inside 02:00–02:59 on
 *     that date names NO real instant. Neither of the two candidate
 *     offsets round-trips back to the input → zero matches → null.
 *   - Autumn-back overlap (e.g. Poland 2026-10-25: clocks fall from 03:00
 *     CEST back to 02:00 CET) — a local time inside 02:00–02:59 on that
 *     date names TWO real, genuinely different instants (one CEST, one an
 *     hour later CET). BOTH candidate offsets round-trip back to the
 *     input, as two distinct UTC instants → null, never silently picking
 *     the earlier or later one.
 *   - Any ordinary hour: EXACTLY ONE of the two candidate offsets
 *     round-trips → that single instant is returned. */
function warsawLocalToUtcIso(parts: WarsawLocalParts): string | null {
  const matchedInstants: number[] = [];
  for (const offsetHours of WARSAW_OFFSET_HOURS_CANDIDATES) {
    const candidateMs =
      Date.UTC(parts.year, parts.monthIndex, parts.day, parts.hour, parts.minute) - offsetHours * 60 * 60 * 1000;
    if (Number.isNaN(candidateMs)) continue;
    const roundTrip = getWarsawParts(new Date(candidateMs));
    const matches =
      roundTrip.year === parts.year &&
      roundTrip.monthIndex === parts.monthIndex &&
      roundTrip.day === parts.day &&
      roundTrip.hour === parts.hour &&
      roundTrip.minute === parts.minute;
    // De-duplicate by instant, not by offset — two 1h-apart offsets can
    // never legitimately produce the same instant, but this keeps the
    // "exactly one real instant" count correct by construction rather
    // than by assuming the two candidate offsets are always distinct.
    if (matches && !matchedInstants.includes(candidateMs)) {
      matchedInstants.push(candidateMs);
    }
  }
  if (matchedInstants.length !== 1) return null;
  return new Date(matchedInstants[0]).toISOString();
}

/** Shared construction + validation for both date formats above — never
 *  called with a guessed/defaulted day, month, or year, only with values a
 *  regex has already extracted from the text. Returns null for anything
 *  that isn't a real calendar date/time, never a best-effort guess.
 *
 *  `hasExplicitTime` distinguishes the two genuinely different semantics
 *  this module needs (Sprint 192 / F3B-S2TZR):
 *   - false (no "godz." clause was written at all): `hour`/`minute` are
 *     always 0 here, and the result is literal UTC midnight — UNCHANGED
 *     from this function's pre-existing behavior, never Warsaw-converted.
 *     This is the project's existing, separate "all-day alert" semantics
 *     (matches the Builder's own date-only convention) — a date with no
 *     stated hour has no real moment to convert in the first place.
 *   - true (a "godz."/"od godz." clause WAS written and parsed validly):
 *     `hour`/`minute` are Europe/Warsaw local wall-clock time, per the
 *     product decision confirmed in F3B-S2TZP/F3B-S2TZR — converted to
 *     the true matching UTC instant via warsawLocalToUtcIso, including
 *     failing closed (null) for a DST-nonexistent or DST-ambiguous local
 *     time. */
function buildValidatedStartDateIso(
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute: number,
  hasExplicitTime: boolean
): string | null {
  // Sprint 192 (F3B-S2TZF) — operational-year boundary, checked first
  // (cheapest, and independent of hour/minute/hasExplicitTime) and for
  // BOTH formats via this single shared function — see
  // MIN_SUPPORTED_ALERT_YEAR's own doc comment above for why.
  if (year < MIN_SUPPORTED_ALERT_YEAR || year > MAX_SUPPORTED_ALERT_YEAR) return null;

  // Explicit range check — Date.UTC silently normalizes an out-of-range
  // hour/minute into the next hour/day (e.g. minute=60 becomes +1 hour,
  // same day) rather than failing, which a round-trip check would then
  // miss entirely. Checked before any construction, not inferred from a
  // round-trip, so "godz. 24:00" and "godz. 7:60" are rejected outright
  // rather than silently reinterpreted as valid times.
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  if (!hasExplicitTime) {
    const date = new Date(Date.UTC(year, monthIndex, day, hour, minute));
    if (Number.isNaN(date.getTime())) return null;
    // Sanity check: the constructed date must round-trip to the same
    // day/month/year — Date.UTC silently rolls over an invalid day (e.g.
    // "31 lutego") into the next month instead of failing, so this
    // catches that rather than publishing a nonsensical date.
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== monthIndex ||
      date.getUTCDate() !== day
    ) {
      return null;
    }
    return date.toISOString();
  }

  // Explicit time: first confirm the CALENDAR date itself is real,
  // independent of any clock time or timezone ("31 lutego" is invalid no
  // matter what hour is attached to it) — same literal round-trip check
  // as the no-explicit-time path above, evaluated at local midnight so a
  // DST transition can never influence whether the DATE itself is valid.
  const calendarCheck = new Date(Date.UTC(year, monthIndex, day, 0, 0));
  if (
    Number.isNaN(calendarCheck.getTime()) ||
    calendarCheck.getUTCFullYear() !== year ||
    calendarCheck.getUTCMonth() !== monthIndex ||
    calendarCheck.getUTCDate() !== day
  ) {
    return null;
  }

  return warsawLocalToUtcIso({ year, monthIndex, day, hour, minute });
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
  const wordDateMatch = START_DATE_PREFIX_RE.exec(text);
  if (wordDateMatch) {
    const day = Number(wordDateMatch[1]);
    const monthWord = normalizeForCompare(wordDateMatch[2]).replace(/\s+/g, "");
    const year = Number(wordDateMatch[3]);
    const monthIndex = MONTH_INDEX[monthWord];
    if (monthIndex === undefined) return null;
    const wordRemainder = text.slice(wordDateMatch.index + wordDateMatch[0].length);

    const wordKeywordMatch = WORD_TIME_KEYWORD_RE.exec(wordRemainder);
    if (wordKeywordMatch) {
      const wordTimeValue = parseExplicitTimeValue(wordRemainder.slice(wordKeywordMatch[0].length));
      if (!wordTimeValue) {
        // Case 3: the clause is present but malformed — fail the whole
        // candidate closed, never fall back to case 1's midnight default,
        // never truncated to a plausible-looking prefix (Sprint 192 /
        // F3B-S2TZF: this is the exact gap a review found in the old
        // single-regex named-month time group).
        return null;
      }
      // Case 2: a complete, well-formed time clause — Europe/Warsaw local,
      // converted to UTC by buildValidatedStartDateIso.
      return buildValidatedStartDateIso(year, monthIndex, day, wordTimeValue.hour, wordTimeValue.minute, true);
    }

    // Sprint 193 (F3B-XWATER-PARSE) — the "w godzinach od H:MM ..." clause
    // shape, tried only after WORD_TIME_KEYWORD_RE has already failed to
    // match (so a genuine "godz."/"godzina" clause is never re-parsed by a
    // second path). Only the FIRST time value of the range is ever read —
    // this module does not parse/store an ends_at, by design (unchanged
    // this sprint).
    const rangeKeywordMatch = WORD_RANGE_TIME_KEYWORD_RE.exec(wordRemainder);
    if (rangeKeywordMatch) {
      const rangeTimeValue = parseExplicitTimeValue(wordRemainder.slice(rangeKeywordMatch[0].length));
      if (!rangeTimeValue) {
        // Same fail-closed rule as case 3 above: an explicit "w godzinach
        // od" clause was written but the time itself doesn't parse — never
        // silently falls back to midnight.
        return null;
      }
      return buildValidatedStartDateIso(year, monthIndex, day, rangeTimeValue.hour, rangeTimeValue.minute, true);
    }

    // Case 1: no recognized time clause at all — date-only, valid,
    // defaults to midnight UTC (never Warsaw-converted).
    return buildValidatedStartDateIso(year, monthIndex, day, 0, 0, false);
  }

  const dateMatch = NUMERIC_DATE_PREFIX_RE.exec(text);
  if (dateMatch) {
    const day = Number(dateMatch[1]);
    const monthIndex = Number(dateMatch[2]) - 1;
    const year = Number(dateMatch[3]);
    const remainder = text.slice(dateMatch.index + dateMatch[0].length);

    const keywordMatch = NUMERIC_TIME_KEYWORD_RE.exec(remainder);
    if (keywordMatch) {
      const timeValue = parseExplicitTimeValue(remainder.slice(keywordMatch[0].length));
      if (!timeValue) {
        // Case 3: the clause is present but malformed — fail the whole
        // candidate closed, never fall back to case 1's midnight default.
        return null;
      }
      // Case 2: a complete, well-formed time clause — Europe/Warsaw local,
      // converted to UTC by buildValidatedStartDateIso.
      return buildValidatedStartDateIso(year, monthIndex, day, timeValue.hour, timeValue.minute, true);
    }

    // Sprint 193 (F3B-XWATER-PARSE) — numeric-format parity, see
    // WORD_RANGE_TIME_KEYWORD_RE's own comment above for the full
    // reasoning; only the first time value of the range is ever read.
    const rangeKeywordMatch = NUMERIC_RANGE_TIME_KEYWORD_RE.exec(remainder);
    if (rangeKeywordMatch) {
      const rangeTimeValue = parseExplicitTimeValue(remainder.slice(rangeKeywordMatch[0].length));
      if (!rangeTimeValue) {
        return null;
      }
      return buildValidatedStartDateIso(year, monthIndex, day, rangeTimeValue.hour, rangeTimeValue.minute, true);
    }

    // Case 1: no "godz."/"od godz."/"w godzinach od" clause at all —
    // date-only, valid, defaults to midnight UTC (never Warsaw-converted —
    // there is no real moment to convert without a stated hour).
    return buildValidatedStartDateIso(year, monthIndex, day, 0, 0, false);
  }

  return null;
}

// ── Place extraction — exact match against the known pilot locality list,
// never a fuzzy/invented location. ──────────────────────────────────────────

// Sprint 192 (F3B-S2PL) — a real official notice may name a pilot
// locality in its ordinary Polish inflected form ("w Pruszkowie",
// locative) rather than the exact nominative form stored in
// PILOT_LOCALITIES ("Pruszków") — Polish's o→ó alternation means the
// literal substring check below never matches that spelling (confirmed
// against the real 10.08.2026 pruszkow.pl road-closure notice, F3B-S2XG
// audit). Fixed with a small, explicit, per-locality alias list — not a
// stemmer, not a general Polish declension table — covering only the one
// locality/form pair a real audited notice has actually needed so far.
// PILOT_LOCALITIES itself stays the canonical/nominative list, completely
// unchanged; a locality found via any of its aliased forms below always
// resolves back to that exact canonical string, never the inflected form
// that matched. Every OTHER locality keeps its pre-existing, unmodified
// `text.includes(locality)` behavior — this alias list is opt-in per
// locality, never a blanket declension expansion.
const LOCALITY_TEXT_ALIASES: Readonly<Record<string, readonly string[]>> = {
  Pruszków: ["Pruszków", "Pruszkowie"],
};

// Word-boundary guard for the aliased forms above — reuses the SAME
// Polish-letter class already defined for this file's date/time keyword
// regexes (POLISH_LETTER_CLASS), so an aliased form can never
// accidentally match as a prefix/substring of a longer, unrelated word
// (e.g. "Pruszkowie" inside a hypothetical "Pruszkowieckiego", or
// "Pruszków" inside a hypothetical "Pruszkówka") the way a plain
// `includes()` check would. Scoped only to the aliased forms actually
// added above — plain (non-aliased) localities are unaffected and keep
// matching via `includes()` exactly as before.
function matchesLocalityForm(text: string, form: string): boolean {
  const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const boundary = `(?<![${POLISH_LETTER_CLASS}])${escaped}(?![${POLISH_LETTER_CLASS}])`;
  return new RegExp(boundary, "u").test(text);
}

export function extractPlace(text: string): string | null {
  for (const locality of PILOT_LOCALITIES) {
    const aliasForms = LOCALITY_TEXT_ALIASES[locality];
    if (aliasForms) {
      if (aliasForms.some((form) => matchesLocalityForm(text, form))) return locality;
      continue;
    }
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
