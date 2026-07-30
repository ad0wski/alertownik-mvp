# National Source Scale Plan V1 — Alertownik

Status: architektura docelowa (Etap E/F), **fundament częściowo wdrożony w
tym sprincie (kod, bez migracji, bez aktywacji na Production)**.

Data: 2026-08-03 (Sprint 188A).

---

## 1. Cel

Dziś Alertownik obsługuje 1 powiat (Gmina Michałowice, Miasto Pruszków,
Powiat Pruszkowski), 10 źródeł, z których każde ma osobny, ręcznie napisany
parser. Ten dokument projektuje system zdolny obsłużyć dowolną liczbę
województw / powiatów / gmin / miast / mniejszych miejscowości i wiele źródeł
na lokalizację, **bez pisania nowego pliku kodu na każde pojedyncze źródło**.

Nie jest to projekt "od zera" — opiera się wprost na tym, co już istnieje i
działa (dedup, fail-closed gates, WordPress REST fetch, kategoryzacja
słowami kluczowymi).

---

## 2. Audyt obecnego kodu (Część C briefu)

### 2.1 Co już generalizuje się bez zmian

- **Dedup** (`classifyProposalAgainstExisting` w `scheduledWriter.ts`,
  URL-match + tekstowy) — nie odwołuje się do żadnej konkretnej lokalizacji
  ani źródła, działa na dowolnym tekście/URL.
- **Kategoryzacja słowami kluczowymi** (`detectCandidateCategory` w
  `candidateVerifier.ts`) — słowniki polskie (przerwa, awaria, remont…) są
  language-specific, nie location-specific; działają identycznie dla
  dowolnej gminy w Polsce.
- **Fail-closed gates** (`isWriteModeEnabled`/`getAllowedWriteSourceIds` w
  `scheduledWriter.ts`, `isAutoPublishEnabled`/`getAutoPublishSourceIds` w
  `trustedSourceAutoPublish.ts`) — wzorzec allowlist+flaga jest już
  generyczny; rozszerzenie na nowe źródła to dopisanie ID do allowlisty, nie
  nowa logika.
- **WordPress REST fetch + parse** (`parseWordpressRestPosts` /
  `parsePruszkowRestPosts`-style funkcje w `pageParser.ts`,
  `manualSourceCheckFetch.ts`) — mechanika pobierania i mapowania pól JSON
  jest generyczna; różni się tylko **filtr słów kluczowych per źródło**, co
  już dziś jest rozdzielone per-source (`REST_PARSERS_BY_SOURCE_ID`).
- **Boilerplate/cookie-banner filtr, cap propozycji, dedup tytułów**
  (`buildCheckProposals` w `sourceCheck.ts`) — czysto strukturalne, zero
  odwołań do lokalizacji.
- **`AlertCategory`** (6 wartości: transport/water/power/waste/roads/
  municipal) — ogólnopolskie z natury, nie wymagają zmian dla nowych gmin.

### 2.2 Co jest zakodowane na twardo pod Komorów/Michałowice/Pruszków

- **`PILOT_LOCALITIES`** (`officialSourceChecklist.ts`) — dokładnie 6 nazw
  miejscowości jako `as const` union. Używane w:
  - `trustedSourceAutoPublish.ts::extractPlace()` — dopasowanie miejsca w
    tekście działa WYŁĄCZNIE przez `text.includes(locality)` po tej stałej
    liście. Nowa gmina = zero dopasowań = auto-publish zawsze
    `place_not_detected`.
  - `src/components/PreferencesSection.tsx`, `src/lib/pilotCoverage.ts` —
    UI personalizacji "Moja okolica" zna tylko te 6 nazw.
  - `docs/LIMITATIONS.md` i testy (`sourceChecklist.spec.ts`, `public.spec.ts`)
    pinują tę samą listę.
- **`OFFICIAL_SOURCE_CHECKS`** (`officialSourceChecklist.ts`) — statyczna
  tablica dokładnie 10 obiektów, każdy ręcznie napisany, z polami
  `whatToCheck`/`riskNote` będącymi wolnym tekstem specyficznym dla danego
  urzędu. To jest **rejestr źródeł jako kod, nie jako dane** — dodanie
  źródła #11 wymaga edycji pliku TypeScript, nie wypełnienia formularza czy
  wiersza w bazie.
