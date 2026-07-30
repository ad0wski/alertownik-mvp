// Sprint 188A — National Source Scale Plan, foundation types only.
//
// Lifecycle status for a source considered anywhere in the pipeline from
// "found on the internet" to "actively monitored on Production". Not
// wired into any Supabase table yet (see
// docs/NATIONAL_SOURCE_SCALE_PLAN_V1.md §4.1 — the geography/lifecycle
// migration is PROPOSED, not applied) — this module is the pure-logic
// layer a future admin UI/migration can adopt without redesigning the
// state machine later.
//
// Upward transitions (toward `active`) are never automatic in the types
// below — `isValidLifecycleTransition` only says whether a transition is
// STRUCTURALLY allowed, not whether it should happen without human
// review. Mirrors this codebase's existing convention (e.g.
// CandidateStatus in src/types/sourceCandidate.ts) of encoding the shape
// of a flow as types, while leaving "who is allowed to trigger it" to the
// caller.

export type SourceLifecycleStatus =
  | "discovered"
  | "classified"
  | "awaiting_review"
  | "testable"
  | "canary"
  | "active"
  | "degraded"
  | "disabled";

export const SOURCE_LIFECYCLE_STATUSES: readonly SourceLifecycleStatus[] = [
  "discovered",
  "classified",
  "awaiting_review",
  "testable",
  "canary",
  "active",
  "degraded",
  "disabled",
] as const;

export const SOURCE_LIFECYCLE_LABELS_PL: Record<SourceLifecycleStatus, string> = {
  discovered: "znalezione",
  classified: "sklasyfikowane",
  awaiting_review: "czeka na przegląd",
  testable: "gotowe do testów",
  canary: "test na żywo (canary)",
  active: "aktywne",
  degraded: "zdegradowane",
  disabled: "wyłączone",
};

// Forward (toward `active`) transitions — always a single deliberate step,
// never a skip. Downward transitions (`active` → `degraded` → `disabled`)
// are allowed from more states because a real-world failure can be
// noticed at any point after a source starts being fetched, not only from
// `active`. `disabled` is reachable from every non-terminal state — an
// operator (or a future automated safety check) can always pull a source
// out of the pipeline regardless of where it currently sits.
const ALLOWED_LIFECYCLE_TRANSITIONS: Record<SourceLifecycleStatus, readonly SourceLifecycleStatus[]> = {
  discovered: ["classified", "disabled"],
  classified: ["awaiting_review", "disabled"],
  awaiting_review: ["testable", "disabled"],
  testable: ["canary", "disabled"],
  canary: ["active", "degraded", "disabled"],
  active: ["degraded", "disabled"],
  degraded: ["active", "disabled"],
  disabled: [],
};

export function getAllowedLifecycleTransitions(
  from: SourceLifecycleStatus
): readonly SourceLifecycleStatus[] {
  return ALLOWED_LIFECYCLE_TRANSITIONS[from];
}

export function isValidLifecycleTransition(
  from: SourceLifecycleStatus,
  to: SourceLifecycleStatus
): boolean {
  return ALLOWED_LIFECYCLE_TRANSITIONS[from].includes(to);
}

/** Statuses that participate in the regular check pipeline (their
 *  candidates can reach the normal review queue). `canary` sources run
 *  live but their output must never flow to the normal candidate queue —
 *  see docs/NATIONAL_SOURCE_SCALE_PLAN_V1.md §3.1. */
export const LIFECYCLE_STATUSES_ELIGIBLE_FOR_CANDIDATE_QUEUE: readonly SourceLifecycleStatus[] = [
  "active",
  "degraded",
];

export function isEligibleForCandidateQueue(status: SourceLifecycleStatus): boolean {
  return LIFECYCLE_STATUSES_ELIGIBLE_FOR_CANDIDATE_QUEUE.includes(status);
}
