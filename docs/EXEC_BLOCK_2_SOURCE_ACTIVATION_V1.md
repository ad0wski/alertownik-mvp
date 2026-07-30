# Blok Wykonawczy 2 — rozszerzenie i aktywacja check-only pierwszej fali (Etap E)

Status: **10 źródeł aktywowanych jako check-only na Production. Zero
zapisów, zero writera, zero auto-publish.**

Data: 2026-08-03 (Blok Wykonawczy 2).

---

## 1. Rozszerzenie fali: 7 → 10 zweryfikowanych źródeł

3 nowe źródła znalezione i **niezależnie podwójnie zweryfikowane** (fork
badawczy + osobny fetch głównego agenta) w tym bloku:

| Instytucja | Gmina/powiat | Endpoint REST | Najnowszy realny wpis | Data | Decyzja |
|---|---|---|---|---|---|
| PWiK w Ząbkach Sp. z o.o. | Ząbki, pow. wołomiński | `pwikzabki.pl/wp-json/wp/v2/posts` | „Wymiana wodomierzy od lipca do listopada" | 2026-07-20 | **GO** |
| Hydrosfera Józefów Sp. z o.o. | Józefów, pow. otwocki | `hydrosfera-jozefow.pl/wp-json/wp/v2/posts` | „ZAWIADOMIENIE !" (przerwa w dostawie wody, ul. Wawerska) | 2026-07-28 | **GO** |
| PWiK w Zielonce Sp. z o.o. | Zielonka, pow. wołomiński | `pwikzielonka.com.pl/wp-json/wp/v2/posts` | „Przerwa w dostawie wody... ul. Ossowska, Korczaka, Bartnika" | 2026-07-24 | **GO** |