- **Per-CMS parsery pisane ręcznie** — `extractNewsListItems` (markup
  Michałowice), `extractBlogPostItems` (Joomla WKD),
  `powiatPruszkowskiParser.ts`/`powiatPruszkowskiFetch.ts` (Liferay gov.pl,
  dwuetapowy fetch). Każdy nowy typ CMS = nowa funkcja w `pageParser.ts` lub
  nowy moduł, nie konfiguracja.
- **`Alert.place: string`** (`types/alert.ts`) — wolny tekst, nie
  ustrukturyzowana hierarchia województwo/powiat/gmina/miejscowość. Działa
  dla 6 znanych nazw wyświetlanych wprost; nie da się z niego policzyc
  "ile aktywnych źródeł ma województwo X" bez parsowania tekstu.

### 2.3 Co jest config-driven już dziś vs. wymaga nowego kodu

| Zmiana | Dziś |
|---|---|
| Nowe źródło z **istniejącym** typem adaptera (WordPress REST, ten sam CMS co Michałowice/WKD) | Nowy wpis w `OFFICIAL_SOURCE_CHECKS` + dopisanie ID do `SAFE_CHECK_SOURCE_IDS` — config, zero nowego kodu parsera |
| Nowe źródło z **nowym** typem CMS/markup | Nowa funkcja parsera w `pageParser.ts` lub nowy moduł (jak `powiatPruszkowskiParser.ts`) — **kod, nie config** |
| Nowa miejscowość w obrębie już obsługiwanej gminy | Dopisanie do `PILOT_LOCALITIES` — ale to zmienia zachowanie `extractPlace`/personalizacji **globalnie**, bo lista jest płaska, nie hierarchiczna per-źródło |
| Nowe źródło RSS/Atom | **Nie działa wcale** — `feedParser.ts` to placeholder (`getFeedParserPlaceholder`), tylko wykrywa link, nigdy nie pobiera/parsuje treści |
| Nowe źródło PDF | **Nie działa wcale** — `pdfParser.ts` to placeholder (`getPdfManualInstructions`), zawsze instrukcja ręczna |
| Nowe źródło "zwykła strona HTML" bez rozpoznanego markupu CMS | Spada do generycznego `extractBlocks`/`buildCandidates` (h1-h3/p heurystyka) — działa, ale słabiej niż dedykowany parser, bez gwarancji jakości |

### 2.4 Obsługiwane typy źródeł — konkretnie

| Typ | Status | Dowód w kodzie |
|---|---|---|
| WordPress REST API | ✅ Działa | `parseWordpressRestPosts`, `parsePruszkowRestPosts`, `REST_PARSERS_BY_SOURCE_ID` |
| HTML — generyczny (h1-h3/p) | ✅ Działa (słabiej) | `extractBlocks`/`buildCandidates` w `pageParser.ts` |
| HTML — dedykowany per-CMS (news-item div, Joomla blogPost, Liferay gov.pl) | ✅ Działa, ale 1 parser = 1 CMS wzorzec | `extractNewsListItems`, `extractBlogPostItems`, `powiatPruszkowskiParser.ts` |
| RSS/Atom | ❌ Tylko wykrycie linku, treść nieparsowana | `feedParser.ts` (placeholder od Sprintu 76) |
| PDF | ❌ Tylko instrukcja ręczna | `pdfParser.ts` (placeholder od Sprintu 76) |
| Publiczne API inne niż WordPress | ❌ Nieobsługiwane, brak przykładu w kodzie | — |

### 2.5 Luki schematu wymagające przyszłej migracji (nie projektowane teraz)

- `alerts.place` / kandydat `place` — wolny tekst, nie FK do tabeli
  administracyjnej (województwo/powiat/gmina/miejscowość). Bez tego panel
  pokrycia Polski wymaga heurystyk tekstowych zamiast prostego JOIN-a.
- `alert_sources` nie ma pól `lifecycle_status`, `adapter_type`,
  `adapter_config` (JSON), `readiness_score` — dziś rejestr źródeł istnieje
  tylko częściowo w kodzie (`officialSourceChecklist.ts`) i częściowo w
  tabeli `alert_sources` (nazwa/URL/kategoria/is_active), bez rozróżnienia
  etapu lifecycle.
