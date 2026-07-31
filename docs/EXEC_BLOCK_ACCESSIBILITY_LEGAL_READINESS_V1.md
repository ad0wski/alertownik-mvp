# Blok Accessibility & Legal Readiness (Etap A + D)

**Data:** 2026-07-31
**Status:** audyt zakończony, dwa realne błędy dostępności naprawione,
zero zmian SQL/RLS/env/allowlist, zero zapisów do Supabase poza `SELECT`.
Ten blok jest częścią istniejących Etapów A i D — nie tworzy nowego etapu.

To nie jest porada prawna. Sekcja prawna (część 3) jest wyłącznie listą
kontrolną do sprawdzenia samodzielnie lub z prawnikiem — żadna z jej
formuł nie została zweryfikowana przez prawnika.

---

## 1. Co sprawdzono

Baseline Production potwierdzony przed jakąkolwiek zmianą:

| Sprawdzenie | Wynik |
|---|---|
| `main` == `origin/main` | tak, `dfda7bf` |
| Working tree | czysty (poza nieistotnym `.vscode/`) |
| `/`, `/instalacja`, `/alerty`, `/admin`, `/admin/sources`, `/partnerzy`, `/demo` | wszystkie 200 |
| `/api/cron/write-candidates`, `/api/cron/auto-publish-trusted-source` | oba 503 (fail-closed) |
| Supabase (odczyt, `SELECT` only) | `alerts`=8, `alert_sources`=4, `source_checks`=2 |

Audyt dostępności objął (przeczytane w całości): `layout.tsx`,
`globals.css`, `AppHeader`, `BottomNav`, `AppFooter`,
`NetworkStatusBanner`, `TodayView`, `AlertCard`, `AlertList`,
`AlertDetailClient`, `PreferencesSection`, `ThemeToggle`, `login/page.tsx`,
`alerty/page.tsx`, `offline.html`, plus grep całego `src/` pod kątem
`<img>` (brak — zero obrazów bez alt, bo ich po prostu nie ma), pól
formularzy bez `<label>`, obecności linku "pomiń nawigację", oraz
istniejących miejsc `aria-live`/`role="status"`/`role="alert"`.

## 2. Co znaleziono

Ogólny stan: **bardzo dobry, dojrzalszy niż przeciętny wczesny pilotaż.**
Poprzednie sprinty (162, 163, 181B, 186A i inne) już konsekwentnie
wdrożyły: widoczny pierścień fokusu (`:focus-visible` na wszystkich
interaktywnych elementach), `prefers-reduced-motion` globalnie
respektowane, minimalne obszary dotykowe 44×44px na przyciskach
mobilnych, `role="radiogroup"`/`aria-checked` na przełączniku motywu,
`aria-expanded`/`aria-pressed` na rozwijanych/przełączanych elementach,
etykiety (`<label htmlFor>`) na każdym polu formularza znalezionym w
`src/`, semantyczne `<nav aria-label>`, `<h1>`/`<h2>` w logicznej
kolejności, uczciwe stany pustych list (5 odrębnych wariantów w
`AlertList`), `lang="pl"` na `<html>`, oraz stronę `offline.html`
działającą samodzielnie (bez JS aplikacji) z własnym trybem ciemnym.

Realne, konkretne braki znalezione tym audytem:

1. **Brak linku „pomiń nawigację"** — każda strona wymagała
   przejścia Tab przez cały header i nawigację przed dotarciem do
   treści głównej. Dotyczy każdego użytkownika klawiatury/czytnika
   ekranu na każdej stronie.
2. **Potwierdzenie zapisu „Moja okolica" nigdy się nie renderowało** —
   to nie jest tylko problem dostępności, to **realny błąd funkcjonalny
   znaleziony przez test napisany dla tego audytu**: `handleSavePrefs`
   w `AlertList.tsx` zamykał panel ustawień w tym samym tyknięciu, w
   którym `PreferencesSection` ustawiał własny stan `saved`, więc
   komunikat „Preferencje zapisane" nigdy nie zdążył się wyświetlić —
   ani wzrokowo, ani dla czytnika ekranu. Wykryte dopiero po dodaniu
   testu sprawdzającego ogłoszenie `aria-live`, który początkowo failował
   z powodu tego niezwiązanego z ARIA błędu bazowego.
