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
//
// Exported (fix(time), builder time-of-day support) so the Builder can
// extract an existing alert's Warsaw-local time-of-day for its optional
// time inputs when loading an alert for editing — same parsing rules the
// display layer already uses, not a second implementation.
export function parseAlertTimestamp(iso: string): { date: string; hhmm: string | null } {
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
  if (!iso) return "Data nieznana";
  const { date, hhmm } = parseAlertTimestamp(iso);
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
  const s = parseAlertTimestamp(startsAt);

  if (!endsAt) return formatAlertDateTime(startsAt);

  const e = parseAlertTimestamp(endsAt);

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

// ── Warsaw wall-clock → UTC conversion (fix(time)) ──────────────────────────
//
// Real notice, real incident that motivated this: Michałowice's official
// "Brak wody - Reguły" notice states "10 listopada 2026 r., w godz.
// 11:00 - 15:00" — a Warsaw LOCAL time. Builder previously had no way to
// capture a time at all (date-only inputs); naively writing the literal
// "11:00:00Z"/"15:00:00Z" face value (treating the stated local hour as if
// it were already UTC) would have displayed as 12:00–16:00 to a Polish
// user — one hour late in winter (CET, UTC+1), two hours late in summer
// (CEST, UTC+2). This is the single, shared, IANA-timezone-aware
// conversion both Builder (via combineDateAndOptionalTime below) and the
// auto-publish candidate parser (candidateWarnings.ts, which imports
// warsawWallTimeToUtcIso directly rather than re-implementing it) now use
// — never a hardcoded UTC+1/+2 offset, never `Date.UTC` treated as if it
// were already Europe/Warsaw.

const WARSAW_TZ = "Europe/Warsaw";
// Europe/Warsaw has never used any standard-time offset other than these
// two (CET = UTC+1, CEST = UTC+2) for any date this app will ever store —
// trying both and verifying the real result via Intl's own IANA-backed
// formatter (rather than hardcoding which one applies on which date) is
// exhaustively correct, not a guess, and automatically correct across any
// future DST rule change too.
const WARSAW_CANDIDATE_OFFSET_HOURS = [1, 2] as const;

const warsawWallClockFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: WARSAW_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Returns the UTC ISO instant corresponding to a given Europe/Warsaw
 *  wall-clock date+time (`month` is 1-12), or `null` if no valid instant
 *  exists for that wall-clock reading (only possible for a wall-clock time
 *  that falls inside the single skipped hour at the spring-forward DST
 *  transition — fails closed rather than guessing, matching this
 *  project's existing "never invent a date" convention). */
export function warsawWallTimeToUtcIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): string | null {
  for (const offsetHours of WARSAW_CANDIDATE_OFFSET_HOURS) {
    const candidate = new Date(Date.UTC(year, month - 1, day, hour - offsetHours, minute));
    const parts = warsawWallClockFormatter.formatToParts(candidate);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    if (
      Number(get("year")) === year &&
      Number(get("month")) === month &&
      Number(get("day")) === day &&
      Number(get("hour")) === hour &&
      Number(get("minute")) === minute
    ) {
      return candidate.toISOString();
    }
  }
  return null;
}

/** "HH:MM", 00-23 hours, 00-59 minutes — the exact shape an
 *  `<input type="time">` produces, and the only shape this module ever
 *  accepts for a time-of-day. */
export function isValidTimeString(timeStr: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(timeStr);
}

/** Builder-facing combiner: `dateStr` is always "YYYY-MM-DD" (from an
 *  `<input type="date">`); `timeStr`, if present, must be "HH:MM" (from an
 *  `<input type="time">`). No time at all → returns `dateStr` completely
 *  unchanged, preserving the EXISTING date-only/all-day storage
 *  convention byte-for-byte (Postgres stores this as UTC midnight,
 *  displayed as all-day by parseAlertTimestamp above) — this function
 *  changes nothing about alerts that never had a time to begin with. A
 *  time is only ever combined in when the caller actually supplies one.
 *  Returns `null` on a malformed date/time (fail closed) — callers are
 *  expected to validate with isValidTimeString first for a clear
 *  user-facing message rather than relying on this null. */
export function combineDateAndOptionalTime(dateStr: string, timeStr?: string): string | null {
  if (!dateStr) return null;
  if (!timeStr) return dateStr;
  if (!isValidTimeString(timeStr)) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);
  if (!y || !m || !d) return null;
  return warsawWallTimeToUtcIso(y, m, d, hour, minute);
}
