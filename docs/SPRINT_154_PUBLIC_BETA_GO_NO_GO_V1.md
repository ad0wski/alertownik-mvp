# Sprint 154 — Public Beta Go/No-Go Checklist v1

Prepared 2026-07-13. Read-only audit sprint — no Production, Vercel,
cron, or data changes were made to produce this checklist.

## READY

- **Public routes** — homepage, alert detail, `/odpady`, `/about`,
  `/zasady` all load correctly on Production, zero console errors
  observed (browser smoke test this session).
- **Admin protection** — anonymous `/admin` visit shows a login gate
  with zero data leak; `/login` form renders correctly. Confirmed live.
- **Trust/disclaimer copy** — independence + manual-verification
  messaging present and consistent across footer, homepage, alert
  detail, `/odpady`, `/zasady`. No contradictions found.
- **Feedback channel** — mailto-based reporting works from 4+ entry
  points (footer, homepage status card, `/about`, per-alert detail).
- **Core QA** — `npm run check` ✅, `npm run test:e2e` ✅ 394/394, live
  Production browser smoke ✅ (documented in `docs/QA_MANUAL_CHECKLIST.md`).
- **No autopublish / no accidental writes anywhere in the current
  codebase** — every admin write path requires an authenticated
  session and an explicit manual action; confirmed by code audit and
  by this session's read-only-by-construction testing.

## BLOCKED

- **Full admin-workflow QA** (Builder publish/archive, AI Helper →
  Builder round-trip, Sources add/edit/delete, source-check save) —
  cannot be verified without either real admin credentials or an
  actual write action, both out of scope for this sprint. Not a
  defect — just untested this sprint. See `docs/QA_MANUAL_CHECKLIST.md`
  §§3–8.
- ~~**Real mobile device testing**~~ — **DONE.** Adam ran the checklist
  on iPhone Safari: technical PASS ✅ (no unwanted horizontal scroll,
  readable text, search/filters/alerts/odpady/feedback all worked,
  add-to-home-screen worked, icon correct). UX findings from that run
  are addressed in Sprint 156B — see REQUIRES ADAM below.

## REQUIRES ADAM

- **Privacy controller identity** — ⚠️ **CORRECTED 2026-07-14 (Sprint
  156C-1): code-complete in Sprint 155, but NOT YET LIVE.** A read-only
  fetch of Production this sprint confirmed `/prywatnosc` still shows
  the old anonymous text and the old private contact address — Sprints
  154/155/156B are three unmerged commits ahead of `main`, never
  deployed. The fix exists and is tested on
  `sprint-156-mobile-first-product-polish-v1`; it only becomes real for
  a public visitor once merged and deployed. See
  `docs/SPRINT_155_PRIVACY_VARIANT_A_IMPLEMENTATION_PACKAGE_V1.md` and
  `docs/SPRINT_156C_PUBLIC_BETA_FINAL_OPERATIONAL_GATES_AUDIT_V1.md` §1.
  `REQUIRES LEGAL WORDING VERIFICATION BEFORE PUBLIC RELEASE` still
  applies, and Sprint 156C-1 additionally found a material gap
  (international data-transfer disclosure) — see that document §6.
- **Data freshness judgment call** — one active alert
  (`wkd-ograniczenia-predkosci-2026-06-29`) has no end date and has
  been active 15 days; Adam should confirm it's still accurate.
  Content coverage is currently thin (2 of 6 advertised categories
  have live data) — a scope call, not a code gap. See
  `docs/SPRINT_154_PUBLIC_BETA_DATA_FRESHNESS_AUDIT_V1.md`.
- **Final admin-workflow QA pass** — Adam (or Claude with Adam's
  explicit go-ahead to use a real/test admin session) should run
  `docs/QA_MANUAL_CHECKLIST.md` §§3–8 for real before wide public
  exposure.
