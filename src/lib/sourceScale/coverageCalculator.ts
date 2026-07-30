// Sprint 188A — National Source Scale Plan, read-only coverage calculator.
//
// Pure function over an in-memory list of sources — no Supabase call, no
// side effects. Works today against sources whose geography is only known
// as free text (Alert.place-style), and is already shaped to accept the
// structured wojewodztwo/powiat/gmina/miejscowosc fields proposed in
// docs/sql/PROPOSED_SPRINT_188A_SOURCE_GEOGRAPHY_V1.sql once (if ever)
// that migration is applied — see docs/NATIONAL_SOURCE_SCALE_PLAN_V1.md
// §3.5. Until then, callers pass `null` for any geography field they
// don't have and this module degrades gracefully (that source simply
// doesn't count toward any geography bucket, but still counts toward the
// lifecycle/category breakdowns).

import type { AlertCategory } from "@/types/alert";
import type { SourceLifecycleStatus } from "@/lib/sourceScale/sourceLifecycle";

export interface CoverageSourceRecord {
  id: string;
  category: AlertCategory;
  lifecycleStatus: SourceLifecycleStatus;
  wojewodztwo: string | null;
  powiat: string | null;
  gmina: string | null;
}

export interface CoverageResult {
  totalSources: number;
  byLifecycleStatus: Record<SourceLifecycleStatus, number>;
  activeWojewodztwa: string[];
  activePowiaty: string[];
  activeGminy: string[];
  /** For each category, the set of gmina names with at least one `active`
   *  source in that category — the primary "where are we missing
   *  coverage" signal from docs/NATIONAL_SOURCE_SCALE_PLAN_V1.md §3.5. */
  activeGminyByCategory: Record<AlertCategory, string[]>;
}

const EMPTY_LIFECYCLE_COUNTS: Record<SourceLifecycleStatus, number> = {
  discovered: 0,
  classified: 0,
  awaiting_review: 0,
  testable: 0,
  canary: 0,
  active: 0,
  degraded: 0,
  disabled: 0,
};

const ALL_CATEGORIES: readonly AlertCategory[] = [
  "transport",
  "water",
  "power",
  "waste",
  "roads",
  "municipal",
];

function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, "pl"));
}

export function computeSourceCoverage(sources: readonly CoverageSourceRecord[]): CoverageResult {
  const byLifecycleStatus: Record<SourceLifecycleStatus, number> = { ...EMPTY_LIFECYCLE_COUNTS };
  const activeWojewodztwa = new Set<string>();
  const activePowiaty = new Set<string>();
  const activeGminy = new Set<string>();
  const activeGminyByCategory: Record<AlertCategory, Set<string>> = {
    transport: new Set(),
    water: new Set(),
    power: new Set(),
    waste: new Set(),
    roads: new Set(),
    municipal: new Set(),
  };

  for (const source of sources) {
    byLifecycleStatus[source.lifecycleStatus] += 1;

    if (source.lifecycleStatus !== "active") continue;

    if (source.wojewodztwo) activeWojewodztwa.add(source.wojewodztwo);
    if (source.powiat) activePowiaty.add(source.powiat);
    if (source.gmina) {
      activeGminy.add(source.gmina);
      activeGminyByCategory[source.category].add(source.gmina);
    }
  }

  const activeGminyByCategoryResult = {} as Record<AlertCategory, string[]>;
  for (const category of ALL_CATEGORIES) {
    activeGminyByCategoryResult[category] = uniqueSorted(activeGminyByCategory[category]);
  }

  return {
    totalSources: sources.length,
    byLifecycleStatus,
    activeWojewodztwa: uniqueSorted(activeWojewodztwa),
    activePowiaty: uniqueSorted(activePowiaty),
    activeGminy: uniqueSorted(activeGminy),
    activeGminyByCategory: activeGminyByCategoryResult,
  };
}

/** For a given gmina, which of the six alert categories currently have no
 *  `active` source — the "missing coverage" report from
 *  docs/NATIONAL_SOURCE_SCALE_PLAN_V1.md §3.5. Returns all six when the
 *  gmina has zero active sources of any kind. */
export function findMissingCategoriesForGmina(
  coverage: CoverageResult,
  gmina: string
): AlertCategory[] {
  return ALL_CATEGORIES.filter((category) => !coverage.activeGminyByCategory[category].includes(gmina));
}