3. **Komunikat błędu pobierania alertów bez `role="alert"`** —
   `AlertList.tsx` pokazuje "Nie udało się połączyć z serwerem" wyłącznie
   wizualnie; czytnik ekranu nie dowiadywał się o tym automatycznie.
4. **Kontrast `text-slate-400` na jasnym tle ~2.7:1** — poniżej progu
   WCAG AA (4.5:1 tekst normalny, 3:1 duży tekst). Używany szeroko jako
   kolor tekstu pomocniczego (znaczniki czasu, placeholdery, opisy
   pomocnicze) w wielu miejscach całej aplikacji. **Nie naprawiono w tym
   bloku** — to systemowa zmiana koloru w dziesiątkach miejsc, czyli
   dokładnie rodzaj „przebudowy całego wyglądu" wyraźnie wykluczony z
   tego bloku bez osobnej decyzji Adama o akceptacji wizualnej zmiany.
   Bezpieczna naprawa istnieje (`slate-500` = ok. 4.77:1, zgodne z AA) i
   jest gotowa do wdrożenia w osobnym, dedykowanym sprincie wizualnym.
5. **Chip filtrów kategorii na desktopie (`hidden sm:flex`, tylko ≥sm)
   mają wysokość ~32px, poniżej zalecanych 44px** — dotyczy tylko
   układu widocznego od breakpointu `sm` wzwyż (myszka jako główne
   wejście w typowym przypadku, ale tablety dotykowe mogą też trafić w
   ten breakpoint). Niejednoznaczne, czy to realny problem w praktyce —
   udokumentowane jako pozycja checklisty, nie naprawione automatycznie
   (zmiana paddingu zmieniłaby układ rzędu chipów na desktopie).
6. **Panel admina (`/builder`, `/admin/sources`, `/admin/waste` itd.)
   ma dziesiątki podobnych, czysto wizualnych potwierdzeń zapisu bez
   `aria-live`** — świadomie odłożone w tym bloku: jedynym użytkownikiem
   panelu admina jest obecnie Adam (widzący, myszka+klawiatura), a
   realny cel VoiceOver/TalkBack tego bloku to publiczna aplikacja dla
   mieszkańców. Realna poprawa możliwa w przyszłym, dedykowanym
   przebiegu po stronie panelu admina.

## 3. Co naprawiono

- `src/app/layout.tsx` — dodany link „Przejdź do treści" (pierwszy
  fokusowalny element na każdej stronie, niewidoczny do czasu fokusu),
  cel `#main-content` z `tabIndex={-1}`.
- `src/components/PreferencesSection.tsx` — komunikat „Preferencje
  zapisane" oznaczony `role="status" aria-live="polite"`.
- `src/components/AlertList.tsx` (dwie zmiany):
  - Komunikat błędu pobierania alertów oznaczony `role="alert"`.
  - **Realna naprawa błędu #2 powyżej**: `handleSavePrefs` teraz zamyka
    panel ustawień z opóźnieniem 1200ms zamiast natychmiast, dając
    komunikatowi potwierdzenia realną szansę wyrenderowania się przed
    zamknięciem panelu — dotyczy zarówno widzących użytkowników, jak i
    czytników ekranu.

Żaden inny plik nie został zmieniony. Żadna zmiana wizualna poza tym,
że panel ustawień teraz zamyka się z 1.2-sekundowym opóźnieniem zamiast
natychmiast (widoczna, zamierzona poprawa, nie regresja).

## 4. Nowe testy automatyczne

`tests/e2e/public.spec.ts`, nowy blok `test.describe("Accessibility —
skip link and live-region confirmations")`:

- Link „Przejdź do treści" jest pierwszym fokusowalnym elementem i
  faktycznie przenosi fokus do `#main-content`.
- Zapisanie preferencji „Moja okolica" renderuje potwierdzenie w
  `[role="status"]` z `aria-live="polite"` — ten test złapał błąd #2
  powyżej przy pierwszym uruchomieniu, zanim naprawa została wdrożona.

## 5. Wyniki testów (Green Gate)

- `npm run check` (typecheck + lint + build): **PASS**, zero błędów,
  zero nowych ostrzeżeń.
