# Sprint 177C — candidate_url Production Validation Attempt

Status: **NO-GO. No Production write attempted. No Environment Variable changed. No redeploy performed.**

## 1. Cel testu

Na rzeczywistym, nowym kandydacie Production potwierdzić, że kod z commita `cd0ab37` ("fix(automation): persist direct candidate source urls", merged to `main` in Sprint 177B) zapisuje `source_notice_candidates.candidate_url` jako niepusty, bezwzględny, bezpośredni publiczny permalink oficjalnego artykułu — nie endpoint `/wp-json/`, nie stronę listy aktualności.

## 2. Commit Production

`cd0ab37` — potwierdzony jako aktualny `main` = `origin/main`, aktywny Production deployment (Ready, Sprint 177B).

## 3. Analizowane źródła

Dokładne source ID odczytane z `src/lib/officialSourceChecklist.ts`, nie z pamięci:

- `pruszkow-aktualnosci` — Miasto Pruszków — aktualności, `apiUrl: https://www.pruszkow.pl/wp-json/wp/v2/posts?categories=371&per_page=6`
- `wodociagi-michalowice` — Wodociągi Michałowice — awarie i przerwy, `apiUrl: https://wodociagimichalowice.pl/wp-json/wp/v2/posts?categories=1&per_page=6`

## 4. Wynik lokalnej symulacji

Lokalny, tymczasowy, niezapisujący skrypt Node.js (`$env:TEMP\alertownik_sim177c.mjs`, usunięty natychmiast po użyciu) odtworzył dokładną, aktualną logikę produkcyjną (`extractWordpressRestCandidates` + `safePostPermalink` + `MIN_PROPOSAL_TEXT_LENGTH` filtr) przeciwko obu prawdziwym, publicznym WordPress REST API — bez żadnego requestu do endpointów `/api/cron/*` tej aplikacji.

### Miasto Pruszków — aktualności (`pruszkow-aktualnosci`)

Pobrano 6 postów, 3 przeszły filtr słów kluczowych i minimalną długość:

| # | Tytuł | Data | Dopasowane słowo | Bezpieczny URL |
|---|---|---|---|---|
| 0 | Czasowa organizacja ruchu na ul. Działkowej od 31 lipca 2026 r. | 2026-07-27 | zamknięty | `https://www.pruszkow.pl/mieszkancy/czasowa-organizacja-ruchu-na-ul-dzialkowej-od-31-lipca-2026-r/` |
| 1 | Zmiana organizacji ruchu na drodze wojewódzkiej nr 719 | 2026-07-23 | Zmiana organizacji ruchu | `https://www.pruszkow.pl/mieszkancy/aktualnosci-mieszkaniec/zmiana-organizacji-ruchu-na-drodze-wojewodzkiej-nr-719/` |
| 2 | Utrudnienia w ruchu w dniach 23-29 lipca 2026 r. na ul. Bryły w Pruszkowie | 2026-07-22 | Utrudnienia | `https://www.pruszkow.pl/mieszkancy/utrudnienia-w-ruchu-w-dniach-23-29-lipca-2026-r-na-ul-bryly-w-pruszkowie-budowa-zatok-postojowych/` |

### Wodociągi Michałowice (`wodociagi-michalowice`)

Pobrano 6 postów, wszystkie 6 przeszły filtr (jednotematyczne źródło):

| # | Tytuł | Data zdarzenia | Bezpieczny URL |
|---|---|---|---|
| 0 | Przerwa w dostawie wody (Wilczkowice, ul. Zielona Dolina) | 2026-07-23 | `.../2026/07/21/przerwa-w-dostawie-wody-196/` |
| 1 | Przerwa w dostawie wody (Zagórzyce Dworskie, ul. Jabłoniowa) | 2026-07-23 | `.../2026/07/21/przerwa-w-dostawie-wody-195/` |
| 2 | (bez tytułu) Wilczkowice, ul. Krakowska | 2026-07-15 | `.../2026/07/13/5797/` |
| 3 | Przerwa w dostawie wody (Wilczkowice) | 2026-07-09 | `.../2026/07/07/przerwa-w-dostawie-wody-194/` |
| 4 | Przerwa w dostawie wody (Michałowice) | 2026-07-06 | `.../2026/07/03/przerwa-w-dostawie-wody-193/` |
| 5 | Przerwa w dostawie wody (Pielgrzymowice) | 2026-06-30 | `.../2026/06/26/przerwa-w-dostawie-wody-192/` |

