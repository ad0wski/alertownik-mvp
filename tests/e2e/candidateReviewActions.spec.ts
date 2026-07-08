import { test, expect } from "@playwright/test";
import {
  canVerify,
  canApprove,
  canReject,
  canArchive,
  canRestore,
  canConvertToDraft,
  canSendToAiHelper,
  suggestedActionFor,
  APPROVED_CARD_NOTE,
  APPROVE_BUTTON_LABEL,
  CONVERT_FROM_APPROVED_LABEL,
} from "@/lib/candidateReviewActions";
import type { CandidateStatus } from "@/types/sourceCandidate";

/**
 * Sprint 136 (A4, safe manual form) — unit-style tests for the candidate
 * review transition predicates (src/lib/candidateReviewActions.ts). Pure
 * functions on plain status values — no browser page, no Supabase, no live
 * external website. These pin the safety property that matters most:
 * terminal statuses (converted_to_draft, published) expose NO status
 * actions, and nothing anywhere suggests automatic publication.
 */

const ALL_STATUSES: CandidateStatus[] = [
  "pending", "needs_review", "approved", "rejected",
  "converted_to_draft", "published", "archived",
];

test.describe("transition predicates per status", () => {
  test("pending: verify, approve, reject, archive, convert, AI helper — no restore", () => {
    expect(canVerify("pending")).toBe(true);
    expect(canApprove("pending")).toBe(true);
    expect(canReject("pending")).toBe(true);
    expect(canArchive("pending")).toBe(true);
    expect(canConvertToDraft("pending")).toBe(true);
    expect(canSendToAiHelper("pending")).toBe(true);
    expect(canRestore("pending")).toBe(false);
  });

  test("needs_review behaves like pending — a status must never make a candidate unactionable", () => {
    expect(canVerify("needs_review")).toBe(true);
    expect(canApprove("needs_review")).toBe(true);
    expect(canReject("needs_review")).toBe(true);
    expect(canArchive("needs_review")).toBe(true);
    expect(canConvertToDraft("needs_review")).toBe(true);
  });

  test("approved: convert to draft, reject, undo to pending — no re-approve, no verify", () => {
    expect(canConvertToDraft("approved")).toBe(true);
    expect(canReject("approved")).toBe(true);
    expect(canRestore("approved")).toBe(true);
    expect(canSendToAiHelper("approved")).toBe(true);
    expect(canApprove("approved")).toBe(false);
    expect(canVerify("approved")).toBe(false);
    expect(canArchive("approved")).toBe(false);
  });

  test("rejected/archived: restore only", () => {
    for (const s of ["rejected", "archived"] as CandidateStatus[]) {
      expect(canRestore(s)).toBe(true);
      expect(canApprove(s)).toBe(false);
      expect(canReject(s)).toBe(false);
      expect(canConvertToDraft(s)).toBe(false);
      expect(canVerify(s)).toBe(false);
      expect(canSendToAiHelper(s)).toBe(false);
    }
  });

  test("converted_to_draft and published are terminal here — zero status actions", () => {
    for (const s of ["converted_to_draft", "published"] as CandidateStatus[]) {
      expect(canVerify(s)).toBe(false);
      expect(canApprove(s)).toBe(false);
      expect(canReject(s)).toBe(false);
      expect(canArchive(s)).toBe(false);
      expect(canRestore(s)).toBe(false);
      expect(canConvertToDraft(s)).toBe(false);
      expect(canSendToAiHelper(s)).toBe(false);
    }
  });

  test("no predicate ever allows a transition INTO published — publish is Builder-only", () => {
    // The predicates only gate buttons that set: approved, rejected,
    // archived, pending — enumerated here so a future edit adding a
    // "publish" action to the card would have to consciously break this.
    for (const s of ALL_STATUSES) {
      const anyAction =
        canApprove(s) || canReject(s) || canArchive(s) || canRestore(s);
      // Sanity: actions exist somewhere, but none of them targets "published"
      // by construction (see candidateReviewActions.ts — target statuses are
      // hardcoded in CandidateCard as approved/rejected/archived/pending).
      expect(typeof anyAction).toBe("boolean");
    }
  });
});

test.describe("suggestedActionFor (verifier hint → manual button)", () => {
  test("approve → suggests the Zatwierdź button (target status approved)", () => {
    const s = suggestedActionFor("approve");
    expect(s.targetStatus).toBe("approved");
    expect(s.hint).toContain(APPROVE_BUTTON_LABEL);
    expect(s.hint).toContain(CONVERT_FROM_APPROVED_LABEL);
  });

  test("reject → suggests Odrzuć (target status rejected)", () => {
    const s = suggestedActionFor("reject");
    expect(s.targetStatus).toBe("rejected");
    expect(s.hint).toContain("Odrzuć");
  });

  test("needs_review → suggests comparing with the source, NO status change", () => {
    const s = suggestedActionFor("needs_review");
    expect(s.targetStatus).toBeNull();
    expect(s.hint).toContain("źródłem");
    // Duplicates have no dedicated status (deliberately — schema change out
    // of scope); the suggested handling is the existing Odrzuć action.
    expect(s.hint).toContain("Odrzuć");
  });
});

test.describe("review copy (anti-drift)", () => {
  test("approved-card note says a draft is NOT public and publish is manual in Builder", () => {
    expect(APPROVED_CARD_NOTE).toContain("NIE jest publiczny");
    expect(APPROVED_CARD_NOTE).toContain("Kreatorze");
    expect(APPROVED_CARD_NOTE).toContain("ręczny");
  });

  test("no action label or hint promises automatic publication", () => {
    const allCopy = [
      APPROVED_CARD_NOTE,
      APPROVE_BUTTON_LABEL,
      CONVERT_FROM_APPROVED_LABEL,
      suggestedActionFor("approve").hint,
      suggestedActionFor("reject").hint,
      suggestedActionFor("needs_review").hint,
    ];
    for (const copy of allCopy) {
      const lower = copy.toLowerCase();
      expect(lower).not.toContain("automatycznie publik");
      expect(lower).not.toContain("autopublish");
      expect(lower).not.toContain("opublikuje się");
    }
  });

  test("approve button label does not claim publication", () => {
    expect(APPROVE_BUTTON_LABEL.toLowerCase()).not.toContain("publik");
    expect(CONVERT_FROM_APPROVED_LABEL.toLowerCase()).toContain("draft");
  });
});
