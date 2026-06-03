import type { AlertCategory } from "./alert";

export type AlertSourceType = "website" | "pdf" | "rss" | "other";

export interface AlertSource {
  id: string;
  name: string;
  url: string;
  category: AlertCategory;
  sourceType: AlertSourceType;
  isActive: boolean;
  notes?: string;
  lastCheckedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AlertSourceInput {
  name: string;
  url: string;
  category: AlertCategory;
  sourceType: AlertSourceType;
  notes?: string;
}

export type SourceCheckResult =
  | "no_changes"
  | "found_notice"
  | "alert_created"
  | "needs_followup";

export interface SourceCheck {
  id: string;
  sourceId: string;
  checkedAt: string;
  result: SourceCheckResult;
  notes?: string;
  relatedAlertId?: string;
  createdBy?: string;
  createdAt: string;
}

export interface SourceCheckInput {
  sourceId: string;
  result: SourceCheckResult;
  notes?: string;
  relatedAlertId?: string;
}