- `npm run test:pwa`: **28/28 PASS**.
- `npm run test:e2e` (pełny): **1748/1749 PASS**. Jedno niepowodzenie
  (`auth-guards.spec.ts` — „/builder — shows login prompt”) okazało się
  przejściowym obciążeniem przy pełnym równoległym przebiegu — ponowne,
  izolowane uruchomienie całego pliku dało **7/7 PASS**, w tym dokładnie
  ten sam test. Niepowiązane z żadną zmianą tego bloku.
- Security/allowlist audit: brak sekretów w diffie; żadna allowlist
  writera/auto-publish niedotknięta; brak zmian SQL/RLS/env.

## 6. Checklista ręcznych testów dla Adama

**Nic poniżej nie zostało wykonane przez Claude — brak fizycznego
urządzenia z VoiceOver/TalkBack w tym środowisku.** To jest przygotowana,
niewykonana checklista, nie raport z testu. Adres testowy:
`https://alertownik-mvp.vercel.app` (Production) lub Preview URL tego
bloku po wdrożeniu.

### A. VoiceOver na iPhonie

- [ ] 1. Włącz VoiceOver (Ustawienia → Dostępność → VoiceOver), otwórz
      stronę główną.
- [ ] 2. Przesuń palcem w prawo od góry ekranu — pierwszy element
      powinien być linkiem „Przejdź do treści” (nowość tego bloku),
      drugi dotknięciem tego linku powinien przenieść czytanie od razu
      do nagłówka „Dzisiaj”/„Lokalne alerty…”, pomijając cały nagłówek
      i nawigację.
- [ ] 3. Przejdź przez kartę alertu — sprawdź, czy VoiceOver odczytuje
      kategorię, poziom ważności, tytuł, miejsce i datę w sensownej
      kolejności (nie w losowej).
- [ ] 4. Otwórz szczegóły alertu (przycisk „Szczegóły ▼”) — sprawdź, czy
      VoiceOver ogłasza zmianę stanu przycisku (rozwinięty/zwinięty).
- [ ] 5. Przejdź do „Moja okolica” → ustaw okolicę → „Zapisz
      preferencje” — sprawdź, czy VoiceOver **ogłasza na głos**
      „Preferencje zapisane” bez potrzeby ręcznego przesuwania palcem do
      tego miejsca (to jest dokładnie to, co naprawiono w tym bloku).
- [ ] 6. Przejdź przez dolną nawigację (Dzisiaj/Alerty/Odpady/Więcej) —
      sprawdź, czy każda zakładka ma sensowną nazwę i czy aktywna
      zakładka jest oznaczona (`aria-current`).
- [ ] 7. Otwórz `/login` — sprawdź, czy pola Email/Hasło są poprawnie
      etykietowane i czy błąd logowania jest odczytywany na głos.
- [ ] 8. Sprawdź `/prywatnosc` i `/zasady` — długie strony tekstowe,
      upewnij się, że nagłówki sekcji (`h2`) pozwalają nawigować przez
      rotor VoiceOver „Nagłówki” zamiast czytać całość liniowo.

### B. TalkBack na Androidzie

- [ ] 1. Włącz TalkBack, otwórz stronę główną w Chrome.
- [ ] 2. Powtórz punkty A2–A7 powyżej (te same elementy, ten sam
      oczekiwany rezultat) — TalkBack i VoiceOver powinny zachowywać
      się spójnie, bo to ta sama semantyka HTML/ARIA, nie osobny kod.
- [ ] 3. Sprawdź konkretnie select kategorii na małym ekranie
      (`<select id="category-select">` widoczny tylko `sm:hidden`) —
      TalkBack ma inny sposób obsługi natywnych `<select>` niż
      VoiceOver, warto to sprawdzić osobno.

### C. Większy tekst / powiększenie systemowe

- [ ] 1. Ustaw największy rozmiar tekstu systemowego (iOS: Ustawienia →
      Wyświetlanie i jasność → Rozmiar tekstu, suwak maksymalnie w
      prawo; Android: Ustawienia → Ułatwienia dostępu → Rozmiar
      czcionki).
- [ ] 2. Sprawdź stronę główną, `/alerty`, szczegóły alertu, `/odpady` —
      czy tekst się nie ucina, czy przyciski nadal mieszczą swoją
      treść, czy nic nie nachodzi na siebie.
- [ ] 3. Powiększ przeglądarkę do 200% (Ctrl/Cmd + kilka razy) na
      komputerze — sprawdź te same strony pod kątem ucinania treści.

### D. Wysoki kontrast

