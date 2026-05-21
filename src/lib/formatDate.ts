// Strips timezone offset (+00:00, -05:30, Z) and seconds from an ISO string,
// then splits into { date: "YYYY-MM-DD", time: "HH:MM" | null }.
// time is null for date-only strings or when the time is exactly midnight.
function normalizeIso(iso: string): { date: string; time: string | null } {
  const clean = iso.replace(/([+-]\d{2}:\d{2}|Z)$/, "");
  if (!clean.includes("T")) return { date: clean, time: null };
  const [date, rawTime] = clean.split("T");
  const hhmm = rawTime.slice(0, 5);
  return { date, time: hhmm === "00:00" ? null : hhmm };
}

export function formatDateTime(iso: string): string {
  const { date, time } = normalizeIso(iso);
  const [year, month, day] = date.split("-");
  if (!time) return `${day}.${month}.${year}`;
  return `${day}.${month}.${year}, godz. ${time}`;
}

export function formatRange(startsAt: string, endsAt?: string): string {
  if (!endsAt) return formatDateTime(startsAt);
  const start = normalizeIso(startsAt);
  const end = normalizeIso(endsAt);
  // Same day with times → "21.05.2026, godz. 09:00 – 14:00"
  if (start.date === end.date && start.time && end.time) {
    const [year, month, day] = start.date.split("-");
    return `${day}.${month}.${year}, godz. ${start.time} – ${end.time}`;
  }
  return `${formatDateTime(startsAt)} – ${formatDateTime(endsAt)}`;
}
