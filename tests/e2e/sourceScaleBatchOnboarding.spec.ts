import { test, expect } from "@playwright/test";
import { validateSourceBatch, type SourceBatch } from "@/lib/sourceScale/batchOnboardingConfig";

// Sprint 188A — National Source Scale Plan foundation. Pure unit tests,
// no network, no Supabase.

function wordpressInstance(id: string, gmina: string) {
  return {
    id,
    name: `${gmina} — aktualności`,
    category: "water" as const,
    gmina,
    config: {
      type: "wordpress_rest" as const,
      officialUrl: `https://${id}.pl/aktualnosci`,
      apiUrl: `https://${id}.pl/wp-json/wp/v2/posts?categories=1`,
      keywordSetId: "water-interruptions",
    },
  };
}

test.describe("validateSourceBatch", () => {
  test("a well-formed batch of 3 same-type instances is valid", () => {
    const batch: SourceBatch = {
      batchId: "batch-1",
      adapterType: "wordpress_rest",
      instances: [
        wordpressInstance("gmina-a", "Gmina A"),
        wordpressInstance("gmina-b", "Gmina B"),
        wordpressInstance("gmina-c", "Gmina C"),
      ],
    };
    expect(validateSourceBatch(batch)).toEqual({ valid: true, issues: [] });
  });

  test("empty batch is invalid", () => {
    const batch: SourceBatch = { batchId: "batch-empty", adapterType: "wordpress_rest", instances: [] };
    const result = validateSourceBatch(batch);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([{ instanceId: null, kind: "empty_batch" }]);
  });

  test("duplicate instance ids within a batch are flagged", () => {
    const batch: SourceBatch = {
      batchId: "batch-dup",
      adapterType: "wordpress_rest",
      instances: [wordpressInstance("gmina-a", "Gmina A"), wordpressInstance("gmina-a", "Gmina A (2)")],
    };
    const result = validateSourceBatch(batch);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual({ instanceId: "gmina-a", kind: "duplicate_id" });
  });

  test("an instance whose config type doesn't match the batch's declared type is flagged", () => {
    const batch: SourceBatch = {
      batchId: "batch-mismatch",
      adapterType: "wordpress_rest",
      instances: [
        {
          id: "gmina-x",
          name: "Gmina X",
          category: "roads",
          gmina: "Gmina X",
          config: { type: "html_generic", officialUrl: "https://gmina-x.pl/aktualnosci" },
        },
      ],
    };
    const result = validateSourceBatch(batch);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual({
      instanceId: "gmina-x",
      kind: "adapter_type_mismatch",
      expected: "wordpress_rest",
      actual: "html_generic",
    });
  });

  test("an instance with an invalid config surfaces its validation issues", () => {
    const batch: SourceBatch = {
      batchId: "batch-invalid-config",
      adapterType: "wordpress_rest",
      instances: [
        {
          id: "gmina-y",
          name: "Gmina Y",
          category: "water",
          gmina: "Gmina Y",
          config: {
            type: "wordpress_rest",
            officialUrl: "https://gmina-y.pl/aktualnosci",
            apiUrl: "",
            keywordSetId: "water-interruptions",
          },
        },
      ],
    };
    const result = validateSourceBatch(batch);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual({
      instanceId: "gmina-y",
      kind: "invalid_config",
      issues: ["missing_api_url"],
    });
  });
});
