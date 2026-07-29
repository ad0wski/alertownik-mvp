# Sprint 187A — Końcowy audyt i formalne zamknięcie bloku Dni 1–20

Status: **blok Dni 1–20 formalnie zamknięty. Cały projekt NIE jest jeszcze zakończony.**

Data: 2026-08-03 (Dzień 20).

---

## 1. Executive summary

Alertownik to lokalny, niezależny pilotaż serwisu alertów cywilnych dla Komorowa, Pruszkowa i okolic (Gmina Michałowice, Miasto Pruszków, Powiat Pruszkowski). W ciągu 20 dni pracy udokumentowanych w tym repozytorium projekt przeszedł od stabilnego, technicznie dojrzałego MVP do stanu, w którym:

- **strona techniczna jest bardzo solidna** — pełny zestaw testów (1452 e2e + 25 PWA) przechodzi, Production działa bez błędów, PWA jest realnie zainstalowane i przetestowane na fizycznym iPhone;
- **automatyzacja źródeł jest zbudowana, ale świadomie ograniczona** — mechanizm zaufanego auto-publish istnieje, jest zabezpieczony RLS i fail-closed, ale pozostaje wyłączony po jednym canary, który ujawnił błąd (naprawiony), i po dwóch kolejnych, niezależnych próbach re-canary, które zakończyły się NO-GO na podstawie realnej treści źródła, nie narzędzi;
- **rzeczywista walidacja przez ludzi pozostaje głównym, niezamkniętym blockerem** — rekrutacja testerów Local Beta utknęła (zaproszeni nie odpowiedzieli), a przygotowany outreach do partnerów (Gate 3) nie został jeszcze wysłany;
- **gotowość do procesu sklepowego jest w pełni przygotowana planistycznie i technicznie**, ale nie rozpoczęto żadnego konta, opłaty ani zgłoszenia — i, co istotne, wymóg Google Play (12 testerów × 14 dni) jest de facto tym samym zadaniem co domknięcie Local Beta.

Żadna automatyzacja zapisująca dane nie została uruchomiona w tym bloku bez wyraźnej, kontrolowanej decyzji; każdy canary zakończył się albo świadomym rollbackiem, albo NO-GO udokumentowanym przed jakąkolwiek zmianą Production.

## 2. Co zbudowano w całym bloku Dni 1–20

- Naprawy i utwardzenie deduplikacji i mechanizmu candidate_url (Sprint 181A i wcześniejsze).
- Pełny audyt instalacji PWA + rzeczywisty test na fizycznym iPhone (Sprint 181B).
- Plan i uczciwe zamknięcie rekrutacji Local Beta z pierwszym realnym feedbackiem użytkownika (Sprinty 182A, Dzień 14).
- Uproszczenie górnej części strony `/alerty` na podstawie realnej opinii użytkownika.
- Nowe oficjalne źródło **Powiat Pruszkowski — Wiadomości** (kategoria drogi): pełny audyt na żywo, decyzja GO, dwuetapowe pobieranie treści z fail-closed hydration, poprawka po znalezieniu realnej luki (brak wyzwalania hydration dla długich tytułów bez daty) — Sprinty 183A, 183B, 184A.
- Dwie niezależne, w pełni udokumentowane próby re-canary tego źródła — obie NO-GO na podstawie realnej treści (lokalizacja poza pilotażem; przeterminowane/duplikujące daty), zero zmian Production.
- Rozbudowa `/partnerzy` o realne zrzuty ekranu, opis sourcingu/deduplikacji, scenariusz w krokach, nazwane grupy odbiorców.
- Nowa, publiczna, niewymagająca logowania strona `/demo` — samodzielnie wysyłalny link 2–3 minutowego demo.
- Pełny audyt Store Readiness: potwierdzenie zero błędów PWA, odkrycie istniejących, gotowych assetów sklepowych z Sprintu 128, zweryfikowane (2026-08-02) aktualne wymagania Google Play/Apple, udokumentowana decyzja kolejności opakowania.
- Ten dokument — pierwszy pełny, całościowy audyt spójności dokumentacji kanonicznej od Sprintu 127.

## 3. Stan architektury

Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind v4 + Supabase + Vercel — bez zmian architektonicznych w tym bloku. Wzorce `rowToX()`, RLS, podział public/admin — niezmienione i nadal spójne. Brak nowych zależności npm.

