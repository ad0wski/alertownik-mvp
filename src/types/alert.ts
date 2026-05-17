export type AlertCategory =
  | "transport"
  | "water"
  | "power"
  | "waste"
  | "roads"
  | "municipal";

export type AlertSeverity = "info" | "warning" | "critical";

export interface Alert {
  id: string;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  location: string;
  dateFrom: string;  // ISO date, e.g. "2026-05-19"
  dateTo?: string;
  summary: string;
  action: string;
  source: string;
}
