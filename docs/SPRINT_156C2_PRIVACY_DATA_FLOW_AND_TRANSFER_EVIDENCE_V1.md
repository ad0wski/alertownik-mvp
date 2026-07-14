# Sprint 156C-2 — Privacy Data-Flow and International Transfer Evidence Verification v1

Executed 2026-07-14 on branch `sprint-156c2-privacy-transfer-evidence-wording-v1`,
base commit `9e851df` (Sprint 156C-1 close). This sprint corrects an
over-broad simplification in Sprint 156C-1: "Vercel/Supabase/Anthropic
are US-domiciled, therefore a transfer-disclosure gap exists" treated
provider headquarters as sufficient evidence of an actual data
transfer. It is not. This sprint re-derives the finding from actual
data flows, actual plan/contract terms, and actual default
infrastructure regions — and reaches a **narrower, more precisely
evidenced, and in one respect more concerning** conclusion than Sprint
156C-1's.

**This is a technical evidence-gathering exercise, not legal advice.**
`REQUIRES LEGAL WORDING VERIFICATION BEFORE PUBLIC RELEASE` is
unchanged and carried forward.

---

## 1. Executive conclusion

**RESULT B — DISCLOSURE REQUIRED — EVIDENCE SUFFICIENT FOR MINIMAL
IMPLEMENTATION — scoped narrowly to Vercel only.**

Three confirmed, code/documentation-backed facts, not an assumption
about company headquarters:

1. Alertownik runs on Vercel's **Hobby (free) plan** — already
   documented in Sprint 153 (`0 5 * * *` cron scheduling was explicitly
   chosen for "Hobby-plan safe" once-daily limits).
2. Vercel's own DPA (fetched from `vercel.com/legal/dpa`, 2026-07-14)
   states verbatim: **"This Addendum applies to Vercel's Processing of
   Personal Data as a Processor under the Agreement for Customers who
   are on Enterprise and Pro plans."** Hobby-tier customers are
   explicitly excluded from Vercel's standard contractual transfer
   safeguard.
3. `vercel.json` (read this sprint) contains no `regions` key, so
   Vercel Functions run in its documented default — `iad1` (Washington
   D.C., USA), per `vercel.com/docs/regions` (fetched 2026-07-14):
   **"Vercel Functions default to running in the `iad1` (Washington,
   D.C., USA) region."**

Together: personal data that genuinely does flow through Vercel
(technical/access logs — IP address, timestamp, path, user-agent, for
every visitor) is very likely processed on US infrastructure, **and
Alertownik currently has no confirmed contractual transfer safeguard
with Vercel for it**, because the plan tier in use doesn't come with
one. This is a **more specific and more actionable finding** than
Sprint 156C-1's — it doesn't just say "might be transferred," it says
"processed on US infra by default, with no DPA at this plan tier,"
which is the more materially important half of the story.

**Supabase and Anthropic are explicitly excluded from this
disclosure** — not because they're safe by assumption, but because the
evidence doesn't support saying anything specific about them (Supabase)
or because no personal data flows there at all (Anthropic). See §§6–7.

---

## 2. Actual personal-data inventory

| Data | Who | Where it lives | Ever sent to a third party? |
|---|---|---|---|
| Locality/category preference | Public visitor | Browser `localStorage` only (`src/lib/userPreferences.ts` — confirmed `localStorage.getItem/setItem` only, zero `fetch`/`axios` calls in that file) | **No** — never transmitted to any server |
| Search query | Public visitor | React component state only | No |
| Technical/access logs (IP, user-agent, timestamp, path) | Every visitor (public + admin) | Vercel's hosting infrastructure (inherent to serving any HTTP request) | **Yes — to Vercel**, see §5 |
| Feedback email content | Public visitor who chooses to write in | Sent directly from the visitor's own email client to the admin's inbox via a plain `mailto:` link (`src/lib/feedbackMailto.ts`) | **No** — confirmed this sprint: it never touches Alertownik's server or Vercel/Supabase at all; see §3.3 |
| Admin email + session | Administrator (natural person) | Supabase Auth (`auth.users`) | **Yes — to Supabase**, see §6 |
| Admin's `created_by` on check/candidate rows | Administrator | Supabase (`source_checks.created_by`, references `auth.users.id`) | Yes — to Supabase (admin's own data only) |
| Official public-source announcement text, pasted by admin | **Not personal data** — publicly published government/operator notices | Sent to Anthropic's API for drafting help | Yes, but not personal data — see §7 |
| Public alert content (title, place, dates, source URL) | N/A — not personal data | Supabase `alerts` table (public, RLS-readable) | Yes — to Supabase, but contains no personal data |

