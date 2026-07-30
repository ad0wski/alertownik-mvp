# Next Milestones — Alertownik

This document describes the next meaningful product milestones, not individual sprints.
It mirrors the gate system defined in the Obsidian project vault (canonical pages:
`Product Maturity Gates`, `Next 15 Sprint Plan`, `Current Priority Decision` in
`Adam_Life/04_Projekty/Alertownik/`). This repo copy is the short version for anyone
reading the codebase.

**Last updated: 2026-08-03 — Sprint 187A (Dzień 20 final audit, closing the Day 1–20 block).**
Previous version was frozen at Sprint 127 (July 2026) and had drifted significantly behind
20 days of real work (Powiat Pruszkowski source, Partner Demo, `/demo`, Store Readiness
audit) — see `docs/SPRINT_187A_DAYS_1_20_FINAL_AUDIT_V1.md` for the full accounting.

---

## Honest current stage

**Utility MVP with two real (still thin) positive user signals, Partner Demo materials
ready to send, and a documented — but not yet started — store-launch path.**

- Public MVP, admin tools, and Draft from Source (Flow B) exist and work.
- Real alerts are published (5 currently `published`); Komorów waste schedule is live on `/odpady`.
- Two real user signals so far: the original "jest git" (Gate 1, n=1) and Adam's mom's
  concrete Sprint 182A feedback (positive on look/usability, one real UX note already
  addressed). Neither is a *partner/institution* signal — that outreach hasn't been sent.
- **Local Beta tester recruitment** (stuck since Sprint 182A — invited testers
  didn't respond, deferred not abandoned) continues as an **external parallel
  stream owned by Adam** (Execution Block 1, 2026-08-03) — it no longer gates
  Etap B or Etap E work, though it's still required to fully close Local Beta
  and, later, Google Play's identical 12-tester/14-day requirement.
- **Actually sending the prepared Partner Demo outreach** is a separate,
  Adam-only decision (a ready-to-send package now exists — see Execution
  Block 1 — Claude never sends it without explicit approval).

## Gate system (canonical statuses live in Obsidian)

| Gate | Meaning | Status (2026-08-03) |
|---|---|---|
| 1. Utility MVP | real alerts + waste data + visible sourcing + ≥1 positive signal | ✅ passed (still thin — 2 informal signals) |
| 2. Local Beta | technical readiness + 3–5 tester responses | 🔶 technical side 100% done (real iPhone test); user-validation side at 1/3–5 responses — **external parallel stream (Adam), not a blocker for Etap B/E work** (Execution Block 1, 2026-08-03) |
| 3. Partner Demo | clean screenshots, demo page, 3–5 fresh examples, 2–3 user signals | 🔶 screenshots + demo page (`/demo`, `/partnerzy`) done; outreach message drafted but **not sent**; zero partner signals yet |
| 4. Monetization Test | offer + target list + outreach + pricing hypothesis (no payments code) | ⬜ not started |
| 5. Store Launch | verified PWA install, icons/screenshots, packaging decision, accounts/submission | 🔶 all technical/planning prep done (Sprint 186A); zero accounts, payments, or submissions started |

Gates are passed in order. Preparation for a later gate is fine; execution is not.
See `docs/SPRINT_187A_DAYS_1_20_FINAL_AUDIT_V1.md` §13 for the full percentage
methodology and formulas behind each status above.

## Source coverage (operational dimension, NOT a 6th Gate)

The official-source checklist (`src/lib/officialSourceChecklist.ts`) currently lists
**10 sources** (grew from 9 in Sprint 183A — Powiat Pruszkowski was added, and the
denominator was not updated in this document until this audit). **5 of 10 (50%)** are
automatically checkable (`SAFE_CHECK_SOURCE_IDS` in `src/lib/sourceCheck.ts`): Gmina
Michałowice komunikaty, WKD aktualności, Wodociągi Michałowice, Miasto Pruszków
aktualności, Powiat Pruszkowski Wiadomości. The remaining 5 (both PGE endpoints, Gmina
Michałowice wyłączenia prądu, Gmina Michałowice harmonogram odpadów, distributed
roboty-drogowe) are manual-only for structural reasons (PDF scans, no stable feed, or
active bot-blocking) documented per-source in the checklist itself — not a gap to "fix"
without the source itself changing.

## Roadmap (order, not calendar)

1. **Close Local Beta tester recruitment.** The one real blocker shared by Gate 2 and
   (per Sprint 186A) by any future Android/Play Console attempt — Google's own closed-
   testing requirement (12 testers, 14 consecutive days) is the same kind of task.
2. **Send the prepared Partner Demo outreach** (`docs/SPRINT_185A_PARTNER_DEMO_V1.md`) —
   drafted, not sent; Adam's decision on timing/recipient.
3. Source engine: Trusted Source Auto-Publish (Sprint 180C) remains built, RLS-backed,
   and **disabled** (`SCHEDULED_AUTO_PUBLISH_ENABLED` unset) pending a second, separately-
   approved canary attempt against a genuinely eligible candidate (two live re-checks in
   Sprints 183B/184A both ended NO-GO on real content grounds, not tooling).
4. Android packaging: **stay PWA-only until Local Beta closes**, then Android TWA, then
   iOS App Store last (decision + rationale in `docs/SPRINT_186A_STORE_READINESS_V1.md`).
5. Monetization Test — not started; needs an explicit decision to begin (offer + target
   list + pricing hypothesis), independent of the above.

## Standing rules

- **Manual admin approval remains the default for every alert.** Sprint 180C
  (CLAUDE.md Security Rule #10 amendment) added exactly one narrow, fail-closed
  exception: Trusted Source Auto-Publish. It only ever considers sources on a
  dedicated, code-narrowed allowlist (currently `pruszkow-aktualnosci` alone),
  requires nine simultaneous conditions (allowlisted source, safe direct
  permalink, current/upcoming, complete fields, non-duplicate/non-ambiguous
  dedup result, still-pending and unconverted, cap of one publish per run,
  idempotent re-runs), and fails closed on any single unmet condition — see
  `docs/SPRINT_180_TRUSTED_SOURCE_AUTO_PUBLISH_CANARY_V1.md` for the full
  design and the first canary's outcome. **As of this writing (2026-08-03) the
  mechanism is built, RLS-backed, and deployed but DISABLED**
  (`SCHEDULED_AUTO_PUBLISH_ENABLED` unset on Production) — confirmed via a live
  503 response from `/api/cron/auto-publish-trusted-source`, not just a prior
  report. Instant rollback is a flag flip + allowlist removal, never a code
  revert or SQL change.
- Official sources only (PGE / gmina / WKD / utilities); Facebook and community
  posts are discovery clues, never publication sources.
- No payments code, no push notifications, no scraping without explicit approval.
- No schema/RLS changes without an approved SQL proposal in `docs/`.

## Out of Scope (Permanent)

- Crowdsourced alerts or user-submitted reports — Alertownik surfaces official sources only
- Comments, reactions, or social features
- National news, weather, or non-local content
- Real-time scraping of websites without RSS feeds (legal and technical complexity)
