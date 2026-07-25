# Sprint 166L-F / FAZA D — First Controlled Scheduled-Writer Run in Production: Checkpoint

**Status: complete. System is back in a safe, fail-closed resting state.**

This checkpoint documents the first-ever real invocation of
`GET /api/cron/write-candidates` against Production, performed under
narrow, explicit, single-shot approval, plus the full close-out sequence
that followed. It supersedes nothing in `SPRINT_166L_D_WRITER_IDENTITY_CREATION_PROCEDURE_V1.md`
or `SPRINT_166L_A_PRODUCTION_ENVIRONMENT_GUARD_AUDIT_V1.md` — those remain
accurate as of their own dates.

---

## 1. Summary of outcome

- Exactly **one** request was sent to
  `GET /api/cron/write-candidates?sourceKey=michalowice-komunikaty` in
  Production, from a one-shot Windows PowerShell 5.1 script (v4) run
  personally by Adam, using his own Production `CRON_SECRET` (never seen,
  requested, or logged by Claude).
- Response: **HTTP 200**, `published=false`, exactly **one** new
  candidate created with status `pending`.
- `sourceChecksInserted=0` — expected, not a bug: `SCHEDULED_WRITER_SOURCE_REGISTRY_IDS`
  (the JSON map used to resolve a registry `source_id` for `insertSourceCheck()`)
  is not configured in Production, so `getRegistrySourceId()` returns `null`
  and the source-check insert is skipped gracefully. The candidate insert
  itself does not depend on this mapping (`source_id` is nullable there).
- No alert was created or published. No email, Resend contact, claim, or
  finish action occurred. No second request or retry was ever sent.
- `SCHEDULED_WRITES_ENABLED` was restored to `false` in Production
  immediately afterward (one manual Save by Adam), followed by exactly one
  Redeploy, confirmed Ready.

## 2. Root cause of the earlier 503s (v2, v3) — recap

Both v2 and v3 failed with `HTTP 503 {"ok":false,"error":"Tryb zapisu jest wyłączony."}`.
This message is shared by Layer 1 (`SCHEDULED_CHECKS_ENABLED`) and Layer 2
(`SCHEDULED_WRITES_ENABLED`) in `src/app/api/cron/write-candidates/route.ts`,
so the response alone could not identify which flag was at fault.
`SCHEDULED_WRITES_ENABLED` was in fact correctly `"true"` from v2 onward
(re-verified character-by-character before v3). The actual blocker was
`SCHEDULED_CHECKS_ENABLED`, a separate, older flag last touched
2026-07-15 and never re-verified this session, which was `false` in
Production. Diagnosed via the read-only, admin-session-gated
`GET /api/admin/automation-status` panel ("Stan automatyzacji (canary)"
on `/admin/sources`) rather than further guess-and-retry against the live
write endpoint. Once `SCHEDULED_CHECKS_ENABLED=true` was set and
redeployed, v4 succeeded immediately.

## 3. Final Day-4 Production state (verified read-only)

Environment Variables (Production scope only; no values read or displayed):
| Variable | State |
|---|---|
| `SCHEDULED_CHECKS_ENABLED` | `true` (unchanged since the fix, this session) |
| `SCHEDULED_WRITES_ENABLED` | `false` (restored; freshly updated, redeployed) |
| `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED` | absent/false — never touched |
| `OPERATIONAL_EMAIL_ALERTS_ENABLED` | absent/false — never touched |
| `CRON_SECRET`, writer credentials | unchanged, configured |

Deployment: exactly one Redeploy of the existing `main` commit
(`1e9380b`, no code change, no merge) performed after the rollback,
confirmed **Ready**, domain `alertownik-mvp.vercel.app` serving it.

Smoke test (read-only): homepage triggers zero `/api/` calls. `/admin/sources`
triggers only `GET /api/admin/automation-status` calls (200s from the
authenticated session; a couple of transient 401s from pre-session-hydration
renders, matching normal client behavior — no `/api/cron/write-candidates`
call anywhere). No console errors. "Stan automatyzacji (canary)" panel
confirms:
- Automatyczne sprawdzanie: **aktywne**
- Automatyczne tworzenie kandydatów: **wyłączone**
- Zapis możliwy przy obecnej konfiguracji: **nie — co najmniej jedna brama zamknięta**

Database (Supabase, Production, read-only `SELECT` audit):
| Table | Count | Expected | Match |
|---|---|---|---|
| `scheduled_writer_runs` (total) | 1 | 1 | ✅ |
| `scheduled_writer_runs` (open/unfinished) | 0 | 0 | ✅ |
| `source_notice_candidates` (total) | 3 | 3 | ✅ |
| `source_checks` (total) | 2 | 2 | ✅ |
| `operational_notification_events` (total) | 0 | 0 | ✅ |
| `operational_notification_events` (claimed) | 0 | 0 | ✅ |
| `alerts` (total) | 6 | 6 | ✅ |
| `automation_identities` (total) | 2 | 2 | ✅ |

The one `scheduled_writer_runs` row: `id=a1ea78c5-...`, `trigger=manual`,
`environment_tag=production`, `outcome=success`,
`started_at=2026-07-25 18:18:41 UTC`, `finished_at=2026-07-25 18:18:42 UTC`.

The one new `source_notice_candidates` row: `id=c1bae2b7-...`,
`status=pending`, `source_id=null` (see §1), `created_at=2026-07-25 18:18:42 UTC`.

## 4. What was never done (and remains true)

- No second request or retry against `/api/cron/write-candidates`.
- No writer/RPC/Cron/claim/finish invocation beyond the single approved run.
- No email or Resend contact.
- No write-performing SQL executed by Claude.
- `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED` / `OPERATIONAL_EMAIL_ALERTS_ENABLED`
  remain absent/false.
- No merge to `main`; no branch deleted.

## 5. Remaining risks / open items

- The one new `pending` candidate (`c1bae2b7-...`) awaits manual admin
  review in the queue like any other candidate — no automatic path exists
  to publish it.
- `SCHEDULED_WRITER_SOURCE_REGISTRY_IDS` is still unconfigured in
  Production, so future controlled runs will continue to show
  `sourceChecksInserted=0` until/unless that mapping is deliberately added
  — a separate, future decision, not required for safety.
- `SCHEDULED_CHECKS_ENABLED=true` now stays enabled in Production
  (this flag alone does not enable writes — `SCHEDULED_WRITES_ENABLED`
  is the separate gate, currently `false`). Confirm this is the intended
  steady state before any future sprint assumes checks are disabled.
- One-shot PowerShell markers (v1–v4) remain in the local scratchpad
  directory (outside the git repo) as an audit trail; not part of this
  commit.
