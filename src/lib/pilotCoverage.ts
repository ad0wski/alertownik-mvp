import { PILOT_LOCALITIES } from "./officialSourceChecklist";

// Sprint 158A — Personalization Clarity and Empty States.
//
// Userbrain testers set "Moja okolica" and then couldn't tell whether an
// empty result meant "no alerts right now" or "we don't cover this area at
// all" (e.g. typing Warszawa, which isn't in PILOT_LOCALITIES). This gives
// the UI a way to distinguish those cases without real geocoding:
// - "matched": a typed keyword resembles a known pilot locality name.
// - "unclear": the keyword looks like a street/estate group (e.g. starts
//   with "ul."), which we can't confidently place inside or outside the
//   pilot area from the name alone — use cautious wording, not a confident
//   rejection.
// - "unsupported": the keyword doesn't match any pilot locality and isn't
//   street-like — safe to confidently say "we don't cover this yet".
// - "empty": no location keywords were set at all (categories-only prefs,
//   or nothing set) — pilot coverage doesn't apply.

export type LocalityMatch = "matched" | "unclear" | "unsupported" | "empty";

const STREET_LIKE_PREFIXES = ["ul.", "ulica", "al.", "aleja", "os.", "osiedle"];

export function matchPilotLocality(locationKeywords: string): LocalityMatch {
  const keywords = locationKeywords
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  if (keywords.length === 0) return "empty";

  const pilotLower = PILOT_LOCALITIES.map((l) => l.toLowerCase());
  let matched = false;
  let streetLike = false;

  for (const kw of keywords) {
    const kwLower = kw.toLowerCase();
    if (pilotLower.some((p) => p.includes(kwLower) || kwLower.includes(p))) {
      matched = true;
      continue;
    }
    if (STREET_LIKE_PREFIXES.some((prefix) => kwLower.startsWith(prefix))) {
      streetLike = true;
    }
  }

  if (matched) return "matched";
  if (streetLike) return "unclear";
  return "unsupported";
}

export function pilotLocalitiesLabel(): string {
  return PILOT_LOCALITIES.join(", ");
}
