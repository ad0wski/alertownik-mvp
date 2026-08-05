# Alertownik — Google Play Store Readiness

Status: dokument roboczy przygotowujący publikację w Google Play. Nie stanowi
gotowej deklaracji prawnej ani ostatecznej treści karty sklepu — każdy punkt
wymagający decyzji Adama jest oznaczony jako **DO POTWIERDZENIA** lub **DO
DECYZJI**. Ten dokument nie wykonuje żadnych działań w Google Play Console.

---

## 1. Aktualny status konta i aplikacji

- [x] Konto Google Play Console utworzone
- [x] Jednorazowa opłata rejestracyjna zapłacona
- [x] Dostęp do fizycznego urządzenia z Androidem zweryfikowany
- [ ] Weryfikacja tożsamości właściciela konta — **w toku**
- [ ] Weryfikacja numeru telefonu — **oczekuje**
- [ ] Aplikacja jeszcze nie została utworzona w Play Console
- [x] Podpisany i zweryfikowany APK gotowy:
      `C:\AndroidTwaProject\app-release-signed.apk`
- [x] Podpisany i zweryfikowany AAB gotowy:
      `C:\AndroidTwaProject\app-release-signed.aab`
      SHA-256: `FEBA3CC81BC6B8D04ED11AA695D42A9FAA9290216BA5CD1B65485243012BBC5A`
- [ ] Niepodpisany AAB (referencyjny, nie do wgrania):
      `C:\AndroidTwaProject\app\build\outputs\bundle\release\app-release.aab`
      — build weryfikacyjny bez podpisu, zachowany wyłącznie jako dowód, że
      Gradle buduje bundle poprawnie bez dotykania keystore. **Do wgrania w
      Play Console służy wyłącznie podpisany plik powyżej.**

---

## 2. Proponowana karta sklepowa

### Nazwa (App name, limit 30 znaków)
Alertownik

(11 znaków — bez zmian, zgodna z `manifest.ts` `name`/`short_name` i
nagłówkiem aplikacji, żadna korekta nie jest potrzebna.)

### Krótki opis (Short description, limit 80 znaków)

**Rekomendacja (74 znaki), uwzględnia odpady, których brakowało w
poprzedniej wersji:**

> Lokalne alerty z oficjalnych źródeł: transport, prąd, woda, drogi, odpady.

Poprzednia wersja robocza (67 znaków, zachowana dla porównania — nie
wymieniała odpadów mimo że to działająca funkcja aplikacji, patrz `/odpady`):

> Lokalne alerty z oficjalnych źródeł: transport, prąd, woda i drogi.

**DO POTWIERDZENIA (Adam):** która wersja krótkiego opisu trafia do Play
Console.

### Pełny opis (Full description, limit 4000 znaków)

Alertownik zbiera w jednym miejscu lokalne alerty — transport, przerwy w
dostawie prądu i wody, utrudnienia drogowe, odpady i komunikaty gminne — na
podstawie oficjalnych, publicznie dostępnych źródeł.

Zamiast sprawdzać osobno strony urzędu, spółek wodociągowych, energetycznych
i przewoźników, znajdziesz te informacje w jednym, czytelnym miejscu, z
możliwością filtrowania według kategorii.

Co znajdziesz w aplikacji:
— Bieżące alerty o zakłóceniach zebrane z oficjalnych źródeł, z podanym
  źródłem przy każdym wpisie.
— Funkcję „Moja okolica" — zapisujesz interesującą Cię okolicę i kategorie,
  a aplikacja pokazuje w pierwszej kolejności to, co dotyczy Ciebie. Te
  ustawienia zostają wyłącznie na Twoim urządzeniu i nie są nigdzie
  wysyłane.
— Harmonogram odbioru odpadów dla obsługiwanych miejscowości, z
  przypomnieniem o najbliższym terminie.
— Tryb jasny, ciemny i systemowy.
— Podstawowy dostęp offline (ekran „Brak połączenia" — aplikacja nigdy nie
  pokaże starego alertu jako aktualnego, gdy jesteś offline).

Korzystanie z Alertownika nie wymaga zakładania konta ani podawania danych
osobowych.

