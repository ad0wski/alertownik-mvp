# Alertownik v1 — Google Play copy pack (FINAL-2, 13.11.2026)

Proposal only — nothing is changed in Play Console from this repo. Written
to match what v1 really does on 13.11.2026; replaces the description draft
in `PLAY_STORE_READINESS.md` §2 (which promised "prąd" and transport).

Ground truth used:
- Automatic monitoring: ONE source — komunikaty gminy Michałowice (writer
  runs twice a day, 05:30 and 15:00 UTC). Every alert is published manually
  by the administrator; auto-publish is OFF.
- Published alerts are mostly water outages and road works; Pruszków / WKD
  items are added by hand and rarely. PGE (power) is not monitored.
- Waste: collection schedule for the pilot localities (`/odpady`).
- Push notifications: built, but OFF in v1 → not mentioned.
- No account, no ads, no payments, no analytics, no GPS; "Moja okolica" and
  theme stay on the device.

## Short description (max 80) — 67 characters

> Komunikaty gminy Michałowice w jednym miejscu: woda, drogi, odpady.

## Full description (pl-PL) — POLICY-FIX, 18.11.2026

Rejected by Google Play on 18.11.2026: Misleading Claims — "Missing Source
Link for Government Information" (in-app "O projekcie" + this description).
The text between the `<!-- PLAY-FULL-DESCRIPTION -->` markers is the exact
text to paste into Play Console → Main store listing → pl-PL → Full
description. It puts the independence disclaimer first and lists every
official source with its literal URL. The source list must match
`src/lib/officialInformationSources.ts` (enforced by
`tests/e2e/playPolicyGovernmentSources.spec.ts`).

<!-- PLAY-FULL-DESCRIPTION:START -->
WAŻNE: Alertownik jest niezależnym projektem. Nie jest oficjalną aplikacją ani przedstawicielem Gminy Michałowice, Miasta Pruszków, Warszawskiej Kolei Dojazdowej ani żadnej innej instytucji publicznej i nie działa w ich imieniu.

Oficjalne źródła informacji:
• Gmina Michałowice — komunikaty: https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty
• Gmina Michałowice — harmonogram odbioru odpadów: https://www.michalowice.pl/ochrona-srodowiska/odbior-odpadow/nowy-harmonogram-odbioru-odpadow-komunalnych
• Miasto Pruszków — aktualności dla mieszkańców: https://www.pruszkow.pl/mieszkancy/aktualnosci-mieszkaniec/
• Warszawska Kolej Dojazdowa (WKD) — aktualności: https://wkd.com.pl/aktualnosci
Przy każdym alercie w aplikacji znajdziesz bezpośredni link do konkretnego oficjalnego komunikatu. Pełna lista źródeł jest też w aplikacji: Więcej → O projekcie.

Alertownik zbiera w jednym miejscu lokalne komunikaty z rejonu gminy Michałowice — przede wszystkim o przerwach w dostawie wody, utrudnieniach na drogach i odbiorze odpadów.

Zamiast co chwilę sprawdzać stronę gminy, zobaczysz krótką kartę: co się dzieje, gdzie, kiedy i co warto zrobić — zawsze z linkiem do oficjalnego komunikatu.

Co znajdziesz w aplikacji:
— Aktualne i nadchodzące alerty na górze listy; zakończone w osobnej, zwiniętej sekcji.
— Przy każdym alercie: miejsce, godziny, opis zmiany i link do źródła.
— „Moja okolica" — wybierz miejscowość, a aplikacja pokaże najpierw to, co dotyczy Ciebie. To ustawienie zostaje wyłącznie na Twoim urządzeniu.
— Harmonogram odbioru odpadów dla obsługiwanych miejscowości.
— Udostępnianie alertu jednym przyciskiem.
— Tryb jasny i ciemny.

Jak to działa:
Komunikaty Gminy Michałowice są sprawdzane automatycznie dwa razy dziennie, a każdy alert publikuje ręcznie administrator po sprawdzeniu źródła. Pojedyncze alerty o Pruszkowie i kolei WKD dodaje ręcznie administrator na podstawie źródeł wymienionych wyżej. To nie jest serwis czasu rzeczywistego ani system alarmowy — w nagłych sytuacjach dzwoń pod 112.

