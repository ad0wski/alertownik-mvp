import type { AlertSeverity } from "@/types/alert";

/**
 * Maps any incoming severity string (English, Polish, varied casing) to the
 * three values the Supabase check constraint accepts: "info" | "warning" | "urgent".
 * "critical" is accepted as an alias for "urgent" (common AI output).
 * Returns null when the value cannot be recognized.
 */
export function normalizeAlertSeverity(value: unknown): AlertSeverity | null {
  if (typeof value !== "string") return null;
  const v = value.toLowerCase().trim();
  if (v === "info" || v === "informacja") return "info";
  if (v === "warning" || v === "uwaga") return "warning";
  if (v === "critical" || v === "pilne" || v === "urgent") return "urgent";
  return null;
}
