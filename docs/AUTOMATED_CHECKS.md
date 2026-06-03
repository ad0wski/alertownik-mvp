# Automated Checks — Alertownik MVP

This document explains the automated checks available in the project and when to run each one.

---

## Commands

### `npm run typecheck`

Runs the TypeScript compiler with `--noEmit` (type-checks without producing any output files).

**What it catches:** Type errors, missing properties, incorrect function signatures, undefined variables.

**When to run:** During active development, as a quick check after editing a TypeScript file.
Fast — typically 5–10 seconds.

```bash
npm run typecheck
```

---

### `npm run lint`

Runs ESLint on all files under `src/` using the project's `eslint.config.mjs`.

**What it catches:** Code quality issues, React Hook violations, incorrect JSX patterns.

**When to run:** Before committing, especially after adding new hooks or component logic.
Produces warnings (expected) and errors (must be zero before committing).

```bash
npm run lint
```

A single warning about `react-hooks/exhaustive-deps` in `builder/page.tsx` is currently known and expected. It is a warning (exit code 0), not an error.

---

### `npm run build`

Runs `next build` — a full production build including TypeScript checking and page generation.

**What it catches:** Everything `typecheck` catches, plus module resolution errors, missing imports, broken pages, and invalid Next.js conventions.

**When to run:** Before every commit. This is the definitive check.
Slow — typically 30–60 seconds.

```bash
npm run build
```

---

### `npm run check`

Runs all three checks in sequence: `typecheck → lint → build`.

```bash
npm run check
```

This is the single command to run before every commit and before considering any coding task complete.

If any step fails, the sequence stops and prints the error. Fix the error, then run `npm run check` again.

---

## What to Do When `npm run check` Fails

### TypeScript error (`typecheck` step)

```
error TS2339: Property 'x' does not exist on type 'Y'
```

- Read the error file and line number
- Fix the type mismatch in the source file
- Run `npm run check` again

### ESLint error (`lint` step)

```
error  'x' is defined but never used  @typescript-eslint/no-unused-vars
```

- Read the rule name at the end of the line
- Fix the issue in the flagged file
- If the rule is flagging a valid pattern that is intentional, add a comment to `eslint.config.mjs` explaining why the rule is disabled — do not use `// eslint-disable-next-line` inline suppression unless the false positive is isolated to one line
- Run `npm run check` again

### Build error (`build` step)

```
Module not found: Can't resolve '@/lib/something'
```

- Check that the imported file exists at the expected path
- Check that the export name is correct
- Run `npm run check` again

---

## What These Checks Do NOT Cover

- **Admin workflows** — login, dashboard, builder, AI Helper, sources, source checks — all require manual testing with a real Supabase session. See `docs/QA_MANUAL_CHECKLIST.md`.
- **Public user flows** — alert rendering, search, category filters, Moje alerty — require manual testing in a browser.
- **Supabase data integrity** — whether rows are correctly saved or RLS policies are correctly enforced requires manual inspection in Supabase Table Editor.
- **Vercel deployment** — a local passing build does not guarantee a successful Vercel deployment. Check the Vercel dashboard after pushing.
- **Mobile layout** — must be tested manually at a narrow viewport.
- **Cross-browser behaviour** — no browser compatibility tests are included.
- **UI regressions** — the checks verify code compiles; they do not verify that the UI looks or behaves correctly.

---

## ESLint Rules Disabled and Why

Three rules are disabled globally in `eslint.config.mjs`:

| Rule | Reason |
|---|---|
| `react-hooks/set-state-in-effect` | Flags valid guard-clause patterns used throughout the codebase (e.g. early return with `setLoading(false)` when Supabase is unavailable). These are intentional and correct. |
| `react-hooks/immutability` | Flags hoisted `async function` declarations called from `useEffect`. JavaScript hoisting makes these work correctly at runtime; the rule is a style preference. |
| `react/no-unescaped-entities` | Noisy for Polish UI text using typographic quotes (`„…"`). The rule incorrectly flags valid Unicode quotation characters. |

These rules were deliberately disabled, not silently suppressed. Do not re-enable them without addressing the underlying patterns first.

---

## Known Warnings

| File | Warning | Status |
|---|---|---|
| `src/app/builder/page.tsx:262` | `react-hooks/exhaustive-deps` — `refreshSupabaseAlerts` missing from `useEffect` dependency array | Accepted — adding it would require `useCallback` refactor and risks render loops; the current behavior is correct |

Warnings do not fail the build or the `npm run check` command.
