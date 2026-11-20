import type { AlertCategory } from "@/types/alert";
import { detectCandidateCategory } from "@/lib/candidateVerifier";
import {
  MONTHS_PL,
  extractEventPlaces,
  normalizeForCompare,
  stripConfirmedDedupBoilerplate,
  textSimilarity,
} from "@/lib/candidateWarnings";
import { warsawWallTimeToUtcIso } from "@/lib/formatAlertDate";
import {
  DUPLICATE_CONFIDENCE_THRESHOLD,
  classifyProposalAgainstSameSourceItems,
  type DedupComparisonItem,
  type ScheduledSourceWriter,
  type AutomationDecisionInsert,
} from "@/lib/scheduledWriter";
import {
  STANDARD_ACTION_BY_CATEGORY,
  buildAutoPublishAlertInsert,
  buildAutoPublishSlug,
  checkTrustedCandidateProvenance,
  getAutoPublishSourceIds,
  MAX_AUTO_PUBLISH_CANDIDATE_AGE_HOURS,
  type AutoPublishAlertFields,
  type AutoPublishCandidateInput,
  type AutoPublishIneligibleReason,
} from "@/lib/trustedSourceAutoPublish";
import { assertPublicHttpUrl, type SsrfCheckResult } from "@/lib/ssrfGuard";

// AUTO ALERTS V1 — automatic alert creation for ONE trusted source.
//
// Builds on the existing Trusted Source Auto-Publish (trustedSourceAutoPublish.ts),
// reusing its provenance gate (pending, candidate age, allowlist, registry
// mapping, direct permalink), slug builder, standard "co zrobić" copy and
// insert payload builder. What V1 adds is a STRICTER content gate:
//
//   - hard scope: michalowice-komunikaty only (intersected with the env
//     allowlist — the env can narrow it, never widen it);
//   - per-category opt-in (SCHEDULED_AUTO_PUBLISH_CATEGORIES, empty = none);
//   - the permalink must be a michalowice.pl "komunikaty" article;
//   - non-alert notices (job offers, campaigns, events, sessions…) and
//     changes/cancellations are rejected outright;
//   - exactly one pilot locality, no compound name (Komorów-Wieś);
//   - exactly one event date and exactly one "HH:MM-HH:MM" range, both in
//     Europe/Warsaw, no contradiction with the "Data wydarzenia" label;
//   - starts_at < ends_at, event not yet over;
//   - event-aware dedup (URL, then same-source date/place veto), plus a
//     "possible reschedule/correction" guard;
//   - a deterministic confidence score above AUTO_ALERTS_V1_MIN_CONFIDENCE.
//
// Any single failing check → the candidate stays `pending` for manual
// review. Nothing here calls an AI model; nothing here sends push.

export const AUTO_ALERTS_V1_SOURCE_IDS: readonly string[] = ["michalowice-komunikaty"];
export const AUTO_ALERTS_V1_ELIGIBLE_CATEGORIES: readonly AlertCategory[] = ["water", "roads", "waste"];
export const AUTO_ALERTS_V1_MIN_CONFIDENCE = 80;
/** A single-day notice that starts further ahead than this is unusual
 *  enough for a human to look at first. */
export const AUTO_ALERTS_V1_MAX_DAYS_AHEAD = 45;
const MAX_EVENT_DURATION_MS = 24 * 60 * 60 * 1000;
const MAX_TEXT_LENGTH = 3000;
const MIN_TITLE_LENGTH = 10;
const MIN_TEXT_LENGTH = 40;

const PERMALINK_HOSTS = new Set(["www.michalowice.pl", "michalowice.pl"]);
const PERMALINK_PATH_PREFIX = "/dzieje-sie/aktualnosci/komunikaty/";

// ── Configuration (fail closed) ──────────────────────────────────────────────

/** env allowlist ∩ the hard V1 scope. */
export function getAutoAlertsV1SourceIds(): readonly string[] {
  return getAutoPublishSourceIds().filter((id) => AUTO_ALERTS_V1_SOURCE_IDS.includes(id));
}