Alertownik jest niezależnym projektem w fazie pilotażu — nie jest oficjalną
aplikacją żadnego urzędu, gminy, spółki komunalnej ani przewoźnika. Zakres
obsługiwanych miejscowości i źródeł rozwija się wraz z pilotażem; aktualny
zasięg widać bezpośrednio w aplikacji.

Projekt stale się rozwija — jeśli zauważysz błąd w alercie albo brakujące
źródło, możesz zgłosić to bezpośrednio z poziomu aplikacji lub strony.

**Zmiana względem poprzedniej wersji:** dodano zdanie o harmonogramie
odbioru odpadów — to realna, działająca funkcja (`/odpady`,
`WasteScheduleSection`), pominięta w poprzednim szkicu. Nic innego nie
zostało dopisane ani upiększone ponad to, co aplikacja faktycznie robi dziś
(brak wzmianek o powiadomieniach push, pełnym pokryciu Polski czy danych
„na żywo" — żadna z tych funkcji nie istnieje).

**DO POTWIERDZENIA (Adam):** ostateczna treść pełnego opisu przed wklejeniem
do Play Console, w szczególności zdanie o zasięgu miejscowości — powyższa
wersja celowo nie ogranicza się do Komorowa/Pruszkowa i podkreśla charakter
pilotażowy, zgodnie z instrukcją.

---

## 3. Preferowana kategoria

**News & Magazines / Wiadomości i czasopisma**

Uzasadnienie: aplikacja agreguje i publikuje lokalne komunikaty z oficjalnych
źródeł — bliżej modelu agregatora informacji lokalnych niż narzędzia
użytkowego. Spójne z podpowiedzią już zapisaną w kodzie: `manifest.ts`
(`categories: ["news", "utilities"]`, Sprint 186A) — to pole Web App
Manifest, nie tożsame z kategorią Play Console, ale ten sam kierunek.

**DO POTWIERDZENIA:** ostateczny wybór kategorii następuje z zamkniętej listy
kategorii dostępnej w formularzu Play Console w momencie tworzenia karty —
lista ta nie jest tożsama z `categories` w Web App Manifest i może się różnić
od powyższej propozycji.

---

## 4. Dane kontaktowe

| Pole (Play Console) | Wartość | Źródło / uwaga |
|---|---|---|
| **E-mail deweloperski (publiczny, wymagany)** | `alertownik.kontakt@gmail.com` | Ten sam adres, którego aplikacja już używa we wszystkich linkach „Napisz do nas" (`src/lib/feedbackMailto.ts`, `FEEDBACK_EMAIL`) i w polityce prywatności (`/prywatnosc`) — spójność z tym, co użytkownik widzi w samej aplikacji. |
| **Strona internetowa (opcjonalna)** | `https://alertownik-mvp.vercel.app/` | Aktualny publiczny adres produkcyjny. Alternatywnie `/demo` (Sprint Day 18) jako krótsza strona wprowadzająca bez logowania — **DO DECYZJI (Adam)**, który adres wygodniej podać. |
| **Telefon (opcjonalny)** | brak do podania | Numer telefonu do konta Play Console jest w trakcie weryfikacji (patrz sekcja 1) — to inne pole niż publiczny numer kontaktowy karty sklepu, którego projekt obecnie nie udostępnia. Nie ma potrzeby go dodawać. |
| **Adres fizyczny** | nie dotyczy tej karty | Play Console może wymagać adresu na poziomie konta dewelopera (rozliczenia/zgodność), nie karty sklepu — poza zakresem tego dokumentu. **DO POTWIERDZENIA (Adam)**, jeśli formularz konta go zażąda. |
| **Administrator danych (RODO, z `/prywatnosc`)** | Adam Jurkowski, osoba fizyczna, projekt niekomercyjny/pilotażowy | Już opublikowane w `/prywatnosc` — użyj tej samej formuły wszędzie, gdzie Play pyta o tożsamość dewelopera/administratora danych, żeby uniknąć rozbieżności między kartą sklepu a polityką prywatności. |

**Zasada spójności:** każde miejsce w Play Console pytające o kontakt lub
tożsamość dewelopera powinno wskazywać dokładnie te same dane co `/prywatnosc`
i istniejące linki „Napisz do nas" w aplikacji — inny e-mail albo inna nazwa
administratora w karcie sklepu niż w polityce prywatności byłyby realną
niespójnością, nie tylko kosmetyczną.

---

## 5. Checklista zasobów graficznych

| Zasób | Ścieżka / status |
|---|---|
| Ikona aplikacji 512×512 | `assets/store/play-icon-512.png` — istnieje w repo, **zatwierdzona wizualnie przez Adama** |
| Grafika promocyjna 1024×500 | `assets/store/feature-graphic-1024x500.png` — istnieje w repo, **zatwierdzona wizualnie przez Adama** (slogan „Ważne informacje z Twojej okolicy w jednym miejscu") |
| Screenshoty telefonu (min. 2, przygotowano 4) | `assets/store/screenshots/phone/` — **zatwierdzone wizualnie przez Adama** |
| Screenshoty tabletu 7" (min. 2) | `assets/store/screenshots/tablet-7/` — **zatwierdzone wizualnie przez Adama** |
| Screenshoty tabletu 10" (min. 2) | `assets/store/screenshots/tablet-10/` — **zatwierdzone wizualnie przez Adama** |
| Wideo promocyjne | niewymagane |

Pełna tabela plik → pole Play Console → format → wymiary → rozmiar →
ekran źródłowy: `assets/store/README.md`.

**Zasada obowiązkowa:** każda grafika (ikona, grafika promocyjna,
screenshoty) wymaga wizualnego zatwierdzenia przez Adama przed przesłaniem do
Play Console. Żadna z nich nie może zawierać logo instytucji (WKD/PGE/gmina/
Google) ani sugerować oficjalnej afiliacji.

---

## 6. Matryca deklaracji — materiał roboczy, NIE gotowa deklaracja prawna

> Poniższa tabela to notatka pomocnicza z audytu kodu, ułatwiająca
> wypełnienie formularzy Play Console. **Nie jest to gotowa, zatwierdzona
> deklaracja Data safety ani żadna inna deklaracja prawna.** Ostateczne
> odpowiedzi w formularzach Play Console musi ręcznie zweryfikować i
> zatwierdzić Adam.

| Element | Stan wg audytu kodu |
|---|---|
| Reklamy | Nie |
| Płatności | Nie |
| Publiczne konta użytkowników | Nie (logowanie istnieje wyłącznie dla administratorów) |
| Geolokalizacja GPS | Nie (funkcja „Moja okolica" to ręcznie wpisywany tekst, nie `navigator.geolocation`) |
| Analityka | Nie wykryto w kodzie |
| Treści użytkowników (UGC) | Nie |
| Preferencje użytkownika | Przechowywane wyłącznie lokalnie na urządzeniu (localStorage), nigdy nie wysyłane na serwer |
| Powiadomienia push | Funkcja nieaktywna (brak wpiętego przepływu wysyłki do użytkowników) |
| `POST_NOTIFICATIONS` (uprawnienie w AndroidManifest.xml) | Uprawnienie istnieje w manifeście, ale jest obecnie nieużywane — **DO DECYZJI przed finalnym wydaniem** (zostawić jako element szablonu TWA czy usunąć/udokumentować w Data safety) |
| Vercel / Supabase, techniczne logi sieciowe / adres IP | **DO POTWIERDZENIA przed zatwierdzeniem formularza Data safety** — wymaga ręcznej weryfikacji dokładnego zakresu przetwarzania po stronie hostingu i bazy danych |
| Polityka prywatności (`/prywatnosc`) | Istnieje i jest publicznie dostępna, ale oznaczona w treści jako szkic wersji beta — **wymaga końcowej rewizji przed publiczną publikacją w sklepie** |

---

## 7. Checklista deklaracji Play Console

- [ ] Data safety (formularz bezpieczeństwa danych)
- [ ] Polityka prywatności (link publiczny w karcie aplikacji)
- [ ] Klasyfikacja treści (content rating questionnaire)
- [ ] Grupa docelowa (target audience)
- [ ] Reklamy (deklaracja obecności/braku reklam)
- [ ] Dostęp do aplikacji (app access — czy wymaga logowania do pełnej funkcjonalności)
- [ ] Deklaracja aplikacji informacyjnej/newsowej (news app declaration, jeśli wymagana dla wybranej kategorii)
- [ ] Dane kontaktowe karty aplikacji (adres e-mail, opcjonalnie strona/telefon) — patrz sekcja 4
- [ ] Oświadczenie o braku oficjalnego powiązania z urzędami/instytucjami

---

## 8. Plan zamkniętego testu (closed testing)

- Minimum **12 testerów**.
- Co najmniej **14 kolejnych dni** ciągłego zapisania do testu.
- Nie zmieniać listy testerów w trakcie okna testowego bez wyraźnej potrzeby
  (zmiana listy może wpłynąć na ciągłość wymaganego okresu — do zweryfikowania
  wg aktualnych zasad Google w momencie startu).
- Zbierać rzeczywisty feedback od testerów, nie tylko potwierdzenie instalacji.
- Prowadzić rejestr obejmujący: datę dołączenia, model i wersję Androida
  urządzenia, wersję aplikacji, zgłoszone błędy i opinie — patrz
  `testers-template.csv`.
- Po zakończeniu testu przygotować odpowiedzi do wniosku o dostęp
  produkcyjny (production access) na podstawie zebranego rejestru.

---

## 9. Tekst zaproszenia dla testerów (bez linku)

> Cześć! Testuję teraz aplikację Alertownik na Androida — lokalne alerty
> (transport, prąd, woda, drogi, odpady) zebrane w jednym miejscu z
> oficjalnych źródeł, w ramach pilotażu.
>
> Szukam kilkunastu osób do krótkiego, dwutygodniowego testu zamkniętego w
> Google Play. Wystarczy zainstalować aplikację z linku testowego (wyślę go
> osobno po dołączeniu do listy testerów) i normalnie z niej korzystać — a
> jeśli coś nie działa albo masz uwagi, daj mi znać.
>
> Aplikacja nie wymaga zakładania konta ani podawania danych osobowych.
> Chętnych proszę o info.

**Link do dołączenia do testu zostanie dodany później** — nie jest jeszcze
dostępny, ponieważ aplikacja nie została jeszcze utworzona w Play Console.

---

## 10. Rejestr testerów — uwaga o poufności

`testers-template.csv` w tym katalogu zawiera wyłącznie nagłówki i jeden
fikcyjny przykładowy wiersz. **Plik z prawdziwymi adresami e-mail i danymi
testerów nie powinien być commitowany do publicznego repozytorium** — realny
rejestr należy prowadzić poza repo (np. arkusz lokalny/prywatny) albo, jeśli
mimo to trafi do repo, dodać go do `.gitignore` przed wypełnieniem danymi.

---

## Decyzje wymagające potwierdzenia Adama (zbiorczo)

1. Wybór wersji krótkiego opisu (sekcja 2).
2. Ostateczna treść pełnego opisu przed wklejeniem do Play Console (sekcja 2).
3. Ostateczny wybór kategorii z zamkniętej listy Play Console (sekcja 3).
4. Który adres podać jako „Strona internetowa" karty sklepu — pełna aplikacja czy `/demo` (sekcja 4).
5. Czy formularz konta dewelopera zażąda adresu fizycznego, i jakiego (sekcja 4).
6. Wykonanie brakujących screenshotów telefonu i tabletu — **zrealizowane**, zatwierdzone wizualnie 2026-08-04 (sekcja 5).
7. Decyzja co do uprawnienia `POST_NOTIFICATIONS` przed finalnym wydaniem (sekcja 6).
8. Potwierdzenie zakresu przetwarzania danych przez Vercel/Supabase przed zatwierdzeniem Data safety (sekcja 6).
9. Końcowa rewizja `/prywatnosc` przed publiczną publikacją w sklepie (sekcja 6).
10. Wypełnienie i zatwierdzenie wszystkich formularzy z sekcji 7 bezpośrednio w Play Console (poza zakresem tego dokumentu).
