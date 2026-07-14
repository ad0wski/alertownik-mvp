# Sprint 156C-1 — Public Beta Final Gates Audit and Controlled Runbook v1

Executed 2026-07-14 on branch `sprint-156c-final-operational-gates-audit-v1`,
base commit `4f9b920` (Sprint 156B close). **Read-only/documentation
sprint — zero product code changed.** No Production, Vercel, env,
Supabase, SQL, RLS, cron, admin session, or live write of any kind was
performed.

---

## 1. Executive status

**Headline finding, not previously stated this plainly in any prior
sprint doc: none of Sprint 154, 155, or 156B has been merged to `main`
or deployed to Production.**

`main`/`origin/main` is still at `dc6bb53` (Sprint 153). Sprints 154,
155, and 156B exist only as three sequential, unmerged feature
branches (`5db9f52` → `a36de69` → `4f9b920`). This was verified two
ways this sprint:

- `git log --oneline main..sprint-156-mobile-first-product-polish-v1`
  shows all three commits still ahead of `main`.
- A read-only fetch of the live site
  (`https://alertownik-mvp.vercel.app/`) confirms Production is still
  serving **pre-Sprint-154 content verbatim**: the old anonymous
  `/prywatnosc` text ("osobę prywatną (administratora projektu)"), the
  old private contact address (`ak.jurkowski@gmail.com`, not
  `alertownik.kontakt@gmail.com`), the old hero paragraph including the
  exact retired phrase "bez przeszukiwania długich ogłoszeń", and the
  old category-pill row ("Awarie", "Komunikaty lokalne") that Sprint
  156B removed.

**Practical consequence:** every gate this document marks "code
complete" below is true of the branch, not of the public site a real
visitor sees today. The privacy-identity fix (Sprint 155's actual
purpose) is **not yet live** — the public site still exposes the
previous private email address. This is the single most important
fact in this audit and the reason the verdict below cannot exceed
**CONDITIONAL GO — FINAL MANUAL GATES REMAIN**, per this sprint's
explicit ceiling.

Everything else in this document should be read through that lens:
code-level readiness is high and well-tested; live-Production
readiness for several of Sprint 154's original four gates has not
actually changed yet, because nothing has shipped.

---

## 2. Final gate matrix

Legend: **PASS** (verified with evidence) · **REQUIRES MANUAL
VERIFICATION** (needs a human step Claude cannot or should not
perform) · **BLOCKED** (a specific approval or prerequisite is
missing) · **NO-GO** (a real defect found — none this sprint).