Zasięg:
Alertownik to lokalny pilotaż dla rejonu gminy Michałowice (m.in. Komorów, Nowa Wieś, Granica, Michałowice, Reguły, Opacz).

Bez konta, bez reklam, bez płatności.

W razie wątpliwości zawsze rozstrzyga oficjalny komunikat źródłowy. Błąd albo brakujący komunikat? Napisz do nas z poziomu aplikacji.
<!-- PLAY-FULL-DESCRIPTION:END -->

### Previous full description (13.11.2026) — REJECTED, do not reuse

Alertownik zbiera w jednym miejscu lokalne komunikaty z rejonu gminy
Michałowice — przede wszystkim o przerwach w dostawie wody, utrudnieniach na
drogach i odbiorze odpadów.

Zamiast co chwilę sprawdzać stronę gminy, zobaczysz krótką kartę: co się
dzieje, gdzie, kiedy i co warto zrobić — zawsze z linkiem do oficjalnego
komunikatu.

Co znajdziesz w aplikacji:
— Aktualne i nadchodzące alerty na górze listy; zakończone w osobnej,
  zwiniętej sekcji.
— Przy każdym alercie: miejsce, godziny, opis zmiany i link do źródła.
— „Moja okolica" — wybierz miejscowość, a aplikacja pokaże najpierw to, co
  dotyczy Ciebie. To ustawienie zostaje wyłącznie na Twoim urządzeniu.
— Harmonogram odbioru odpadów dla obsługiwanych miejscowości.
— Udostępnianie alertu jednym przyciskiem.
— Tryb jasny i ciemny.

Jak to działa:
Nowe komunikaty gminy są sprawdzane automatycznie dwa razy dziennie, a każdy
alert publikuje ręcznie administrator po sprawdzeniu źródła. To nie jest
serwis czasu rzeczywistego ani system alarmowy — w nagłych sytuacjach dzwoń
pod 112.

Zasięg:
Alertownik to lokalny pilotaż dla rejonu gminy Michałowice (m.in. Komorów,
Nowa Wieś, Granica, Michałowice, Reguły, Opacz). Informacje z Pruszkowa i o
kolei WKD pojawiają się rzadziej.

Bez konta, bez reklam, bez płatności.

Alertownik jest niezależnym projektem — nie jest oficjalną aplikacją gminy
Michałowice, WKD, PGE ani żadnej innej instytucji. Błąd albo brakujący
komunikat? Napisz do nas z poziomu aplikacji.

## Screenshots — status and replacement plan

Visual review (FINAL-2): layout/navigation in all store shots still matches
the app, but the CONTENT is outdated and over-promises:

| File | Problem | Action |
|---|---|---|
| phone-01-dzisiaj | Shows the stale "ul. Działkowa" alert as "Trwa" and a 10 Aug waste date | Replace |
| phone-02-alerty | Old heading "Lokalne alerty dla Komorowa, Pruszkowa i okolic." | Replace |
| phone-03-szczegoly-alertu | WKD timetable shown as "Trwa" (suggests active transport monitoring) | Replace with a water alert |
| phone-04-moja-okolica | Old heading; otherwise fine | Replace for consistency |
| tablet-7 ×2, tablet-10 ×2 | Same era/content as phone 01–02 | Replace |
| public/screenshots (manifest) ×3 | Same era | Replace |

Plan: after the owner checkpoint (stale alerts archived, the two current
water alerts published), regenerate all shots automatically from Production
with Playwright at the same sizes (phone 1080×1920, tablet sizes as in
`assets/store/README.md`), review, then upload in Play Console (owner).

## Data safety (unchanged for v1)

With push OFF, the declarations in `PLAY_STORE_READINESS.md` §6 stay true
(no account, no location, no analytics, preferences on device). Before push
is ever switched on, Data safety must declare the push subscription
(endpoint + keys + chosen locality, stored on our server, deletable by the
user) — see `/prywatnosc`.

## Contact e-mail

`alertownik.kontakt@gmail.com` is a dedicated project mailbox (not a
personal address) and is used consistently in the app, `/prywatnosc` and
the store listing — acceptable for the v1 pilot. Move to an address on a
project domain at the latest before broader promotion (paid ads, press,
outreach to the gmina), and update app + privacy policy + Play listing in
one change.