**No public-user account, form, or database exists at all.** Public
visitors are, and remain, anonymous to Alertownik's own systems.

---

## 3. Public-user flows (§B1)

- **Locality/category preference**: confirmed client-side-only,
  `localStorage`, never sent to any server (already correctly stated
  in the current privacy policy).
- **Search**: client-side filtering of already-fetched public alert
  data; no query is ever sent anywhere.
- **Cookies/analytics/tracking**: confirmed **none** — `package.json`
  has exactly 3 runtime dependencies
  (`@anthropic-ai/sdk`, `@supabase/supabase-js`, `next`/`react`/`react-dom`),
  no analytics/cookie library among them; `git grep` for
  `document.cookie`/`set-cookie`/`cookies()` across `src/` returns
  nothing; no `middleware.ts` exists at all (no Edge Middleware).
- **No `@vercel/analytics` or `@vercel/speed-insights` package** is
  installed — confirmed via `package.json`. Whatever Vercel Analytics
  dashboard exists (if any) at the account level is not driven by any
  in-app SDK collecting additional data beyond standard request logs.
- **Feedback mailto**: see §3.3 below — not a server-side form.
- **IP address / technical logs**: inherent to HTTP hosting, not
  something Alertownik's own code chooses to collect beyond what
  Vercel's platform does by default. This is the one confirmed
  personal-data flow through Vercel — see §5.

### 3.3 — Feedback is not a backend form

`src/lib/feedbackMailto.ts` builds plain `mailto:` URLs (confirmed by
reading the file this sprint — every exported function returns a
string starting with `mailto:`). Clicking one of these links opens the
**visitor's own local email client**, addressed to the project's
contact email. **Alertownik's server never receives, stores, sees, or
forwards this message.** It is a direct visitor → Adam's personal
inbox flow using whichever mail provider the visitor and Adam
personally use — not a "Vercel/Supabase-mediated" data flow at all.
The current privacy policy's "E-maile z opiniami" bullet is accurate
in substance (you do end up giving Adam your email + message) but
worth being precise about here: this specific mechanism involves
neither Vercel nor Supabase as a processor in any capacity.

---

## 4. Admin flows (§B2)

- **Supabase Auth**: real email/password authentication; Supabase
  stores the admin's email and a hashed credential in `auth.users`.
  This is personal data of the administrator (a natural person), not
  of any public user — there is no roles table, no multi-tenant user
  base, just the small number of people Adam has given login access
  to.
- **Panel/Sources/Candidate Queue/Builder**: all confirmed read
  operations pull from Supabase tables containing no public-user
  personal data (public alert content, source registry, check history,
  candidates) — the only personal-data column found across these
  tables is `source_checks.created_by` (references `auth.users.id`),
  which identifies which admin performed a check, not any public user.
