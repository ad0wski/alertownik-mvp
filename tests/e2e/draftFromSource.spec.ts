import { test, expect } from "@playwright/test";
import {
  assessDraft,
  dateCameFromSource,
  suggestSourceNameFromUrl,
} from "@/lib/draftFromSource";

/**
 * Unit-style tests for the Sprint 115 "Draft from Source" assessment
 * logic (/admin/new-alert). The page itself is auth-gated (covered by
 * auth-guards.spec.ts), so the deterministic risk/recommendation layer
 * is tested here directly — same pattern as alertQuality.spec.ts.
 * No live external pages, no Supabase, no AI calls.
 */

function makeDraft(overrides: Partial<Parameters<typeof assessDraft>[0]> = {}) {
  return {
    severity: "info" as const,
    sourceUrl: "https://wkd.com.pl/aktualnosci/3675-ograniczenia",
    place: "linia WKD",
    ...overrides,
  };
}

test.describe("assessDraft", () => {
  test("clean info draft with source → low risk, draft-ok", () => {
    const result = assessDraft(makeDraft(), []);
    expect(result.risk).toBe("low");
    expect(result.recommendation).toBe("draft-ok");
    // Even a clean draft must remind about manual verification
    expect(result.reasons.some((r) => r.includes("ręczna weryfikacja"))).toBe(true);
  });

  test("missing source URL → do-not-publish, never draft-ok", () => {
    const result = assessDraft(makeDraft({ sourceUrl: null }), []);
    expect(result.recommendation).toBe("do-not-publish");
    expect(result.risk).not.toBe("low");
    expect(result.reasons.some((r) => r.includes("bez źródła nie publikujemy"))).toBe(true);
  });

  test("suspicious/test content → do-not-publish", () => {
    const result = assessDraft(makeDraft(), [
      "Pole(-a) „Tytuł” wygląda na testowe/placeholder.",
    ]);
    expect(result.recommendation).toBe("do-not-publish");
  });

  test("non-empty warning list without hard blockers → needs-review", () => {
    const result = assessDraft(makeDraft(), ["Brak opisu „Co zrobić”."]);
    expect(result.recommendation).toBe("needs-review");
  });

  test("severity drives base risk: warning → medium, urgent → high", () => {
    expect(assessDraft(makeDraft({ severity: "warning" }), []).risk).toBe("medium");
    expect(assessDraft(makeDraft({ severity: "urgent" }), []).risk).toBe("high");
  });

  test("missing place raises risk and is named in the reasons", () => {
    const result = assessDraft(makeDraft({ place: "" }), []);
    expect(result.risk).toBe("medium");
    expect(result.reasons.some((r) => r.includes("Brak lokalizacji"))).toBe(true);
  });

  test("urgent draft with no source → high risk and do-not-publish", () => {
    const result = assessDraft(makeDraft({ severity: "urgent", sourceUrl: "" }), []);
    expect(result.risk).toBe("high");
    expect(result.recommendation).toBe("do-not-publish");
  });
});

test.describe("suggestSourceNameFromUrl", () => {
  test("extracts the hostname without www", () => {
    expect(suggestSourceNameFromUrl("https://www.michalowice.pl/komunikaty/1")).toBe("michalowice.pl");
    expect(suggestSourceNameFromUrl("https://wkd.com.pl/aktualnosci/3675")).toBe("wkd.com.pl");
  });

  test("returns empty string for empty, invalid, or non-http input", () => {
    expect(suggestSourceNameFromUrl("")).toBe("");
    expect(suggestSourceNameFromUrl("   ")).toBe("");
    expect(suggestSourceNameFromUrl("not a url")).toBe("");
    expect(suggestSourceNameFromUrl("javascript:alert(1)")).toBe("");
  });
});

test.describe("dateCameFromSource", () => {
  test("true when the API produced no missing-date warning", () => {
    expect(dateCameFromSource([])).toBe(true);
    expect(dateCameFromSource(["Brakuje linku do źródła — uzupełnij go w Kreatorze przed publikacją."])).toBe(true);
  });

  test("false when the API flagged a missing date", () => {
    expect(
      dateCameFromSource(["Brakuje dokładnej daty — uzupełnij datę w Kreatorze przed publikacją."])
    ).toBe(false);
  });
});