- [ ] 1. Włącz tryb wysokiego kontrastu systemowego (iOS: Ustawienia →
      Dostępność → Wyświetlanie i rozmiar tekstu → Zwiększ kontrast;
      Android: zależne od producenta, zwykle Ustawienia → Ułatwienia
      dostępu).
- [ ] 2. Sprawdź, czy karty alertów, przyciski i linki pozostają
      czytelne i rozróżnialne.
- [ ] 3. Przełącz aplikację między trybem jasnym/ciemnym/systemowym
      (`/ustawienia` lub stopka) w obu trybach kontrastu.

### E. Obsługa bez patrzenia na ekran / jedną ręką

- [ ] 1. Z zablokowanym ekranem telefonu w kieszeni (albo z zamkniętymi
      oczami), spróbuj samym dotykiem i VoiceOver/TalkBack dotrzeć do
      najważniejszego aktywnego alertu na stronie głównej i przeczytać
      jego treść.
- [ ] 2. Trzymając telefon jedną ręką, sprawdź czy dolna nawigacja i
      najważniejsze przyciski (Szczegóły, Zapisz preferencje) są
      wygodne do dotknięcia kciukiem bez zmiany chwytu.

### F. Tryb offline i błędy sieciowe

- [ ] 1. Włącz tryb samolotowy, otwórz aplikację (jeśli była wcześniej
      zainstalowana/odwiedzona) — sprawdź, czy pokazuje się ekran „Brak
      połączenia z internetem”, a nie stare dane jako aktualne.
- [ ] 2. Sprawdź, czy górny baner „Brak internetu” pojawia się przy
      utracie połączenia i znika po jego przywróceniu (bez odświeżania
      strony).
