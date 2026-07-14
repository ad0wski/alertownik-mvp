# Sprint 156C-3 — Verified Hosting Regions and Privacy Wording Correction v1

Executed 2026-07-14 on branch `sprint-156c3-verified-hosting-regions-privacy-wording-v1`,
base commit `5db3586` (Sprint 156C-2 close). This sprint corrects one
imprecision left in Sprint 156C-2's implemented wording, using two
facts Adam confirmed manually via dashboard screenshots. No
infrastructure was changed — this is a wording correction only.

**This is a technical wording correction, not legal advice.**
`REQUIRES LEGAL WORDING VERIFICATION BEFORE PUBLIC RELEASE` is
unchanged and carried forward.

---

## 1. Verified manual facts (from Adam, via dashboard screenshots)

| Fact | Value | Source |
|---|---|---|
| Vercel plan | Hobby | Confirmed (already known since Sprint 153; re-confirmed by Adam) |
| Vercel Function Region | `iad1` — North America / USA | Adam's screenshot, this sprint |
| Supabase project region | `eu-west-2` — West Europe (London, UK) | Adam's screenshot, this sprint |

These are dashboard-label facts, not secrets — no credential, key, or
env value was involved in confirming them.

---

## 2. Correction to Sprint 156C-2's Vercel wording

Sprint 156C-2 implemented text stating the Hobby plan "nie obejmuje
formalnej umowy powierzenia przetwarzania danych ani standardowych
klauzul umownych" (does not include a formal DPA or SCCs). This was
**itself too broad**, for the same reason Sprint 156C-2 was written to
correct Sprint 156C-1's over-broad claim:

- **Confirmed true:** Vercel's own DPA text (`vercel.com/legal/dpa`)
  states it applies to Enterprise/Pro plans; Alertownik is on Hobby, so
  that specific formal instrument does not apply to this project.
- **Not established, and therefore not safe to claim:** that *no*
  transfer mechanism of any kind applies. Vercel's privacy policy
  separately declares that Vercel uses the EU-U.S. Data Privacy
  Framework and other appropriate transfer mechanisms (including SCCs
  where relevant) as a general practice. Whether/how that general
  practice extends to Hobby-tier customers specifically wasn't
  established by either sprint's research — asserting "no protections
  exist at all" overstated the negative just as confidently as Sprint
  156C-1 overstated the positive.

**Corrected wording**, `src/app/prywatnosc/page.tsx`, Vercel bullet
(replaces the Sprint 156C-2 text):

> Vercel — hosting aplikacji (logi techniczne, np. adres IP). Funkcje
> serwerowe są obecnie wykonywane w regionie iad1 (Stany Zjednoczone)
> — w związku z tym techniczne dane obsługi żądania mogą być
> przetwarzane poza Europejskim Obszarem Gospodarczym. Vercel deklaruje
> w swojej dokumentacji prywatności stosowanie mechanizmów ochrony
> transferu danych (m.in. EU–U.S. Data Privacy Framework oraz
> odpowiednie klauzule umowne, gdy mają zastosowanie). Alertownik
> korzysta obecnie z bezpłatnego planu Vercel (Hobby); dokładny zakres
> obowiązującej relacji umownej wymaga ponownej weryfikacji przed
> szerszym startem publicznym.

What changed and why:
- States the **confirmed** region (`iad1`, USA) as fact, not inference.
- States that technical data **may** be processed outside the EEA —
  accurate, hedged appropriately (routing/CDN behavior can vary).
- States what Vercel **declares** about its own transfer mechanisms,
  without asserting those mechanisms are confirmed to specifically
  cover Alertownik's Hobby-tier relationship.
- Explicitly flags that the exact contractual scope "wymaga ponownej
  weryfikacji" (needs re-verification) before wider public launch —
  honest about the remaining uncertainty instead of resolving it with
  a guess in either direction.