## 4. Stan Production

- Aktualny commit Production: **`b29ca9a`** (Sprint 186A) w momencie preflightu tego audytu — zgodny z `main`/`origin/main`.
- `/`, `/alerty`, `/instalacja`, `/partnerzy`, `/demo`, `/admin`, `/admin/sources` → **200**.
- `/api/cron/write-candidates`, `/api/cron/auto-publish-trusted-source` → **503** (fail-closed, bez sekretu skonfigurowanego dla wywołania z zewnątrz — potwierdzone na żywo, nie tylko z raportu).

## 5. Stan PWA i urządzeń mobilnych

Zero defektów funkcjonalnych znalezionych w Sprincie 186A — manifest, service worker, ikony (wymiary zweryfikowane bezpośrednio z bajtów plików, nie tylko deklaracji), 3 realne screenshoty, `/instalacja` — wszystko zgodne i przetestowane. Realny test na fizycznym iPhone (Sprint 181B) potwierdził instalację, standalone launch, brak scrolla, safe-area, offline fallback. Odkryto i skatalogowano istniejące, nieużywane assety sklepowe (`assets/store/play-icon-512.png`, `feature-graphic-1024x500.png`, oba z Sprintu 128).

## 6. Stan źródeł

**10 źródeł** w checklist (`officialSourceChecklist.ts`) — liczba realnie wzrosła z 9 do 10 w Sprincie 183A; ten dokument koryguje wcześniej powielany błąd „5/9" w dziennych raportach na poprawne **5/10 (50%)**.

| Źródło | Kategoria | Automatyczny check |
|---|---|---|
| WKD — aktualności | Transport | ✅ |
| Gmina Michałowice — komunikaty | Komunikaty | ✅ |
| Miasto Pruszków — aktualności | Komunikaty | ✅ |
| Wodociągi Michałowice — awarie i przerwy | Woda | ✅ |
| Powiat Pruszkowski — Wiadomości | Drogi | ✅ |
| PGE Dystrybucja — planowane wyłączenia | Prąd | ❌ (interfejs wymaga ręcznego wyboru rejonu) |
| PGE Dystrybucja — aktualne przerwy | Prąd | ❌ (dane znikają po usunięciu, brak stabilnego API) |
| Gmina Michałowice — wyłączenia prądu | Prąd | ❌ (statyczna strona zbiorcza) |
| Gmina Michałowice — harmonogram odpadów | Odpady | ❌ (PDF skanowany) |
| Remonty i utrudnienia drogowe — gmina + Pruszków | Drogi | ❌ (rozproszone, brak jednej strony) |

Żadne z 5 źródeł bez automatycznego checku nie jest przedstawiane jako gotowe do automatyzacji — każde ma udokumentowany, strukturalny powód (nie brak czasu).

## 7. Stan automatyzacji

- **Scheduled writer** (`write-candidates`): zbudowany, testowany, `SCHEDULED_WRITES_ENABLED=false`.
- **Trusted Source Auto-Publish**: zbudowany, RLS-backed, 9 jednoczesnych warunków fail-closed, `SCHEDULED_AUTO_PUBLISH_ENABLED` nieustawione (wyłączone). Allowlista domyślna: wyłącznie `pruszkow-aktualnosci`.
- **Deduplikacja**: tekstowa + URL, cap przed/po dedup zachowany, testy regresyjne dla realnych przypadków (DW 719, boilerplate).
- **Kill switch**: niezależny od uwierzytelniania, potwierdzony fail-closed na żywo (503) dla obu endpointów.
- **Monitoring**: `/admin/sources` pokazuje stan zdrowia źródeł, liczbę kandydatów, ostatnie sprawdzenia — bez trwałego zapisu błędów pobierania (świadomy, udokumentowany gap schematu).

## 8. Stan bezpieczeństwa i RLS

Brak zmian RLS w tym bloku poza wcześniej zatwierdzoną migracją Sprintu 172 (source_checks.result obsługuje 'failed'). Żaden klucz service_role nie pojawia się w kodzie frontendowym (zweryfikowane wielokrotnie w poprzednich sprintach, bez regresji). Brak prywatnych danych Adama w żadnym publicznym pliku (manifest, `/demo`, `/partnerzy`, `/instalacja`, `offline.html`) — zweryfikowane grepem w Sprincie 185A/186A.