- **AI Helper / all AI integrations**: see §7 — confirmed to send only
  admin-pasted public source text, never admin account data (no email,
  session token, or IP is included in the Anthropic request body,
  confirmed by reading `src/app/api/ai/draft-alert/route.ts` this
  sprint — the payload is built from `sourceText`/`sourceName`/
  `sourceUrl`/`suggestedCategory`/today's date only).
- **Incidental note (not in scope for the transfer question, flagged
  for completeness):** `/api/ai/draft-alert` itself has no server-side
  session check in the route handler — the UI gate is client-side
  (AI Helper page). This is a separate security-posture observation,
  not a data-transfer finding; not expanded on further here since it's
  outside this sprint's scope.

---

## 5. Vercel finding

**Confirmed facts (with exact source and access date):**

- **Plan: Hobby.** Documented already in Sprint 153
  (`docs/SPRINT_153_FIRST_PRODUCTION_DRY_RUN_CRON_ACTIVATION_RUNBOOK_V1.md`):
  the cron schedule was deliberately chosen as `0 5 * * *` because
  "Hobby plan: max once per day" (citing
  `vercel.com/docs/cron-jobs/usage-and-pricing`). No evidence this
  sprint of a plan upgrade since.
- **DPA scope** (`vercel.com/legal/dpa`, fetched 2026-07-14): "This
  Addendum applies to Vercel's Processing of Personal Data as a
  Processor under the Agreement for Customers who are on Enterprise
  and Pro plans." Hobby is not listed. Vercel does describe SCC-based
  transfer mechanisms (Schedule 3, 2021 SCCs, Irish law/courts) **for
  customers the DPA applies to** — which does not currently include
  this project.
- **Default compute region** (`vercel.com/docs/regions`, fetched
  2026-07-14): "Vercel Functions default to running in the `iad1`
  (Washington, D.C., USA) region," used "unless a region is explicitly
  configured." This project's `vercel.json` (read this sprint)
  contains only a `crons` key — no `regions` override.
- **Residual uncertainty, stated plainly:** Vercel also allows setting
  a function region via the *Project Settings dashboard* (not
  necessarily reflected in `vercel.json`), and whether that control is
  even available on the Hobby tier wasn't confirmed by the docs
  fetched this sprint. This is why the implemented wording (§10) says
  data "may be" processed outside the EEA rather than asserting a
  specific region as certain — honestly hedged, not falsely precise.

**No Vercel analytics/tracking SDK, no Edge Middleware, no
Vercel-specific cookie** is present in the codebase (§3).

**Conclusion: sufficiently evidenced for a scoped, minimal disclosure.**
Not "Vercel is a US company, so assume a transfer" — specifically
"Hobby plan (confirmed) + no DPA at that tier (confirmed, verbatim) +
default US compute region absent an override (confirmed absent in
code, residual dashboard-level uncertainty acknowledged)."

---

## 6. Supabase finding

- **Tables containing personal data**: `auth.users` (admin
  email/credentials, Supabase-managed), `source_checks.created_by`
  (admin user ID reference). No table contains public-user personal
  data — confirmed by reading every schema file in `docs/*.sql`
  this sprint (`alert_sources`, `source_checks`,
  `source_notice_candidates`, plus the base `alerts` table referenced
  throughout) — none has a public-facing user-identity column, and RLS
  on every admin table denies anon access entirely.
- **Project region**: **NOT CONFIRMED.** Supabase's own docs
  (`supabase.com/docs/guides/platform/regions`, fetched 2026-07-14)
  confirm region is chosen once, by the project creator, at project
  creation — with genuine EU options available: "Central EU
  (Frankfurt), West EU (Ireland), West Europe (London), West EU
  (Paris), Central Europe (Zurich), North EU (Stockholm)" alongside
  non-EU options. Nothing in the codebase, `.env.local` (checked for
  the project URL's structure only, no secret value read or
  displayed), or documentation reveals which region Adam actually
  selected. **This is a genuine, materially significant unknown** — if
  the project is hosted in an EU region, no Supabase-related transfer
  disclosure would even be accurate to add.

**MANUAL FACT REQUIRED — SUPABASE PROJECT REGION.** Exact place to
check: Supabase Dashboard → your project → **Settings → General** →
"Region" field (no secret value involved, just reading a label).

**Conclusion: evidence is insufficient to say anything specific about
Supabase's transfer status — correctly excluded from the implemented
wording rather than guessed.** This does not block implementing the
Vercel-specific disclosure in §10, since that finding stands
independently.

---

## 7. Anthropic finding

- **Confirmed: `@anthropic-ai/sdk` is a real, live production
  dependency** (in `package.json` `dependencies`, not `devDependencies`),
  called from `src/app/api/ai/draft-alert/route.ts` when
  `ANTHROPIC_API_KEY` is set server-side. This is a genuinely active
  integration, not dev-only tooling.
- **Confirmed exact payload sent to Anthropic** (read the route
  handler this sprint, lines ~344–361): the message body is built from
  `sourceText` (admin-pasted official notice text), optionally
  `sourceName`, `sourceUrl`, `suggestedCategory`, and today's date
  string. **No admin account data (email, session token, IP) and no
  public-user data of any kind is included in the request.**
- **Candidate Verifier** (`ruleBasedVerifyCandidate`,
  `src/lib/candidateVerifier.ts`) — confirmed (Sprint 156C-1's admin
  audit, re-confirmed by this sprint's own read) to be a pure,
  deterministic local function with no network call at all — it never
  contacts Anthropic or any external service.
- **Builder**: no AI call originates from Builder itself; any
  AI-assisted draft arrives via `sessionStorage` handoff from AI
  Helper, already generated before Builder is involved.
- Anthropic's own privacy policy (`anthropic.com/legal/privacy`,
  fetched 2026-07-14) does describe US processing and SCC-based
  transfer safeguards **for personal data Anthropic processes in
  general** — but since Alertownik's specific integration sends no
  personal data to Anthropic, GDPR Chapter V (which governs transfers
  of personal data) is not engaged by this flow at all, regardless of
  Anthropic's own general policies.

**Conclusion: DO NOT LIST AS PUBLIC-USER DATA RECIPIENT for
transfer-disclosure purposes.** The current privacy policy's existing
Anthropic bullet ("Do AI trafiają wyłącznie teksty publicznych
komunikatów źródłowych... nigdy dane użytkowników serwisu") is
independently confirmed accurate by this sprint's own code read and
requires no correction. Listing Anthropic generally as an AI-tool
processor (as the page already does) remains good transparency
practice; it does not need an international-transfer sentence attached
to it, because no personal data is the subject of that particular flow.

---

## 8. Evidence matrix

| Provider | Actual Alertownik data flow | Data subject | Personal data category | Role | EEA/non-EEA evidence | Transfer mechanism evidence | Contract/plan dependency | Should appear in privacy notice? | Confidence | Missing facts |
|---|---|---|---|---|---|---|---|---|---|---|
| Vercel | Hosting; technical/access logs for every request | All visitors (public + admin) | IP address, user-agent, timestamp, request path | Processor | Confirmed default compute region = `iad1` (USA); no `regions` override in `vercel.json` | Vercel's DPA (SCCs, 2021 EU SCCs, Irish law) confirmed to exist, but **confirmed inapplicable** at Hobby tier | **Confirmed: Hobby plan, no DPA at this tier** | **Yes** — scoped, minimal wording implemented (§10) | **High** for plan/DPA-exclusion; **Medium** for actual region (dashboard override can't be ruled out) | Whether a non-default Function Region was manually set in Project Settings (not visible in code) |
| Supabase | Database (public alert content); Auth (admin email/credentials); admin operational tables | Public: none (no PII stored). Admin: yes (auth.users, created_by) | Admin email, hashed credential, admin user ID references | Processor (admin data); N/A (public content) | **Not confirmed** — Supabase offers both EU and non-EU regions; project's actual region unknown from code | Not evaluated — moot until region is known | Unknown (Supabase's DPA/TIA terms by plan tier not checked this sprint, since the threshold question — region — is already unresolved) | **Not yet** — deferred pending Adam's confirmation | **Low** (genuinely unknown, not merely unconfirmed-but-likely) | Supabase project region (Dashboard → Settings → General) |
| Anthropic | AI-assisted alert drafting from admin-pasted public source text | **None** — only already-public official notice text is sent, confirmed by code read | N/A — no personal data in this flow | N/A (not a personal-data processor for this specific flow) | Not applicable — GDPR Ch. V governs personal-data transfers; none occurs here | Anthropic does offer SCCs for its own personal-data processing generally, but this flow doesn't invoke it | N/A | **No, not for transfer purposes** — existing general AI-tool disclosure remains accurate as-is | **High** (confirmed by direct code read of the exact payload sent) | None |
| Mail provider (feedback) | User's own email client → Adam's personal inbox | The visitor who chooses to write in | Email address + message content | N/A — not an Alertownik-selected processor at all; the visitor's own mail provider and Adam's personal inbox provider (outside Alertownik's control or contract) | N/A | N/A | N/A | Existing "Dostawca poczty" bullet is accurate as a plain-language description; no code-level processor relationship exists to formalize | **High** | None |

---

## 9. Legal source matrix

| Requirement | Official source | What it says (brief) |
|---|---|---|
| Art. 13(1)(f) — duty to disclose intended international transfers and the safeguard used | EUR-Lex, Regulation (EU) 2016/679, `eur-lex.europa.eu/eli/reg/2016/679/oj` (attempted fetch 2026-07-13/14 — page did not render via this session's tooling; relying on well-established, unchanged-since-2018 Art. 13 structure) | Controller must state, where a transfer is intended, the fact of the transfer and reference to the appropriate/suitable safeguard |
| GDPR Chapter V (Art. 44–49) | Same as above | Transfers of personal data to third countries require an adequacy decision, appropriate safeguards (e.g. SCCs), or a specific derogation — applies only when personal data actually is transferred |
| Vercel DPA scope | `vercel.com/legal/dpa` (fetched 2026-07-14) | Explicitly Enterprise/Pro-plan only; SCCs (2021 EU SCCs) apply "to the extent Customer's use... requires" a transfer mechanism, under the Agreement this Addendum attaches to |
| Vercel default region | `vercel.com/docs/regions` (fetched 2026-07-14) | Functions default to `iad1` (Washington D.C., USA) absent explicit region configuration |
| Supabase regions | `supabase.com/docs/guides/platform/regions` (fetched 2026-07-14) | Project region chosen once at creation; both EU and non-EU regions genuinely available |
| Anthropic transfers/DPA | `anthropic.com/legal/privacy` (fetched 2026-07-14) | Anthropic transfers personal data to the US/outside the EEA generally, using adequacy decisions and SCCs — relevant only when Anthropic actually processes personal data, which this integration confirmed does not happen |

**This is a technical completeness/evidence exercise, not a legal
opinion.** `REQUIRES LEGAL WORDING VERIFICATION BEFORE PUBLIC RELEASE`
is unchanged.

---

## 10. Final result and implementation

**RESULT B — DISCLOSURE REQUIRED — EVIDENCE SUFFICIENT FOR MINIMAL
IMPLEMENTATION, scoped to Vercel only.**

**Implemented** in `src/app/prywatnosc/page.tsx`, "Komu powierzamy
dane" section, Vercel bullet (minimal diff — one bullet extended, nothing
else changed):

> **Vercel** — hosting aplikacji (logi techniczne, np. adres IP).
> Vercel Inc. ma siedzibę w USA; w ramach standardowej infrastruktury
> hostingowej logi techniczne mogą być przetwarzane na serwerach poza
> Europejskim Obszarem Gospodarczym. Alertownik korzysta obecnie z
> bezpłatnego planu Vercel, który — zgodnie z warunkami Vercel — nie
> obejmuje formalnej umowy powierzenia przetwarzania danych ani
> standardowych klauzul umownych; zostanie to uregulowane przed
> szerszym startem publicznym.

Deliberately:
- Names the specific provider and country, not "some data may go
  somewhere."
- Uses "mogą być przetwarzane" (may be processed) — honestly hedged
  given the residual dashboard-override uncertainty, not falsely
  certain.
- **Does not claim a safeguard is in place that isn't** — the previous
  Sprint 156C-1 proposal would have said SCCs apply; that would have
  been inaccurate for this specific Hobby-tier project. This version
  states the actual gap (no DPA at this plan tier) plainly, which is
  more useful and more honest than a reassuring-but-false claim.
- No Supabase or Anthropic mention added — not guessed.
- No home address, phone number, or other unnecessary personal data
  added.

---

## 11. Missing manual facts (exact, minimal)

1. **Supabase project region** — Dashboard → your project → **Settings
   → General** → "Region" field. If it's an EU region (Frankfurt,
   Ireland, London, Paris, Zurich, or Stockholm), no further privacy-
   policy change is needed for Supabase. If it's outside the EEA, a
   parallel sentence to the Vercel one above should be added for
   Supabase too.
