# Sprint 155 — Privacy Variant A Implementation Package v1

**Status: APPLIED (2026-07-14).** The proposal below was implemented
on branch `sprint-155-privacy-identity-project-contact-v1` using
Adam's approved real values — administrator **Adam Jurkowski**, public
project contact **alertownik.kontakt@gmail.com** — replacing the
placeholders shown in the original proposal text further down this
document. See `## Sprint 155 implementation record` at the end of this
file for exactly what changed, what was tested, and current QA/security
results. No home address published; no invented personal data.

**REQUIRES LEGAL WORDING VERIFICATION BEFORE PUBLIC RELEASE** — this
marking carries forward unchanged from
`docs/SPRINT_154_PRIVACY_CONTROLLER_IDENTITY_DECISION_V1.md` and
applies to everything in this document too.

## 1. Decision recorded

Adam selected **Variant A**: a named natural person as data
controller, identified by full name, with a separate dedicated
project email (not the current general-purpose feedback mailbox), no
home address published at this stage. "Alertownik" remains the
project name, not a substitute for controller identification.

## 2. Exact replacement text for `/prywatnosc`

### Current (`src/app/prywatnosc/page.tsx:41-53`)

```
Alertownik to niekomercyjny projekt pilotażowy prowadzony przez
osobę prywatną (administratora projektu). Kontakt we wszystkich
sprawach, w tym dotyczących prywatności: [napisz e-mail]. Docelowy,
dedykowany adres kontaktowy zostanie uruchomiony wraz z rozwojem
projektu.
```

### Proposed replacement (placeholders only)

```
Alertownik to niekomercyjny projekt pilotażowy prowadzony przez
[IMIĘ I NAZWISKO ADMINISTRATORA] jako osobę fizyczną. Nazwa
„Alertownik" oznacza sam projekt, a nie odrębny podmiot prawny —
administratorem danych w rozumieniu RODO pozostaje wskazana wyżej
osoba. Kontakt we wszystkich sprawach, w tym dotyczących prywatności:
[DEDYKOWANY E-MAIL PROJEKTU].
```

Changes from current text:
- "osobę prywatną (administratora projektu)" → named individual +
  explicit RODO-controller statement.
- Added the one clarifying sentence Adam asked for: the project name
  is not itself the identified entity.
- Removed "Docelowy, dedykowany adres kontaktowy zostanie uruchomiony
  wraz z rozwojem projektu" — that sentence promised a *future*
  dedicated address; Variant A supplies one now, so the promise is
  resolved rather than repeated.
- No mailto markup changed in this proposal (see §5 on `FEEDBACK_EMAIL`
  below) — the placeholder is presented as plain text here since no
  real address exists yet to wire into an `href`.

## 3. Consistency check against the rest of `/prywatnosc`

Read the full file (`src/app/prywatnosc/page.tsx`, all 189 lines).
No other section makes an identity or anonymity claim that conflicts
with Variant A:

- "Dane administratorów" (line 81) — "konta logowania... administratorów
  serwisu" — refers to the login-account role, not to anonymity.
  Compatible as-is.
- "Komu powierzamy dane" (line 129) — "skrzynki e-mail administratora
  projektu" — again role-based phrasing, not an anonymity claim.
  Compatible as-is.
- "Status tego dokumentu" box (lines 176-184) — already states this is
  a beta draft pending legal review before wider launch. No change
  needed; this framing is exactly what Variant A's legal-verification
  flag continues to rely on.

**No other paragraph in this file needs editing.**

## 4. Other app locations checked for anonymous-operator language

Grepped the full `src/` tree for "osoba prywatna" / "prywatny
operator" / "administrator" / "prowadzony przez" phrasing:

| File | Line | Text | Needs correction? |
|---|---|---|---|
| `src/app/prywatnosc/page.tsx` | 42-43 | "osobę prywatną (administratora projektu)" | **Yes — this document, §2 above.** |
| `src/app/prywatnosc/page.tsx` | 129 | "skrzynki e-mail administratora projektu" | No — role reference, not an anonymity claim. |
| `src/app/zasady/page.tsx` | 93-98 | "Alertownik jest niezależnym projektem pilotażowym. Nie jest oficjalnym serwisem..." | No — this is an *independence-from-official-bodies* claim (true regardless of who the admin is), not an anonymity claim about the controller. No correction needed. |
| `src/app/about/page.tsx` | 67, 72 | "przez administratora" | No — role reference only. |
| `src/components/BetaStatusCard.tsx` | 21 | "przez administratora" | No — role reference only. |
| `src/components/AlertDetailClient.tsx` | 260 | "przez administratora" | No — role reference only. |

**Conclusion: exactly one paragraph in the whole app needs editing** —
the one in §2. Nothing else claims anonymity or needs to change to
stay consistent with a named controller.

## 5. Flagged follow-up decision (not part of this package, not implemented)

`src/lib/feedbackMailto.ts:9` defines `FEEDBACK_EMAIL` — this is the
**single real address currently wired into every contact point in the
app** (footer "Kontakt," `/about` feedback section, per-alert report
links, and the "napisz e-mail"/"napisz do nas" links inside
`/prywatnosc` itself). It is not currently a project-dedicated
address in the sense Variant A calls for.

