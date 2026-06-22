import { findSuspiciousFields } from "@/lib/testContentDetection";

// One consolidated pre-publish checklist for Builder — covers fields a
// resident actually reads (Sprint 73), suspicious test/placeholder
// wording (Sprint 87/90), and missing source link / inverted date range
// / overly short change-or-action text (Sprint 91). Extracted from
// builder/page.tsx (which is auth-gated and untestable end-to-end) so
// the logic itself stays unit-testable, the same reasoning already
// applied to testContentDetection.ts.
const MIN_DESCRIPTIVE_LENGTH = 15;

export interface PrePublishCheckInput {
  title: string;
  place: string;
  change: string;
  action: string;
  sourceName: string;
  sourceUrl?: string;
  startsAt: string;
  endsAt?: string;
}

export function getPrePublishWarnings(f: PrePublishCheckInput): string[] {
  const warnings: string[] = [];

  if (!f.place.trim()) warnings.push("Brak lokalizacji.");
  if (!f.change.trim()) warnings.push("Brak opisu „Co się zmienia”.");
  if (!f.action.trim()) warnings.push("Brak opisu „Co zrobić”.");
  if (!f.sourceName.trim()) warnings.push("Brak nazwy źródła.");
  if (!f.sourceUrl?.trim()) warnings.push("Brak linku do źródła.");
  if (f.startsAt && f.endsAt && f.endsAt < f.startsAt) {
    warnings.push("Data „do” jest wcześniejsza niż data „od” — sprawdź zakres dat.");
  }
  if (f.change.trim() && f.change.trim().length < MIN_DESCRIPTIVE_LENGTH) {
    warnings.push("„Co się zmienia” jest bardzo krótkie — czy to wystarczająco konkretne?");
  }
  if (f.action.trim() && f.action.trim().length < MIN_DESCRIPTIVE_LENGTH) {
    warnings.push("„Co zrobić” jest bardzo krótkie — czy to wystarczająco konkretne?");
  }

  const flagged = findSuspiciousFields({
    "Tytuł": f.title,
    "Lokalizacja": f.place,
    "Co się zmienia": f.change,
    "Co zrobić": f.action,
  });
  if (flagged.length > 0) {
    warnings.push(`Pole(-a) „${flagged.join(", ")}” wygląda na testowe/placeholder.`);
  }

  return warnings;
}

export function confirmPrePublish(warnings: string[]): boolean {
  if (warnings.length === 0) return true;
  return confirm(`Przed publikacją zwróć uwagę na:\n— ${warnings.join("\n— ")}\n\nOpublikować mimo to?`);
}
