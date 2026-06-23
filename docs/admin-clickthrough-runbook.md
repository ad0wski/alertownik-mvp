# Admin Click-through Runbook — Sprint 97

For Adam. A one-time, real, end-to-end pass through the admin workflow on
the **live Vercel deployment** (`https://alertownik-mvp.vercel.app/`), not
localhost. This is the one thing no prior sprint's code-level audit could
substitute for — Claude Code has no admin login credentials in any
session, so this step has never actually been performed by a human since
the workflow was built (Sprints 65–96).

No secrets, logins, or private data are written here. Nothing in this
file should ever need editing for a normal run — if you find yourself
wanting to add a real password or token to this file, stop and don't.

---

## Before you start

- Use the real deployed site, not `npm run dev` — this is about whether
  the thing testers actually see works, not whether your local checkout does.
- Pick **one real, currently-reachable source** to run the full chain
  against (see "Known source reachability" below) — don't try all sources
  at once on the first pass.
- Have 15–20 uninterrupted minutes. Each step below builds on the last.

## Known source reachability (carried forward, not re-checked this sprint)

Per the source-monitoring history in Obsidian's `Research.md`: WKD, Gmina
Michałowice, and Wodociągi Michałowice have all been independently
confirmed fetchable. Both Pruszków-domain sources (Miasto Pruszków
aktualności, MZO Pruszków odpady) are confirmed **bot-blocked (HTTP 403)**
to automated fetch — this is not a bug, use "Otwórz źródło ręcznie" for
those instead of "Sprawdź stronę."

---

## Step-by-step

| # | Step | What to click | What success looks like | Status |
|---|---|---|---|---|
| 1 | Login | `/login`, your admin email/password | Redirected to `/admin`, header shows "Admin" badge | **available** |
| 2 | Dashboard check | Just look at `/admin` | Stats cards load, no red error banner, new "Status workflow źródeł" section (Sprint 96) shows your sources | **available** |
| 3 | Open Sources | `/admin/sources` | List of registered sources loads with status badges | **available** |
| 4 | Run a source check | Pick a reachable source (see above) → "Sprawdź stronę" | Preview panel shows extracted text fragments, or a clear "open manually" message for a bot-blocked source | **available** |
| 5 | Review check history | Same source card → "Historia" | Past checks listed with date/result | **available** |
| 6 | Legacy candidate queue | `/admin/queue` → "Starsze (z historii sprawdzeń źródeł)" | Always works — no migration dependency | **available** |
| 7 | Persistent candidate queue | `/admin/queue` → "Kandydaci (trwali)" | Either real candidates with Zignoruj/Archiwizuj actions, **or** a calm "migracja nie uruchomiona" banner | **blocked by migration** — status genuinely unknown as of this sprint (see note below); the page itself will tell you which case you're in |
| 8 | Candidate → draft | From a candidate: "Wyślij do AI Helpera →" or "Utwórz szkic w Kreatorze →" | Lands on `/ai-helper` or `/builder` with fields pre-filled | **available** |
| 9 | Create a draft alert | `/builder`, fill in or adjust the pre-filled fields | Form accepts input, "Zapisz jako draft" works | **available** |
| 10 | Manual content check | Open the source link yourself, compare date/place/wording against the draft | — (this step has no code substitute, by design) | **requires manual admin action** |
| 11 | Publish or don't | `/builder` → "Opublikuj w Supabase" | Either publishes (after reviewing the pre-publish warning list, if any appear), or you decide not to — both are correct outcomes | **available** |
| 12 | Public verification | Open `/` in an incognito window (not logged in) | New alert appears correctly, source link works, no admin UI visible | **available** |
| 13 | Mobile check | Open the live site on your actual phone | Layout doesn't overflow, "Otwórz alert" / "Szczegóły" work, no dev-mode badge | **available** |

## What counts as a real blocker (stop and report, don't push through)

- A page that errors instead of showing the expected empty/loading state.
- A publish that succeeds but the public page shows wrong/garbled content.
- Any path that publishes without you clicking "Opublikuj" yourself — if
  you ever see this, stop immediately and report it; it would violate a
  hard safety rule, not just a UX bug.
- The mobile view cutting off content or making a button unreachable.

## What does NOT count as a blocker

- Step 7 showing the "migracja nie uruchomiona" banner — that's an
  accurate status report, not a bug. It just means persistent candidates
  aren't enabled yet (your call whether to run the migration).
- A bot-blocked source (Pruszków domain) failing "Sprawdź stronę" — use
  the manual-open fallback instead.
- Builder's pre-publish warning list showing up — that's the safety net
  working, not a malfunction. Read the warnings, decide, then publish or
  fix.

## When NOT to publish

- The draft's `change`/`action` text reads as placeholder/example text,
  not a real disruption.
- You can't find a working source link to verify against.
- The pre-publish warning list flags something you can't resolve right
  now (e.g. inverted date range) — fix it first, don't publish around it.

## How to record the result

Don't write results into this file — it should stay a clean, reusable
runbook. Instead, fill in the results table in Obsidian's **Public Beta
Readiness** page (`Adam_Life/04_Projekty/Alertownik/Public Beta
Readiness.md`), under "Admin Click-through — Adam's results." One row
per step above, with a date and a one-line note.

## Related

- `Pilot Ops Checklist.md` (Obsidian) — the *recurring* day-to-day version
  of steps 3–11, for normal operation after this one-time check.
- `docs/supabase_source_notice_candidates.sql` — the migration referenced
  in step 7, if you decide to run it.
