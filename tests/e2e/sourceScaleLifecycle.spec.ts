import { test, expect } from "@playwright/test";
import {
  SOURCE_LIFECYCLE_STATUSES,
  getAllowedLifecycleTransitions,
  isValidLifecycleTransition,
  isEligibleForCandidateQueue,
} from "@/lib/sourceScale/sourceLifecycle";

// Sprint 188A — National Source Scale Plan foundation. Pure unit tests,
// no network, no Supabase.

test.describe("sourceLifecycle — transitions", () => {
  test("all 8 canonical statuses are present, in order", () => {
    expect(SOURCE_LIFECYCLE_STATUSES).toEqual([
      "discovered",
      "classified",
      "awaiting_review",
      "testable",
      "canary",
      "active",
      "degraded",
      "disabled",
    ]);
  });

  test("forward path discovered → ... → active is a chain of single valid steps", () => {
    const path: (typeof SOURCE_LIFECYCLE_STATUSES)[number][] = [
      "discovered",
      "classified",
      "awaiting_review",
      "testable",
      "canary",
      "active",
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(isValidLifecycleTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  test("cannot skip stages (discovered → active directly)", () => {
    expect(isValidLifecycleTransition("discovered", "active")).toBe(false);
  });

  test("disabled is reachable from every non-terminal status", () => {
    for (const status of SOURCE_LIFECYCLE_STATUSES) {
      if (status === "disabled") continue;
      expect(getAllowedLifecycleTransitions(status)).toContain("disabled");
    }
  });

  test("disabled has no outgoing transitions", () => {
    expect(getAllowedLifecycleTransitions("disabled")).toEqual([]);
  });

  test("active can degrade and degraded can recover back to active", () => {
    expect(isValidLifecycleTransition("active", "degraded")).toBe(true);
    expect(isValidLifecycleTransition("degraded", "active")).toBe(true);
  });

  test("only active/degraded are eligible for the normal candidate queue", () => {
    for (const status of SOURCE_LIFECYCLE_STATUSES) {
      const expected = status === "active" || status === "degraded";
      expect(isEligibleForCandidateQueue(status)).toBe(expected);
    }
  });
});
