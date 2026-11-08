import type { AlertCategory, AlertSeverity } from "@/types/alert";
import { detectCandidateCategory } from "@/lib/candidateVerifier";
// P0-2C — extractPlace/extractStartDateIso moved to candidateWarnings.ts
// (so scheduledWriter.ts's new cross-source dedup can reuse them without
// an import cycle) and re-exported here verbatim — this module's own
// public API, and every existing test importing them from
// "@/lib/trustedSourceAutoPublish", is unchanged.
import { extractPlace, extractStartDateIso } from "@/lib/candidateWarnings";
import {
  classifyProposalAgainstExisting,
  getRegistrySourceId,
  type DedupComparisonItem,
  type AutoPublishAlertInsertPayload,
  type PendingAutoPublishCandidateRow,
  type ScheduledSourceWriter,
} from "@/lib/scheduledWriter";
import { SAFE_CHECK_SOURCE_IDS } from "@/lib/sourceCheck";

export { extractPlace, extractStartDateIso };

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
// detectCandidateCategory (candidateVerifier.ts), extractPlace/
// extractStartDateIso (candidateWarnings.ts, re-exported here — see
// P0-2C comment above). No second dedup algorithm, no second category
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
 *  read), never missing.
 *
 *  P0-2C — upgraded to a type predicate (`url is string`), purely a
 *  static-type change: the runtime behavior/return values are byte-for-
 *  byte identical (still plain `true`/`false`), so every existing test
 *  asserting on them is unaffected. This lets evaluateAutoPublishEligibility
 *  below narrow `candidate.candidateUrl` to a real `string` after this
 *  check passes, so the auto-published alert's `source_url` (Fix 3) can
 *  use it directly — no `!` non-null assertion, no second validation. */
export function isDirectSafePermalink(url: string | null | undefined): url is string {
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
 *  stale. This is about the CONTENT's own stated date — kept as a fully
 *  separate rule from MAX_AUTO_PUBLISH_CANDIDATE_AGE_HOURS below, which
 *  is about how long the candidate ROW has sat `pending` regardless of
 *  what date its text happens to mention. */
const PAST_GRACE_MS = 24 * 60 * 60 * 1000;

// P0-2C fix — pre-launch audit P0 finding: evaluateAutoPublishEligibility
// previously never looked at `detected_at` at all, so a candidate could
// sit `pending` for months and still be auto-published the moment
// auto-publish was (re-)enabled, as long as its own embedded text date
// still looked current relative to the evaluation moment. Alertownik is
// a near-real-time local alert product — a stale, unprocessed candidate
// must never surface, unreviewed, as a "new" published alert just
// because the flag happened to flip back on later.
//
// Deliberately NOT the same rule as PAST_GRACE_MS above: that one judges
// the NOTICE's own claimed date; this one judges how long OUR OWN
// pipeline has had the candidate sitting unprocessed, independent of
// what the text says. Both must pass — neither substitutes for the
// other.
export const MAX_AUTO_PUBLISH_CANDIDATE_AGE_HOURS = 24;
const MAX_AUTO_PUBLISH_CANDIDATE_AGE_MS = MAX_AUTO_PUBLISH_CANDIDATE_AGE_HOURS * 60 * 60 * 1000;

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
  /** P0-2C fix — the candidate's own verified, direct permalink
   *  (`candidate.candidateUrl`, already proven safe by
   *  isDirectSafePermalink below), never the source's generic listing
   *  URL. See buildAutoPublishAlertInsert's own comment for the full
   *  provenance-regression this closes. */
  sourceUrl: string;
  /** P0-2C fix, tightened by P0-2H.2's provenance gate: the candidate's
   *  own registry mapping (`source_notice_candidates.source_id`), carried
   *  through to the published alert's `source_id`. By the time this
   *  `eligible: true` branch is reached, the provenance gate above has
   *  already confirmed this is non-null AND exactly matches the trusted
   *  registry mapping for this candidate's sourceKey — never invented,
   *  and never merely "whatever happened to be on the row." See
   *  buildAutoPublishAlertInsert. */
  sourceId: string;
}

export type AutoPublishEligibility =
  | { eligible: true; fields: AutoPublishAlertFields }
  | { eligible: false; reason: AutoPublishIneligibleReason };