/** SCHEDULED_AUTO_PUBLISH_CATEGORIES — JSON array, e.g. '["water"]'.
 *  Unset/invalid/empty → [] → no category qualifies. Filtered through
 *  AUTO_ALERTS_V1_ELIGIBLE_CATEGORIES, so it can only narrow. */
export function getAutoPublishCategories(): readonly AlertCategory[] {
  const raw = process.env.SCHEDULED_AUTO_PUBLISH_CATEGORIES;
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return AUTO_ALERTS_V1_ELIGIBLE_CATEGORIES.filter((c) => parsed.includes(c));
  } catch {
    return [];
  }
}

export type AutomationMode = "off" | "dry_run" | "live";

/** SCHEDULED_AUTOMATION_DRY_RUN=true always wins over the live flag. */
export function resolveAutomationMode(liveFlag: string | undefined, dryRunFlag: string | undefined): AutomationMode {
  if (dryRunFlag === "true") return "dry_run";
  if (liveFlag === "true") return "live";
  return "off";
}

// ── Permalink ────────────────────────────────────────────────────────────────

/** Structural check: https, the official host, a "komunikaty" article path
 *  (not the listing itself), no credentials/port/query/fragment. A change
 *  in the site's URL structure therefore fails closed. The DNS-level SSRF
 *  check (assertPublicHttpUrl) runs separately, before any write. */
export function isAllowedV1Permalink(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (!PERMALINK_HOSTS.has(parsed.hostname)) return false;
  if (parsed.username || parsed.password || parsed.port) return false;
  if (parsed.search || parsed.hash) return false;
  if (!parsed.pathname.startsWith(PERMALINK_PATH_PREFIX)) return false;
  return parsed.pathname.length > PERMALINK_PATH_PREFIX.length + 3;
}

// ── Notice classification ────────────────────────────────────────────────────

// Matched against normalizeForCompare() output (lowercase, no diacritics).
const NON_ALERT_MARKERS = [
  "nabor",
  "oferta pracy",
  "stanowisko",
  "konkurs",
  "kampani",
  "wystaw",
  "koncert",
  "zaprasza",
  "zaproszeni",
  "zyczeni",
  "sesj",
  "posiedzeni",
  "warsztat",
  "festyn",
  "rekrutac",
  "szkoleni",
  "webinar",
  "dyzur",
  "spotkani",
  "bezplatn",
];

// A notice that changes/cancels/corrects something must be read by a human
// in V1 — automatic follow-up of an earlier alert is V2.
const CHANGE_OR_CANCELLATION_MARKERS = [
  "odwolan",
  "odwoluj",
  "zmiana terminu",
  "nowy termin",
  "przesuniet",
  "sprostowani",
  "aktualizacj",
  "korekt",
  "do odwolania",
];

const STRICT_CATEGORY_MARKERS: Partial<Record<AlertCategory, string[]>> = {
  water: ["przerwa w dostawie wody", "brak wody", "wstrzymanie dostawy wody", "przerwa w dostawach wody"],
  roads: ["organizacja ruchu", "zamkniecie drogi", "zamkniecie ulicy", "utrudnienia w ruchu", "zamkniety odcinek"],
  waste: ["odbior odpadow", "odbioru odpadow", "wywoz odpadow"],
};

/** Word-START match (`\b` + marker), never a bare substring: "sesj"
 *  must match "sesja rady" but not "posesji" (present in every water
 *  notice). Markers are plain [a-z ] strings — no regex metacharacters. */
function containsAny(normalized: string, markers: readonly string[]): boolean {
  return markers.some((m) => new RegExp(`\\b${m}`).test(normalized));
}

// ── Date & time extraction ───────────────────────────────────────────────────

const MONTH_INDEX: Record<string, number> = {
  stycznia: 1, lutego: 2, marca: 3, kwietnia: 4, maja: 5, czerwca: 6,
  lipca: 7, sierpnia: 8, wrzesnia: 9, pazdziernika: 10, listopada: 11, grudnia: 12,
};

