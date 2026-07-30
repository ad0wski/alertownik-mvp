import { test, expect } from "@playwright/test";
import { validateSourceAdapterConfig } from "@/lib/sourceScale/sourceConfigValidation";
import type { SourceAdapterConfig } from "@/lib/sourceScale/sourceAdapterTypes";

// Sprint 188A — National Source Scale Plan foundation. Pure unit tests,
// no network, no Supabase.

test.describe("validateSourceAdapterConfig — wordpress_rest", () => {
  test("valid config passes", () => {
    const config: SourceAdapterConfig = {
      type: "wordpress_rest",
      officialUrl: "https://example.pl/aktualnosci",
      apiUrl: "https://example.pl/wp-json/wp/v2/posts?categories=1&per_page=6",
      keywordSetId: "water-interruptions",
    };
    expect(validateSourceAdapterConfig(config)).toEqual({ valid: true, issues: [] });
  });

  test("missing apiUrl fails", () => {
    const config: SourceAdapterConfig = {
      type: "wordpress_rest",
      officialUrl: "https://example.pl/aktualnosci",
      apiUrl: "",
      keywordSetId: "water-interruptions",
    };
    const result = validateSourceAdapterConfig(config);
    expect(result.valid).toBe(false);
    expect(result.issues).toContain("missing_api_url");
  });

  test("apiUrl that isn't wp-json shaped fails", () => {
    const config: SourceAdapterConfig = {
      type: "wordpress_rest",
      officialUrl: "https://example.pl/aktualnosci",
      apiUrl: "https://example.pl/api/posts",
      keywordSetId: "water-interruptions",
    };
    const result = validateSourceAdapterConfig(config);
    expect(result.valid).toBe(false);
    expect(result.issues).toContain("api_url_is_not_wordpress_shaped");
  });

  test("officialUrl pointing at a wp-json endpoint is rejected as unsafe (not human-facing)", () => {
    const config: SourceAdapterConfig = {
      type: "wordpress_rest",
      officialUrl: "https://example.pl/wp-json/wp/v2/posts",
      apiUrl: "https://example.pl/wp-json/wp/v2/posts",
      keywordSetId: "water-interruptions",
    };
    const result = validateSourceAdapterConfig(config);
    expect(result.valid).toBe(false);
    expect(result.issues).toContain("unsafe_official_url");
  });
});

test.describe("validateSourceAdapterConfig — other adapter types", () => {
  test("rss_atom requires a valid feedUrl", () => {
    const config: SourceAdapterConfig = {
      type: "rss_atom",
      officialUrl: "https://example.pl/aktualnosci",
      feedUrl: "not-a-url",
    };
    const result = validateSourceAdapterConfig(config);
    expect(result.valid).toBe(false);
    expect(result.issues).toContain("unsafe_feed_url");
  });

  test("html_custom requires a parserId", () => {
    const config: SourceAdapterConfig = {
      type: "html_custom",
      officialUrl: "https://example.pl/aktualnosci",
      parserId: "",
    };
    const result = validateSourceAdapterConfig(config);
    expect(result.valid).toBe(false);
    expect(result.issues).toContain("missing_parser_id");
  });

  test("html_generic only needs a safe officialUrl", () => {
    const config: SourceAdapterConfig = {
      type: "html_generic",
      officialUrl: "https://example.pl/aktualnosci",
    };
    expect(validateSourceAdapterConfig(config)).toEqual({ valid: true, issues: [] });
  });

  test("pdf only needs a safe officialUrl", () => {
    const config: SourceAdapterConfig = {
      type: "pdf",
      officialUrl: "https://example.pl/harmonogram.pdf",
    };
    expect(validateSourceAdapterConfig(config)).toEqual({ valid: true, issues: [] });
  });

  test("missing officialUrl always fails, regardless of type", () => {
    const config: SourceAdapterConfig = {
      type: "html_generic",
      officialUrl: "",
    };
    const result = validateSourceAdapterConfig(config);
    expect(result.valid).toBe(false);
    expect(result.issues).toContain("missing_official_url");
  });
});