## 9. Stan Local Beta

- Strona techniczna: **100%** — potwierdzone realnym testem na iPhone.
- Walidacja użytkowników: **1 pełny, zakończony test** (mama Adama) wobec wymaganych 3–5. Zaproszeni testerzy nie odpowiedzieli — status uczciwie oznaczony jako „odłożone, nie porzucone".
- Jedyna realna poprawka z tego feedbacku (uproszczenie górnej części `/alerty`) — wdrożona i przetestowana.

## 10. Stan Partner Demo

- Realne zrzuty ekranu, opis sourcingu/dedup, scenariusz w krokach na `/partnerzy` — gotowe.
- Publiczna, samodzielna strona `/demo` — gotowa, wdrożona, przetestowana wizualnie w przeglądarce.
- Gotowa wiadomość outreachowa (6–8 zdań), scenariusz 5-minutowego demo, lista pytań do partnera — przygotowane w `docs/SPRINT_185A_PARTNER_DEMO_V1.md`, **nic nie wysłano**.
- Zero realnych sygnałów od partnera/instytucji (naturalna konsekwencja niewysłanego outreachu).

## 11. Stan Store Readiness

Pełny audyt PWA (zero błędów), odkryte i skatalogowane istniejące assety sklepowe, zweryfikowana (2026-08-02) aktualna polityka Google Play (12 testerów/14 dni ciągle dla nowych kont osobistych) i Apple (wytyczna 4.2), udokumentowana rekomendacja kolejności: PWA teraz → Android TWA po zamknięciu Local Beta → iOS na końcu. Gotowe robocze teksty listingowe. Zero kont, opłat, zgłoszeń.

## 12. Wszystkie aktualne liczniki i flagi (zweryfikowane na żywo, 2026-08-03)

| Wartość | Stan |
|---|---|
| Alerty łącznie | 8 |
| Alerty opublikowane | 5 |
| Kandydaci łącznie | 8 |
| Kandydaci pending | 6 |
| Źródła w rejestrze (`alert_sources`) | 4 |
| Sprawdzenia źródeł (`source_checks`) | 2 |
| `SCHEDULED_WRITES_ENABLED` | false (503 na żywo) |
| `SCHEDULED_AUTO_PUBLISH_ENABLED` | false (503 na żywo) |
| Otwarty run | brak |

## 13. Kanoniczna tabela procentów

**Metodologia:** każdy wymiar informacyjny liczony jest niezależnie z jawnym wzorem. „Cały projekt" to prosta średnia z pięciu głównych Bram (nie z wymiarów informacyjnych). Pokrycie źródeł to osobny wymiar operacyjny, nigdy nie wliczany bezpośrednio do średniej pięciu Bram.

### Wymiary informacyjne

| Wymiar | Wzór | Wynik |
|---|---|---|
| Techniczny pilot webowy | jakościowa ocena stanu technicznego (testy, Production, PWA) | **95%** |
| Local Beta technicznie | zrealizowane kryteria techniczne Gate 2 (instalacja, mobile, dane) | **100%** |
| Walidacja prawdziwych użytkowników | zakończone testy / wymagane minimum = 1/3 (dolna granica) | **20%** |
| Pokrycie oficjalnych źródeł | źródła z automatycznym checkiem / wszystkie źródła = 5/10 | **50%** *(poprawione z błędnie powielanego „56%"/„5/9")* |

### Pięć głównych Bram

| Brama | Wzór | Wynik |
|---|---|---|
| 1. Utility MVP | jakościowa ocena (real alerty + dane + sourcing + sygnał) | **95%** |
| 2. Local Beta | (Local Beta technicznie + Walidacja użytkowników) / 2 = (100+20)/2 | **60%** |
| 3. Partner Demo | średnia ważona 4 kryteriów (screenshoty 100%, strona demo 100%, świeże przykłady ~50%, sygnały partnerskie ~10%) | **60%** |
| 4. Monetization Test | zero kryteriów rozpoczętych | **0%** |
| 5. Store Launch | 20% (gotowość techniczna, zrobione) + 15% (planowanie/decyzja, zrobione) + 30% (konta/opłaty, niezrobione) + 35% (zgłoszenie/launch, niezrobione) = 20+15+0+0 | **35%** |

