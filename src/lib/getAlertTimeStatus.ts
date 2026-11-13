const TZ = "Europe/Warsaw";

export type AlertTimeStatus = "active" | "upcoming" | "ended" | "unknown";

// P0-1 fix (pre-launch audit, 2026-11-06) — a published alert with no
// `ends_at` previously stayed "active"/"Trwa" forever (see git history:
// `if (!endsAt) return "active";` had no upper bound at all). Two real
// Production rows from July 2026 were still rendering as "Trwa" in
// November 2026 — a civic-safety app confidently asserting a road closure
// was ongoing, 3+ months after it started, with no actual signal either
// way. docs/SPRINT_154_PUBLIC_BETA_DATA_FRESHNESS_AUDIT_V1.md already
// flagged the same pattern once before (an open-ended alert, 15 days old,
// "worth a human look") but that was deferred as a manual judgment call,
// never fixed in code.
//
// Chosen policy — conservative, and deliberately NOT inventing a fact:
//   - This NEVER writes or guesses an `ends_at` value. The stored data is
//     untouched; only the derived, read-time status changes.
//   - A recent open-ended alert (within the window, measured from
//     `startsAt` — the one date everyone agrees describes when the real
//     situation began) keeps today's behavior exactly: "active"/"Trwa".
//     Most Alertownik categories (roads, water, power, waste, transport,
//     municipal notices) describe bounded disruptions measured in days,
//     not indefinite situations, so a two-week grace window covers a
//     genuine multi-week roadworks/maintenance notice without ever
//     claiming certainty the app doesn't have.
//   - Once the window elapses with still no `ends_at`, the alert is
//     treated exactly like any other alert past its end date: "ended".
//     This is the existing, tested, correct bucket for "stop asserting
//     this is current" — AlertList.tsx already excludes "ended" from the
//     live/active view and sorts/counts it as historical, but keeps it
//     reachable under "Pokaż zakończone" rather than hiding it outright.
//     No new UI state, no new badge, no new filtering code needed.
export const OPEN_ENDED_ALERT_FRESHNESS_DAYS = 14;
const OPEN_ENDED_ALERT_FRESHNESS_MS = OPEN_ENDED_ALERT_FRESHNESS_DAYS * 24 * 60 * 60 * 1000;

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

    if (!endsAt) {
      // No explicit end date at all — apply the bounded freshness window
      // instead of claiming indefinite "active" status. Measured from
      // startsAt itself (when the real-world situation began), using a
      // plain elapsed-time comparison — the day-string comparison used
      // for `started`/`ended` above exists to make an all-day boundary
      // inclusive through the end of its calendar day; a multi-day
      // freshness window has no such boundary-day nuance, so a direct ms
      // comparison is simpler and exact.
      const startMs = new Date(startsAt).getTime();
      const ageMs = nowMs - startMs;
      return ageMs > OPEN_ENDED_ALERT_FRESHNESS_MS ? "ended" : "active";
    }

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

/** FINAL-3 — upcoming alerts starting within this many days are shown on "Dzisiaj". */
export const UPCOMING_ALERT_HORIZON_DAYS = 14;

/** True when the alert has not started yet and starts within the horizon. */
export function isUpcomingSoon(startsAt: string | undefined, endsAt?: string): boolean {
  if (!startsAt || getAlertTimeStatus(startsAt, endsAt) !== "upcoming") return false;
  const start = new Date(startsAt).getTime();
  return Number.isFinite(start) && start <= Date.now() + UPCOMING_ALERT_HORIZON_DAYS * 24 * 60 * 60 * 1000;
}
