# Demo Data Guide — Alertownik MVP

Ten dokument opisuje, jakie dane warto przygotować w Supabase przed pilotem lub demo.
Wszystkie operacje wykonuje się ręcznie w Kreatorze alertu lub bezpośrednio w Supabase.

Last updated: June 2026

---

## Zasada: nie usuwaj danych automatycznie

Stare alerty testowe należy **archiwizować** (status → `archived`), nie usuwać.
Archiwizacja ukrywa je przed publicznymi użytkownikami, ale zachowuje historię.

Aby zarchiwizować alert: otwórz Kreator (`/builder`) → znajdź alert na liście Supabase → kliknij „Archiwizuj".

---

## Jakie alerty warto mieć na demo

### Minimum dla pilotu

Przygotuj co najmniej **3 alerty opublikowane** z różnych kategorii i o różnym statusie czasowym:

| # | Kategoria | Poziom | Status czasu | Opis |
|---|-----------|--------|--------------|------|
| 1 | Transport | Uwaga | Trwa (startsAt dziś lub wcześniej, endsAt za kilka dni) | Zmiana trasy / objazd |
| 2 | Woda lub Prąd | Pilne lub Uwaga | Nadchodzące (startsAt za 1–2 dni) | Planowa przerwa w dostawie |
| 3 | Komunikaty lub Drogi | Informacja | Trwa lub Nadchodzące | Utrudnienie ogólne |

### Opcjonalnie (dla bogatszego demo)

- Alert z kategorii Odpady (zmiana harmonogramu odbioru)
- Alert z kategorii Drogi (remont ulicy)
- Alert zakończony — żeby pokazać filtr „Zakończone"

---

## Przykładowe alerty do wpisania

### Przykład 1 — Transport

```
Kategoria:   Transport
Poziom:      Uwaga
Tytuł:       Zmiana trasy WKD — linia W1
Lokalizacja: Komorów / Pruszków
Data od:     (dziś lub kilka dni temu)
Data do:     (za 5–7 dni)
Co się zmienia:
  Pociągi WKD na linii W1 kursują zmienioną trasą z powodu prac torowych między
  Komorowem a Pruszkowem. Na odcinku zastępczym kursują autobusy.
Co zrobić:
  Sprawdź aktualne odjazdy na stronie WKD przed wyjściem.
  Autobus zastępczy odjeżdża spod stacji Komorów.
Źródło:      WKD
URL źródła:  https://wkd.com.pl/aktualnosci/
```

### Przykład 2 — Woda

```
Kategoria:   Woda
Poziom:      Pilne
Tytuł:       Przerwa w dostawie wody — ul. Szkolna, Michałowice
Lokalizacja: Michałowice
Data od:     (jutro lub pojutrze)
Data do:     (ten sam dzień, kilka godzin)
Co się zmienia:
  W związku z wymianą głównego zaworu wodociągowego woda zostanie
  odcięta na ul. Szkolnej i przyległych odcinkach.
Co zrobić:
  Zaopatrz się w wodę pitną przed przerwą.
  W razie pilnej potrzeby zadzwoń do Urzędu Gminy.
Źródło:      Gmina Michałowice
URL źródła:  https://www.michalowice.pl/
```

### Przykład 3 — Komunikaty lokalne

```
Kategoria:   Komunikaty
Poziom:      Informacja
Tytuł:       Zamknięcie Urzędu Gminy w dniu 12 czerwca
Lokalizacja: Michałowice, ul. Raszyńska 34
Data od:     2026-06-12
Data do:     2026-06-12
Co się zmienia:
  Urząd Gminy Michałowice będzie zamknięty w dniu 12 czerwca (czwartek) z okazji
  lokalnego Dnia Samorządu.
Co zrobić:
  W pilnych sprawach skontaktuj się przez e-mail lub zadzwoń dzień wcześniej.
Źródło:      Urząd Gminy Michałowice
URL źródła:  https://www.michalowice.pl/
```

---

## Stare dane testowe — jak je posprzątać

Alerty z tytułami w stylu:
- „test"
- „asdf"
- „Test alert"
- „przykładowy alert 1"
- dowolne z `slug` zawierającym `test` lub `sample`

Archiwizuj je ręcznie w Kreatorze, zanim zaproszisz pilotów.

**Jak to zrobić:**
1. Otwórz `/builder`
2. Przewiń do sekcji „Alerty w Supabase"
3. Użyj filtra statusu lub wyszukiwarki, żeby znaleźć stare alerty
4. Kliknij „Archiwizuj" przy każdym starym alercie testowym

---

## Źródła do sprawdzenia

Przed pilotem warto mieć w rejestrze źródeł co najmniej:

| Źródło | Kategoria | URL |
|--------|-----------|-----|
| WKD | Transport | https://wkd.com.pl/aktualnosci/ |
| Gmina Michałowice | Komunikaty | https://www.michalowice.pl/ |
| Urząd Gminy Pruszków | Komunikaty | https://pruszkow.pl/ |

Dodaj je przez stronę `/admin/sources` → „+ Dodaj źródło".

---

## Co sprawdzić po dodaniu demo danych

- [ ] Na stronie głównej widać co najmniej 2 opublikowane alerty
- [ ] Karta alertu wyświetla się poprawnie (tytuł, badges, daty, lokalizacja)
- [ ] Strona szczegółów `/alerts/[slug]` działa dla każdego demo alertu
- [ ] W rejestrze źródeł jest co najmniej jedno źródło aktywne
- [ ] Stare alerty testowe mają status `archived` i nie są widoczne publicznie
