// LR-8B.3 — Builder slug rules, pure and testable.
//
// Bug fixed here: the slug used to be generated from the title only while
// the slug was EMPTY. Typing a title key by key therefore froze the slug at
// the first letter ("B" → slug "b"), which is how Production got /alerts/b.
//
// Rule now: the slug follows the title as long as it is "automatic" —
// empty, or exactly what the previous title would have produced. As soon as
// the admin types their own slug it stops following (a manual slug is never
// overwritten). Clearing the slug, or resetting the form, makes it automatic
// again. Editing an existing alert never changes its slug from the title:
// the slug is that alert's public URL.

const POLISH_MAP: Record<string, string> = {
  ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z",
  Ą: "a", Ć: "c", Ę: "e", Ł: "l", Ń: "n", Ó: "o", Ś: "s", Ź: "z", Ż: "z",
};

/** Title → URL slug; "" when the title has no usable characters. */
export function slugFromTitle(title: string): string {
  return title
    .split("")
    .map((c) => POLISH_MAP[c] ?? c)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The slug after the title field changes to `nextTitle`. */
export function slugAfterTitleChange(
  prev: { title: string; slug: string },
  nextTitle: string,
  editingExistingAlert: boolean
): string {
  if (editingExistingAlert) return prev.slug;
  const followsTitle = prev.slug === "" || prev.slug === slugFromTitle(prev.title);
  return followsTitle ? slugFromTitle(nextTitle) : prev.slug;
}