- Contains none of the forbidden claims: does not say Alertownik has
  an active Vercel DPA; does not say SCCs definitely cover Alertownik;
  does not say Vercel has no safeguards; does not say the transfer is
  unlawful; does not say the policy is legally approved.

---

## 3. Supabase region finding

Supabase project region confirmed: **`eu-west-2`, London, United
Kingdom.**

The UK left the EEA but has held a **European Commission adequacy
decision** since 2021 (data protection framework recognized as
providing an essentially equivalent level of protection to the GDPR).
Per this sprint's explicit instruction, Supabase's London region is
**not** presented as an unprotected transfer requiring an SCC purely
because the UK is outside the EEA — that would misstate what an
adequacy decision means.

Added to the existing Supabase bullet on `/prywatnosc` (minimal
addition, not a new section):

> Supabase — baza danych (treść alertów; konta wyłącznie
> administratorów), region Europa Zachodnia (Londyn, Wielka Brytania).
> Wielka Brytania nie należy do EOG, ale Komisja Europejska uznaje ją
> za kraj zapewniający odpowiedni poziom ochrony danych (decyzja o
> adekwatności).

This resolves Sprint 156C-2's open "MANUAL FACT REQUIRED — SUPABASE
PROJECT REGION" item entirely — no further Supabase-related wording is
needed unless the project is ever migrated to a different region.

---

## 4. Legal caution

This sprint states three verified facts (Vercel plan, Vercel region,
Supabase region) and describes what each provider's own published
policy says about transfer mechanisms. It does **not** constitute a
legal opinion on whether Alertownik's current arrangement is fully
GDPR-compliant, nor does it confirm the scope of any actual contractual
relationship with Vercel beyond what's publicly documented for the
Hobby tier. `REQUIRES LEGAL WORDING VERIFICATION BEFORE PUBLIC RELEASE`
remains in force.

---

## 5. Tests

Updated the Sprint 156C-2 test in `tests/e2e/public.spec.ts`:
- Confirms `iad1` and "Stany Zjednoczone" are present (region fact).
- Confirms the EEA-processing-possibility statement is present.
- Confirms "EU–U.S. Data Privacy Framework" is present (declared
  mechanism, not a confirmed-for-Alertownik claim).
- Confirms "bezpłatnego planu Vercel (Hobby)" is present.
- Confirms the page does **not** contain "Alertownik ma aktywny DPA
  Vercela" (no overclaim of an active DPA).
- Confirms the page does **not** contain the Sprint 156C-2 draft's
  exact overly-broad phrase ("nie obejmuje formalnej umowy powierzenia
  przetwarzania danych ani standardowych klauzul umownych") — guarding
  against ever reintroducing that specific overclaim.
- New test confirms "Londyn" and "decyzja o adekwatności" are present
  for the Supabase region disclosure.
- All pre-existing privacy-page tests (administrator name, dedicated
  contact email, independence statement, absence of the old private
  address, all processors named) continue to pass unmodified.

## 6. QA results

- `npm run check` (typecheck + lint + build) — ✅ zero errors, zero warnings.
- `npm run test:e2e` — full results in the completion report.
- `git diff --check` — to be confirmed before commit.

## 7. Security

- No new secrets. The three facts recorded (Vercel plan, Vercel
  region, Supabase region) are plain dashboard labels, not credentials.
- No `.env.local` change; not tracked.
- No Vercel Function Region change, no Save clicked, no redeploy.
- No Supabase region change.
- No SQL, RLS, migration, or live write.
- No cron change, no Production deployment.

## 8. Remaining public-beta gates (unchanged except this item)

This sprint corrects and finalizes the international-transfer wording
started in Sprint 156C-1 and refined in 156C-2. All other gates are
unchanged: merge + Production deploy of Sprints 154–156B; execute the
admin-workflow QA pass with a real session; decide the open-ended WKD
alert's fate; decide whether/when to activate the Phase B cron
observation window.

**Verdict ceiling unchanged: CONDITIONAL GO — FINAL MANUAL GATES
REMAIN.**