Fully realizing "kontakt: osobny, dedykowany e-mail projektu" means
this constant will eventually need to point at the real dedicated
address once Adam creates one — that is a **separate, larger change**
(touches every contact surface in the app, not just the privacy
paragraph) and is **not part of this package**. Flagging it now so it
isn't lost, not proposing it for action yet.

## 6. Exact file list + diff, ready for approval

**Files that would change (1 total):**

- `src/app/prywatnosc/page.tsx` — replace lines 42-52 (the JSX text
  content between the `<p className={pClass}>` open tag at line 41
  and its close at line 53) with the proposed text from §2, rendered
  as JSX (the mailto `<a>` element would need to either stay a plain
  placeholder string or be removed until a real address exists —
  Adam's call at implementation time, not decided by this proposal).

**Unified diff (illustrative — exact JSX line-wrapping would be
finalized at implementation time):**

```diff
--- a/src/app/prywatnosc/page.tsx
+++ b/src/app/prywatnosc/page.tsx
@@ -39,17 +39,13 @@
         <section className={sectionClass}>
           <h2 className={h2Class}>Kto prowadzi serwis</h2>
           <p className={pClass}>
-            Alertownik to niekomercyjny projekt pilotażowy prowadzony przez
-            osobę prywatną (administratora projektu). Kontakt we wszystkich
-            sprawach, w tym dotyczących prywatności:{" "}
-            <a
-              href={`mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent("Alertownik — prywatność")}`}
-              className="font-medium text-blue-600 hover:underline"
-            >
-              napisz e-mail
-            </a>
-            . Docelowy, dedykowany adres kontaktowy zostanie uruchomiony wraz z
-            rozwojem projektu.
+            Alertownik to niekomercyjny projekt pilotażowy prowadzony przez
+            [IMIĘ I NAZWISKO ADMINISTRATORA] jako osobę fizyczną. Nazwa
+            „Alertownik" oznacza sam projekt, a nie odrębny podmiot prawny —
+            administratorem danych w rozumieniu RODO pozostaje wskazana wyżej
+            osoba. Kontakt we wszystkich sprawach, w tym dotyczących
+            prywatności: [DEDYKOWANY E-MAIL PROJEKTU].
           </p>
         </section>
```

**Not applied.** Awaiting Adam's approval of the wording, and
separately, the two real values ([IMIĘ I NAZWISKO ADMINISTRATORA],
[DEDYKOWANY E-MAIL PROJEKTU]) before this diff can be turned into a
real commit.

## 7. Confirmations

- No home address added anywhere.
- No invented/fictional personal data used — every bracketed value is
  a literal placeholder.
- No Vercel, Production, cron, or database change — this is a
  documentation-only proposal; zero files in `src/` have actually
  been modified.
- `REQUIRES LEGAL WORDING VERIFICATION BEFORE PUBLIC RELEASE` carried
  forward.

## Sprint 155 implementation record

Executed 2026-07-14 on branch
`sprint-155-privacy-identity-project-contact-v1`, base commit
`5db9f52` (Sprint 154 close).

**Administrator:** Adam Jurkowski
**Public project contact:** alertownik.kontakt@gmail.com

**Files changed:**
- `src/app/prywatnosc/page.tsx` — "Kto prowadzi serwis" section now
  names the data controller, states RODO controller status, adds the
  independence-from-official-institutions sentence (gmina, urząd, WKD,
  PGE), and links the real dedicated contact address as a mailto link
  (previously an anonymous "napisz e-mail" placeholder pointing at the
  general feedback mailbox).
- `src/lib/feedbackMailto.ts` — `FEEDBACK_EMAIL` repointed from the
  previous private contact address to `alertownik.kontakt@gmail.com`.
  No other exports, subjects, bodies, or feedback types changed — this
  constant is consumed by every public contact surface (footer,
  `/about`, `/partnerzy`, `/prywatnosc`, per-alert report links), so
  all of them now resolve to the new address automatically.
- `tests/e2e/feedbackMailto.spec.ts` — updated the one assertion that
  hardcoded the previous address.
- `tests/e2e/public.spec.ts` — added two tests: controller
  name/contact/independence copy is present on `/prywatnosc`, and the
  previous private address is absent from the rendered page.

**Public surface audit:** grepped all of `src/` for the previous
private contact address after the change — zero remaining
occurrences. All mailto links across the app now resolve through the
single `FEEDBACK_EMAIL` constant.

**QA results:**
- `npm run check` (typecheck + lint + build) — ✅ zero errors, zero
  warnings.
- `npm run test:e2e` — ✅ 396/396 passed, 0 failed, 0 skipped.
- `git diff --check` — ✅ no whitespace errors.

**Security/privacy audit:**
- `.env.local` not tracked; only `.env.example` tracked under `env*`
  naming.
- No secret-shaped strings (`service_role`, `CRON_SECRET`, API keys,
  passwords) introduced in the diff.
- No Vercel, Supabase, RLS, SQL, cron, or Production changes made.
- No live database write performed.

`REQUIRES LEGAL WORDING VERIFICATION BEFORE PUBLIC RELEASE` remains in
force — this sprint implements Adam's approved wording and values, not
a legal review.
