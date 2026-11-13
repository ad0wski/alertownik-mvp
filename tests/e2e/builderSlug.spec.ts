import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { slugAfterTitleChange, slugFromTitle } from "@/lib/builderSlug";

// LR-8B.3 — Builder slug must follow the whole title while typing (Production
// got /alerts/b because the slug froze at the first typed letter).

/** Simulates typing `text` into the title field key by key. */
function typeTitle(start: { title: string; slug: string }, text: string, editing = false) {
  let state = { ...start };
  for (const ch of text) {
    const title = state.title + ch;
    state = { title, slug: slugAfterTitleChange(state, title, editing) };
  }
  return state;
}

test.describe("LR-8B.3 Builder slug", () => {
  test("typing a title key by key: B → Brak → Brak wody - Reguły never ends as 'b'", () => {
    let s = typeTitle({ title: "", slug: "" }, "B");
    expect(s.slug).toBe("b");
    s = typeTitle(s, "rak");
    expect(s.slug).toBe("brak");
    s = typeTitle(s, " wody - Reguły");
    expect(s).toEqual({ title: "Brak wody - Reguły", slug: "brak-wody-reguly" });
  });

  test("pasting, deleting and retyping keep the slug in sync", () => {
    let s = { title: "", slug: "" };
    s = { title: "Brak wody - Reguły, ul. Wiejska", slug: slugAfterTitleChange(s, "Brak wody - Reguły, ul. Wiejska", false) };
    expect(s.slug).toBe("brak-wody-reguly-ul-wiejska");
    s = { title: "Brak wody", slug: slugAfterTitleChange(s, "Brak wody", false) }; // shortened
    expect(s.slug).toBe("brak-wody");
    s = { title: "", slug: slugAfterTitleChange(s, "", false) }; // cleared
    expect(s.slug).toBe("");
  });

  test("a manual slug is never overwritten by later title changes", () => {
    let s = typeTitle({ title: "", slug: "" }, "Brak wody");
    s = { ...s, slug: "moj-wlasny-slug" }; // admin edits the slug field
    s = typeTitle(s, " - Reguły");
    expect(s.slug).toBe("moj-wlasny-slug");
  });

  test("clearing the slug (or a form reset) makes it automatic again", () => {
    let s = { title: "Brak wody", slug: "moj-wlasny-slug" };
    s = { ...s, slug: "" }; // admin clears the slug field
    s = typeTitle(s, " - Granica");
    expect(s.slug).toBe("brak-wody-granica");
    // Form reset = initialForm (empty title and slug) → automatic from the start.
    expect(typeTitle({ title: "", slug: "" }, "Utrudnienia").slug).toBe("utrudnienia");
  });

  test("editing an existing alert never changes its slug (its public URL)", () => {
    const existing = { title: "Brak wody", slug: "brak-wody" }; // slug happens to equal the auto value
    expect(typeTitle(existing, " - Reguły", true).slug).toBe("brak-wody");
    expect(typeTitle({ title: "Stary", slug: "b" }, " tytuł", true).slug).toBe("b");
  });

  test("slugFromTitle keeps the previous transformation (Polish letters, separators)", () => {
    expect(slugFromTitle("Zmiana trasy WKD – linia W1")).toBe("zmiana-trasy-wkd-linia-w1");
    expect(slugFromTitle("Żółć Ęą ŁÓDŹ")).toBe("zolc-ea-lodz");
    expect(slugFromTitle("  !!  ")).toBe("");
  });

  test("Builder wires the title field through slugAfterTitleChange with the edit-mode guard", () => {
    const src = readFileSync(path.join(process.cwd(), "src/app/builder/page.tsx"), "utf8");
    expect(src).toContain("slugAfterTitleChange(prev, value, Boolean(editingSupabaseAlert))");
    expect(src).not.toMatch(/name === "title" && !prev\.slug/);
    expect(src).toContain('return slugFromTitle(title) || `alert-${Date.now()}`;');
  });
});
