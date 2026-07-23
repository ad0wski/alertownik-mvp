// Sprint 166D-1 — deduplication and cooldown. Pure functions only, no
// storage — a future sprint would need a small persisted "last alert sent
// per fingerprint" store (see design doc §I.2) to make cooldown real
// across invocations; this module only provides the deterministic
// decision logic, testable in isolation, injectable clock (same pattern
// as isRunLockHeld in scheduledWriterRunSafety.ts).

import type { AutomationErrorCategory } from "@/lib/automationAlerting";

/** Deterministic, plain string composition — matches this project's
 *  existing convention (e.g. writerCandidateActivity.ts keys rows by
 *  sourceKey) rather than a cryptographic hash, which this use case does
 *  not require: fingerprints are compared for equality only, never stored
 *  or transmitted as a security token. */
export function buildAlertFingerprint(
  sourceKey: string,
  category: AutomationErrorCategory,
  environmentTag: string
): string {
  return `${environmentTag}:${sourceKey}:${category}`;
}

/** Default cooldown: one alert per fingerprint per 6 hours. Deliberately
 *  generous — this route currently has no cron at all, so even a manually
 *  re-triggered run should not re-alert for the exact same ongoing
 *  problem within the same working session. */
export const DEFAULT_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/** Returns true if a new alert for the same fingerprint should be
 *  suppressed because one was already sent recently. `lastAlertSentAt ===
 *  null` (never alerted before for this fingerprint) never suppresses. */
export function isWithinCooldown(
  lastAlertSentAt: string | null,
  now: Date = new Date(),
  cooldownMs: number = DEFAULT_ALERT_COOLDOWN_MS
): boolean {
  if (!lastAlertSentAt) return false;
  const lastSentMs = new Date(lastAlertSentAt).getTime();
  if (!Number.isFinite(lastSentMs)) return false;
  return now.getTime() - lastSentMs < cooldownMs;
}
