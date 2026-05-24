const TZ = "Europe/Warsaw";

export type AlertTimeStatus = "active" | "upcoming" | "ended" | "unknown";

// Returns today's date string (YYYY-MM-DD) in Warsaw local time.
function warsawDateString(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

// Returns true for all-day values: bare "YYYY-MM-DD" strings and UTC-midnight
// timestamps (the builder stores date-only fields as UTC midnight in Supabase).
function isAllDay(iso: string): boolean {
  if (!/T/.test(iso)) return true;
  const d = new Date(iso);
  return d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
}

export function getAlertTimeStatus(
  startsAt: string | undefined,
  endsAt?: string
): AlertTimeStatus {
  if (!startsAt) return "unknown";
  try {
    const todayWaw = warsawDateString();
    const nowMs = Date.now();

    const startAllDay = isAllDay(startsAt);
    const startDate = startsAt.slice(0, 10);
    const started = startAllDay
      ? startDate <= todayWaw
      : new Date(startsAt).getTime() <= nowMs;

    if (!started) return "upcoming";
    if (!endsAt) return "active";

    const endAllDay = isAllDay(endsAt);
    const endDate = endsAt.slice(0, 10);
    // All-day end: alert is active through the end of that calendar day.
    // ended = end date is strictly before today.
    const ended = endAllDay
      ? endDate < todayWaw
      : new Date(endsAt).getTime() <= nowMs;

    return ended ? "ended" : "active";
  } catch {
    return "unknown";
  }
}