### Cały projekt

```
(Brama 1 + Brama 2 + Brama 3 + Brama 4 + Brama 5) / 5
= (95 + 60 + 60 + 0 + 35) / 5
= 250 / 5
= 50%
```

**Ważne wyjaśnienie zmiany:** poprzednie dzienne raporty (Dni 15–19) błędnie podawały pokrycie źródeł jako „5/9 (56%)" — realnie źródeł jest 10 od Sprintu 183A, więc poprawna wartość to 5/10 (50%). Ta korekta **nie zmienia** wartości żadnej z pięciu Bram ani całego projektu (50%) — pokrycie źródeł nigdy nie było bezpośrednim składnikiem tej średniej, tylko osobnym wymiarem operacyjnym opisowym.

## 14. Wszystkie prawdziwe blockery

1. **Rekrutacja testerów Local Beta** — zaproszeni nie odpowiedzieli; jedyny sposób na postęp to nowe, realne zaproszenia przez Adama.
2. **Niewysłany outreach Partner Demo** — materiały gotowe, decyzja o wysłaniu należy do Adama.
3. **Brak realnego, aktualnego kandydata do auto-publish** — dwie próby re-canary NO-GO na tym samym, niezmienionym źródle; potrzebny nowy komunikat lub nowe źródło.

## 15. Wszystkie zależności zewnętrzne

- Testerzy-mieszkańcy (Local Beta).
- Instytucja/partner do rozmowy (Gate 3).
- Konto Google Play Console (opłata jednorazowa) + 12 testerów/14 dni ciągłego opt-in.
- Konto Apple Developer Program (99 USD/rok), jeśli/gdy podjęta zostanie decyzja o iOS App Store.
- Dane wydawcy (nazwa, adres) do formularzy sklepowych — decyzja Adama.

## 16. Funkcje technicznie gotowe, ale wyłączone

- Trusted Source Auto-Publish (`SCHEDULED_AUTO_PUBLISH_ENABLED=false`).
- Scheduled writer (`SCHEDULED_WRITES_ENABLED=false`).
- Assety sklepowe (`assets/store/*`) — gotowe, nigdy nieserwowane, wymagają wizualnej akceptacji Adama przed jakimkolwiek publicznym użyciem.
- Manifest `categories` — obecne, ale bez żadnego efektu do czasu realnego pakowania TWA.

## 17. Rzeczy rozpoczęte, ale niezakończone

- Rekrutacja testerów Local Beta (1 z 3–5 wymaganych odpowiedzi).
- Outreach Partner Demo (przygotowany, niewysłany).
- Ponowna próba auto-publish dla Powiatu Pruszkowskiego (mechanizm naprawiony, ale źródło wciąż nie dostarczyło kwalifikującego się komunikatu).

## 18. Rzeczy jeszcze nierozpoczęte

- Monetization Test (Gate 4) — całkowicie.
- Jakiekolwiek konto deweloperskie, opłata lub zgłoszenie sklepowe.
- Rozszerzenie na kolejne lokalizacje/kategorie poza obecnym pilotażem.

## 19. Rekomendowana kolejność następnego bloku

1. Domknięcie Local Beta (realna rekrutacja testerów) — wspólny fundament dla Gate 2 i przyszłego Android TWA.
2. Decyzja Adama o wysłaniu przygotowanego outreachu Partner Demo.
3. Dopiero po (1) — rozważenie rozpoczęcia procesu Android TWA (założenie konta przez Adama).
4. Monetization Test — niezależna decyzja, może biec równolegle do (1)–(3).

## 20. Decyzje do podjęcia przez Adama

- Czy i kiedy wysłać przygotowaną wiadomość outreachową (Gate 3)?
- Czy podjąć nową, bardziej aktywną próbę rekrutacji testerów (Gate 2), i jaką formę ma przyjąć?
- Czy i kiedy rozpocząć proces Android Google Play Console (konto, opłata)?
- Czy rozważyć iOS App Store, czy pozostać przy PWA na iPhone bezterminowo?
- Czy i kiedy rozpocząć Monetization Test (Gate 4)?
- Czy zaakceptować wizualnie assety w `assets/store/` do przyszłego użycia?

## 21. Jasne stwierdzenie

**Blok Dni 1–20 zakończony; cały projekt nie jest jeszcze zakończony.**
