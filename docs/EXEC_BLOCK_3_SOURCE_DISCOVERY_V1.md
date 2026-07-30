# Blok Wykonawczy 3 — discovery i aktywacja fali 2 (Etap F, patrz audyt etykiety)

Status: **7 nowych źródeł aktywowanych check-only na Production. Zero
zapisów, zero writera, zero auto-publish.**

Data: 2026-08-03 (Blok Wykonawczy 3).

---

## 1. Metodologia

Discovery przez WebSearch (znalezienie kandydatów) + WebFetch (weryfikacja
`{domena}/wp-json/wp/v2/posts?per_page=3` — 3 wpisy, nie 1, żeby ocenić
realny udział treści operacyjnej). **Każde źródło osobiście zweryfikowane
przez głównego agenta rzeczywistym zapytaniem HTTP** — żadne nie zostało
przyjęte na podstawie samego wyniku wyszukiwarki ani faktu istnienia
WordPressa bez sprawdzenia treści.

Przetestowano ~24 dodatkowych kandydatów w województwach mazowieckim i
łódzkim. 7 zakwalifikowano (GO), pozostałe odrzucono na podstawie
rzeczywistej treści lub statusu HTTP.

## 2. Zweryfikowane, aktywowane źródła (7× GO)

| Instytucja | Gmina/Miasto | Województwo | Endpoint REST | Realna treść próbki | Decyzja |
|---|---|---|---|---|---|
| PWiK Mińsk Mazowiecki | Mińsk Mazowiecki | mazowieckie | `pwikminsk.pl/wp-json/wp/v2/posts` | „Awaria sieci wodociągowej", „Przerwa w dostawie wody" | **GO** |
| PWiK Wyszków | Wyszków | mazowieckie | `pwikwyszkow.pl/wp-json/wp/v2/posts` | „KOMUNIKAT" (operacyjny) + 2 PR/finansowanie | **GO** (filtr słów kluczowych już to obsługuje) |
| PWiK Pułtusk | Pułtusk | mazowieckie | `pwikpultusk.pl/wp-json/wp/v2/posts` | „Przerwa w dostawie wody", „KOMUNIKAT!", „APEL DO MIESZKAŃCÓW" | **GO** |
| Wodociągi i Kanalizacja — Zgierz | Zgierz | **łódzkie** | `wodkan.zgierz.pl/wp-json/wp/v2/posts` | „OGŁOSZENIE" (upał), „AWARIA", „PRZERWA W DOSTAWIE WODY" | **GO** |
| ZWiK Pabianice | Pabianice | **łódzkie** | `zwik.pabianice.pl/wp-json/wp/v2/posts` | „Awaria wodociągu ul. Warszawska/Batorego" ×2, 1 PR | **GO** |
| PGKiM Aleksandrów Łódzki | Aleksandrów Łódzki | **łódzkie** | `pgkimal.pl/wp-json/wp/v2/posts` | „Brak wody!" ×3 (realne, różne lokalizacje) | **GO** |
| RAWiK Rawa Mazowiecka | Rawa Mazowiecka | **łódzkie** | `rawik.pl/wp-json/wp/v2/posts` | „Informacja o przerwie...", „Awaria wodociągu" ×2 | **GO** |

**Pierwsze źródła poza województwem mazowieckim** — 4 z 7 to Łódzkie,
zgodnie z briefem „2-3 kolejne województwa" (finalnie: mazowieckie
rozszerzone + łódzkie, 2 województwa łącznie po tym bloku).

## 3. Kandydaci odrzuceni (NO-GO, z realnym uzasadnieniem)

