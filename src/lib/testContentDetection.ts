// Heuristic only — flags likely test/placeholder content for a human to
// verify, never auto-archives, never blocks, never hides anything.
// Shared between the admin dashboard's post-publish review (Sprint 87)
// and Builder's pre-publish warning (Sprint 90) so the word list can't
// drift between the two checkpoints.
const SUSPICIOUS_CONTENT_PATTERNS = [
  /test/i, /aaaa/i, /asdf/i, /lorem/i, /placeholder/i, /\bxxx\b/i, /przykład/i,
];

export function looksLikeTestContent(text: string): boolean {
  return SUSPICIOUS_CONTENT_PATTERNS.some((re) => re.test(text));
}

// Which of the given user-facing fields (keyed by their Polish display
// label) look suspicious — lets a caller name the specific field(s) in
// its own warning instead of just a yes/no flag.
export function findSuspiciousFields(fields: Record<string, string>): string[] {
  return Object.entries(fields)
    .filter(([, value]) => looksLikeTestContent(value))
    .map(([label]) => label);
}
