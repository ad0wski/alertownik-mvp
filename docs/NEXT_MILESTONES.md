# Next Milestones — Alertownik

This document describes the next meaningful product milestones, not individual sprints.
It mirrors the gate system defined in the Obsidian project vault (canonical pages:
`Product Maturity Gates`, `Next 15 Sprint Plan`, `Current Priority Decision` in
`Adam_Life/04_Projekty/Alertownik/`). This repo copy is the short version for anyone
reading the codebase.

Last updated: July 2026 — Sprint 127 (roadmap reset). The previous version of this
file was frozen at Sprint 58 and marked the AI Draft Generator as "active" — that
milestone shipped long ago (Sprints 57–58, Flow B in 115/118).

---

## Honest current stage

**Utility MVP with an early positive signal, before a scalable data engine.**

- Public MVP, admin tools, and Draft from Source (Flow B) exist and work.
- First real alerts are published; Komorów waste schedule (40 rows) is live on `/odpady`.
- First real user feedback is positive ("jest git") — but n=1.
- The main blocker is **data coverage and a repeatable source workflow**, not UX,
  not the app store, and not pricing.

## Gate system (canonical statuses live in Obsidian)

| Gate | Meaning | Status (2026-07-07) |
|---|---|---|
| 1. Utility MVP | real alerts + waste data + visible sourcing + ≥1 positive signal | ✅ passed (thin — n=1) |
| 2. Local Beta | 3–5 data categories, 5–10 testers, mobile tested on a real phone, no stale data | ⬜ not yet — **current focus** |
| 3. Partner Demo | clean screenshots, demo page, 3–5 fresh examples, 2–3 user signals | 🔶 close, not yet |
| 4. Monetization Test | offer + target list + outreach + pricing hypothesis (no payments code) | ⬜ not yet |
| 5. Store Launch | verified PWA install, PNG icons, screenshots, stable data, packaging decision | ⬜ not yet |

Gates are passed in order. Preparation for a later gate is fine; execution is not.

## Next sprints (order, not calendar — full table in Obsidian `Next 15 Sprint Plan`)

1. **Sprint 128 — PWA phone install test + screenshot/icon pack** (recommended next;
   unblocked, feeds Gates 3 and 5).
2. PGE manual source workflow in real use + waste coverage expansion (data).
3. Source Checker Dashboard v1 — only after ≥1 week of real logged source checks.
4. Reach 3–5 fresh alerts → local smoke test round 2 (5–10 testers).
5. Partner demo page → soft outreach (feedback first, money later).
6. Source engine stages: candidate queue → AI verifier → risk scoring → one-click
   approve. A first, narrow, guarded auto-publish exception shipped in Sprint
   180C (see Standing rules below) — currently disabled pending a second,
   separately-approved canary attempt (Sprint 181A hardened its dedup logic).
7. Android packaging decision (stay PWA vs TWA) and, only after its gate, Google
   Play Console. iOS remains LATER.

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
  design and the first canary's outcome. **As of this writing the mechanism is
  built, RLS-backed, and deployed but DISABLED** (`SCHEDULED_AUTO_PUBLISH_ENABLED`
  unset on Production) — the first canary surfaced a real bug (since fixed),
  and a second live attempt has not yet been approved. Instant rollback is a
  flag flip + allowlist removal, never a code revert or SQL change.
- Official sources only (PGE / gmina / WKD / utilities); Facebook and community
  posts are discovery clues, never publication sources.
- No payments code, no push notifications, no scraping without explicit approval.
- No schema/RLS changes without an approved SQL proposal in `docs/`.

## Out of Scope (Permanent)

- Crowdsourced alerts or user-submitted reports — Alertownik surfaces official sources only
- Comments, reactions, or social features
- National news, weather, or non-local content
- Real-time scraping of websites without RSS feeds (legal and technical complexity)
