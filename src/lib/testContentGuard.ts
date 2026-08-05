import { normalizeForCompare } from "@/lib/candidateWarnings";

// Sprint 191 — Automation content guard (hard block).
//
// Deliberately a SEPARATE module from src/lib/testContentDetection.ts, not
// a second use of it: that module is an intentionally broad, WARN-ONLY
// heuristic for a human reviewer (admin dashboard post-publish review,
// Builder's pre-publish confirm dialog) — its own file header says "never
// auto-archives, never blocks, never hides anything", and its pattern list
// includes a bare /test/i and /przykład/i. Those are fine for a dialog a
// human can read and dismiss, but wiring that exact list into an
// UNATTENDED write/publish path would wrongly block entirely real notices
// — "test syren alarmowych" (a siren test notice), "test systemu
// ostrzegania" (a warning-system test), or any notice that merely uses
// "na przykład" in an ordinary sentence. Two different jobs need two
// different signal strengths: this module is the hard-block one, used only
// by unattended automation (scheduledWriter.ts / trustedSourceAutoPublish.ts).
// It is never imported by any human-facing warning UI, and
// testContentDetection.ts is never imported by any automation path — one
// list per job, neither reimplements the other's normalization (both reuse
// normalizeForCompare from candidateWarnings.ts as the single source of
// truth for case/diacritic/whitespace handling).
//
// Every pattern below is a STRONG, essentially-zero-false-positive marker
// of synthetic/placeholder/test-only content: either an English filler-text
// term that would never appear in a real Polish municipal notice (lorem,
// ipsum, placeholder, dummy, sample data/alert), an explicit compound
// phrase that names the content itself as non-real (komunikat testowy,
// tekst testowy, wiadomość testowa, przykładowy komunikat/alert/wiadomość,
// do not publish / nie publikować, fikcyjny komunikat/alert), or a
// keyboard-mash/dev-junk marker (asdf, xxx, aaaa — same three already used
// by testContentDetection.ts, which is why they're safe: they were already
// vetted as never occurring in real notice text). This list deliberately
// never includes a bare "test" or "przykład" alone.

const BLOCKED_SYNTHETIC_CONTENT_PATTERNS: RegExp[] = [
  // Filler/lorem-ipsum text — never legitimate in a real notice.
  /lorem/, /ipsum/,
  // English words a real Polish municipal notice would not contain.
  /placeholder/, /\bdummy\b/, /sample data/, /sample alert/,
  // Keyboard-mash / dev junk markers (same three as testContentDetection.ts).
  /asdf/, /\bxxx\b/, /aaaa/,
  // Explicit compound phrases naming the content as non-real — always
  // multi-word, never a single common word, so a real notice that happens
  // to use "test" or "przyklad" (normalized) in an ordinary sentence never
  // matches any of these.
  /komunikat testowy/, /tekst testowy/, /wiadomosc testowa/, /alert testowy/,
  /przykladowy komunikat/, /przykladowy alert/, /przykladowa wiadomosc/,
  /do not publish/, /nie publikowac/,
  /fikcyjny komunikat/, /fikcyjny alert/,
];

/** True only when `text` contains one of the strong synthetic-content
 *  markers above, after the SAME normalization (lowercase, diacritics
 *  stripped, punctuation collapsed to spaces) every other dedup/compare
 *  function in this codebase already uses — never a second, drifting
 *  normalization. Never throws: normalizeForCompare and RegExp#test cannot
 *  throw on a string input. */
export function containsBlockedSyntheticContent(text: string): boolean {
  const normalized = normalizeForCompare(text);
  return BLOCKED_SYNTHETIC_CONTENT_PATTERNS.some((re) => re.test(normalized));
}

/** The gate every automation write/publish path must call before
 *  persisting a candidate or publishing an alert — checks title and body
 *  text together (the project's own minimum requirement), true if either
 *  looks synthetic. Callers on a fail-closed path should treat any
 *  unexpected exception calling this function as a block too (it cannot
 *  itself throw today, but a caller must never assume that stays true
 *  forever — see call sites in scheduledWriter.ts / trustedSourceAutoPublish.ts). */
export function isSyntheticAutomationContent(fields: { title: string; text: string }): boolean {
  return containsBlockedSyntheticContent(fields.title) || containsBlockedSyntheticContent(fields.text);
}