**Odrzucony kandydat (NO-GO):** KPEC Karczew (Karczewskie Przedsiębiorstwo
Energetyki Cieplnej, `kpec.com.pl`) — realny, żywy `wp-json`, ale
próbkowany najnowszy wpis to komunikat przetargowy („Informacja z otwarcia
ofert"), nie komunikat operacyjny (awaria/przerwa) — kategoria
ciepłownicza wymaga głębszej weryfikacji próbki przed aktywacją, nie
odrzucona na stałe, tylko odłożona.

**Dlaczego nie 10–15, tylko 10:** poszukiwania objęły dodatkowo Piaseczno
(404), zdublowaną domenę wodociągów Józefowa (404, zastąpioną działającą
`hydrosfera-jozefow.pl`), oraz kilka miejscowości bez znalezionej
dedykowanej domeny spółki komunalnej (Kobyłka, Wiązowna) — rzeczywisty,
uczciwy limit tego, co dało się **zweryfikować żywym HTTP** w tym bloku, nie
sztuczne zaokrąglenie w dół.

## 2. Pełna lista pierwszej aktywnej fali (10 źródeł)

| # | id | Instytucja | Gmina | Status |
|---|---|---|---|---|
| 1 | `eko-raszyn` | EKO-RASZYN Sp. z o.o. | Raszyn | ✅ aktywowane |
| 2 | `bpwik-brwinow` | BPWiK Brwinów | Brwinów | ✅ aktywowane |
| 3 | `pkn-nadarzyn` | PK Nadarzyn | Nadarzyn | ✅ aktywowane |
| 4 | `zwik-ozarow-mazowiecki` | ZWiK Ożarów Mazowiecki | Ożarów Mazowiecki | ✅ aktywowane |
| 5 | `pwik-radzymin` | PWiK Radzymin | Radzymin | ✅ aktywowane |
| 6 | `pwk-legionowo` | PWK „Legionowo” | Legionowo | ✅ aktywowane |
| 7 | `opwik-otwock` | OPWiK Otwock | Otwock | ✅ aktywowane |
| 8 | `pwik-zabki` | PWiK Ząbki | Ząbki | ✅ aktywowane |
| 9 | `hydrosfera-jozefow` | Hydrosfera Józefów | Józefów | ✅ aktywowane |
| 10 | `pwik-zielonka` | PWiK Zielonka | Zielonka | ✅ aktywowane |

Wszystkie 10 dodane do `OFFICIAL_SOURCE_CHECKS`
(`src/lib/officialSourceChecklist.ts`) i `SAFE_CHECK_SOURCE_IDS`
(`src/lib/sourceCheck.ts`), w dwóch podpartiach po 5 (typecheck zielony po
każdej), zgodnie z briefem.

## 3. Wspólny adapter

**`wordpress_rest`** — identyczny mechanizm co `wodociagi-michalowice`
(Sprint 168): `fetchAndParseManualCheck` → `parseWordpressRestPosts`
(domyślny filtr, bo żadne z 10 nowych źródeł nie ma wpisu w
`REST_PARSERS_BY_SOURCE_ID`, więc korzysta z tego samego, sprawdzonego
domyślnego filtra słów kluczowych co Wodociągi Michałowice — zero nowego
kodu parsera).

## 4. Wynik rzeczywistego, kontrolowanego sprawdzenia (10/10)

Wykonane przez bezpośrednie wywołanie `fetchAndParseManualCheck` — dokładnie
tej samej funkcji, której używa `/api/sources/check` (funkcja nie wykonuje
żadnego zapisu do Supabase — potwierdzone czytaniem jej kodu, nie tylko
założeniem). Uruchomione raz, ręcznie, z jednorazowego pliku testowego
usuniętego zaraz po użyciu (nie wszedł do commitowanego zestawu testów —
zgodnie z konwencją tego repo: testy commitowane są fixture-based, zero
zależności od żywych stron).

| id | Fetch | Propozycje po filtrze | Przykładowy tytuł | Data wykryta |
|---|---|---|---|---|
| eko-raszyn | ✅ | 1 | „Kanalizacja to nie kosz!" | ✅ |
| bpwik-brwinow | ✅ | 4 | „UWAGA BRWINÓW!!! Przerwa w dostawie wody." | ✅ |
| pkn-nadarzyn | ✅ | 2 | „Przerwa w dostawie wody – Nadarzyn" | ✅ |
| zwik-ozarow-mazowiecki | ✅ | 4 | „Komunikat zamknięcia wody" | ✅ |
| pwik-radzymin | ✅ | 1 | „ZAWIADOMIENIE... 31.07.2026" | ✅ |
| pwk-legionowo | ✅ | 0 | (brak — najnowsze wpisy nie przeszły filtra operacyjności, zgodnie z riskNote) | — |
| opwik-otwock | ✅ | 4 | „Prace na sieci wodociągowej w ul. Pod Zegarem" | ✅ |
| pwik-zabki | ✅ | 1 | „5-go czerwca biuro nieczynne" | ❌ (brak daty w treści) |
| hydrosfera-jozefow | ✅ | 2 | „ZAWIADOMIENIE !" | ✅ |
| pwik-zielonka | ✅ | 5 | „Przerwa w dostawie wody... ul. Ossowska" | częściowo |

Zero 500, zero timeoutów, wszystkie URL-e prowadzą do oficjalnych domen
instytucji z tabeli §2. **Uwaga kosmetyczna (nie błąd bezpieczeństwa):**
`pageTitle` zwracany przez `parseWordpressRestPosts` to stały string
„Wodociągi Michałowice — Aktualności" niezależnie od źródła — istniejący,
nieszkodliwy szczegół generycznego REST-parsera (pole czysto opisowe, nie
wpływa na filtrowanie/kategoryzację/URL-e), pozostawiony bez zmian jako
poza zakresem tego bloku.

## 5. Potwierdzenie: wyłącznie check-only

- Żadne z 10 źródeł **nie zostało dodane** do
  `DEFAULT_ALLOWED_WRITE_SOURCE_IDS` (`scheduledWriter.ts`) — pozostaje
  `["michalowice-komunikaty"]`, bez zmian.
- Żadne z 10 źródeł **nie zostało dodane** do
  `DEFAULT_AUTO_PUBLISH_SOURCE_IDS` (`trustedSourceAutoPublish.ts`) —
  pozostaje `["pruszkow-aktualnosci"]`, bez zmian.
- Żadna zmienna środowiskowa Production nie została zmieniona —
  `SCHEDULED_WRITES_ENABLED`/`SCHEDULED_AUTO_PUBLISH_ENABLED` pozostają
  nieustawione, oba endpointy nadal zwracają 503 (zweryfikowane na żywo po
  merge, patrz raport końcowy).
- **Uczciwa techniczna uwaga** (nie luka, ustalony fakt istniejącego
  systemu): `getAllowedWriteSourceIds()`/`getAutoPublishSourceIds()` filtrują
  wartość zmiennej środowiskowej przez `SAFE_CHECK_SOURCE_IDS` — bycie na
  tej liście czyni źródło *strukturalnie kwalifikowalne* do przyszłej,
  osobno zatwierdzonej zmiany env var, identycznie jak każde istniejące
  źródło check-only od Sprintu 134. To nie nowe ryzyko wprowadzone tym
  blokiem — to już istniejąca właściwość mechanizmu, opisana tu dla
  pełnej przejrzystości.

## 6. Rozwiązany problem typów: `localities`

`OfficialSourceCheck.localities` jest typu `PilotLocality[]` — ścisła unia
6 nazw pilotażu (`officialSourceChecklist.ts`). Żadna z 10 nowych gmin nie
należy do tej unii. Rozwiązanie: `localities: []` (pusta tablica jest
poprawna typowo, bez poszerzania `PILOT_LOCALITIES`) — uczciwie odzwierciedla
fakt, że te źródła są poza obszarem personalizacji „Moja okolica" i nie
liczą się do pokrycia pilotażu. Jedyny towarzyszący fix: `OfficialSourceChecklist.tsx`
(komponent tylko na `/admin/sources`, za autoryzacją) pokazuje teraz
„poza obecnym pilotażem — check-only" zamiast pustego ciągu, gdy
`localities` jest puste — 3-liniowa, admin-only poprawka wymagana do
poprawnego wyświetlenia nowych kart, nie przebudowa UX.