- `source_checks.error_code`/`error_summary` (Sprint 172, proposed) —
  potwierdzone wcześniej jako wykonane; nie blokuje tego planu, ale
  monitoring degradacji źródła (Etap E) będzie chciał z tego korzystać.
- Brak tabeli "discovery candidates" (kandydatów na nowe źródła, zanim
  zostaną sklasyfikowane/przetestowane) — dziś nie istnieje żaden odpowiednik
  wcześniejszych etapów lifecycle (`discovered`/`classified`).

### 2.6 Ryzyko pojedynczego punktu awarii

Obecny kod jest **już** zaprojektowany fail-closed per źródło (każdy parser
zwraca 0 kandydatów zamiast rzucać wyjątek przy nieznanym markupie —
udokumentowane wprost w `officialSourceChecklist.ts` riskNote dla Powiatu
Pruszkowskiego: "jeśli portal gov.pl zmieni szablon, check bezpiecznie
zwróci zero propozycji zamiast błędu"). To dobry fundament — ryzyko rośnie
nie z awarią pojedynczego źródła, ale z **brakiem widoczności**, że źródło
przestało cokolwiek zwracać (monitoring health per źródło jest dziś tylko
sesyjny w UI, nie trwały — patrz Sprint 171/172). Przy 10 źródłach człowiek
to zauważy; przy 200 źródłach cicha degradacja jednego adaptera zostanie
niezauważona bez trwałego monitoringu i alertowania per-adapter.

---

## 3. Docelowa architektura

### 3.1 Lifecycle źródła

```
discovered → classified → awaiting_review → testable → canary → active → degraded → disabled
```

| Stan | Znaczenie | Kto/co przesuwa |
|---|---|---|
| `discovered` | Znaleziony URL/kandydat na źródło (ręcznie lub przez przyszłe automatyczne discovery) — brak jeszcze wiedzy o typie | Adam lub przyszłe narzędzie discovery |
| `classified` | Rozpoznano typ adaptera (WordPress REST / RSS / HTML / PDF / API) i przypisano województwo/powiat/gminę | Klasyfikator (reguły, potem ew. AI-assisted) |
| `awaiting_review` | Czeka na przegląd człowieka przed jakimkolwiek testem na żywo | Adam |
| `testable` | Zatwierdzone do testów technicznych (fetch, parse) — wciąż zero zapisu do Production | Adam |
| `canary` | Przechodzi żywe testy z realnymi danymi, ale bez wpływu na publiczne alerty (mirror obecnego wzorca canary z Powiatu Pruszkowskiego) | Automatyczny test + przegląd Adama |
| `active` | Certyfikowane, uczestniczy w regularnych checkach, kandydaci trafiają do normalnej kolejki przeglądu | Adam (jawna aktywacja) |
| `degraded` | Aktywne źródło przestało zwracać sensowne dane (0 kandydatów przez N kolejnych checków, lub błędy fetch) — automatyczna, fail-closed degradacja | System (monitoring) |
| `disabled` | Ręcznie lub automatycznie wyłączone na stałe | Adam lub system po przedłużonej degradacji |

Przejścia **w dół** (`active → degraded`, `→ disabled`) mogą być
automatyczne i fail-closed. Przejścia **w górę** (`awaiting_review →
testable → canary → active`) wymagają jawnej decyzji człowieka — dokładnie
ten sam wzorzec co dziś: żadna automatyzacja nie publikuje bez przeglądu.

### 3.2 Interfejs adaptera źródła

Jeden wspólny kontrakt, wiele implementacji — zamiast jednej funkcji na
każde źródło. Konkretna propozycja typów w §4 (kod zaimplementowany w tym
sprincie).

```
SourceAdapter {
  type: "wordpress_rest" | "rss_atom" | "html_generic" | "html_custom" | "pdf" | "public_api"
  fetch(config) -> RawFetchResult (fail-closed: nigdy nie rzuca, zwraca ok:false z kodem diagnostycznym)
  parse(raw, config) -> PageParseResult (ten sam kształt co dziś — bez zmian downstream)
}
```

`html_custom` pozostaje ucieczką dla źródeł jak Powiat Pruszkowski, których
markup wymaga dedykowanej logiki (dwuetapowy fetch artykułu) — nie każde
źródło da się w pełni skonfigurować, ale **typ** adaptera jest deklaratywny,
więc rejestr źródeł wie, którego kodu użyć, bez ifów rozsianych po całej
bazie kodu.

### 3.3 Discovery, klasyfikacja, certyfikacja

- **Discovery** (poza zakresem tego sprintu, przyszła praca): może korzystać
  z automatyzacji/AI do znajdywania kandydatów na oficjalne źródła (np.
  przeszukiwanie stron `*.gov.pl`, BIP, stron gmin) — ale **wynik discovery
  zawsze ląduje w stanie `discovered`, nigdy wyżej**.
- **Klasyfikacja**: wykrycie typu adaptera (czy strona ma `/wp-json/`, czy
  ma `<link rel=alternate type=rss>`, czy to PDF) — deterministyczne testy
  HTTP, nie zgadywanie.
- **Certyfikacja przed `active`**: test dostępności (HTTP 200, brak
  bot-blockingu), test parsera na realnej próbce (≥1 sensowny kandydat lub
  jawnie udokumentowany powód zera), sprawdzenie wykrywania dat, sprawdzenie
  że dedup nie generuje masowych duplikatów. Mirror tego, co już ręcznie
  robiono dla Powiatu Pruszkowskiego (Sprint 183A) — teraz jako powtarzalna
  procedura, nie jednorazowy audyt.

### 3.4 Batch onboarding

Źródła dodawane **partiami wg wspólnego adaptera**, nie pojedynczo:

- Przykład fali: 10 gmin używających tego samego WordPress + tej samej
  struktury kategorii REST → jedna konfiguracja adaptera + 10 wierszy
  rejestru różniących się tylko URL/lokalizacją/kategorią.
- Przykład fali: grupa wodociągów miejskich (wzorzec identyczny do
  Wodociągów Michałowice) → jeden typ adaptera, wiele instancji.
- Batch = jeden przegląd certyfikacji dla wzorca adaptera + per-źródło tylko
  weryfikacja unikalnych danych (URL, lokalizacja, kategoria), nie
  pełny audyt kodu za każdym razem.

### 3.5 Panel pokrycia Polski (coverage)

Read-only kalkulator (zaimplementowany w tym sprincie, patrz §4.4): dla
danego zbioru źródeł i ich statusu lifecycle, oblicza:
- Liczbę unikalnych województw/powiatów/gmin z ≥1 źródłem `active`.
- Braki per kategoria (np. "żadne aktywne źródło kategorii `power` w
  województwie X").
- Rozkład źródeł po statusie lifecycle.

To czysta funkcja nad danymi w pamięci — nie wymaga migracji, żeby istnieć i
być przetestowana; realne zasilenie danymi z Supabase to Etap F (po
migracji geograficznej).

### 3.6 Fail-closed przez cały łańcuch

Zasada niezmieniona względem obecnego kodu, rozszerzona na każdy nowy
adapter:
- Fetch nigdy nie rzuca nieobsłużonego wyjątku — zawsze zwraca strukturę z
  kodem diagnostycznym.
- Parser nieznanego/zmienionego markupu zwraca 0 kandydatów, nigdy błąd
  blokujący cały run.
- Automatyczna degradacja (`active → degraded`) nie usuwa źródła ani nie
  publikuje niczego — tylko oznacza do przeglądu człowieka.
- Aktywacja źródła (`→ active`) i jakakolwiek automatyczna publikacja
  pozostają jawnymi decyzjami człowieka/configu, nigdy domyślnym skutkiem
  ubocznym discovery czy klasyfikacji.

---

## 4. Co zaimplementowano w tym sprincie (bez migracji, bez aktywacji)

Patrz katalog `src/lib/sourceScale/` (nowy w Sprincie 188A):

- `sourceLifecycle.ts` — typ `SourceLifecycleStatus` (8 wartości z §3.1) +
  `ALLOWED_LIFECYCLE_TRANSITIONS` (mapa dozwolonych przejść) +
  `isValidLifecycleTransition()`.
- `sourceAdapterTypes.ts` — typ `SourceAdapterType` (6 wartości z §3.2) +
  `SourceAdapterConfig` discriminated union (jedna wariant na typ adaptera,
  polami dopasowanymi do tego, co już realnie istnieje w
  `officialSourceChecklist.ts`/`manualSourceCheckFetch.ts`) + typ
  `RawFetchResult`/`SourceAdapter` interfejsu.
- `sourceConfigValidation.ts` — czyste funkcje walidujące
  `SourceAdapterConfig` (poprawny URL, zgodność typu z wymaganymi polami,
  brak `/wp-json/` tam gdzie wymagany jest bezpieczny permalink — reużywa
  tej samej reguły co `isDirectSafePermalink` w `trustedSourceAutoPublish.ts`).
- `sourceReadinessScore.ts` — deterministyczny scoring gotowości źródła
  (0–100) na podstawie: czy fetch działa, czy parser zwraca ≥1 sensowny
  kandydat, czy dedup nie generuje masowych duplikatów, czy daty są
  wykrywane — czysta funkcja nad już-zebranymi wynikami testów, nie wykonuje
  sama żadnego fetchu.
- `coverageCalculator.ts` — read-only funkcja z §3.5, przyjmuje tablicę
  źródeł z polami geograficznymi (przygotowana pod przyszłą migrację, ale
  działa też na dzisiejszych danych z `place: string` przez opcjonalny
  parametr) i zwraca strukturę pokrycia.
- `batchOnboardingConfig.ts` — typ `SourceBatch` (grupa źródeł dzieląca
  jeden `SourceAdapterConfig`-owy szablon + listę instancji różniących się
  tylko URL/lokalizacją) + walidator spójności batcha.
- Testy jednostkowe dla każdego z powyższych w `tests/e2e/sourceScale*.spec.ts`
  (fixture-based, zero zależności od żywych stron — ten sam wzorzec co
  istniejące testy parserów).

Nic z powyższego nie jest podłączone do żadnej strony admina ani do
żadnego crona w tym sprincie — to fundament typów/walidatorów/kalkulatorów,
gotowy do wykorzystania w Etapie F, kiedy nastąpi realne rozszerzenie.

### 4.1 Migracje przygotowane, NIE wykonane

- `docs/sql/PROPOSED_SPRINT_188A_SOURCE_GEOGRAPHY_V1.sql` — dodaje
  `wojewodztwo`, `powiat`, `gmina`, `miejscowosc` (nullable, TEXT) do
  `alert_sources` i `alerts`, plus `lifecycle_status` do `alert_sources`.
  Wyłącznie addytywne (nowe nullable kolumny) — nic nie usuwa, nic nie
  zmienia w istniejących wierszach.
- `docs/sql/VERIFY_SPRINT_188A_SOURCE_GEOGRAPHY_READ_ONLY_V1.sql` — read-only zapytania
  potwierdzające, że kolumny istnieją, są nullable, i że istniejące wiersze
  mają te pola `NULL` (zero utraty danych, zero domyślnych zgadywanych
  wartości).
- Testy anti-drift (`tests/e2e/sourceGeographyMigrationShape.spec.ts` —
  jeśli migracja zostanie wykonana, ten test pinuje oczekiwany kształt
  kolumn, żeby przypadkowa ręczna zmiana schematu nie przeszła niezauważona).

Adam nie jest proszony w tym sprincie o wykonanie tej migracji — plik
istnieje wyłącznie jako gotowy do przyszłego, osobno zatwierdzonego kroku.

---

## 5. Co świadomie NIE zostało zbudowane w tym sprincie

- Żaden nowy adapter RSS/Atom czy PDF (implementacja realnego parsera —
  nie tylko typu) — to nadal placeholder, zgodnie z decyzją ze Sprintu 76,
  niezmienioną tym dokumentem.
- Żaden mechanizm automatycznego discovery źródeł (wymagałby web-scrapingu
  poza obecnym zakresem, jawnie zakazanego bez zgody w CLAUDE.md).
- Żadna zmiana `PILOT_LOCALITIES`/`extractPlace` na hierarchiczną geografię —
  wymaga migracji z §4.1, która nie została wykonana.
- Żadna integracja `sourceScale/*` z `/admin/sources` UI — to celowo
  fundament, nie feature widoczny dla Adama w tym sprincie.