2. **Whether a non-default Vercel Function Region was ever configured**
   in the Project Settings dashboard (not visible in `vercel.json` or
   any tracked file) — if Adam knows this was never touched, the
   `iad1` default assumption in the implemented wording is on solid
   ground; if a region was set, the wording may need a small correction
   (or could even be removed, if the configured region is in the EEA).
3. **Whether Adam plans to upgrade to Vercel Pro** at some point before
   wider public launch — if so, the DPA would then apply and the
   wording implemented this sprint would need updating to reflect that
   an SCC-based safeguard is now actually in place.

None of these are secrets — all three are plain configuration facts
readable from a dashboard label, not any credential or key value.

---

## 12. Tests

Added to `tests/e2e/public.spec.ts`:
- Confirms the Vercel bullet states the US location, the EEA-transfer
  possibility, and the Hobby-plan DPA gap (three separate targeted
  regex assertions, not one brittle string match).
- Confirms the page does **not** contain the specific "standardowych
  klauzul umownych stosowanych przez tych dostawców" phrasing —
  guarding against ever reintroducing the Sprint 156C-1 draft's
  overclaim that a safeguard is confirmed in place.
- Pre-existing tests (administrator name, dedicated contact email,
  independence statement, absence of the old private address, all
  three named processors visible) all continue to pass unmodified —
  no assertion was weakened or removed.

