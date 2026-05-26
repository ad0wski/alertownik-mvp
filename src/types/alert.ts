export type AlertCategory =
  | "transport"
  | "water"
  | "power"
  | "waste"
  | "roads"
  | "municipal";

export type AlertSeverity = "info" | "warning" | "urgent";

export interface Alert {
  id: string;
  slug: string;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  place: string;       // Gdzie
  startsAt: string;    // ISO date or datetime, e.g. "2026-05-19" or "2026-05-19T09:00"
  endsAt?: string;
  change: string;      // Co się zmienia
  action: string;      // Co zrobić
  sourceName: string;  // Źródło – nazwa
  sourceUrl?: string;  // Źródło – link
}