| # | Gate | Status | Evidence | Remaining action | Risk | Manual approval required |
|---|---|---|---|---|---|---|
| 1 | Core public experience | REQUIRES MANUAL VERIFICATION | Code: 409/409 `test:e2e`, `npm run check` clean, on branch `sprint-156-mobile-first-product-polish-v1`. Production: still pre-Sprint-154 (confirmed live). | Merge `main` ← this branch chain; deploy; re-smoke Production. | Low (well-tested code) | **Yes — merge + Production deploy** |
| 2 | iPhone real-device smoke | PASS | Adam ran the Sprint 154 checklist on iPhone Safari: technical PASS, 7/10 first impression; findings addressed in Sprint 156B code. | Re-run once the fixes are actually live. | Low | No (informational re-check only) |
| 3 | Mobile UX (Sprint 156B polish) | REQUIRES MANUAL VERIFICATION | Code complete + tested (409/409); confirmed **not live** — Production still shows the old hero/category-pill/header. | Deploy, then re-verify on a real phone. | Low | **Yes — deploy** |
| 4 | Search | PASS | Unchanged across all three branches; existing `test:e2e` coverage passes; already live and working on current Production. | None. | None | No |
| 5 | Category filters | REQUIRES MANUAL VERIFICATION | Wrap-fix code complete, tested; old horizontal-scroll behavior (functional, just less discoverable) is what's still live. | Deploy. | Low | **Yes — deploy** |
| 6 | Locality personalization (quick-pick) | REQUIRES MANUAL VERIFICATION | Code complete, tested (localStorage-verified in `test:e2e`); not live — old "Moje alerty" flow (still functional) is what a visitor sees today. | Deploy. | Low | **Yes — deploy** |
| 7 | Waste schedule | PASS | Core feature already live and correct; Sprint 156B's hierarchy tightening is a polish item not yet deployed but not a functional gap. | Deploy the polish when convenient. | None | No |
| 8 | Privacy controller identity | BLOCKED | Code complete (Sprint 155), tested; **confirmed not live** — Production still shows the anonymous operator text and the old private email address. | Merge + deploy Sprint 155 (bundled with 154/156B in the current branch chain). | Medium (public trust/legal exposure while unresolved) | **Yes — merge + Production deploy** |
| 9 | Project contact (dedicated address) | BLOCKED | Same as #8 — `alertownik.kontakt@gmail.com` exists only in code, not live. | Same as #8. | Medium | **Yes — merge + Production deploy** |
| 10 | Legal wording completeness | Per §6: **MATERIAL GAP** found (see below); standing flag `REQUIRES LEGAL WORDING VERIFICATION BEFORE PUBLIC RELEASE` unchanged. | See §6 — third-country data-transfer disclosure (Vercel/Supabase/Anthropic, all US-domiciled) is not currently addressed anywhere on `/prywatnosc`. | Adam decides on the proposed one-paragraph addition in §6.3; no code changed automatically. | Medium | **Yes — content change + ideally professional legal review** |
| 11 | Admin authentication | PASS | Real Supabase Auth (email/password), `AuthGate`/session checks confirmed in code; unchanged across all branches, already live and correctly gating `/admin` on current Production (confirmed read-only this session — no data leak to an anonymous visitor). | None. | Low | No |
| 12 | Sources workflow (general) | REQUIRES MANUAL VERIFICATION | Full workflow mapped read-only this sprint (§3); no automated test exercises real writes; Sprint 155's admin-workflow QA checklist still not executed by anyone. | One real, controlled manual pass — see §4 runbook. | Low–Medium (real writes) | **Yes — live-write approval for any write step** |
| 13 | Source Checker | REQUIRES MANUAL VERIFICATION | "Sprawdź stronę" (preview fetch) is confirmed read-only/no DB write. Saving a check result, marking checked, or saving a candidate **are real writes**. | Read-only preview can be exercised now; write buttons need separate approval — see GATE ADMIN-3. | Low (preview) / Medium (writes) | **Yes, for the write buttons — SEPARATE LIVE-WRITE APPROVAL REQUIRED** |
| 14 | Candidate Queue | REQUIRES MANUAL VERIFICATION | Reading the queue is read-only; status-changing actions are real writes to `source_notice_candidates`. | Read-only review can happen now; do not change any candidate's status without separate approval. | Low (read) / Medium (write) | **Yes, for status changes** |
| 15 | Candidate Verifier ("Zweryfikuj (pomocnik)") | PASS | `ruleBasedVerifyCandidate` is a pure, deterministic function — no DB call, confirmed by code read and existing unit tests (`candidateVerifier.spec.ts`). | None. | None | No |
| 16 | Review actions (Zatwierdź/Odrzuć/convert) | REQUIRES MANUAL VERIFICATION | All confirmed real writes to `source_notice_candidates.status`; never exercised end-to-end this session or (per Sprint 155's still-open checklist) any prior session. | Controlled manual pass — see GATE ADMIN-4. | Medium | **Yes** |
| 17 | Builder (open/preview/draft/publish/archive) | REQUIRES MANUAL VERIFICATION | Opening and browsing is read-only. Draft/publish/archive/restore all write to `alerts` and are **not covered by any automated test**. Sprint 155's checklist for this is still unexecuted. | Controlled manual pass, read-only portions only this sprint — see GATE ADMIN-5. | Medium–High (publish affects public data) | **Yes, especially for Publish** |
| 18 | Manual publishing flow | BLOCKED | By this sprint's own explicit instruction — documentation only, not to be exercised. | Separate future sprint/approval. | Medium–High | **Yes** |
| 19 | Active alert freshness (overall) | PASS | Sprint 154/155 read-only anon-key audits (2026-07-13) found 4 published rows, 2 correctly-bucketed active, 2 correctly-bucketed ended, zero stale-shown-as-live defects. Not re-queried live this session — this session's Bash tool hit the same SSL/schannel limitation that blocks `git push` (see §9), so no fresh direct DB read was possible; relying on the prior same-week audit plus this sprint's official-source cross-check of both WKD alerts (below). | Optional: re-run the anon-key freshness query once connectivity/MCP is available. | Low | No |
| 20 | WKD schedule alert ("Rozkład jazdy WKD od 29 czerwca") | PASS — **SOURCE VERIFIED, KEEP ACTIVE UNTIL DEFINED END DATE** | Official WKD site confirms verbatim: "Rozkład jazdy obowiązujący od 29 czerwca 2026 r. do 30 sierpnia 2026 r." — exact match to the DB record (`starts_at=2026-06-29`, `ends_at=2026-08-30`). | None — re-check near 2026-08-30 for the next schedule change. | None | No |
| 21 | Open-ended WKD delay alert ("Możliwe kilkuminutowe opóźnienia") | **REQUIRES HUMAN JUDGMENT** | Official WKD notice page still live, still reads as an active heat-related speed-restriction notice with no stated end date and no follow-up "restriction lifted" notice found on the WKD aktualności listing. A heat-triggered restriction's real-world status cannot be confirmed from a static announcement page alone — see §5.2. | Adam's judgment call: keep active (re-verify occasionally), set an end date if WKD updates the notice, or archive if independently confirmed lifted. | Low (informational alert, not safety-critical) | **Yes — data change (any of the three options) needs Adam** |
| 22 | Cron deployment (config only, checks OFF) | PASS | Sprint 153 Phase A **is** on `main`/Production (`dc6bb53`) — confirmed via `git log`: `main` = Sprint 153's own commit. `vercel.json` present, single cron, `/api/cron/check-michalowice`, `0 5 * * *`. Route confirmed zero-write by code read this session (no Supabase import in `cronCheckSources.ts`). | None for Phase A itself. | Low | No (already approved/done in Sprint 153) |
| 23 | First automatic cron observation (Phase B) | BLOCKED | Per Sprint 153 docs, Phase B (`SCHEDULED_CHECKS_ENABLED=true`) has never been activated. Not activated this sprint either. | See §7 runbook — requires a separate, explicit approval to flip the env var for one observation window. | Low (route is zero-write by construction even if triggered) | **Yes — SEPARATE PRODUCTION ENV APPROVAL REQUIRED** |
| 24 | Restoration of `SCHEDULED_CHECKS_ENABLED=false` | BLOCKED (pending #23) | Cannot restore a flag that has never been flipped on. | Only relevant once #23 is executed — restore immediately after the single observation window per the existing Sprint 153 runbook. | Low | **Yes — same env approval as #23** |
| 25 | Final Production release (merge Sprints 154–156B) | BLOCKED | Confirmed via `git log`: 3 commits ahead of `main`, none merged. | Adam's explicit merge + deploy decision. | Medium (bundles UI + privacy + mobile changes) | **Yes** |
| 26 | Production smoke | PASS | Read-only fetch this session against current live Production: homepage loads cleanly, no console/application errors, `/admin` correctly shows no data to an anonymous visitor, footer/nav links present and correct. | Re-run after any future deploy. | Low | No |
| 27 | Feedback (mailto flows) | PASS (mechanism) / REQUIRES MANUAL VERIFICATION (address) | Mailto mechanism itself works identically before/after Sprint 155 (only the target address constant changed); confirmed still functional on current Production, but pointing at the **old** address until deployed. | Deploy to update the live address. | Low | **Yes — deploy** (bundled with #8/#9) |
| 28 | Secret safety | PASS | `.env.local` untracked; `git ls-files` shows only `.env.example`; `git grep service_role` finds only a doc/comment reference, no value; no new secret-shaped strings introduced this sprint (no code changed). | None. | None | No |
| 29 | No autopublish | PASS | Full admin-workflow chain mapped this sprint (§3): every write path (Source Checker → candidate → Verifier suggestion → Review action → Builder draft → **manual** "Opublikuj") requires an explicit human click at the final step; cron routes are zero-write by construction (confirmed no Supabase import); AI Helper never writes directly. | None. | None | No |
| 30 | Public beta go/no-go | **CONDITIONAL GO — FINAL MANUAL GATES REMAIN** | See §11. | See §11. | — | **Yes — see §11** |

---

## 3. Admin workflow — read-only audit

Full SOURCE → CHECK → PROPOSAL → CANDIDATE → VERIFY → REVIEW → BUILDER
→ MANUAL PUBLICATION chain, mapped by reading code only (no session
created, no request sent, no password entered, no secret displayed,
no test alert created):

1. **`/admin` dashboard** (`src/app/admin/page.tsx`) — read-only.
   Reads `alerts`, `alert_sources`, `source_checks`,
   `source_notice_candidates`, a waste-schedule table. Every action on
   the page is a `<Link>` to another tool; no mutation call anywhere
   on this page itself. Requires a session; shows a login prompt if
   none (confirmed by this session's read-only Production fetch: no
   data leak to an anonymous visitor).
2. **`/admin/sources` — Source Checker**
   (`src/app/admin/sources/page.tsx`,
   `src/app/api/sources/fetch-preview/route.ts`,
   `src/app/api/sources/check/route.ts`):
   - **"Sprawdź stronę"** → server-side fetch + HTML parse of the
     source URL. **No Supabase write** — result lives only in
     transient React state (`previewData`) until an explicit save
     button is clicked.
   - **"Zapisz wynik sprawdzenia"** → writes `source_checks`.
   - **"Oznacz jako sprawdzone"** → updates
     `alert_sources.last_checked_at`.
   - **"Zapisz jako kandydata →"** → writes `source_notice_candidates`
     (status `pending`) — the only path that creates a candidate; it
     never creates an `alerts` row directly.
   - Source registry add/edit/delete/toggle-active → writes
     `alert_sources`.
   - No dry-run/real distinction exists for these writes — every save
     button is an immediate, real write once clicked. All require an
     authenticated session (RLS: `auth.role() = 'authenticated'`).
3. **Candidate Queue / Verifier**
   (`src/app/admin/queue/page.tsx`, `src/lib/candidateVerifier.ts`,
   `src/lib/candidateReviewActions.ts`, `src/components/CandidateCard.tsx`):
   - Reading the queue and clicking **"Zweryfikuj (pomocnik) →"** is
     read-only — `ruleBasedVerifyCandidate` is a pure function
     (source/date/category/duplicate heuristics), confirmed no DB call.
   - **"Zatwierdź"**, **"Odrzuć"**, **"Utwórz draft z kandydata"**,
     **"Cofnij/Przywróć do oczekujących"** all call
     `updateCandidateStatus(id, status)` → **write**
     `source_notice_candidates.status`. Converting to a draft hands
     off to Builder via `sessionStorage`; it does not write `alerts`
     directly — publishing still happens later, manually, in Builder.
4. **Builder** (`src/app/builder/page.tsx`,
   `src/lib/supabaseAlertWrites.ts`) — opening/browsing/filtering is
   read-only. Writes, all to `alerts`, all session-gated:
   - "Zapisz jako draft w Supabase" → insert/update, `status=draft`.
   - "Opublikuj w Supabase" / "Opublikuj" (list row) → `status=published`,
     sets `published_at`.
   - "Zarchiwizuj" → `status=archived`.
   - "Przywróć jako draft" → `status=draft`.
5. **AI Helper** (`src/app/ai-helper/page.tsx`) — confirmed **no direct
   Supabase write**. Calls the server-side `/api/ai/draft-alert` route
   (Anthropic key stays server-side); "send to Builder" only writes to
   `sessionStorage`, then navigates to `/builder`. All real persistence
   happens later, in Builder, manually.
6. **Auth** (`src/lib/auth.ts`, `AuthGate`) — real Supabase Auth
   (`signInWithPassword`), a genuine session persisted client-side; any
   authenticated user is treated as admin (no separate roles table).

**Test coverage found:** `sourceCheck.spec.ts`, `sourceParserFixtures.spec.ts`,
`sourceChecklist.spec.ts`, `sourceHealth.spec.ts`, `candidateQueue.spec.ts`,
`candidateVerifier.spec.ts`, `candidateReviewActions.spec.ts`,
`auth-guards.spec.ts` — all unit-style or logged-out-only; **none**
exercise a real Supabase write with a live session. Builder's
draft/publish/archive/restore actions have **no automated test at
all** — this matches Sprint 155's own still-open
`SPRINT_155_ADMIN_WORKFLOW_QA_CHECKLIST_V1.md`, which nobody has
executed yet.

---

## 4. Admin workflow — controlled manual runbook

For Adam. Gated, in order. Stop and return to the coordinating session
between gates if anything looks wrong — don't improvise past an
unexpected result.

### GATE ADMIN-1 — Login and dashboard read (read-only)
1. Go to `https://alertownik-mvp.vercel.app/login`.
2. Log in with your real admin credentials.
3. **Expect:** redirect to `/admin`; header now shows admin nav links
   (Panel, Nowy alert, Kreator alertu, AI Helper, Źródła, Kandydaci,
   Harmonogram odpadów, Wyloguj).
4. On `/admin`, read the stats (Wszystkie/Opublikowane/Drafty/
   Zarchiwizowane), "Źródła do sprawdzenia," "Ostatnie sprawdzenia."
   **Do not click any write action.**
5. Screenshot the dashboard stats now, for a before/after comparison
   later if you do any writes in later gates.
6. This gate is **read-only**. Nothing here can write data.

### GATE ADMIN-2 — Sources list read (read-only)
1. Go to `/admin/sources`.
2. Confirm the source list loads, search/filter controls work.
3. Open "Historia" on one source; confirm check history renders.
4. **Do not click "Zapisz wynik sprawdzenia," "Oznacz jako sprawdzone,"
   "Zapisz jako kandydata," or any add/edit/delete source control.**
5. This gate is **read-only**.

### GATE ADMIN-3 — Source Checker (mixed — stop before any write)
1. On `/admin/sources`, pick one source and click **"Sprawdź stronę."**
2. **Expect:** a preview of fetched/parsed content appears in the page
   (client-side state only).
3. This click itself is **read-only** — confirmed by code read, no
   Supabase call in the fetch-preview path.
4. **STOP HERE.** Do **not** click "Zapisz wynik sprawdzenia," "Oznacz
   jako sprawdzone," or "Zapisz jako kandydata →" — all three are real
   writes (`source_checks`, `alert_sources.last_checked_at`,
   `source_notice_candidates` respectively).
5. **SEPARATE LIVE-WRITE APPROVAL REQUIRED** for any of those three
   buttons. Return to the coordinating session and explicitly say
   which one (if any) you want to try, before clicking it.

### GATE ADMIN-4 — Candidate Queue and Verifier (read-only review only)
1. Go to `/admin/queue`.
2. Read existing candidates (if any); note their current status.
3. If you want, click **"Zweryfikuj (pomocnik) →"** on one — this is
   read-only (pure rule-based check, no DB write).
4. **Do not click "Zatwierdź," "Odrzuć," "Utwórz draft z kandydata,"**
   or the restore/undo buttons — all of these write
   `source_notice_candidates.status`.
5. **Do not change any candidate's status this gate.**

### GATE ADMIN-5 — Builder open/preview (no publish)
1. Go to `/builder`.
2. Confirm the blank form loads and accepts input; try opening an
   **existing** draft/published alert via edit mode (`?edit=[slug]`)
   to confirm it pre-populates correctly.
3. This is safe to browse — reading and typing into the form doesn't
   save anything until you explicitly click a save/publish button.
4. **Do not click "Zapisz jako draft w Supabase," "Opublikuj w
   Supabase," "Zarchiwizuj," or "Przywróć jako draft."**
5. If you want to test a save, use a throwaway title clearly marked
   TEST — but this is a real write; treat it as GATE ADMIN-6-adjacent
   and use your own judgment, not this sprint's approval.

### GATE ADMIN-6 — Manual publishing (documentation only, not executed)
This gate is **not to be performed** as part of this sprint.
Publishing (or archiving/restoring a real alert) is a genuine
production-data change and needs its own separate, explicit approval —
ideally as part of finally executing the still-open
`docs/SPRINT_155_ADMIN_WORKFLOW_QA_CHECKLIST_V1.md` end-to-end, once
you're ready to treat that as a deliberate task rather than a
by-the-way click during this audit.

**After any gate involving writes:** click "Wyloguj" when done, and
compare the `/admin` dashboard stats you screenshotted in GATE
ADMIN-1 against the new numbers to confirm only the changes you
intended happened.

---

## 5. WKD alert review

### 5.1 — "Rozkład jazdy WKD od 29 czerwca" (schedule change)

Official source: `https://wkd.com.pl/aktualnosci` (fetched this
session). The site's own current notice reads: **"Rozkład jazdy
obowiązujący od 29 czerwca 2026 r. do 30 sierpnia 2026 r."** — an
exact match to the DB record (`starts_at=2026-06-29`,
`ends_at=2026-08-30`, per Sprint 154's freshness audit).

**Status: SOURCE VERIFIED — KEEP ACTIVE UNTIL DEFINED END DATE.** No
data changed.

### 5.2 — "Możliwe kilkuminutowe opóźnienia na linii WKD" (speed restriction)

Official source:
`https://wkd.com.pl/aktualnosci/3675-ograniczenia-predkosci-na-linii-wkd`
(fetched this session). The notice (dated 2026-06-29) states speed
restrictions were introduced due to high temperatures, causing possible
several-minute delays. **No end date is given on the page itself.**
Cross-checked against the current WKD aktualności listing: no newer
notice about this restriction being lifted, updated, or extended was
found; the next-most-recent unrelated item is a July 9 ticket-machine
maintenance notice.

Per this sprint's explicit instruction, neither assumption is safe:
the page's continued existence doesn't prove the restriction is still
active, and its age doesn't prove it has ended. A heat-triggered speed
restriction is, by nature, condition-dependent — WKD's own static
announcement page cannot answer whether today's actual operating speed
is still restricted.

**Status: REQUIRES HUMAN JUDGMENT.** No data changed. Recommendation
(from Sprint 155's own prior review, still valid): re-check the live
source immediately before public launch and either (a) confirm still
active and refresh `updated_at`/set a concrete `ends_at` if WKD's page
now gives one, (b) archive if independently confirmed lifted, or
(c) treat as the single highest-priority item on the next source-check
pass if it can't be resolved right now.

---

## 6. Legal wording audit (`/prywatnosc`, `/zasady`)

**Correction (Sprint 156C-2, 2026-07-14):** the international-transfer
finding in this section used an over-broad simplification — "Vercel,
Supabase, Anthropic are US-domiciled, therefore a gap exists" — that
treated provider headquarters as sufficient evidence of an actual data
transfer, without checking actual data flows, actual plan/contract
terms, or actual infrastructure regions. Sprint 156C-2 re-derived this
finding from evidence and **implemented** a narrower, more precisely
scoped disclosure covering Vercel only (confirmed Hobby plan, Vercel's
own DPA confirmed inapplicable at that tier, confirmed default US
compute region) — deliberately excluding Supabase (region genuinely
unconfirmed, not guessed) and Anthropic (confirmed to receive no
personal data at all). See
`docs/SPRINT_156C2_PRIVACY_DATA_FLOW_AND_TRANSFER_EVIDENCE_V1.md` for
the full evidence matrix. The §6.3 proposed paragraph below is
**superseded** by that implementation — kept here only as a historical
record of the original (less precise) reasoning.

**Method note:** EUR-Lex's and UODO's own pages did not render usable
content through this session's fetch tool (empty/404 responses for the
specific URLs tried) — this is a tooling limitation, not a claim that
these sources don't exist. The analysis below relies on GDPR Article
13's well-established, unchanged-since-2018 structure. This is a
**technical completeness check against a known checklist, not a
substitute for professional legal review** — the standing flag below
is unchanged regardless of this audit's findings.

### 6.1 — What's present and adequate

Reading current `src/app/prywatnosc/page.tsx` against GDPR Art. 13(1)–(2):
- **(a) Controller identity + contact** — ✅ named individual (Adam
  Jurkowski) + dedicated email, added Sprint 155.
- **(c) Purposes + legal basis** — ✅ "Po co przetwarzamy dane" states
  purposes and legal basis (legitimate interest; voluntary action for
  email).
- **(d) Legitimate interests pursued** — ✅ names the specific interest
  ("prowadzenie i zabezpieczenie serwisu pilotażowego").
- **(e) Recipients** — ✅ "Komu powierzamy dane" names actual processors
  (Vercel, Supabase, mail provider, Anthropic) — exceeds the minimum
  "categories of recipients" bar.
- **13(2)(a) Retention period/criteria** — ✅ "Jak długo przechowujemy
  dane" states criteria (acceptable under Art. 13(2)(a), which
  explicitly allows criteria instead of a fixed period).
- **13(2)(d) Right to complain to a supervisory authority** — ✅ names
  "Prezesa UODO" specifically.
- `/zasady` doesn't need Art. 13 elements (it's a terms/disclaimer
  page, not a data-collection notice) and introduces no contradictions
  with `/prywatnosc`.

### 6.2 — Gaps found

- **MATERIAL GAP — 13(1)(f) international data transfer.** Vercel,
  Supabase, and Anthropic are all US-domiciled companies; hosting/DB/AI
  infrastructure very plausibly involves data leaving the EEA. The
  current page states *who* the processors are but never addresses
  *where* the data may go or what safeguards apply (e.g. Standard
  Contractual Clauses). This is not hypothetical given the actual
  vendor list — it's the single most concrete finding of this audit.
- **MINOR — 13(2)(b) data portability** not listed alongside
  access/rectification/erasure/restriction/objection. Portability's
  applicability here is genuinely debatable (it applies to
  consent/contract-based, automated processing — most of Alertownik's
  server-side processing is neither), but omitting it silently is
  weaker than either including it or stating why it doesn't apply.
- **MINOR — legal-basis framing for the email/feedback channel.** The
  page says the basis is "Twoje dobrowolne działanie (wysłanie
  wiadomości)" — informally consent-like language without invoking
  Art. 6(1)(a) or stating a right to withdraw. Whether this should be
  legitimate interest (correspondence handling) or consent is exactly
  the kind of characterization a real legal review should settle, not
  this audit.
- **MINOR — DPO / automated decision-making** — both are genuinely
  inapplicable at this project's scale, so their absence isn't a
  defect, but one clarifying sentence for each ("nie wyznaczono
  inspektora ochrony danych — nie jest wymagany przy tej skali
  przetwarzania"; "nie stosujemy zautomatyzowanego podejmowania
  decyzji") would remove any ambiguity for a careful reader at zero
  cost.

### 6.3 — Proposed minimal addition (NOT applied — awaiting Adam)

**File:** `src/app/prywatnosc/page.tsx`
**Section:** new bullet or short paragraph inside "Komu powierzamy
dane" or a new short section directly after it.

Proposed text (placeholder framing, no invented facts):

> Część dostawców, z których korzysta Alertownik (m.in. Vercel,
> Supabase, Anthropic), może przetwarzać dane poza Europejskim
> Obszarem Gospodarczym. W takich przypadkach opieramy się na
> mechanizmach zgodności przewidzianych w RODO (np. standardowych
> klauzulach umownych stosowanych przez tych dostawców).

**Justification:** directly closes the 13(1)(f) gap identified above,
without adding any personal data or making claims beyond what's
already implied by using these named processors. **Official source
for the underlying requirement:** GDPR Art. 13(1)(f) / Art. 44–49
(Chapter V, international transfers) — `https://eur-lex.europa.eu/eli/reg/2016/679/oj`.

**This is a proposal only. No file has been edited.** Adam's approval
is required before this (or any alternative wording) is applied — this
is a content change to a legal page, explicitly gated per this
sprint's instructions.

### 6.4 — Status

**MATERIAL GAP** (international transfer disclosure) **+
`REQUIRES LEGAL WORDING VERIFICATION BEFORE PUBLIC RELEASE`** (flag
carried forward unchanged, per every prior sprint that touched this
page). This is a technical completeness finding, not a legal opinion —
professional review remains the right next step before wide public
exposure, independent of whether the proposed addition above is
adopted.

---

## 7. Cron observation — read-only audit and runbook

### 7.1 — Confirmed facts (code read this session)

- Exactly one cron in `vercel.json`: path `/api/cron/check-michalowice`,
  schedule `0 5 * * *`.
- `src/app/api/cron/check-michalowice/route.ts` checks the fail-closed
  kill switch (`SCHEDULED_CHECKS_ENABLED`) **first**, before auth,
  before fetch, before parsing — confirmed by reading the file this
  session.
- `checkOneSource`/`buildDryRunSummary` (in `src/lib/cronCheckSources.ts`)
  contain **no Supabase import** — confirmed by `grep`. Zero writes to
  `candidates`, `source_checks`, or `alerts`; zero publish path.
- **This cron config (Phase A) is already on `main`/Production** —
  `main` = commit `dc6bb53` = Sprint 153's own commit, confirmed via
  `git log`. This is the one piece of Sprint 153-156B work that
  genuinely is already live.
- Phase B (`SCHEDULED_CHECKS_ENABLED=true`, the actual observation
  window) has **never been activated**, per Sprint 153's own docs and
  unchanged this session.

### 7.2 — Manual instructions for Adam (read-only checks only)

1. Vercel Dashboard → your project → **Deployments** → confirm the
   latest **Production** deployment is `Ready`, and note its commit
   hash.
2. Project → **Settings → Cron Jobs** → confirm exactly one entry:
   path `/api/cron/check-michalowice`, schedule `0 5 * * *`.
3. Click into that cron entry → **View Logs** (or **Runtime Logs**
   filtered to `requestPath:/api/cron/check-michalowice`) to see the
   most recent automatic invocation, if any.
4. In that log entry, look for: HTTP status, and in the JSON response
   body: `ok`, `dryRun`, `checkedSources`, `successfulSources`,
   `failedSources`, `savedCandidates` (must read `0`),
   `savedSourceChecks` (must read `0`), `published` (must read
   `false`).
5. Project → **Settings → Environment Variables** → confirm the
   current value of `SCHEDULED_CHECKS_ENABLED` (should currently read
   `false`, per Sprint 153's resting state).

**Do not** change this env var, click "Run" on the cron entry, send a
manual request as a substitute, or redeploy, as part of this check.

### 7.3 — Two paths

**PATH A — an automatic run exists and looks correct** (matches §7.2
step 4 exactly): note the timestamp and response fields for the
record. The **next** step would be flipping
`SCHEDULED_CHECKS_ENABLED=false`→`true` for a real observation window —
but that is **SEPARATE PRODUCTION ENV APPROVAL REQUIRED**, not
something to do as a continuation of this read-only check.

**PATH B — no automatic run exists yet, or the logs are ambiguous**:
this is expected if Phase B has genuinely never been activated (per
§7.1, it hasn't). Note this plainly; it is not a defect — the
observation window simply hasn't started yet.

Given §7.1's confirmation that Phase B has never been turned on,
**PATH B is the expected current state.**

---

## 8. Automated QA results

- `npm run check` (typecheck + lint + build) — ✅ zero errors, zero
  warnings. (No product code changed this sprint, so this reconfirms
  the Sprint 156B baseline rather than testing anything new.)
- `npm run test:e2e` — ✅ **409/409 passed**, 0 failed, 0 skipped, 0 flaky.
- `git diff --check` — ✅ clean (no product diff yet at time of this
  check; documentation-only commit follows).
- **Read-only public Production browser smoke** (via fetch, no
  interaction): homepage loads cleanly, no console/application errors,
  correct nav/footer links; `/admin` shows no data to an anonymous
  visitor (confirms the login gate); `/prywatnosc` and hero text
  confirmed to be the **pre-Sprint-154** version (see §1).
- **Not-found behavior**: unchanged from Sprint 154's prior
  observation — invalid alert slugs render an honest "not found" UI
  client-side but return HTTP 200, not a real 404 (known, previously
  logged, deliberately not fixed this sprint — out of scope).
- **Link/mailto audit**: footer and homepage mailto links confirmed
  present and correctly formed in code (unchanged Sprint 156 logic);
  live Production still resolves to the pre-Sprint-155 address per §1.
- No live admin actions, no write requests, no test weakened or
  skipped to hide a result.

---

## 9. Security

- `.env.local` not tracked (`git ls-files` confirms only `.env.example`).
- No new secrets introduced (no code changed this sprint).
- `git grep service_role` finds only a documentation/comment reference
  naming the term, no actual value, in `src/app/admin/page.tsx`'s own
  QA-checklist copy.
- No `CRON_SECRET` value ever displayed or logged by this audit.
- No Vercel, Supabase, RLS, SQL, or migration change.
- No live write, no alert changed, no publish, no autopublish, no cron
  state change, no Production deployment.
- **Tooling note:** this session's Bash/curl tooling hit the same
  Windows/schannel SSL certificate-revocation-check limitation that
  has previously blocked `git push` in this environment
  (`CRYPT_E_NO_REVOCATION_CHECK`) — confirmed by testing `curl` against
  an unrelated public site, not specific to Supabase or GitHub. This
  meant a direct anon-key Supabase query wasn't possible from this
  session's Bash tool; the `WebFetch` tool (routed differently) worked
  for the public site and WKD checks instead. Flagging this
  transparently rather than silently skipping the freshness re-check.

---

## 10. Documentation

This document (new). Also updated this sprint:
- `docs/SPRINT_154_PUBLIC_BETA_GO_NO_GO_V1.md` — corrected to state
  plainly that Sprint 155/156B are not deployed.
- Obsidian `Roadmap.md` and `Sprint Log.md` — new Sprint 156C-1 entry.
- `docs/SPRINT_155_ADMIN_WORKFLOW_QA_CHECKLIST_V1.md` — cross-referenced
  as still open (unexecuted), not duplicated.

---

## 11. Remaining manual approvals (exact list)

1. **Merge `main` ← `sprint-156-mobile-first-product-polish-v1`
   (bundles Sprints 154+155+156B) and deploy to Production.** This is
   the single action that would resolve gates #1, #3, #5, #6, #8, #9,
   #27 in one step.
2. **Execute `docs/SPRINT_155_ADMIN_WORKFLOW_QA_CHECKLIST_V1.md`
   end-to-end** with a real admin session (gates #12–18) — separate
   live-write approval needed for each write step per §4's runbook.
3. **Decide the fate of the open-ended WKD delay alert** (gate #21) —
   keep/update/archive, per §5.2.
4. **Decide on the proposed international-transfer disclosure addition**
   to `/prywatnosc` (gate #10) — or an alternative — and ideally get a
   professional legal review before wide public exposure.
5. **Decide whether/when to activate the Phase B cron observation
   window** (gates #23/#24) — separate Production env approval, per
   §7.3 PATH A's next step.

None of the above was executed this sprint. All require Adam's
explicit, separate go-ahead.

---

## 12. Go/No-Go

**CONDITIONAL GO — FINAL MANUAL GATES REMAIN** (the ceiling this
sprint was explicitly told not to exceed).

The product itself, as committed to the feature-branch chain, is in
good shape: 409/409 automated tests, clean typecheck/lint/build, a
real-device smoke pass with its findings addressed, a verified WKD
schedule alert, and a fully-mapped admin workflow with no autopublish
path found anywhere. But **none of it is live**, the open-ended WKD
alert still needs a human call, and one material legal-wording gap
(international transfer disclosure) was found. This is not a
regression from Sprint 156B's own reported status — it's a more
complete accounting of what "ready" actually means once Production
reality is checked directly, which no prior sprint in this chain had
explicitly done.