export type AutoPublishIneligibleReason =
  | "not_pending_or_already_converted"
  | "candidate_too_old"
  | "source_not_on_auto_publish_allowlist"
  | "source_registry_mapping_missing"
  | "candidate_source_id_missing"
  | "candidate_source_id_mismatch"
  | "missing_or_unsafe_candidate_url"
  | "duplicate"
  | "ambiguous"
  | "category_not_detected"
  | "place_not_detected"
  | "start_date_not_detected"
  | "notice_expired"
  | "title_missing_or_too_short"
  | "text_too_short"
  | "missing_source_url";

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
  // P0-2C fix — cheapest check (no text parsing), so it runs early: a
  // candidate detected more than MAX_AUTO_PUBLISH_CANDIDATE_AGE_HOURS ago
  // is never eligible, regardless of what its own text says. Exactly 24
  // hours still passes (`>`, not `>=`) — matches this codebase's existing
  // boundary-inclusive convention (e.g. getAlertTimeStatus.ts's
  // OPEN_ENDED_ALERT_FRESHNESS_DAYS check).
  const candidateAgeMs = now.getTime() - new Date(candidate.detectedAt).getTime();
  if (candidateAgeMs > MAX_AUTO_PUBLISH_CANDIDATE_AGE_MS) {
    return { eligible: false, reason: "candidate_too_old" };
  }
  if (!getAutoPublishSourceIds().includes(candidate.sourceKey)) {
    return { eligible: false, reason: "source_not_on_auto_publish_allowlist" };
  }

  // P0-2H.2 — trusted provenance gate. Being on the auto-publish
  // allowlist only proves candidate.sourceKey is a trusted STRING — it
  // says nothing about whether this specific row actually came from the
  // automated writer for that source, as opposed to a manual/legacy/
  // forged candidate that merely happens to share the same source_key
  // (source_key is admin-settable free text on every other write path —
  // nothing before this gate ever constrained it). Requires candidate.
  // registrySourceId to exactly equal the SAME SCHEDULED_WRITER_SOURCE_
  // REGISTRY_IDS mapping the writer itself already uses for this exact
  // sourceKey (getRegistrySourceId, scheduledWriter.ts) — reused, not
  // reparsed, so there is exactly one place this env var's JSON shape is
  // ever understood. Any of: no mapping configured for this sourceKey,
  // no source_id on the candidate at all, or a source_id that doesn't
  // match → fails closed, every one a distinct, reported reason, never
  // a guess or a silent pass.
  const expectedRegistrySourceId = getRegistrySourceId(candidate.sourceKey);
  if (!expectedRegistrySourceId) {
    return { eligible: false, reason: "source_registry_mapping_missing" };
  }
  if (!candidate.registrySourceId) {
    return { eligible: false, reason: "candidate_source_id_missing" };
  }
  if (candidate.registrySourceId !== expectedRegistrySourceId) {
    return { eligible: false, reason: "candidate_source_id_mismatch" };
  }

  if (!isDirectSafePermalink(candidate.candidateUrl)) {
    return { eligible: false, reason: "missing_or_unsafe_candidate_url" };
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
      sourceName: candidate.sourceName,
      // P0-2C fix — candidate.candidateUrl, not candidate.sourceUrl: the
      // isDirectSafePermalink check above already proved it's a real,
      // safe, direct permalink (and narrowed its type to `string`) — the
      // generic source_url check below remains a separate, defense-in-
      // depth sanity check on the candidate's own registry provenance,
      // it is simply no longer what feeds this field.
      sourceUrl: candidate.candidateUrl,
      sourceId: candidate.registrySourceId,
    },
  };
}

// ── Insert payload builder — mirrors buildPendingCandidateInsert's own
// "only known-safe fields can ever be passed" shape: status/published_at
// are never parameters here, always the same literal values. ─────────────
//
// Pre-launch audit finding (2026-11-06), inspected deliberately: this
// payload has NO `ends_at` field at all (AutoPublishAlertInsertPayload,
// scheduledWriter.ts) — nothing here can invent an end date it cannot
// derive with confidence (consistent with every other field in this
// module), and nothing here ever will. This was previously a real gap:
// an auto-published alert would have shown as indefinitely "Trwa" with
// zero freshness protection, since the old getAlertTimeStatus.ts treated
// a missing `ends_at` as permanently active.
//
// That gap is now closed generically, not here: getAlertTimeStatus.ts's
// OPEN_ENDED_ALERT_FRESHNESS_DAYS window applies at READ time to every
// alert with `ends_at = null`, regardless of which code path inserted
// it — manual Builder publish or this auto-publish path alike. An
// alert this function produces is therefore automatically subject to
// the same bounded freshness window as any other open-ended alert; no
// change to this module's fields, eligibility rules, or output shape
// was needed or made. See tests/e2e/trustedSourceAutoPublish.spec.ts's
// "auto-published alert inherits the open-ended freshness cap" test,
// which proves this against the real buildAutoPublishAlertInsert +
// getAlertTimeStatus pairing rather than assuming it.
//
// Auto-publish itself remains fully disabled (SCHEDULED_AUTO_PUBLISH_ENABLED
// is unset in every environment) and this audit made no change to that —
// see CLAUDE.md Security Rule #10.
//
// P0-2C fix — two further pre-launch-audit findings closed here:
//   - `source_url` now carries `fields.sourceUrl`, which
//     evaluateAutoPublishEligibility now populates from
//     `candidate.candidateUrl` (the verified, direct permalink) instead
//     of the source's generic listing page. Previously, EVERY alert
//     auto-published from one source shared the exact same `source_url`
//     (the listing page), so "Zobacz źródło →" never pointed at the
//     actual notice that was verified — a real provenance regression,
//     even though the candidate's own `candidate_url` was captured and
//     validated correctly all along. Never falls back to the generic
//     listing URL: if `candidate.candidateUrl` were ever unavailable/
//     unsafe, evaluateAutoPublishEligibility's own earlier
//     isDirectSafePermalink check already made the whole candidate
//     ineligible — this function is only ever called with a payload
//     already carrying a verified, direct URL.
//   - `source_id` now carries `fields.sourceId` (from
//     `candidate.registrySourceId`) instead of being hardcoded `null`.
//     Investigated and confirmed safe without a migration: the live
//     "Scheduled writer can insert trusted-source auto-published alert"
//     WITH CHECK policy places no constraint on source_id at all, and
//     the column is a plain nullable FK — verified directly against the
//     live schema this session. Stays `null` exactly when no legitimate
//     registry mapping exists; never invented.
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
    source_id: fields.sourceId,
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
