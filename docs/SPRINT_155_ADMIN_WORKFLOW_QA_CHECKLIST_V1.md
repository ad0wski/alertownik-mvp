# Sprint 155 — One Full Admin-Workflow QA Pass Checklist v1

For Adam. Covers `docs/QA_MANUAL_CHECKLIST.md` §§3–8, which Sprint
154B marked 🚫 BLOCKED (no admin credentials or write actions used by
Claude this sprint by design). Not executed by Claude. Nothing below
is marked done.

**Update (Sprint 156C-1, 2026-07-14):** still not executed by anyone as
of this update. Sprint 156C-1 additionally mapped the full admin
workflow read-only (which steps write, which tables, which need a real
session) and produced a gated, click-by-click controlled runbook — see
`docs/SPRINT_156C_PUBLIC_BETA_FINAL_OPERATIONAL_GATES_AUDIT_V1.md` §§3–4.
That runbook and this checklist cover the same ground; use whichever
you prefer, or both.

Run this once, end to end, using a real admin session on Production
(or a throwaway test alert if you'd rather not touch real data — your
call, either satisfies the checklist).

## Login (`/login`)
- [ ] Valid credentials → redirected to `/admin`.
- [ ] After login, admin nav links appear in the header.

## Dashboard (`/admin`)
- [ ] Stats (Wszystkie/Opublikowane/Drafty/Zarchiwizowane) look correct.
- [ ] "Źródła do sprawdzenia" count and "Ostatnie sprawdzenia" list render.
- [ ] Quick-action links (Kreator, AI Helper, Źródła) all work.

## Builder (`/builder`)
- [ ] Blank form loads; all fields accept input.
- [ ] "Zapisz jako draft" saves correctly (status=draft).
- [ ] Edit mode (`/builder?edit=[slug]`) pre-populates and updates
      the same record, not a duplicate.
- [ ] "Opublikuj" / "Zarchiwizuj" / "Przywróć" all work and reflect
      correctly on the public homepage.

## AI Helper (`/ai-helper`)
- [ ] Prompt preview updates live as you type.
- [ ] Pasting a valid AI JSON response is accepted; "Wczytaj do
      Kreatora" opens Builder pre-filled.
- [ ] Pasting invalid JSON shows an error and does not navigate.

## Sources (`/admin/sources`)
- [ ] Source list loads, search/filters work.
- [ ] "Historia" panel opens and shows check history correctly.
- [ ] Saving a check result creates a `source_checks` row and updates
      `last_checked_at`.

## Data integrity (Supabase)
- [ ] Publish → appears on public homepage immediately.
- [ ] Archive → disappears from public homepage, still visible in
      admin dashboard.
- [ ] Edit → change reflected on both homepage and detail page.

If anything here fails, note exactly which step and what happened —
that becomes a real blocker bug for a follow-up sprint, not a
guess.
