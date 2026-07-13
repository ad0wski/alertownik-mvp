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
- **Real mobile device testing** — no physical device available to
  Claude. Checklist prepared for Adam:
  `docs/SPRINT_154_REAL_DEVICE_SMOKE_CHECKLIST_V1.md`.

## REQUIRES ADAM

- **Privacy controller identity** — `/prywatnosc` currently discloses
  no name/address for the data controller (self-flagged in the page
  itself). Decision package with 3 variants prepared, no wording
  chosen or published:
  `docs/SPRINT_154_PRIVACY_CONTROLLER_IDENTITY_DECISION_V1.md`.
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
- **Real-device smoke test** — `docs/SPRINT_154_REAL_DEVICE_SMOKE_CHECKLIST_V1.md`.
- **Beta-status prominence** — optional copy/placement tweak proposed
  (not applied) in `docs/SPRINT_154_COLD_USER_BETA_FRAMING_AUDIT_V1.md`;
  Adam's call whether it's worth doing before or during beta.

## DEFERRED TO BETA (explicitly not blocking, per this sprint's scope)

- Locality quick-select chips (replace free-text "Moja okolica").
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

**PUBLIC BETA CONDITIONAL GO ⚠️**

The product itself (public-facing routes, trust messaging, feedback
channel, admin-write protection) is in good shape and did not surface
any blocking defect this sprint. What's actually gating a "public"
(not just recruited-pilot) launch are four bounded, mostly
non-code items: the privacy controller-identity decision, one real
end-to-end admin-workflow QA pass, a human judgment call on current
data freshness/coverage, and a real-device check. None of these
require new engineering scope — they require Adam's time and
decisions, not more code.
