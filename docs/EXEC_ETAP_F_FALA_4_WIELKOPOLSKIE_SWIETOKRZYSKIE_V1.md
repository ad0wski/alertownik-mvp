# Etap F, Fala 4 — Wielkopolskie + Świętokrzyskie (batch równoległy)

Status: **6 źródeł aktywowanych check-only na Production. Zero zapisów,
zero writera, zero auto-publish.**

Data: 2026-07-30. Wszystkie 28 kandydatów osobiście zweryfikowanych
rzeczywistym HTTP requestem przez głównego agenta — **zero subagentów w
całym tym bloku**, zgodnie z zakazem po incydencie (`CLAUDE.md`).

---

## 1. Uwaga preflight: korekta liczby OFFICIAL_SOURCE_CHECKS

Preflight tego bloku oczekiwał 34 wpisów `OFFICIAL_SOURCE_CHECKS` — realna
liczba przed tym blokiem wynosiła **30** (zweryfikowane bezpośrednim
zliczeniem `id: "..."` w pliku). Rozbieżność wynika z błędu arytmetycznego
we własnym raporcie zamknięcia Fali 3, nie z rzeczywistej rozbieżności
stanu systemu — `SAFE_CHECK_SOURCE_IDS` (25) był poprawny i zgodny.
Skorygowane tutaj dla jasności; nie wpływa na bezpieczeństwo ani
poprawność żadnego wcześniejszego wdrożenia.

## 2. Metodologia

WebSearch + bezpośredni `WebFetch` na `{domena}/wp-json/wp/v2/posts?per_page=3`,
wykonane osobiście, batch równoległy dla 2 województw. Każde źródło GO
zweryfikowane **dwukrotnie**.

## 3. Wielkopolskie — 16 osobiście sprawdzonych kandydatów

