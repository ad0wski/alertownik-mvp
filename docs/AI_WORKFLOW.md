# AI Workflow — How We Use Claude Code

This document describes how to use Claude Code effectively and safely when building Alertownik.

---

## How We Work with Claude Code

Claude Code is used as an interactive pair programmer inside VS Code. Every sprint starts with a written goal. Claude reads the relevant files, proposes an implementation, writes the code, runs the build, and reports what changed.

Claude does **not** make product decisions, commit code, or deploy. The human reviews every change before it goes anywhere.

---

## Writing Safe Sprint Prompts

A good sprint prompt has:

1. **Context** — briefly restate current state ("Sources page exists and works. Check history exists.")
2. **Goal** — one clear sentence ("Add a notice text field to the check form that flows to AI Helper.")
3. **Explicit rules** — list what Claude must not touch (schema, .env.local, service_role, etc.)
4. **Implementation points** — numbered list of specific things to build
5. **End request** — "Run `npm run build`" and "Tell me what changed + what to test"

### Template

```
You are helping me continue building Alertownik MVP.

Current state: [brief list of what works]

Sprint N goal: [one sentence]

Important rules:
1. Do not use service_role or secret keys.
2. Do not modify .env.local.
3. Do not add AI API integration.
4. Do not add web scraping.
5. Do not add cron jobs.
6. Do not add notifications yet.
7. Do not remove existing functionality.
8. Keep public alert browsing working.
9. Keep admin tools protected.
10. Keep code simple and beginner-readable.
11. Use Polish UI text.
[add any sprint-specific rules]

Please inspect: [list files to read first]

Implement:
1. ...
2. ...

Run: npm run build

After changes, tell me:
1. What files were changed.
2. [specific question about how something works]
3. What I should test.
```

---

## Ask Claude to Inspect Files First

Before any implementation, ask Claude to read the relevant files. This avoids:
- Hallucinating function signatures that don't exist
- Duplicating existing helpers
- Missing existing patterns

Always include in the prompt:
```
Please inspect:
- [relevant page file]
- [relevant lib helper]
- [type definitions]
```

Claude will read them before writing anything.

---

## How to Test Changes

After every sprint, test manually in this order:

1. **Build passes** — `npm run build` must succeed with zero errors
2. **Public homepage** — opens, alert list loads, filters work
3. **The specific feature** — follow the testing checklist Claude provides
4. **Regressions** — quickly check that unchanged features still work

For Supabase features: test in the browser with a real admin session, not just by reading the code.

See `docs/QA_MANUAL_CHECKLIST.md` for the full test procedure.

---

## Avoiding Overbuilding

Tell Claude explicitly what **not** to build. Examples:

- "Do not add error handling for scenarios that can't happen"
- "Do not add a loading skeleton here — a simple text is fine"
- "Do not extract this into a separate component — keep it inline"
- "Do not add a confirmation dialog — just delete directly"

Claude follows the instruction if it is in the prompt. If Claude adds something extra anyway, say "revert that part" and it will.

Rules that prevent overbuilding (already in sprint templates):
- "Keep code simple and beginner-readable"
- "Do not remove existing functionality"
- "Do not add cron jobs / AI API calls / notifications"

---

## Handling Supabase Safely

### Schema changes

Never ask Claude to run SQL automatically. Always:

1. Ask Claude to write the SQL to `docs/supabase_something.sql`
2. Review the SQL yourself
3. Run it manually in the Supabase SQL Editor
4. Verify the table appears before testing the app

Claude will remind you to do this if a schema change is needed.

### RLS policies

Always use `auth.role() = 'authenticated'` for admin-only tables (same pattern as `alert_sources`). Never expose admin tables to the anon role.

Never use the service_role key. The anon key is sufficient for all operations when RLS is configured correctly.

### Checking what's in the database

Use the Supabase Table Editor (web UI) to verify rows were created. Do not rely solely on the app UI to confirm database state.

---

## The AI Helper Manual Workflow

This is the current process for turning a real source notice into a published alert:

```
1. Admin opens /admin/sources
2. Finds a source with status "Do sprawdzenia"
3. Clicks "Otwórz źródło ↗" — opens the source website in a new tab
4. Finds a new notice on the source website
5. In the source card: opens "Historia ↓" panel
6. Selects result "Znaleziono komunikat"
7. Pastes the notice text into "Treść komunikatu lub link do komunikatu"
8. Clicks "Zapisz wynik sprawdzenia"
9. Clicks "Przygotuj alert w AI Helperze →"
   → AI Helper opens with source prefilled and notice text in the input field
10. Clicks "Kopiuj prompt"
11. Pastes into ChatGPT or Claude
12. Gets back a JSON object
13. Pastes the JSON into "Odpowiedź AI" section
14. Clicks "Wczytaj do Kreatora"
   → Builder opens with the alert prefilled
15. Reviews all fields, adjusts if needed
16. Clicks "Opublikuj" → alert is live
```

This workflow requires no API keys. ChatGPT or Claude is used externally, manually.

---

## Version Control

- Never ask Claude to commit or push
- Review `git diff` before every commit
- Write commit messages yourself — they describe the why, not just the what
- `npm run build` must pass before every commit

---

## When Something Goes Wrong

If Claude writes code that breaks the build:
1. Share the exact error output with Claude
2. Claude will fix it in the same session
3. Do not commit broken code

If Claude changes something it shouldn't have:
1. Say "revert [specific change]"
2. Or use `git restore src/path/to/file.tsx`

If Claude invents a Supabase function or table that doesn't exist:
1. Check `src/lib/supabaseSourceWrites.ts` and `src/lib/supabaseAlertWrites.ts` for what actually exists
2. Tell Claude "that function doesn't exist — read the lib file first"
