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
