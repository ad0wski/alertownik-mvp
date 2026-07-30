# Blok Wykonawczy 1 — pakiet outreachowy do Gminy Michałowice (Etap B)

Status: **przygotowane, NIE wysłane.** Wysyłka wymaga osobnej, jawnej decyzji
Adama — Claude nigdy nie wysyła tej wiadomości samodzielnie.

Data: 2026-08-03 (Blok Wykonawczy 1, po Sprincie 188A).

---

## 1. Dlaczego Gmina Michałowice

Rekomendowany pierwszy odbiorca zgodnie z briefem tego bloku. Uzasadnienie
merytoryczne: Gmina Michałowice jest już najlepiej pokrytym źródłem w
pilotażu (`michalowice-komunikaty` — automatyczny check, kategoria
`municipal`; plus `michalowice-wylaczenia-pradu`, `michalowice-odpady` —
`src/lib/officialSourceChecklist.ts`), obejmuje 5 z 6 miejscowości pilotażu
(Komorów, Nowa Wieś, Granica, Michałowice, Reguły), i to właśnie stamtąd
pochodzi jedyny dotychczasowy realny sygnał użytkownika (mama Adama,
Sprint 182A) — kontakt z samą gminą jest naturalnym następnym krokiem, nie
przypadkowym wyborem.

---

## 2. Temat wiadomości

**Wariant A (neutralny, informacyjny):**
> Lokalny projekt komunikatów dla mieszkańców gminy — prośba o krótką opinię

**Wariant B (krótszy):**
> Alertownik — prośba o opinię (2 minuty)

---

## 3. Pełna wiadomość e-mail

> Dzień dobry,
>
> Piszę w sprawie Alertownika — niewielkiego, niezależnego projektu, który od
> kilku miesięcy zbiera w jednym miejscu lokalne komunikaty dotyczące gminy
> Michałowice: przerwy w dostawie wody, wyłączenia prądu, utrudnienia
> drogowe, komunikaty urzędu i rozkład WKD. Wszystkie komunikaty pochodzą
> wyłącznie z oficjalnych źródeł (strona gminy, wodociągi, WKD, PGE) i przed
> publikacją są ręcznie zatwierdzane — projekt nie zbiera niczego z plotek
> ani mediów społecznościowych.
>
> To wciąż wczesny, niezależny pilotaż — nie jest to oficjalna aplikacja
> gminy ani żadnego z operatorów, i obecnie nie proponuję żadnej płatnej
> usługi ani formalnej współpracy. Piszę wyłącznie z prośbą o kilka minut
> uwagi i krótką, szczerą opinię.
>
> Krótkie demo (2–3 minuty czytania), pokazujące dokładnie, jak i skąd
> zbierane są komunikaty: https://alertownik-mvp.vercel.app/demo
>
> Byłbym bardzo wdzięczny za odpowiedź na dwa pytania: czy taki format
> komunikatów miałby sens dla mieszkańców gminy, i czy z Państwa strony
> widzicie jakiekolwiek przeciwwskazania do tego, żeby projekt w obecnej,
> niezobowiązującej formie dalej istniał i się rozwijał. Nie proszę o żadną
> decyzję dotyczącą współpracy — wyłącznie o opinię.
>
> Dziękuję za czas i pozdrawiam,
> Adam Jurkowski

**Uwaga o autentyczności:** wiadomość jest podpisana prawdziwym imieniem i
nazwiskiem Adama (zgodnie z danymi sesji) — Claude nie tworzy fikcyjnej
tożsamości nadawcy.

---

## 4. Krótsza alternatywa (jeśli Adam wybierze wersję na 3 zdania)

> Dzień dobry, prowadzę niezależny, niekomercyjny projekt zbierający lokalne
> komunikaty (woda, prąd, drogi, WKD) dla gminy Michałowice z oficjalnych
> źródeł — krótkie demo: https://alertownik-mvp.vercel.app/demo. Byłbym
> wdzięczny za kilka zdań opinii, czy taki format ma sens dla mieszkańców.
> Dziękuję za czas! Adam Jurkowski

