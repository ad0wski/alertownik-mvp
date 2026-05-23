// All alert dates are displayed in Europe/Warsaw local time.
// Supabase returns timestamptz values as UTC ISO strings (e.g. "2026-05-18T22:00:00+00:00"),
// which represent Warsaw midnight when Poland is UTC+2. This helper converts correctly.

const TZ = "Europe/Warsaw";

function toWarsawParts(d: Date): { date: string; hhmm: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hhmm: `${get("hour").padStart(2, "0")}:${get("minute")}`,
  };
}

// Parses an ISO string into a local date and optional time.
// Returns hhmm=null when the timestamp is a day boundary:
//   - date-only strings (no "T") → all-day
//   - UTC 00:00:00 → all-day (builder saves date-only → Supabase stores UTC midnight)
//   - Warsaw 00:00 or 23:59 → all-day boundary
function parse(iso: string): { date: string; hhmm: string | null } {
  if (!/T/.test(iso)) return { date: iso.slice(0, 10), hhmm: null };

  const d = new Date(iso);

  // UTC midnight — builder sends "2026-05-19", Supabase stores "2026-05-19T00:00:00+00:00"
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) {
    return { date: iso.slice(0, 10), hhmm: null };
  }

  const { date, hhmm } = toWarsawParts(d);

  // Warsaw midnight (e.g. "2026-05-18T22:00:00+00:00" = Warsaw 00:00) or end-of-day (23:59)
  if (hhmm === "00:00" || hhmm === "23:59") return { date, hhmm: null };

  return { date, hhmm };
}

function polishDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

// Formats a single timestamp: "19.05.2026" or "19.05.2026, 09:00"
export function formatAlertDateTime(iso: string): string {
  const { date, hhmm } = parse(iso);
  if (!hhmm) return polishDate(date);
  return `${polishDate(date)}, ${hhmm}`;
}

// Formats an alert date range:
// A) All-day single:    "19.05.2026"
// B) All-day range:     "19.05.2026 – 23.05.2026"
// C) Same-day hours:    "21.05.2026, 09:00 – 14:00"
// D) Multi-day hours:   "19.05.2026, 09:00 – 23.05.2026, 14:00"
// E) No end:            same as formatAlertDateTime(startsAt)
export function formatAlertRange(startsAt: string, endsAt?: string): string {
  const s = parse(startsAt);

  if (!endsAt) return formatAlertDateTime(startsAt);

  const e = parse(endsAt);

  // Both day boundaries → date-only range
  if (!s.hhmm && !e.hhmm) {
    if (s.date === e.date) return polishDate(s.date);
    return `${polishDate(s.date)} – ${polishDate(e.date)}`;
  }

  // Same day with explicit hours on both sides
  if (s.date === e.date && s.hhmm && e.hhmm) {
    return `${polishDate(s.date)}, ${s.hhmm} – ${e.hhmm}`;
  }

  // General: mixed or multi-day with at least one explicit time
  const startStr = s.hhmm ? `${polishDate(s.date)}, ${s.hhmm}` : polishDate(s.date);
  const endStr = e.hhmm ? `${polishDate(e.date)}, ${e.hhmm}` : polishDate(e.date);
  return `${startStr} – ${endStr}`;
}