Wszystkie zwrócone bezpieczne URL-e przeszły `safePostPermalink()` — bezwzględne https, żaden nie wskazuje `/wp-json/`.

## 5. Warunki GO/NO-GO

### Pruszków

Kandydatów w `source_notice_candidates` dla `pruszkow-aktualnosci`: dokładnie 1, już istniejący ("ul. Działkowej", `status=converted_to_draft`, powiązany alert już opublikowany).

Deterministyczna symulacja przebiegu `writeCandidatesForSource` (cap=1, przetwarzanie w kolejności zwróconej przez API):

1. Proposal 0 (Działkowa) — tekst niemal identyczny z już istniejącym kandydatem w bazie → klasyfikowany jako `duplicate` przez wewnętrzny dedup (porównanie w obrębie `source_key=pruszkow-aktualnosci`), pominięty, **nie liczy się do cap**.
2. Proposal 1 (DW nr 719 na drodze wojewódzkiej, Nowa Wieś, gmina Michałowice) — porównywany wyłącznie z istniejącym tekstem Działkowej (jedyny wpis w puli porównawczej tego `source_key`) → algorytmiczne podobieństwo niskie → klasyfikowany jako `new` → **zostałby wstawiony jako candidatesInserted=1**, wyczerpując cap.
3. Proposal 2 (ul. Bryły) — cap już wyczerpany → `cappedSkipped`, nigdy nie zostałby wstawiony.

Cross-check z tabelą `alerts` (poza zasięgiem automatycznej deduplikacji, wykonany ręcznie w tym sprincie): istnieje opublikowany alert `Utrudnienia w ruchu drogowym – DW nr 719, Nowa Wieś` (Gmina Michałowice, `źródło: michalowice.pl`) — *"Od 9 lipca 2026 r. na odcinku DW nr 719 w Nowej Wsi obowiązuje czasowa organizacja ruchu w związku z pracami prowadzonymi przez STRABAG... Przewidywane zakończenie prac: sierpień 2026 r."* Proposal 1 opisuje **tę samą drogę (DW 719), tę samą lokalizację (Nowa Wieś, gmina Michałowice)**, w nakładającym się okresie (nowy start 29 lipca, istniejący alert trwa do sierpnia) — realny duplikat tego samego, kontynuowanego zdarzenia drogowego, opisany przez drugie źródło (Pruszków) w sposób tekstowo odmienny od oryginalnego zgłoszenia Michałowic, więc niewykrywalny przez istniejący fuzzy-dedup ograniczony do jednego `source_key` (znane ograniczenie architektury, udokumentowane już w Sprincie 175D — obliczone tam podobieństwo tekstowe dla analogicznego przypadku wyniosło ~0.25, poniżej nawet progu "ambiguous").

**Wniosek: kandydat, który faktycznie zostałby wstawiony (proposal 1), jest duplikatem istniejącego opublikowanego alertu — warunek GO #4 nie jest spełniony.** Nie istnieje sposób na "wybranie" bezpiecznego proposal 2 (ul. Bryły) bez zmiany kodu (poza zakresem tego sprintu) — endpoint przetwarza wszystkie proposale danego źródła deterministycznie w kolejności zwróconej przez API.

### Wodociągi Michałowice

Zero istniejących kandydatów w bazie dla `wodociagi-michalowice` — brak ryzyka duplikatu względem historii kandydatów. Jednak wszystkie 6 proposali opisuje zdarzenia **już zakończone** względem daty bieżącej (2026-07-27): najnowsze zdarzenie miało miejsce 2026-07-23, czyli 4 dni wcześniej, wszystkie to jednodniowe, kilkugodzinne przerwy w dostawie wody, dawno zamknięte.