const LABEL_RE = /^\s*Data wydarzenia:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?\s*/i;
const POST_TIMESTAMP_RE = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s+\d{1,2}:\d{2}\s+/;
const SPELLED_DATE_RE = new RegExp(`\\b(\\d{1,2})\\s+(${MONTHS_PL})\\b(?:\\s+(\\d{4}))?`, "gi");
const NUMERIC_DATE_RE = /\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g;
// A time range only counts right after "godz." / "godzinach:" — so a
// year-less date range such as "1.12 do 3.12" can never be read as hours.
const TIME_RANGE_RE =
  /godz(?:\.|in(?:ach|ie|y|a))?:?\s*(?:od\s+)?(\d{1,2})[:.](\d{2})\s*(?:-|–|—|do)\s*(?:godz(?:\.|iny)?\s*)?(\d{1,2})[:.](\d{2})\b/gi;
const ANY_TIME_RE = /godz|\b\d{1,2}:\d{2}\b/i;
const SINGLE_TIME_AFTER_GODZ_RE = /godz\S*\s*(?:od\s+)?\d{1,2}[.:]\d{2}/gi;
const YEARLESS_NUMERIC_DATE_RE = /\b\d{1,2}\.\d{1,2}\b/;

// Index = Date.getUTCDay(). Inflected forms included ("w środę").
const WEEKDAYS: readonly string[][] = [
  ["niedziela", "niedziele"],
  ["poniedzialek"],
  ["wtorek"],
  ["sroda", "srode"],
  ["czwartek"],
  ["piatek"],
  ["sobota", "sobote"],
];
const DATE_RANGE_RE = new RegExp(`\\bod\\s+\\d{1,2}(?:\\s+(?:${MONTHS_PL}))?\\s+do\\s+\\d{1,2}\\s+(?:${MONTHS_PL})`, "i");

interface YMD {
  y: number;
  m: number;
  d: number;
}