| Domena | Miejscowość | Powód NO-GO |
|---|---|---|
| `pwik.kutno.pl`, `mpwik-milanowek.pl`, `pwikgarwolin.pl`, `pgk.plonsk.pl`, `www.mpwik-blonie.pl` | Kutno, Milanówek, Garwolin, Płońsk, Błonie | 404 — brak działającego REST API |
| `wodkan-skierniewice.com.pl` | Skierniewice | 401 Unauthorized |
| `www.pkgkl.pl` | Konstantynów Łódzki | błąd certyfikatu TLS — złamana konfiguracja |
| `www.zuk-brzeziny.pl` | Brzeziny | brak REST API (strona HTML, nie WordPress REST) |
| `www.zgwk.pl` | Tomaszów Mazowiecki | żywy REST, ale próbka to wyłącznie treść edukacyjna/PR (wizyty szkolne) |
| `www.zwikciechanow.pl` | Ciechanów | żywy REST, ale próbka to wyłącznie ogłoszenia przetargowe |
| `zwikndm.pl` | Nowy Dwór Mazowiecki | żywy REST, ale próbka to wyłącznie treść administracyjna (połączenie spółek, legitymacje) — brak dowodu treści operacyjnej w próbce |
| `puiksokolowpodl.pl` | Sokołów Podlaski | żywy REST, ale próbka to wyłącznie przetargi |
| `mpwikzdw.com.pl` | Zduńska Wola | żywy REST, ale próbka to wyłącznie przetargi/zamówienia |
| `zwik-wiazowna.pl` | Wiązowna | domena nie istnieje (DNS nie rozwiązuje) |

## 4. Wspólny adapter i brak nowego kodu

`wordpress_rest` — identyczny mechanizm co poprzednie 15 źródeł. Żadne z 7
nie ma wpisu w `REST_PARSERS_BY_SOURCE_ID`, więc korzysta z domyślnego
`parseWordpressRestPosts` (ten sam filtr co Wodociągi Michałowice) — zero
nowego kodu parsera, zgodnie z zasadą „nie buduj wielu jednorazowych
parserów".

## 5. Rzeczywisty kontrolowany check (7/7)

Wykonane przez `fetchAndParseManualCheck` (dokładnie ta sama funkcja co
`/api/sources/check`), jednorazowy, nie-commitowany skrypt weryfikacyjny,
usunięty zaraz po użyciu. Baseline `source_checks` przed: **2**. Po: **2**
— potwierdzone, że kontrolowany check nie zapisuje historii (funkcja nigdy
nie dotyka Supabase, zgodnie z projektem Sprintu 134).

| id | Fetch | Propozycje | Przykładowy permalink |
|---|---|---|---|
| pwik-minsk-mazowiecki | ✅ | 2 | pwikminsk.pl/2026/07/29/awaria-sieci-wodociagowej-7/ |
| pwik-wyszkow | ✅ | 0 (filtr operacyjności poprawnie odrzucił próbkę tego runu) | — |
| pwik-pultusk | ✅ | 1 | pwikpultusk.pl/przerwa-w-dostawie-wody/ |
| wodkan-zgierz | ✅ | 2 | wodkan.zgierz.pl/2026/07/17/przerwa-w-dostawie-wody-149/ |
| zwik-pabianice | ✅ | 5 | zwik.pabianice.pl/2026/07/16/awaria-wodociagu-ul-warszawska-batorego/ |
| pgkim-aleksandrow-lodzki | ✅ | 5 | pgkimal.pl/brak-wody-82/ |
| rawik-rawa-mazowiecka | ✅ | 4 | rawik.pl/informacja-o-przewie-w-dostawie-wody-w-ul-1-go-maja-i-ul-ksieze-domki/ |

Zero 500, zero timeoutów, wszystkie permalinki prowadzą do oficjalnych
domen z §2. Zero kandydatów zapisanych w Supabase, zero alertów, zero
writer runów, zero e-maili — funkcja `fetchAndParseManualCheck` nie ma
żadnej ścieżki zapisu (potwierdzone statycznym testem czytającym kod
źródłowy, patrz `sourceScaleMazowszeLodzkieWave2Batch.spec.ts`).

## 6. Bezpieczeństwo — bez zmian względem poprzednich bloków

Żadne z 7 nowych źródeł nie zostało dodane do
`DEFAULT_ALLOWED_WRITE_SOURCE_IDS` (`["michalowice-komunikaty"]`, bez
zmian) ani `DEFAULT_AUTO_PUBLISH_SOURCE_IDS` (`["pruszkow-aktualnosci"]`,
bez zmian) — potwierdzone testami parametryzowanymi.