- [ ] 3. Wyłącz internet w trakcie ładowania `/alerty` — sprawdź, czy
      pojawia się czytelny komunikat błędu (teraz też ogłaszany
      czytnikom ekranu, patrz naprawa #3 w części 3).

---

## 7. Audyt prawny (nie jest to porada prawna)

Stan wyjściowy jest już dojrzały: `/prywatnosc` i `/zasady` istnieją,
oznaczone jako „wersja beta (szkic)”, i realnie zawierają: nazwanego
administratora danych (Adam Jurkowski), dedykowany kontakt e-mail,
listę faktycznie zbieranych danych (w tym jawne „czego NIE zbieramy” —
brak analityki, brak cookies reklamowych, brak danych płatniczych),
wszystkich podmiotów przetwarzających (Vercel z regionem iad1/USA i
zweryfikowanym opisem mechanizmów transferu, Supabase z regionem
Londyn/UK i decyzją o adekwatności, dostawcę poczty, Anthropic/AI z
jasnym zakresem), podstawę prawną przetwarzania, okres przechowywania,
prawa RODO, oraz status dokumentu. `/zasady` jawnie zastrzega: to nie
jest serwis ratunkowy (112 wskazane), niekompletność, brak gwarancji
aktualności w czasie rzeczywistym, niezależność od gminy/WKD/PGE/innych
instytucji, brak odpowiedzialności za decyzje podjęte wyłącznie na
podstawie treści.

### A. Wymagane przed bezpłatnym pilotażem (obecny stan aplikacji)

| Pozycja | Stan |
|---|---|
| Polityka prywatności z administratorem i kontaktem | ✅ gotowe (`/prywatnosc`) |
| Regulamin/zasady z zastrzeżeniem "nie serwis ratunkowy" | ✅ gotowe (`/zasady`) |
| Ujawnienie źródeł i sposobu ich oznaczania | ✅ gotowe (każdy alert ma „Źródło”, `/zasady` opisuje proces) |
| Zastrzeżenie braku afiliacji z gminą/WKD/PGE/wodociągami | ✅ gotowe, powtórzone w stopce, `/zasady`, `/prywatnosc` |
| Ujawnienie cookies/localStorage/analityki | ✅ gotowe — jawnie: brak cookies reklamowych, brak zewnętrznej analityki, tylko localStorage preferencji |
| Kanał zgłaszania błędu/nieaktualnego alertu | ✅ gotowe (`/about#feedback`, mailto) |
| Retencja i możliwość usunięcia danych | ✅ opisane (logi wg dostawcy, e-maile do usunięcia, localStorage czyszczalne przez użytkownika) |
| Odpowiedzialność za opóźnienia/błędy/niepełność | ✅ gotowe (`/zasady`, „Czego nie gwarantujemy") |

**Wniosek A: zgodne z minimalnym zestawem wymaganym dla bezpłatnego
pilotażu w obecnej formie „szkic beta”.** Jedyne co brakuje to formalna
weryfikacja prawna tego szkicu (patrz sekcja D) — sam projekt już
uczciwie i kompletnie opisuje swój aktualny stan.

### B. Wymagane dopiero przed sklepami (Google Play / App Store)

| Pozycja | Stan |
|---|---|
| Google Play Data Safety (Sekcja bezpieczeństwa danych w konsoli) | ⬜ nie wypełnione — osobny formularz w Play Console, niezależny od `/prywatnosc`, wymaga wypełnienia przy zgłoszeniu |
| Apple App Privacy (Nutrition Labels) | ⬜ nie wypełnione — analogiczny formularz App Store Connect, dopiero przy zgłoszeniu do App Store |
| Target audience / content rating (Play Console) | ⬜ nie ustawione — kwestionariusz w konsoli, wymaga decyzji Adama o grupie docelowej (raczej "wszyscy"/ogólna, biorąc pod uwagę charakter treści) |
| Dane wydawcy (nazwa, adres) w formularzach sklepowych | ⬜ decyzja Adama — nie do wypełnienia automatycznie |
| Finalna (nie-"szkic beta") wersja `/prywatnosc` i `/zasady` | ⬜ wymaga decyzji, czy "szkic beta" wystarcza na start zamkniętego testu, czy wymaga finalizacji już na tym etapie — bezpieczniejsze: finalizować przed jawnym zgłoszeniem do sklepu, nie przed samym zamkniętym testem 12 testerów |
| Zgodność z wytyczną Apple 4.2 (Minimum Functionality) dla PWA/TWA | ⬜ ryzyko udokumentowane w Sprincie 186A — decyzja o iOS odłożona |

**Wniosek B: technicznie i treściowo przygotowane, ale trzy formalne
formularze sklepowe (Data Safety, App Privacy, content rating) nie
istnieją jeszcze nigdzie poza tym, co już opisuje `/prywatnosc` —
wymagają osobnego wypełnienia w konsoli danej platformy w momencie
zgłoszenia, nie wcześniej.**

### C. Zależne od przyszłej monetyzacji (Etap C, nierozpoczęty)

| Pozycja | Stan |
|---|---|
| Regulamin płatnej usługi / warunki subskrypcji | ⬜ nie istnieje — Etap C nierozpoczęty, zgodnie z briefem tego bloku pozostaje nierozpoczęty |
| Zasady zwrotów/rezygnacji | ⬜ nie dotyczy jeszcze — brak jakiejkolwiek płatnej oferty |
| Rejestracja działalności gospodarczej / status podatkowy | ⬜ decyzja Adama, poza zakresem technicznym całkowicie |
| Umowy B2B z gminami/partnerami (jeśli monetyzacja B2G) | ⬜ zależne od wyniku Etapu B/C |

**Wniosek C: świadomie nierozpoczęte, zgodnie z jawnym zakazem tego
bloku — Etap C wymaga najpierw osobnej rozmowy Adama z ChatGPT o modelu
zarabiania, działalności, podatkach, przed jakimkolwiek kodem czy
dokumentem.**

### D. Wymagające konsultacji z prawnikiem

| Pozycja | Dlaczego to nie jest coś, co Claude może rozstrzygnąć samodzielnie |
|---|---|
| Czy "administrator = osoba fizyczna, imię i nazwisko" w pełni spełnia wymogi Art. 13 RODO dla serwisu tej skali | Sprint 154 already flagged this open — wybrany wariant A (nazwane imię+nazwisko) jest najprostszy, ale ostateczna wystarczalność prawna nie została zweryfikowana przez prawnika |
| Dokładny zakres relacji umownej Vercel Hobby / Supabase wobec transferu danych poza EOG | Opisane uczciwie jako "wymaga ponownej weryfikacji przed szerszym startem" (Sprint 156C3) — to pozostaje otwarte, nie rozstrzygnięte |
| Czy PWA/TWA "opakowujący" istniejącą stronę spełnia Apple Guideline 4.2 w praktyce (nie tylko w teorii) | Zależy od faktycznej decyzji recenzenta Apple, nie od analizy tekstu wytycznych |
| Odpowiedzialność za treści alertów cytowane od stron trzecich (WKD, PGE, gminy) w przypadku błędu źródła | Zastrzeżenia w `/zasady` są rozsądne i uczciwe, ale ich prawna skuteczność w sporze nie została oceniona przez prawnika |
| Ryzyka przyszłego wykorzystania przez gminy/podmioty publiczne (B2G) | Zupełnie nowa kategoria ryzyka (zamówienia publiczne, dostępność cyfrowa wg ustawy o dostępności cyfrowej stron internetowych, umowy administracyjne) — nie oceniane w tym bloku w ogóle, zasadnie odłożone do momentu realnego zainteresowania partnera |
| Wymogi ustawy o dostępności cyfrowej (WCAG 2.1 AA) jeśli serwis kiedykolwiek stanie się częścią oferty podmiotu publicznego | Ten blok wykonał praktyczny audyt WCAG-owy (część 2 powyżej), ale formalna zgodność prawna z ustawą wymaga oceny prawnika, szczególnie jeśli B2G stanie się realne |

**Wniosek D: żadna z powyższych pozycji nie blokuje bezpłatnego
pilotażu ani rozpoczęcia procesu Google Play (12 testerów/14 dni) — są
to pytania właściwe dla momentu, gdy Adam realnie rozważa jawną
publikację sklepową, B2G, lub monetyzację, nie wcześniej.**

---

## 8. Kanoniczny status roadmapy A–F po tym bloku

| Etap | Status |
|---|---|
| A (techniczny) | 100% + ten blok: dwa realne błędy dostępności naprawione (skip link, martwe potwierdzenie zapisu preferencji), zero regresji |
| A (walidacja) | 1/3–5 (20%) — bez zmian, wymaga realnych odpowiedzi testerów, poza zakresem tego bloku |
| B | w toku — bez zmian (wysłano 2026-07-30, brak odpowiedzi) |
| C | 0%, świadomie nierozpoczęty w tym bloku |
| D | ~35% + ten blok: audyt Data Safety/App Privacy/content rating udokumentowany jako punkt B checklisty prawnej — nie podnosi formalnego %, żaden sub-cel D1 nadal nieukończony (brak konta Play Console) |
| E | zakończony, bez zmian |
| F | 8 fal, bez zmian w tym bloku |

## 9. Szacunkowa liczba dużych bloków Claude pozostałych

- **Do wersji gotowej do zamkniętego testu Google Play (D1 start):**
  ~1 blok techniczny (założenie konta i wypełnienie Data
  Safety/target audience/content rating to zadania Adama w konsoli, nie
  kodu; Claude'owy blok to ewentualnie dokończenie `android-twa/`
  scaffoldu do realnego `bubblewrap init` **po** wyborze `packageId`
  przez Adama).
- **Do wersji gotowej do publikacji w Google Play:** powyższy blok +
  14 dni kalendarzowych oczekiwania na testerów (nie blok pracy) + 1
  blok na ewentualne poprawki po realnym review Google.
- **Do pełnego planu z monetyzacją:** nieokreślone z natury —
  zależne od rozmowy Adama z ChatGPT o modelu (Etap C) i od sygnału z
  Etapu B, żaden z tych kroków nie jest technicznym blokiem Claude'a.

## 10. Rekomendowany dokładny następny blok (niezaczęty, wymaga decyzji Adama)

**Rekomendacja: kontynuacja Etapu A (walidacja użytkowników) lub Etapu B
(oczekiwanie/follow-up na odpowiedź `sekretariat@michalowice.pl`) —
oba są zewnętrznymi strumieniami zależnymi od ludzi, nie bloków
technicznych.** Jeśli Adam chce kolejny blok techniczny zamiast
czekania na ludzi: dedykowany, wizualnie zaakceptowany przebieg
poprawy kontrastu `text-slate-400` (znalezisko #4 w części 2) w całej
aplikacji byłby następnym bezpiecznym, jednoznacznym krokiem technicznym
— ale wymaga jawnej zgody Adama na zmianę odcienia szarości w
dziesiątkach miejsc przed rozpoczęciem, zgodnie z zasadą braku
przebudowy wyglądu bez wyraźnej potrzeby. Nie rozpoczęto żadnego z
powyższych w tym bloku — obie opcje czekają na decyzję Adama.