---

## 5. Jasne wyjaśnienie zawarte w wiadomości (checklist zgodności z briefem)

- ✅ Niezależny, wczesny projekt — stwierdzone wprost, nie ukryte w stopce.
- ✅ Nie sprzedajemy teraz żadnej usługi — zdanie „obecnie nie proponuję
  żadnej płatnej usługi ani formalnej współpracy" jest dosłowne, nie
  domyślne.
- ✅ Prosimy wyłącznie o krótką opinię — dwa konkretne pytania, żadnej innej
  prośby.
- ✅ Demo pokazuje sposób zbierania komunikatów — link do `/demo`, które
  samo w sobie (Sprint 185A) opisuje źródła i proces bez żargonu.
- ✅ Brak twierdzenia o współpracy — wiadomość nigdy nie mówi „współpracujemy
  z gminą" ani nie sugeruje istniejącego partnerstwa; wprost pyta o
  ewentualne przeciwwskazania, zamiast zakładać zgodę.

---

## 6. Do kogo kierować kontakt (rodzaje stanowisk, nie nazwiska)

Gmina Michałowice nie ma jednego jawnie publicznego adresu dla tego typu
zapytania w danych już zebranych przez ten projekt — poniższa lista to
**rodzaje** adresatów, nie konkretne osoby (Claude nie wyszukiwał ani nie
zgadywał żadnych prywatnych danych kontaktowych):

1. **Referat/stanowisko ds. komunikacji i promocji gminy** — najbardziej
   naturalny pierwszy adresat: to dokładnie ich obszar (informowanie
   mieszkańców).
2. **Sekretariat urzędu gminy** (ogólny adres kontaktowy ze strony
   `michalowice.pl`) — bezpieczny domyślny wybór, jeśli nie ma dedykowanego
   adresu ds. komunikacji; sekretariat zwykle przekazuje dalej.
3. **Referat zarządzania kryzysowego / bezpieczeństwa** — trafny drugi wybór
   z uwagi na kategorie „drogi"/„prąd"/„woda", ale mniej naturalny dla
   pierwszego kontaktu niż komunikacja/promocja.

**Zalecenie:** zacząć od (1) lub (2) — Adam sam potwierdzi dokładny adres
e-mail ze strony gminy przed wysyłką; Claude nie wpisuje żadnego konkretnego
adresu bez weryfikacji przez Adama.

---

## 7. Sposób śledzenia wysyłki i odpowiedzi

Prosta tabela do ręcznego prowadzenia przez Adama (bez nowej tabeli
Supabase, bez nowego kodu — zgodnie z zasadą „prosty sposób", nie nowa
funkcja produktowa):

| Data wysyłki | Adresat (stanowisko) | Wariant wiadomości | Odpowiedź | Data odpowiedzi | Notatka |
|---|---|---|---|---|---|
| _(puste do wypełnienia)_ | | | ⬜ brak / ✅ tak / ❌ odmowa | | |

Rekomendacja: prowadzić tę tabelę w tym samym pliku (edytując go ręcznie po
wysyłce) lub w Obsidian (`Adam_Life/04_Projekty/Alertownik/`), zgodnie z
istniejącym wzorcem przechowywania decyzji projektowych poza repozytorium
kodu.

---

## 8. Co Adam musi zrobić przed faktyczną wysyłką

1. Potwierdzić lub odnaleźć właściwy adres e-mail gminy (Claude nie
   wyszukiwał ani nie zgadywał żadnego konkretnego adresu).
2. Wybrać wariant wiadomości (pełny §3 lub krótki §4) i temat (§2).
3. Wysłać wiadomość osobiście, z własnej skrzynki — Claude nie loguje się do
   żadnej poczty i nie wysyła niczego automatycznie.
4. Zapisać datę wysyłki w tabeli z §7.

Do czasu tej decyzji status Etapu B pozostaje: **materiały 100% gotowe,
outreach 0% wysłany** — bez zmian względem Sprintu 187A/188A.
