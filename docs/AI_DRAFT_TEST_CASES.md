# AI Draft Generator — Test Cases

Test cases for manual QA of the AI draft generator. Use these to verify that the generator produces sensible drafts and that warnings appear correctly.

Last updated: June 2026 — Sprint 60

---

## How to use

1. Open AI Helper (`/ai-helper` — admin login required)
2. Paste the source text into the "Wklej komunikat źródłowy" field
3. Fill in "Nazwa źródła" and "Link do źródła" if noted
4. Click "Wygeneruj draft AI"
5. Check generated draft against the expected output and admin review notes

---

## Case 1 — WKD transport change (planned)

**Source text:**
```
Uprzejmie informujemy, że w dniu 15 czerwca 2026 r. (poniedziałek) z powodu planowanych prac technicznych na odcinku Warszawa Śródmieście WKD – Pruszków WKD, pociągi WKD będą kursować zmienioną trasą. Pociągi na linii WKD będą kursować wyłącznie na odcinku Grodzisk Mazowiecki Radońska – Pruszków WKD. Zastępcza komunikacja autobusowa zostanie uruchomiona na odcinku Pruszków WKD – Warszawa Śródmieście WKD.
```

**Nazwa źródła:** WKD  
**Sugerowana kategoria:** transport

**Expected output:**
- `category`: `transport`
- `severity`: `warning`
- `title`: something like "Zmiana trasy WKD — 15 czerwca"
- `startsAt`: `2026-06-15` (date mentioned in source)
- `place`: optional — may include the affected section

**Admin must verify:**
- Confirm date (15 June 2026) matches actual WKD timetable notice
- Confirm replacement bus section matches the source
- Check that direction (Grodzisk → Pruszków) is correct, not reversed
- Expected warning: "Sprawdź, czy trasa i kierunek przejazdu są poprawne."

---

## Case 2 — Water outage (emergency)

**Source text:**
```
AWARIA WODOCIĄGOWA — ul. Różana, Komorów

Informujemy, że z powodu awarii sieci wodociągowej wstrzymana jest dostawa wody dla mieszkańców przy ul. Różanej i ul. Akacjowej w Komorowie. Ekipy naprawcze są już na miejscu. Przewidywany czas usunięcia awarii: do godz. 20:00.
```

**Nazwa źródła:** Urząd Gminy Michałowice

**Expected output:**
- `category`: `water`
- `severity`: `urgent`
- `title`: something like "Awaria wodociągowa — ul. Różana, Komorów"
- `place`: "ul. Różana, ul. Akacjowa, Komorów" or similar
- `startsAt`: null (no date in source) — fallback to today's date in draft
- `endsAt`: null (only a time given, not a date)

**Admin must verify:**
- `place` is correct (ul. Różana and ul. Akacjowa)
- Check expected fix time — if significant, add to `change` field manually
- Expected warning: "Brakuje dokładnej daty — uzupełnij pole „Od kiedy" w Kreatorze."

---

## Case 3 — Planned power outage

**Source text:**
```
Tauron Dystrybucja S.A. informuje o planowanej przerwie w dostawie energii elektrycznej.

Data: 18 czerwca 2026 (środa), godz. 8:00 – 14:00
Ulice objęte przerwą: ul. Lipowa 12–24, ul. Brzozowa 1–15, Reguły
Powód: prace modernizacyjne na stacji transformatorowej.
```

**Nazwa źródła:** Tauron Dystrybucja  
**Sugerowana kategoria:** power

**Expected output:**
- `category`: `power`
- `severity`: `warning`
- `title`: something like "Przerwa w dostawie prądu — Reguły, 18 czerwca"
- `startsAt`: `2026-06-18`
- `endsAt`: `2026-06-18` (same day)
- `place`: "ul. Lipowa 12–24, ul. Brzozowa 1–15, Reguły" or similar

**Admin must verify:**
- Hours (8:00–14:00) — add to `change` field if not included
- Confirm street numbers are correct
- No warnings expected for date or location (both present in source)

---

## Case 4 — Waste collection change

**Source text:**
```
Zmiana harmonogramu odbioru odpadów komunalnych

Uprzejmie informujemy, że w związku ze Świętem Bożego Ciała (19 czerwca 2026) odbiór odpadów z terenu gminy zostaje przesunięty. Odpady, które planowo miały być odbierane 19 czerwca, zostaną odebrane dzień wcześniej, tj. 18 czerwca 2026 (środa).

Dotyczy: odpady zmieszane, odpady segregowane.
```

**Nazwa źródła:** Urząd Gminy Michałowice

**Expected output:**
- `category`: `waste`
- `severity`: `info`
- `title`: something like "Zmiana terminu odbioru odpadów — 18 czerwca"
- `startsAt`: `2026-06-18` or `2026-06-19` (either is acceptable)
- `place`: "" (no specific street — entire gmina)

**Admin must verify:**
- Dates are correct (pickup moved from 19 to 18 June)
- `place` is empty — this is expected for gmina-wide notices
- Expected warning: "Brakuje dokładnej lokalizacji — uzupełnij pole „Gdzie" w Kreatorze." (acceptable — gmina-wide)
- Admin may leave `place` empty for gmina-wide notices

---

## Case 5 — Road works (longer-term)

**Source text:**
```
Zarząd Dróg Powiatowych w Pruszkowie informuje, że od 10 do 30 czerwca 2026 r. prowadzone będą roboty drogowe na ul. Szkolnej w Komorowie (odcinek od skrzyżowania z ul. Ogrodową do ul. Polnej). W związku z tym ruch drogowy będzie odbywał się wahadłowo, kierowany przez sygnalizację tymczasową. Czas przejazdu może być wydłużony.
```

**Nazwa źródła:** ZDP Pruszków

**Expected output:**
- `category`: `roads`
- `severity`: `warning`
- `title`: something like "Roboty drogowe — ul. Szkolna, Komorów"
- `startsAt`: `2026-06-10`
- `endsAt`: `2026-06-30`
- `place`: "ul. Szkolna, Komorów (od ul. Ogrodowej do ul. Polnej)" or similar

**Admin must verify:**
- Date range is correct (10–30 June)
- Street section is correctly captured (ul. Szkolna, between ul. Ogrodowa and ul. Polna)
- `change` mentions traffic is one-way alternating ("ruch wahadłowy")
- No major warnings expected — all key data is in the source

---

## Notes for testing

- Cases 2 and 4 intentionally lack full date info to verify warning generation.
- Case 1 is a transport case — always expect the route-check warning.
- Case 4 has no specific street — an empty `place` is correct here; do not treat it as an error.
- In mock mode (no `ANTHROPIC_API_KEY`), draft quality will be lower — the `change` field will be truncated source text. Warnings are not generated in mock mode.