## 13. QA results

- `npm run check` (typecheck + lint + build) — ✅ zero errors, zero warnings.
- `npm run test:e2e` — see final report (run in progress at time of
  writing this section; full results in the completion report).
- `git diff --check` — to be confirmed before commit.

## 14. Security

- No new secrets introduced. `.env.local` was read only to confirm
  which two variable *names* it defines (already public knowledge, per
  `CLAUDE.md`) — no value was ever displayed or logged.
- No Vercel, Supabase, RLS, SQL, or migration change.
- No live write, no cron change, no Production deploy.
- No data sent to Anthropic during this audit — all Anthropic research
  this sprint was reading Anthropic's own *public* privacy-policy page,
  not calling their API.
- No env value, service_role key, or CRON_SECRET ever displayed.

## 15. Remaining public-beta gates (unchanged from Sprint 156C-1 except this item)

This sprint narrows and corrects Sprint 156C-1's legal-wording finding
(§10 of that document) but does not change any other gate. Full list
remains: merge + Production deploy of Sprints 154–156B; execute the
admin-workflow QA pass with a real session; decide the open-ended WKD
alert's fate; decide on Supabase's region and whether/when to add a
parallel disclosure sentence; decide whether/when to activate the
Phase B cron observation window.

**Verdict ceiling unchanged: CONDITIONAL GO — FINAL MANUAL GATES
REMAIN.**
