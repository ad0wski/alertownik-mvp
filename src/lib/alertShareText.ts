// LR-4 — the text handed to the Web Share API on the alert detail page.
// A neighbour receiving it in a chat should understand the alert without
// opening the link: what, when, where, and whose notice it is. The link
// itself is passed separately (ShareAlertButton sends window.location.href
// as `url`), so it is deliberately not repeated here.
export interface AlertShareTextInput {
  title: string;
  place?: string | null;
  /** Already formatted for display (formatAlertRange). */
  when?: string | null;
  sourceName?: string | null;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function buildAlertShareText({ title, place, when, sourceName }: AlertShareTextInput): string {
  const parts = [title.trim()];
  const cleanPlace = place?.trim();
  // Titles often already name the place ("Brak wody - Reguły") — don't say it twice.
  if (cleanPlace && !normalize(title).includes(normalize(cleanPlace))) parts.push(cleanPlace);
  const cleanWhen = when?.trim();
  if (cleanWhen) parts.push(cleanWhen);
  let text = parts.join(" · ");
  const cleanSource = sourceName?.trim();
  if (cleanSource) text += `. Źródło: ${cleanSource}`;
  return `${text}. Szczegóły w Alertowniku:`;
}
