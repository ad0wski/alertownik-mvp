// Sprint 188A — National Source Scale Plan, batch onboarding foundation.
//
// A SourceBatch groups many source instances that share one adapter
// *type* and can therefore be certified/reviewed as a group (see
// docs/NATIONAL_SOURCE_SCALE_PLAN_V1.md §3.4 — "5–20 WordPress REST
// sources", "a group of sources on the same CMS"), instead of the
// current one-source-at-a-time model in officialSourceChecklist.ts. This
// module only validates a batch's internal consistency; it never fetches,
// writes, or activates anything.

import type { AlertCategory } from "@/types/alert";
import type { SourceAdapterConfig, SourceAdapterType } from "@/lib/sourceScale/sourceAdapterTypes";
import { validateSourceAdapterConfig } from "@/lib/sourceScale/sourceConfigValidation";

export interface SourceBatchInstance {
  /** Stable, human-assigned id — mirrors OfficialSourceCheck.id (e.g.
   *  "gmina-x-komunikaty") so a future registry can reuse the same
   *  allowlist mechanics (SAFE_CHECK_SOURCE_IDS-style) unchanged. */
  id: string;
  name: string;
  category: AlertCategory;
  gmina: string | null;
  config: SourceAdapterConfig;
}

export interface SourceBatch {
  batchId: string;
  /** Every instance in a batch must share this adapter type — a batch is
   *  defined by "same fetch/parse mechanics", not by geography or
   *  category, which can (and usually do) vary per instance. */
  adapterType: SourceAdapterType;
  instances: SourceBatchInstance[];
}

export type SourceBatchIssue =
  | { instanceId: string; kind: "duplicate_id" }
  | { instanceId: string; kind: "adapter_type_mismatch"; expected: SourceAdapterType; actual: SourceAdapterType }
  | { instanceId: string; kind: "invalid_config"; issues: string[] }
  | { instanceId: null; kind: "empty_batch" };

export interface SourceBatchValidationResult {
  valid: boolean;
  issues: SourceBatchIssue[];
}

/** Validates that a batch is internally consistent: non-empty, every
 *  instance actually uses the batch's declared adapter type, every
 *  instance id is unique within the batch, and every instance's config
 *  passes validateSourceAdapterConfig. Does not check for collisions
 *  against an existing registry — that requires the registry's current
 *  state, which this pure function deliberately does not depend on. */
export function validateSourceBatch(batch: SourceBatch): SourceBatchValidationResult {
  const issues: SourceBatchIssue[] = [];

  if (batch.instances.length === 0) {
    return { valid: false, issues: [{ instanceId: null, kind: "empty_batch" }] };
  }

  const seenIds = new Set<string>();

  for (const instance of batch.instances) {
    if (seenIds.has(instance.id)) {
      issues.push({ instanceId: instance.id, kind: "duplicate_id" });
    }
    seenIds.add(instance.id);

    if (instance.config.type !== batch.adapterType) {
      issues.push({
        instanceId: instance.id,
        kind: "adapter_type_mismatch",
        expected: batch.adapterType,
        actual: instance.config.type,
      });
      continue;
    }

    const configResult = validateSourceAdapterConfig(instance.config);
    if (!configResult.valid) {
      issues.push({ instanceId: instance.id, kind: "invalid_config", issues: configResult.issues });
    }
  }

  return { valid: issues.length === 0, issues };
}