| Domena | Instytucja/miasto | Wynik | Powód |
|---|---|---|---|
| aquanet.pl | Aquanet Poznań | ❌ NO-GO | Realny endpoint REST, ale zwraca pustą tablicę `[]` — brak treści w tym kanale |
| wodociagi-kalisz.pl | PWiK Kalisz | ❌ NO-GO | HTTP 404 |
| pwik-konin.com.pl | PWiK Konin | ✅ **GO** | Realne komunikaty o awariach przyłączy/modernizacji, zweryfikowane 2× |
| mwik.pila.pl | MWiK Piła | ❌ NO-GO | Realny endpoint, próbka 3/3: rekrutacja/PR/edukacja, brak treści operacyjnej |
| wodkan.com.pl | WODKAN Ostrów Wielkopolski | ❌ NO-GO | Realny endpoint, treść wyłącznie przetargowa (3/3 „PRZETARG NIEOGRANICZONY") |
| pwikgniezno.com.pl | PWiK Gniezno | ❌ NO-GO | Strona HTML, brak działającego REST API |
| pwikwrzesnia.pl | PWiK Września | ✅ **GO** | Realne komunikaty operacyjne (apel, spadek ciśnienia), zweryfikowane 2× |
| mpwik-leszno.pl | MPWiK Leszno | ❌ NO-GO | HTTP 404 |
| sremskiewodociagi.pl | Śremskie Wodociągi | ✅ **GO** | Wszystkie próbkowane wpisy w pełni operacyjne, zweryfikowane 2× |
| pgkimkrotoszyn.pl | PGKiM Krotoszyn | ❌ NO-GO | HTTP 404 |
| pgkim-turek.pl | PGKiM Turek | ❌ NO-GO | HTTP 404 |
| pwikjarocin.pl | PWiK Jarocin | ❌ NO-GO | HTTP 401 Unauthorized |
| wodociagi-koscian.pl | Wodociągi Kościańskie | ❌ NO-GO | HTTP 404 |
| zwikrawicz.pl | ZWiK Rawicz | ❌ NO-GO | Realny endpoint, treść wyłącznie przetargowa/budowlana (3/3) |
| mpwik-wagrowiec.pl | MPWiK Wągrowiec | ❌ NO-GO | HTTP 404 |
| mwik.pl (Chodzież) | MWiK Chodzież | ❌ NO-GO | HTTP 404 |

**Wynik Wielkopolskie: 3 GO / 16 sprawdzonych.**

## 4. Świętokrzyskie — 12 osobiście sprawdzonych kandydatów

| Domena | Instytucja/miasto | Wynik | Powód |
|---|---|---|---|
| wod-kiel.com.pl | Wodociągi Kieleckie | ❌ NO-GO | HTTP 403 Forbidden (blokada bota) |
| mwikostrowiec.pl | MWiK Ostrowiec Świętokrzyski | ✅ **GO** | Realne komunikaty o przerwach/modernizacji, zweryfikowane 2× |
| pwik.starachowice.pl | PWiK Starachowice | ❌ NO-GO | HTTP 404 |
| mpwik-skarzysko.eu | MPWiK Skarżysko-Kamienna | ❌ NO-GO | Realny endpoint, próbka 2/3 przetargowa, treść zdominowana przez ogłoszenia |
| pgkim.sandomierz.pl | PGKiM Sandomierz | ❌ NO-GO | Strona HTML, brak działającego REST API |
| mpgkbusko.pl | MPGK Busko-Zdrój | ✅ **GO** (najsłabszy sygnał) | Realny endpoint, mieszana treść — 1/3 wyraźnie operacyjna, filtr obsługuje resztę |
| wodociagi.jedrzejowskie.pl | Wodociągi Jędrzejowskie | ❌ NO-GO | HTTP 404 |
| wodociagipinczowskie.net | Wodociągi Pińczowskie | ✅ **GO** | Realne komunikaty z ulicami i datami, zweryfikowane 2× |
| pwik-konskie.pl | PWiK Końskie | ❌ NO-GO | Błąd certyfikatu TLS |
| pgkim.pl | PGKiM Staszów | ❌ NO-GO | Realny endpoint, treść wyłącznie przetargowa/zaopatrzeniowa (3/3) |
| wzwik-wloszczowa.pl | WZWiK Włoszczowa | ❌ NO-GO | HTTP 404 |
| opatow.zakladkomunalny.com | PGKIM Opatów | ❌ NO-GO | Strona HTML, brak działającego REST API |

**Wynik Świętokrzyskie: 3 GO / 12 sprawdzonych.**

## 5. Łącznie: 6 GO, 22 NO-GO z 28 sprawdzonych

Poniżej progu 8–15 z briefu — zgodnie z jego jawną instrukcją („Jeżeli GO
otrzyma mniej źródeł, wdroż wyłącznie wiarygodne") **nie naciągnięto
liczby**. Nowa, powtarzająca się w tej fali obserwacja: duży odsetek
realnych, żywych endpointów REST zawiera wyłącznie treść przetargową
(zamówienia publiczne) — te spółki prowadzą WordPressa jako kanał
zamówień, nie komunikatów dla mieszkańców. To ustalenie samo w sobie jest
wartościowe dla przyszłych fal.

## 6. Wspólny adapter

**`wordpress_rest`** — identyczny mechanizm co Fale 1–3, zero nowego kodu
parsera.

## 7. Realny kontrolowany check (6/6)

| id | Fetch | Propozycje | Przykład |
|---|---|---|---|
| pwik-konin | ✅ | 3 | „Awaria na przyłączu wodociągowym przy ul. Pogodnej 13" |
| pwik-wrzesnia | ✅ | 3 | „Przerwa w dostawie wody – 09.06.2026" |
| sremskie-wodociagi | ✅ | 3 | „Awaria sieci wodociągowej w miejscowości Śrem ul. Długa" |
| mwik-ostrowiec | ✅ | 3 | „Modernizacja sieci w ul. Żeromskiego" |
| mpgk-busko-zdroj | ✅ | 2 | „Przerwa w dostawie wody" |
| wodociagi-pinczowskie | ✅ | 4 | „AWARIA-BRAK WODY- 04.07.2026R." |

Zero 500/timeout, wszystkie permalinki prowadzą do oficjalnych domen.

## 8. Potwierdzenie: wyłącznie check-only

Żadne z 6 źródeł nie zostało dodane do `DEFAULT_ALLOWED_WRITE_SOURCE_IDS`
ani `DEFAULT_AUTO_PUBLISH_SOURCE_IDS` (oba niezmienione, potwierdzone
testami parametryzowanymi). Pierwsze źródła z dwóch nowych województw —
`localities: []`, ten sam uczciwy wzorzec co Fale 1–3.