- ~~**Real-device smoke test**~~ — **DONE**, see BLOCKED section above.
- **Beta-status prominence** — code-complete in Sprint 156B (status
  card compacted to two lines), same **not-yet-live** caveat as above —
  the deployed Production card is still the original 5-bullet version.
  See `docs/SPRINT_156B_MOBILE_FIRST_PRODUCT_VALUE_AND_PERSONALIZATION_V1.md`.
- **Open-ended WKD delay alert** (`wkd-ograniczenia-predkosci-2026-06-29`) —
  Sprint 156C-1 cross-checked WKD's official notice page directly: no
  end date given, no follow-up "restriction lifted" notice found either.
  **REQUIRES HUMAN JUDGMENT** — keep active / update / archive, Adam's
  call. See `docs/SPRINT_156C_PUBLIC_BETA_FINAL_OPERATIONAL_GATES_AUDIT_V1.md` §5.2.
- **Merge and deploy** — Sprints 154, 155, and 156B are all still
  unmerged feature branches; `main`/Production remain at the Sprint 153
  commit. Nothing above actually reaches a public visitor until Adam
  approves a merge + Production deploy. This is the top-line finding of
  Sprint 156C-1.

## DEFERRED TO BETA (explicitly not blocking, per this sprint's scope)

- ~~Locality quick-select chips (replace free-text "Moja okolica").~~
  **Done in Sprint 156B** — a compact PILOT_LOCALITIES chip picker was
  added on the homepage, reusing the existing free-text field/mechanism
  rather than replacing it.
- `loading.tsx`/`error.tsx` route boundaries.
- Soft-404 → real HTTP 404 fix for invalid alert slugs.
- Trust-messaging consolidation (currently repetitive, not incorrect).
- `QA_MANUAL_CHECKLIST.md` / `PILOT_READINESS_CHECKLIST.md` dedup.
- Lightweight analytics (requires a coordinated privacy-policy update
  and Adam's explicit new-dependency approval — not started).
- Anything from the LATER/monetization bucket in the Sprint 154A
  audit (service worker, push, accounts, map, app stores,
  monetization) — explicitly out of scope for this sprint by
  instruction.

## Cron observation — separate track, not a beta blocker

Sprint 153's Production cron observation window remains pending and
was not touched by this sprint. It gates its own separate release
track (the scheduled-writer/automation effort), not the public-beta
UI/content readiness assessed here. It should only become a beta
blocker if the eventual observation run surfaces an actual problem
(e.g. an unexpected write) — nothing in this sprint's audit found
reason to expect that.

## Verdict

**CONDITIONAL GO — FINAL MANUAL GATES REMAIN** (updated 2026-07-14,
Sprint 156C-1 — see correction above)

The product itself (public-facing routes, trust messaging, feedback
channel, admin-write protection) is in good shape and did not surface
any blocking defect this sprint. What's actually gating a "public"
(not just recruited-pilot) launch are four bounded, mostly
non-code items: the privacy controller-identity decision, one real
end-to-end admin-workflow QA pass, a human judgment call on current
data freshness/coverage, and a real-device check. None of these
require new engineering scope — they require Adam's time and
decisions, not more code.

**Update (Sprint 156B, 2026-07-14):** the privacy controller-identity
decision (Sprint 155) and the real-device check were addressed in code.
Remaining at that point: full admin-workflow QA pass, the data-freshness
judgment call, the open-ended WKD alert review, and final legal wording
verification.

**Correction (Sprint 156C-1, 2026-07-14):** none of Sprints 154, 155,
or 156B has actually been merged to `main` or deployed — confirmed via
`git log` and a direct read-only fetch of Production, which still
serves pre-Sprint-154 content. The verdict below reflects this: ceiling
is **CONDITIONAL GO — FINAL MANUAL GATES REMAIN**, not a plain
conditional go, because "resolved" so far means "resolved in code,"
not "live for a real visitor." Full detail, including a 30-item gate
matrix, the WKD alert findings, a legal-wording completeness check, and
a controlled admin-workflow runbook:
`docs/SPRINT_156C_PUBLIC_BETA_FINAL_OPERATIONAL_GATES_AUDIT_V1.md`.
