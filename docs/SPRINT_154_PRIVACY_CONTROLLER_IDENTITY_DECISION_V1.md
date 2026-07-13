# Sprint 154 — Privacy Controller Identity Decision Package v1

**This document contains no real personal data of Adam's and proposes
no wording to be published.** It exists solely to give Adam a
concrete, bounded decision to make. No file has been edited as a
result of this document — `src/app/prywatnosc/page.tsx` is unchanged.

This is not legal advice, and none of the three variants below should
be treated as legally sufficient without review — see the flags at
the bottom.

## 1. Exact current fragment

`src/app/prywatnosc/page.tsx:40-53` ("Kto prowadzi serwis" section):

> **Kto prowadzi serwis**
>
> Alertownik to niekomercyjny projekt pilotażowy prowadzony przez
> osobę prywatną (administratora projektu). Kontakt we wszystkich
> sprawach, w tym dotyczących prywatności: [napisz e-mail]. Docelowy,
> dedykowany adres kontaktowy zostanie uruchomiony wraz z rozwojem
> projektu.

The page as a whole also carries a "Status tego dokumentu" note
(`prywatnosc/page.tsx:176-184`) that already, explicitly, tells
readers this is an unreviewed pilot draft.

## 2. What's currently missing

- No name (individual or business) identifying who "the private
  individual" is.
- No postal/registered address of any kind.
- The contact channel is the same general feedback mailbox used for
  all other purposes (bug reports, testing sign-ups), not a
  privacy-specific channel — acceptable for a small pilot, weaker for
  a wider public audience.
- No stated retention period tied to a specific authority, and no
  named alternative contact if the primary person is unreachable.

## 3. Three variants (placeholders only — no real data)

### Variant A — Named individual + dedicated project email

> Alertownik to niekomercyjny projekt pilotażowy prowadzony przez
> **[Imię Nazwisko]**, prowadzącego serwis jako osobę prywatną.
> Kontakt we wszystkich sprawach, w tym dotyczących prywatności:
> **[dedykowany e-mail projektu, np. kontakt@alertownik.pl]**.

- Pros: clearest individual accountability, simplest to write, no
  new business entity needed.
- Cons: ties a real personal name to a public page permanently;
  Adam may prefer more separation between his name and the project
  at this stage.

### Variant B — Project/operator name + responsible-person note where required

> Alertownik jest projektem pilotażowym prowadzonym pod nazwą
> **[nazwa projektu/operatora, np. "Alertownik"]**. Osobą
> odpowiedzialną za przetwarzanie danych w rozumieniu RODO jest
> **[stanowisko/rola, np. "administrator projektu", bez ujawniania
> danych osobowych publicznie, jeśli przepisy na to pozwalają]**.
> Kontakt: **[dedykowany e-mail]**.

- Pros: leads with the project brand rather than a personal name;
  may reduce the visible personal-name exposure Adam might be
  weighing.
- Cons: whether a project name alone (without a named natural person
  or registered entity) satisfies GDPR Art. 13 controller-identification
  requirements is exactly the kind of question that needs real legal
  verification — **do not assume "project name" is sufficient on its
  own.**

### Variant C — Minimal contact-only, explicitly interim

> Alertownik to niekomercyjny projekt pilotażowy. Do czasu pełnej
> weryfikacji prawnej tego dokumentu, wszystkie sprawy dotyczące
> prywatności prosimy kierować na: **[dedykowany e-mail]**. Pełne dane
> administratora danych zostaną opublikowane przed szerszym startem
> publicznym.

- Pros: smallest change from current text, buys time without
  pretending the gap is closed, keeps the existing "beta draft, will
  be finalized" framing consistent.
- Cons: least likely to independently satisfy a strict reading of
  GDPR Art. 13 if the site sees genuinely wide public traffic before
  the "fuller" version is published — most defensible only as a
  short-lived interim state for a *beta*, not a permanent answer.

## 4. Flags

**REQUIRES ADAM DECISION**

**REQUIRES LEGAL WORDING VERIFICATION BEFORE PUBLIC RELEASE**

None of the three variants above should be copied into
`src/app/prywatnosc/page.tsx` as-is without Adam first confirming the
actual identity/contact details to use and, ideally, a lightweight
legal sanity-check given this will be public-facing.

## 5. The one decision this document is asking for

**Which variant (A, B, or C) does Adam want as the direction, so
Claude can draft the real replacement text using Adam's actual
name/contact details in a follow-up — with the explicit understanding
that the resulting wording still needs Adam's final review before
publishing, and is not being auto-applied by this sprint?**