function isValidYmd({ y, m, d }: YMD): boolean {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const ymdKey = ({ y, m, d }: YMD) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const timeKey = (h: number, min: number) => `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
const isValidTime = (h: number, min: number) => h >= 0 && h <= 23 && min >= 0 && min <= 59;

export type EventWindowFailure =
  | "date_not_detected"
  | "multiple_dates"
  | "contradictory_dates"
  | "multi_day_event"
  | "end_time_not_detected"
  | "multiple_time_ranges"
  | "invalid_time"
  | "contradictory_start_time"
  | "starts_not_before_ends"
  | "duration_too_long";

export type EventWindowResult =
  | { ok: true; startsAt: string; endsAt: string; date: string; hasLabel: boolean }
  | { ok: false; reason: EventWindowFailure };

/** The notice's single event window, Europe/Warsaw wall time → UTC ISO.
 *  Requires exactly one date and exactly one explicit HH:MM-HH:MM range;
 *  everything else (no end, several dates, overnight, label disagreeing
 *  with the body) is a failure — never a guess. */
export function extractEventWindow(text: string): EventWindowResult {
  let body = text;
  let label: { date: YMD; time: string | null } | null = null;
  const labelMatch = LABEL_RE.exec(body);
  if (labelMatch) {
    label = {
      date: { d: Number(labelMatch[1]), m: Number(labelMatch[2]), y: Number(labelMatch[3]) },
      time: labelMatch[4] ? timeKey(Number(labelMatch[4]), Number(labelMatch[5])) : null,
    };
    body = body.slice(labelMatch[0].length);
  } else {
    const post = POST_TIMESTAMP_RE.exec(body);
    if (post) body = body.slice(post[0].length);
  }

  if (DATE_RANGE_RE.test(body)) return { ok: false, reason: "multi_day_event" };
  // A year-less "D.MM" left after removing full dates and times means a
  // date this parser cannot place → never guess.
  const scrubbed = body.replace(TIME_RANGE_RE, " ").replace(NUMERIC_DATE_RE, " ").replace(SINGLE_TIME_AFTER_GODZ_RE, " ");
  if (YEARLESS_NUMERIC_DATE_RE.test(scrubbed)) return { ok: false, reason: "multiple_dates" };

  const dates: YMD[] = [];
  for (const m of body.matchAll(SPELLED_DATE_RE)) {
    const month = MONTH_INDEX[normalizeForCompare(m[2]).replace(/\s+/g, "")];
    if (!month) return { ok: false, reason: "date_not_detected" };
    const year = m[3] ? Number(m[3]) : label?.date.y;
    if (!year) return { ok: false, reason: "date_not_detected" };
    dates.push({ d: Number(m[1]), m: month, y: year });
  }
  for (const m of body.matchAll(NUMERIC_DATE_RE)) {
    dates.push({ d: Number(m[1]), m: Number(m[2]), y: Number(m[3]) });
  }
  if (dates.some((d) => !isValidYmd(d))) return { ok: false, reason: "date_not_detected" };

  const bodyDates = new Set(dates.map(ymdKey));
  if (bodyDates.size > 1) return { ok: false, reason: "multiple_dates" };
  if (label && !isValidYmd(label.date)) return { ok: false, reason: "date_not_detected" };
  if (label && bodyDates.size === 1 && !bodyDates.has(ymdKey(label.date))) {
    return { ok: false, reason: "contradictory_dates" };
  }
  const eventDate = dates[0] ?? label?.date;
  if (!eventDate) return { ok: false, reason: "date_not_detected" };

  // "23 listopada 2026 r. (poniedziałek)" — a named weekday must match.
  const words = new Set(normalizeForCompare(body).split(" "));
  const namedWeekdays = WEEKDAYS.map((forms, i) => (forms.some((f) => words.has(f)) ? i : -1)).filter((i) => i >= 0);
  if (namedWeekdays.length > 1) return { ok: false, reason: "multiple_dates" };
  if (
    namedWeekdays.length === 1 &&
    new Date(Date.UTC(eventDate.y, eventDate.m - 1, eventDate.d)).getUTCDay() !== namedWeekdays[0]
  ) {
    return { ok: false, reason: "contradictory_dates" };
  }

  const ranges = new Map<string, [number, number, number, number]>();
  for (const m of body.matchAll(TIME_RANGE_RE)) {
    const parts = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] as [number, number, number, number];
    if (!isValidTime(parts[0], parts[1]) || !isValidTime(parts[2], parts[3])) return { ok: false, reason: "invalid_time" };
    ranges.set(`${timeKey(parts[0], parts[1])}-${timeKey(parts[2], parts[3])}`, parts);
  }
  if (ranges.size === 0) return { ok: false, reason: "end_time_not_detected" };
  if (ranges.size > 1) return { ok: false, reason: "multiple_time_ranges" };
  const [sh, smin, eh, emin] = [...ranges.values()][0];
  if (label?.time && label.time !== timeKey(sh, smin)) return { ok: false, reason: "contradictory_start_time" };

  const startsAt = warsawWallTimeToUtcIso(eventDate.y, eventDate.m, eventDate.d, sh, smin);
  const endsAt = warsawWallTimeToUtcIso(eventDate.y, eventDate.m, eventDate.d, eh, emin);
  if (!startsAt || !endsAt) return { ok: false, reason: "invalid_time" };
  const startMs = new Date(startsAt).getTime();
  const endMs = new Date(endsAt).getTime();
  if (!(startMs < endMs)) return { ok: false, reason: "starts_not_before_ends" };
  if (endMs - startMs > MAX_EVENT_DURATION_MS) return { ok: false, reason: "duration_too_long" };

  return { ok: true, startsAt, endsAt, date: ymdKey(eventDate), hasLabel: Boolean(label) };
}

/** True when the text names a time at all — used only to tell
 *  "no end time" apart from "no time" in the failure reason. */
export function mentionsAnyTime(text: string): boolean {
  return ANY_TIME_RE.test(text.replace(LABEL_RE, ""));
}

// ── Place ────────────────────────────────────────────────────────────────────

export type PlaceResult =
  | { ok: true; place: string }
  | { ok: false; reason: "place_not_detected" | "place_ambiguous" | "place_contradicts_title" };

/** Exactly one pilot locality in the body; a compound name sharing the
 *  base ("Komorów-Wieś", "Michałowice-Osiedle") is a DIFFERENT place, so
 *  it is ambiguous, never folded into the base locality. A title naming a
 *  different pilot locality than the body is a contradiction. */
export function extractV1Place(title: string, text: string): PlaceResult {
  const combined = `${title}\n${text}`;
  for (const locality of extractEventPlaces(combined)) {
    // Hyphen attached on both sides ("Komorów-Wieś"); a spaced dash in a
    // title ("Reguły - ul. Torfowa") is punctuation, not a compound name.
    const compound = new RegExp(`${locality}[-–]\\p{L}`, "iu");
    if (compound.test(combined)) return { ok: false, reason: "place_ambiguous" };
  }
  const bodyPlaces = extractEventPlaces(text);
  if (bodyPlaces.length === 0) return { ok: false, reason: "place_not_detected" };
  if (bodyPlaces.length > 1) return { ok: false, reason: "place_ambiguous" };
  const titlePlaces = extractEventPlaces(title);
  if (titlePlaces.some((p) => p !== bodyPlaces[0])) return { ok: false, reason: "place_contradicts_title" };
  return { ok: true, place: bodyPlaces[0] };
}

// ── Dedup (event-aware) ──────────────────────────────────────────────────────

export type V1DedupResult = "new" | "duplicate" | "ambiguous" | "possible_change";

/** 1) exact permalink match → duplicate; 2) same-source event-aware
 *  classification (an item about a different date/place is not the same
 *  event) → duplicate/ambiguous; 3) an almost identical text for the SAME
 *  place but a DIFFERENT date → possible reschedule/correction of an
 *  earlier notice → never auto-published in V1. */
export function classifyV1Dedup(
  proposal: { text: string; url: string; title: string },
  existingItems: DedupComparisonItem[],
  place: string
): V1DedupResult {
  const base = classifyProposalAgainstSameSourceItems(proposal, existingItems);
  if (base !== "new") return base;

  const stripped = stripConfirmedDedupBoilerplate(proposal.text);
  for (const item of existingItems) {
    if (!item.text || !extractEventPlaces(item.text).includes(place)) continue;
    if (textSimilarity(stripped, stripConfirmedDedupBoilerplate(item.text)) >= DUPLICATE_CONFIDENCE_THRESHOLD) {
      return "possible_change";
    }
  }
  return "new";
}

// ── Confidence ───────────────────────────────────────────────────────────────

export interface ConfidenceSignals {
  titleHasCategoryMarker: boolean;
  titleHasPlace: boolean;
  hasDateLabel: boolean;
  bodyLength: number;
}

/** Deterministic, explainable score. Hard requirements are separate gates
 *  above; this only weighs soft signals, so two missing soft signals are
 *  enough to send a notice to manual review. */
export function computeV1Confidence(s: ConfidenceSignals): number {
  let score = 100;
  if (!s.titleHasCategoryMarker) score -= 15;
  if (!s.titleHasPlace) score -= 10;
  if (!s.hasDateLabel) score -= 10;
  if (s.bodyLength < 80) score -= 10;
  if (s.bodyLength > 1500) score -= 10;
  return score;
}

const TITLE_CATEGORY_MARKERS: Partial<Record<AlertCategory, string[]>> = {
  water: ["wod"],
  roads: ["ruch", "drog", "ulic", "utrudnieni", "zamkniec"],
  waste: ["odpad", "smieci"],
};

// ── The V1 gate ──────────────────────────────────────────────────────────────

export type AutoAlertV1Reason =
  | AutoPublishIneligibleReason
  | "source_not_in_v1_scope"
  | "permalink_not_official_notice"
  | "suspicious_source_structure"
  | "not_alert_notice"
  | "change_or_cancellation_notice"
  | "category_not_eligible"
  | "category_not_enabled"
  | "category_conflict"
  | "place_ambiguous"
  | "place_contradicts_title"
  | EventWindowFailure
  | "time_not_detected"
  | "event_ended"
  | "event_too_far_ahead"
  | "possible_change"
  | "low_confidence";

export type AutoAlertV1Evaluation =
  | { eligible: true; fields: AutoPublishAlertFields & { endsAt: string }; confidence: number }
  | { eligible: false; reason: AutoAlertV1Reason; needsReview: boolean };

/** Reasons that mean "this was not a publishable alert at all" — no human
 *  needs to be told. Everything else is a real notice the automation could
 *  not safely handle, so it is surfaced for review. */
const NOT_ACTIONABLE_REASONS: ReadonlySet<AutoAlertV1Reason> = new Set<AutoAlertV1Reason>([
  "not_pending_or_already_converted",
  "candidate_too_old",
  "source_not_on_auto_publish_allowlist",
  "source_not_in_v1_scope",
  "permalink_not_official_notice",
  "not_alert_notice",
  "category_not_detected",
  "category_not_eligible",
  "duplicate",
  "event_ended",
]);

function fail(reason: AutoAlertV1Reason): AutoAlertV1Evaluation {
  return { eligible: false, reason, needsReview: !NOT_ACTIONABLE_REASONS.has(reason) };
}

export interface AutoAlertV1Options {
  now?: Date;
  enabledCategories?: readonly AlertCategory[];
  allowedSourceIds?: readonly string[];
}

export function evaluateAutoAlertV1(
  candidate: AutoPublishCandidateInput,
  existingItems: DedupComparisonItem[],
  options: AutoAlertV1Options = {}
): AutoAlertV1Evaluation {
  const now = options.now ?? new Date();
  const enabledCategories = options.enabledCategories ?? getAutoPublishCategories();
  const allowedSourceIds = options.allowedSourceIds ?? getAutoAlertsV1SourceIds();

  if (!AUTO_ALERTS_V1_SOURCE_IDS.includes(candidate.sourceKey)) return fail("source_not_in_v1_scope");
  const provenance = checkTrustedCandidateProvenance(candidate, now, allowedSourceIds);
  if (provenance) return fail(provenance);
  const url = candidate.candidateUrl;
  const registrySourceId = candidate.registrySourceId;
  if (!url || !registrySourceId) return fail("missing_or_unsafe_candidate_url");
  if (!isAllowedV1Permalink(url)) return fail("permalink_not_official_notice");
  if (!candidate.sourceUrl?.trim()) return fail("missing_source_url");

  const title = candidate.title?.trim() ?? "";
  const text = candidate.text?.trim() ?? "";
  if (title.length < MIN_TITLE_LENGTH) return fail("title_missing_or_too_short");
  if (text.length < MIN_TEXT_LENGTH) return fail("text_too_short");
  if (text.length > MAX_TEXT_LENGTH || /<\/?[a-z][^>]*>/i.test(text)) return fail("suspicious_source_structure");

  const normalized = normalizeForCompare(`${title} ${text}`);
  if (containsAny(normalized, NON_ALERT_MARKERS)) return fail("not_alert_notice");
  if (containsAny(normalized, CHANGE_OR_CANCELLATION_MARKERS)) return fail("change_or_cancellation_notice");

  const category = detectCandidateCategory(`${title}\n${text}`);
  if (!category) return fail("category_not_detected");
  if (!AUTO_ALERTS_V1_ELIGIBLE_CATEGORIES.includes(category)) return fail("category_not_eligible");
  const strictMarkers = STRICT_CATEGORY_MARKERS[category] ?? [];
  if (!containsAny(normalized, strictMarkers)) return fail("category_not_detected");
  const otherStrictCategory = AUTO_ALERTS_V1_ELIGIBLE_CATEGORIES.find(
    (c) => c !== category && containsAny(normalized, STRICT_CATEGORY_MARKERS[c] ?? [])
  );
  if (otherStrictCategory) return fail("category_conflict");
  if (!enabledCategories.includes(category)) return fail("category_not_enabled");

  const window = extractEventWindow(text);
  if (!window.ok) {
    if (window.reason === "end_time_not_detected" && !mentionsAnyTime(text)) return fail("time_not_detected");
    return fail(window.reason);
  }
  if (new Date(window.endsAt).getTime() <= now.getTime()) return fail("event_ended");
  if (new Date(window.startsAt).getTime() - now.getTime() > AUTO_ALERTS_V1_MAX_DAYS_AHEAD * 86_400_000) {
    return fail("event_too_far_ahead");
  }

  const place = extractV1Place(title, text);
  if (!place.ok) return fail(place.reason);

  const dedup = classifyV1Dedup({ text, url, title }, existingItems, place.place);
  if (dedup !== "new") return fail(dedup);

  const normalizedTitle = normalizeForCompare(title);
  const confidence = computeV1Confidence({
    titleHasCategoryMarker: containsAny(normalizedTitle, TITLE_CATEGORY_MARKERS[category] ?? []),
    titleHasPlace: extractEventPlaces(title).includes(place.place),
    hasDateLabel: window.hasLabel,
    bodyLength: text.length,
  });
  if (confidence < AUTO_ALERTS_V1_MIN_CONFIDENCE) return fail("low_confidence");

  return {
    eligible: true,
    confidence,
    fields: {
      slug: buildAutoPublishSlug(title, candidate.id),
      category,
      severity: "info",
      title,
      place: place.place,
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      change: text,
      action: STANDARD_ACTION_BY_CATEGORY[category],
      sourceName: candidate.sourceName,
      sourceUrl: url,
      sourceId: registrySourceId,
    },
  };
}

// ── Orchestration ────────────────────────────────────────────────────────────

export type AutoAlertsV1RunStatus =
  | "off"
  | "published"
  | "would_publish"
  | "no_eligible_candidate"
  | "dedup_pool_unavailable"
  | "insert_failed"
  | "mark_converted_failed"
  | "unexpected_error";

export interface AutoAlertsV1Decision {
  candidateId: string;
  decision: AutomationDecisionInsert["decision"];
  reason: string | null;
  needsReview: boolean;
  alertId?: string;
}

export interface AutoAlertsV1RunResult {
  mode: AutomationMode;
  status: AutoAlertsV1RunStatus;
  decisions: AutoAlertsV1Decision[];
  alertId?: string;
  decisionLogFailures: number;
}

export interface AutoAlertsV1RunOptions {
  mode: AutomationMode;
  runId: string | null;
  now?: Date;
  /** Injected for tests; defaults to the DNS-resolving SSRF guard. */
  checkUrl?: (url: string) => Promise<SsrfCheckResult>;
}

/** Evaluates every pending V1 candidate and publishes AT MOST ONE (live
 *  mode). Dry run evaluates and logs the same decisions with zero writes
 *  to alerts or candidates. Every failure path fails closed. */
export async function runAutoAlertsV1(
  writer: ScheduledSourceWriter,
  options: AutoAlertsV1RunOptions
): Promise<AutoAlertsV1RunResult> {
  const { mode } = options;
  const now = options.now ?? new Date();
  const checkUrl = options.checkUrl ?? assertPublicHttpUrl;
  const result: AutoAlertsV1RunResult = { mode, status: "off", decisions: [], decisionLogFailures: 0 };
  if (mode === "off") return result;

  const record = async (d: AutoAlertsV1Decision) => {
    result.decisions.push(d);
    if (!writer.insertAutomationDecision) return;
    const logged = await writer
      .insertAutomationDecision({
        run_id: options.runId,
        kind: "auto_publish",
        mode,
        subject_id: d.candidateId,
        decision: d.decision,
        reason: d.reason,
        alert_id: d.alertId ?? null,
      })
      .catch(() => ({ ok: false }));
    if (!logged.ok) result.decisionLogFailures += 1;
  };

  if (
    !writer.findPendingAutoPublishCandidates ||
    !writer.findExistingAlertComparisons ||
    !writer.insertPublishedAlert ||
    !writer.markCandidateAutoPublished
  ) {
    result.status = "no_eligible_candidate";
    return result;
  }

  const sourceIds = getAutoAlertsV1SourceIds();
  if (sourceIds.length === 0) {
    result.status = "no_eligible_candidate";
    return result;
  }

  let candidates: AutoPublishCandidateInput[];
  let existingAlerts: DedupComparisonItem[];
  try {
    const detectedAfterIso = new Date(now.getTime() - MAX_AUTO_PUBLISH_CANDIDATE_AGE_HOURS * 3_600_000).toISOString();
    candidates = await writer.findPendingAutoPublishCandidates(sourceIds, detectedAfterIso);
    existingAlerts = await writer.findExistingAlertComparisons();
  } catch {
    result.status = "dedup_pool_unavailable";
    return result;
  }
  if (candidates.length === 0) {
    result.status = "no_eligible_candidate";
    return result;
  }
  // Production always has published/archived alerts; an empty pool means
  // the read was RLS-filtered or broken — dedup would be blind.
  if (existingAlerts.length === 0) {
    result.status = "dedup_pool_unavailable";
    return result;
  }

  let publishedOne = false;
  for (const candidate of candidates) {
    let existingTexts: string[];
    try {
      existingTexts = await writer.findExistingCandidateTexts(candidate.sourceKey, candidate.registrySourceId, candidate.id);
    } catch {
      await record({ candidateId: candidate.id, decision: "skipped", reason: "dedup_pool_unavailable", needsReview: true });
      continue;
    }
    const evaluation = evaluateAutoAlertV1(
      candidate,
      [...existingTexts.map((t) => ({ text: t })), ...existingAlerts],
      { now }
    );
    if (!evaluation.eligible) {
      await record({
        candidateId: candidate.id,
        decision: "skipped",
        reason: evaluation.reason,
        needsReview: evaluation.needsReview,
      });
      continue;
    }

    const ssrf = await checkUrl(evaluation.fields.sourceUrl).catch((): SsrfCheckResult => ({ ok: false, reason: "error" }));
    if (!ssrf.ok) {
      await record({ candidateId: candidate.id, decision: "skipped", reason: "permalink_ssrf_rejected", needsReview: true });
      continue;
    }

    if (publishedOne || result.status === "would_publish") {
      await record({ candidateId: candidate.id, decision: "deferred", reason: "per_run_cap", needsReview: false });
      continue;
    }

    if (mode === "dry_run") {
      result.status = "would_publish";
      await record({ candidateId: candidate.id, decision: "would_publish", reason: `confidence_${evaluation.confidence}`, needsReview: false });
      continue;
    }

    const insert = await writer.insertPublishedAlert(buildAutoPublishAlertInsert(evaluation.fields)).catch(() => ({
      ok: false as const,
      reason: "unknown_error" as const,
    }));
    if (!insert.ok) {
      result.status = "insert_failed";
      await record({ candidateId: candidate.id, decision: "failed", reason: `insert_${insert.reason}`, needsReview: true });
      return result;
    }
    const mark = await writer.markCandidateAutoPublished(candidate.id, insert.id).catch(() => ({ ok: false }));
    result.alertId = insert.id;
    if (!mark.ok) {
      result.status = "mark_converted_failed";
      await record({ candidateId: candidate.id, decision: "failed", reason: "mark_converted_failed", needsReview: true, alertId: insert.id });
      return result;
    }
    publishedOne = true;
    result.status = "published";
    await record({ candidateId: candidate.id, decision: "published", reason: `confidence_${evaluation.confidence}`, needsReview: false, alertId: insert.id });
  }

  if (result.status === "off") result.status = "no_eligible_candidate";
  return result;
}