**Wniosek: żaden proposal nie spełnia warunku GO #1 ("istnieje co najmniej jeden aktualny albo nadchodzący komunikat operacyjny").**

## 6. Decyzja

**NO-GO dla obu przeanalizowanych źródeł.** Żadna flaga Environment Variable nie została zmieniona, żaden redeploy nie został wykonany, writer nie został aktywowany, żaden request `write-candidates` nie został wysłany, żaden nowy kandydat nie powstał.

## 7. Stan Production (niezmieniony przez ten sprint)

Potwierdzony przed i po analizie (read-only):

- `checksEnabled=true`, `writesEnabled=false`, `writeAttemptsPossible=false`, `openRun=null`
- `operationalNotificationRuntimeEnabled=false`, `emailAlertConfig.enabled=false`
- `canarySources` = domyślna allowlista (`michalowice-komunikaty`), brak czasowej Production allowlisty
- Liczniki: `alert_sources=4, source_checks=2, source_notice_candidates=5, alerts=8, alerts_published=5, scheduled_writer_runs=3, operational_notification_events=1, automation_identities=2, open_runs=0` — identyczne z baseline sprzed sprintu, zero delt.

## 8. Problemy i ograniczenia

- Potwierdzony ponownie, konkretnym nowym przykładem, znany architektoniczny gap: `findExistingCandidateTexts()` porównuje kandydatów wyłącznie w obrębie tego samego `source_key`, nigdy z tabelą `alerts` ani między różnymi źródłami opisującymi to samo realne zdarzenie. Ten sprint dostarcza drugi, niezależny, żywy przykład tego zjawiska (Pruszków-vs-Michałowice, DW 719) — pierwszy był w Sprincie 175D.
- Kolejność przetwarzania proposali (kolejność zwrócona przez zewnętrzne API, zwykle data malejąco) w połączeniu z cap=1 oznacza, że "najnowszy, ale ryzykowny" proposal może zasłonić "starszy, ale bezpieczny" — system nie ma mechanizmu priorytetyzacji po ryzyku, tylko po kolejności/dacie.
- Wodociągi Michałowice publikuje wyłącznie krótkotrwałe, szybko dezaktualizujące się ogłoszenia (jednodniowe okna czasowe) — źródło typu "web-scraped feed sprawdzany raz dziennie" ma strukturalnie wysoką szansę zastać wyłącznie już-nieaktualne wpisy, jeśli sprawdzenie nie nastąpi tego samego dnia.
- `candidate_url` sama poprawka (Sprint 177A/177B) pozostaje **niepotwierdzona na żywych danych Production** — ten test miał to potwierdzić, ale warunki bezpieczeństwa (GO/NO-GO) słusznie zablokowały wykonanie. Lokalna symulacja z realnym, publicznym API pokazuje, że `safePostPermalink()` poprawnie zwraca bezpośrednie permalinki dla obu źródeł (żaden `/wp-json/`, wszystkie bezwzględne https) — to pośrednie, ale nie ostateczne potwierdzenie działania na żywych danych.

## 9. Rekomendowany kolejny krok

Nie ponawiać próby na tych samych dwóch źródłach bez zmiany warunków. Dwie realne opcje:
1. Poczekać na naturalnie nowy, jednoznacznie bezpieczny komunikat z jednego z tych źródeł (np. nowy temat niezwiązany z DW 719, albo Wodociągi sprawdzone tego samego dnia co nowa awaria).
2. Rozważyć osobny, jawnie zatwierdzony sprint dodający source_key-do-source_key porównanie z tabelą `alerts` (nie tylko z innymi kandydatami) — usunęłoby to klasę ryzyka odkrytą dwukrotnie teraz (175D i 177C), kosztem większej zmiany kodu niż ta z Sprintu 177A/B.
