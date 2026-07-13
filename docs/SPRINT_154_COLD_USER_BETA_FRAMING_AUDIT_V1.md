# Sprint 154 — Cold-User / Beta-Framing Audit v1

Perspective: someone who has never heard of Alertownik, arrives from
a shared link, doesn't know Adam, doesn't know what the project is.
No code was changed as part of this audit. Evidence gathered from a
live browser smoke test of https://alertownik-mvp.vercel.app the same
session (2026-07-13).

## 1. Does a cold visitor understand within ~10 seconds?

**What the app does** — Yes. The hero (`src/app/page.tsx:9-45`) states
it directly in the first sentence: "Alertownik zbiera w jednym
miejscu informacje o utrudnieniach w transporcie, dostawach wody i
prądu, drogach, odpadach i komunikatach gminnych dla Komorowa,
Pruszkowa i okolic."

**What area it covers** — Yes, same sentence names the localities
explicitly ("Komorowa, Pruszkowa i okolic").

**That it's in beta** — Yes, but only in small print. The line "Wczesny
pilotaż — sprawdź w 60 sekund, jak to działa" sits directly under the
hero at a visibly smaller/lighter type weight (`text-xs text-slate-400`)
than the headline. A skimming visitor could plausibly miss it on first
glance, though the `BetaStatusCard` immediately below (still above the
fold on desktop, likely one scroll on mobile) repeats it more
explicitly as a bulleted "Status pilotażu" box: "Alertownik jest w
kontrolowanej becie."

**That it's not an official service** — Not in the first 10 seconds.
The independence disclaimer ("Niezależny projekt — nie jest oficjalną
aplikacją żadnej gminy, WKD ani PGE") appears in the `BetaStatusCard`
bullet list (still early, but the 5th bullet — requires reading past
4 other lines) and again in the footer (`AppFooter.tsx`, below the
fold). It is present early, but not the *first* thing a skimmer sees.

## 2. Is it clear where data comes from / to verify / where to report?

- **Source attribution**: every alert card shows "Źródło: X" even
  collapsed (`AlertCard.tsx:116-121`) — this is genuinely strong;
  a cold user sees the source before they even click anything.
- **"Check the source" framing**: `BetaStatusCard` states "Oficjalne
  źródło zawsze ma pierwszeństwo przed szybkością Alertownika" and
  the alert detail page has a dedicated "Źródło komunikatu" trust box
  with a direct outbound link — clear.
- **Where to report a problem**: two mailto entry points are visible
  on the homepage alone (`BetaStatusCard`'s "Zgłoś brakujące źródło
  lub błąd" + footer "Kontakt"), plus a third on `/about` and a fourth
  per-alert on the detail page. This is not a gap — if anything it's
  redundant (see §3).

## 3. Is current messaging visible enough / too repetitive / confusing / too long?

- **Too repetitive**: the independence/trust disclaimer appears
  verbatim-adjacent in at least 5 places — hero area, `BetaStatusCard`,
  alert detail, `/odpady`, and the footer on every page. For a cold
  user reading only the homepage once, this isn't confusing, but a
  user who browses 2-3 pages will read essentially the same sentence
  3+ times. This is a minor polish opportunity, not a beta blocker.
- **Not confusing**: no contradictory claims found across pages — the
  "we don't publish automatically, a human always approves" message
  is consistent everywhere it appears.
- **Not too long**: individual disclaimer blocks are short (1-3
  sentences); the issue if any is frequency of repetition, not length
  per instance.
- **Visibility of "beta" status specifically**: adequate but not
  prominent. It is present within the first screen on desktop, but
  relies on the visitor reading the smaller-type sub-headline or the
  status card bullets rather than a single unmissable badge.

## Assessment

No large redesign is warranted or being proposed. The app already
does the essentials right: what it is, what area, source-first trust
signals, and multiple ways to report a problem are all present and
consistent. The one real (small) gap is that "beta / not official"
status is communicated adequately rather than prominently — a
first-time stranger has to read past the headline to be certain,
whereas a recruited pilot tester (who already knows this is a beta
from Adam directly) never had that gap to begin with. This matters
more for *public* beta than it did for the *recruited pilot* the app
was originally tuned for.

## Proposed small copy correction (NOT applied — awaiting review)

Option: promote the existing sub-headline text weight/position
slightly, or add a compact inline badge (e.g. "BETA" pill) next to
the app name in the header, so beta status is visible in the very
first eye-scan rather than requiring a full read of the sub-headline.

This is a **proposal only**. No CSS/copy change has been made. If
Adam wants this, it is a small (~30 min) implementation Claude could
do in a follow-up, but per this sprint's scope it is explicitly
**not** auto-applied — it would touch shared header/hero markup and
deserves a deliberate look, not a drive-by edit bundled into an audit
sprint.

## What this audit does not cover

Full onboarding flow, multi-step tutorials, or any interactive
first-run experience — explicitly out of scope for Sprint 154B per
the sprint brief ("nie rozszerzaj zakresu o... pełny onboarding").
