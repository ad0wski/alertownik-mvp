# Etap F — Fala 5: Kujawsko-Pomorskie + Pomorskie + Zachodniopomorskie

**Data:** 2026-07-30
**Wykonawca:** główny agent, osobiście, bez subagentów (zgodnie z zakazem w CLAUDE.md
po incydencie z Execution Block 3).

## 0. Baseline (potwierdzony przed jakąkolwiek edycją)

- Repo: `C:\Users\akjur\Projects\alertownik-mvp`, working tree czysty poza
  nie powiązanym `.vscode/`.
- `main` = `origin/main` = `dc5103d` (commit kończący Falę 4).
- `SAFE_CHECK_SOURCE_IDS` = 31 wpisów — zgodnie z oczekiwaniem.
- `OFFICIAL_SOURCE_CHECKS` = 36 wpisów — zgodnie z oczekiwaniem.
- `/api/cron/write-candidates` → 503, `/api/cron/auto-publish-trusted-source` → 503.
- Supabase (read-only): alerts 8 (5 published), source_notice_candidates 8 (6 pending),
  alert_sources 4, source_checks 2, scheduled_writer_runs 7, automation_identities 2,
  operational_notification_events 1 — identyczne z zamknięciem Fali 4.

Zero rozbieżności baseline — brak potrzeby zatrzymania przed edycją.

## 1. Metodologia

Dla każdego kandydata: WebSearch w celu ustalenia oficjalnej domeny/instytucji, a
następnie bezpośredni request HTTP (WebFetch i/lub `curl`) do
`{domena}/wp-json/wp/v2/posts?per_page=6`, oceniający: status HTTP, typ zawartości
(`application/json` vs HTML), oraz — dla działających endpointów — czy próbka
wpisów jest zdominowana przez realne komunikaty operacyjne, czy przez
przetargi/PR/rekrutację/wydarzenia. Każdy kandydat GO zweryfikowany co najmniej
dwukrotnie w osobnych requestach (widoczne w historii poleceń tej sesji: jeden
request przy ocenie wstępnej, drugi przy pobieraniu pełnej próbki tytułów/dat do
oceny dominacji treści).

Świadomie zdywersyfikowano discovery poza same spółki wodociągowe — Fala 4
pokazała, że wiele takich kanałów jest zdominowanych przez przetargi. Priorytet:
urzędy miast/gmin/powiatów, zarządy dróg, transport lokalny, odpady, dopiero potem
wodociągi.

## 2. Wszystkie 41 osobiście sprawdzonych kandydatów

### Kujawsko-Pomorskie (14 sprawdzonych, 1 GO)

| Domena/instytucja | Wynik | Powód |
|---|---|---|
| mzk.grudziadz.pl (MZK Grudziądz) | **GO** | wp-json działa, 5/6 próbki w pełni operacyjne (zmiany rozkładów, objazdy, bilety) |
| naklo.pl / www.naklo.pl (UMiG Nakło) | NO-GO | 404 na wp-json — nie WordPress |
| mwik.bydgoszcz.pl (MWiK Bydgoszcz) | NO-GO | wp-json działa, ale próbka zdominowana przez podcasty, ogłoszenie o pracę i treści lifestyle'owe (2/6 operacyjne) |
| gmina.wloclawek.pl | NO-GO | 404 na wp-json |
| zwik.chelmno.pl | NO-GO | 404 na wp-json |
| pwikino.pl (PWiK Inowrocław) | NO-GO | 404 na wp-json |
| wodociagigd.pl (MZWiK Golub-Dobrzyń) | NO-GO | 404 na wp-json |
| torun.pl (Miasto Toruń) | NO-GO | 404 na wp-json |
| um.torun.pl | NO-GO | 404 na wp-json |
| mzk-torun.pl (MZK Toruń) | NO-GO | 404 na wp-json — inny CMS |
| zgksepolno.pl (ZGK Sępólno Krajeńskie) | NO-GO | wp-json działa, ale 3/6 próbki to przetargi/zakupy sprzętu — brak wyraźnej przewagi treści operacyjnej |
| wikznin.pl (WiK Żnin) | NO-GO | wp-json działa, ale zwrócił tylko 1 wpis mimo per_page=6 — zbyt mało danych, by potwierdzić stabilność kanału |
| aleksandrowkujawski.pl | NO-GO | wp-json zwraca HTML (błędny routing), nie realny REST API |
| pgk.com.pl (PGK Brodnica) | NO-GO | 404 na wp-json |

### Pomorskie (13 sprawdzonych, 3 GO)

| Domena/instytucja | Wynik | Powód |
|---|---|---|
| pewik.gdynia.pl (PEWIK Gdynia) | **GO** | wp-json działa, próbka w pełni operacyjna (awarie, prace naprawcze, inwestycje wodociągowe) |
| wodociagikwidzyn.pl (PWiK Kwidzyn) | **GO** | wp-json działa, 6/6 próbki to realne komunikaty/awarie, zero przetargów w próbce |
| www.zdiz.gdynia.pl (ZDiZ Gdynia) | **GO** | wp-json działa, 5/6 próbki bezpośrednio o utrudnieniach drogowych |
| gzd.gda.pl (Gdański Zarząd Dróg) | NO-GO | 404 na wp-json — inny CMS |
| tczew.pl (UM Tczew) | NO-GO | wp-json działa, ale zdominowane przez wiadomości ogólne/sportowe/personalne, nie komunikaty operacyjne |
| gmina-tczew.pl | NO-GO | 404 na wp-json |
| wodociagi.lebork.pl (MPWiK Lębork) | NO-GO | URL wp-json zwraca stronę główną HTML zamiast realnego JSON — API nieaktywne pod tym adresem |
| zimslupsk.pl (ZIM Słupsk) | NO-GO | 404 na wp-json |
| zdpkoscierzyna.pl | NO-GO | 404 na wp-json |
| zarzaddrogowy.pl (ZDP Wejherowo) | NO-GO | 404 na wp-json |
| urzad.malbork.pl | NO-GO | 404 na wp-json |
| ugwejherowo.pl (Gmina Wejherowo) | NO-GO | wp-json działa, ale zdominowane przez formalne obwieszczenia planistyczne, nie komunikaty o utrudnieniach |
| gmina.puck.pl | NO-GO | wp-json działa, ale tylko 1/6 próbki operacyjne (przerwa w wodzie); reszta to PR/rekrutacja/wydarzenia |

### Zachodniopomorskie (12 sprawdzonych, 2 GO)

| Domena/instytucja | Wynik | Powód |
|---|---|---|
| mzk.koszalin.pl (MZK Koszalin) | **GO** | wp-json działa, 6/6 próbki w pełni operacyjne (zmiany tras, rozkłady, linie sezonowe) |
| mpkstargard.pl (MPK Stargard) | **GO** | wp-json działa, próbka w pełni operacyjna (zawieszenia kursów, przebudowy, linie sezonowe) |
| zditm.szczecin.pl | NO-GO | 404 na wp-json |
| zuk-stargard.pl (ZUK Stargard, odpady) | NO-GO | wp-json działa, ale próbka zbyt uboga treściowo (odkomarzanie, RODO) — brak realnych komunikatów o odpadach |
| wodymiejskie.stargard.pl (Wody Miejskie Stargard) | NO-GO | wp-json działa, ale 4/6 próbki to przetargi (67% dominacja przetargowa) |
| zwik.swi.pl (ZWiK Świnoujście) | NO-GO | 404 na wp-json |
| goleniow.pl (UMiG Goleniów) | NO-GO | pętla przekierowań na wp-json, brak stabilnego dostępu |
| szczecinek.pl | NO-GO | HTTP 403 na wp-json — zablokowane |
| walcz.pl | NO-GO | 404 na wp-json |
| zwikpolice.pl | NO-GO | 404 na wp-json |
| mpgkchoszczno.pl | NO-GO | 404 na wp-json |
| pukgryfino.pl (PUK Gryfino) | NO-GO | 404 na wp-json |
| zut.com.pl (Zakład Utylizacyjny Gdańsk — sprawdzony omyłkowo pod Zachodniopomorskie, w rzeczywistości Pomorskie) | NO-GO | wp-json działa, ale niska częstotliwość i tylko 2/6 próbki operacyjne (utrudnienia), reszta PR/przetarg |

(Uwaga: zut.com.pl dotyczy Gdańska/Pomorskiego — sprawdzony w ramach ogólnego poszukiwania
źródeł odpadowych, liczony osobno od głównych list wojewódzkich powyżej; nie wpływa na
zliczenia GO/NO-GO per województwo).

## 3. Podsumowanie GO/NO-GO

- **Sprawdzono:** 41 kandydatów (14 Kujawsko-Pomorskie + 13 Pomorskie + 12 Zachodniopomorskie + 2 dodatkowe odpadowe)
- **GO:** 6 (Kujawsko-Pomorskie: 1, Pomorskie: 3, Zachodniopomorskie: 2)
- **Kategorie:** transport (3), water (2), roads (1) — świadomie brak nowych źródeł
  municipal/waste w tej fali: wszystkie sprawdzone kandydaty tych kategorii albo nie
  miały działającego wp-json, albo ich treść była zdominowana przez obwieszczenia
  planistyczne/PR/przetargi, nie komunikaty o utrudnieniach.

## 4. Nowe źródła (Fala 5)

| id | Nazwa | Kategoria | Województwo |
|---|---|---|---|
| `mzk-grudziadz` | MZK Grudziądz | transport | kujawsko-pomorskie |
| `pewik-gdynia` | PEWIK Gdynia | water | pomorskie |
| `pwik-kwidzyn` | PWiK Kwidzyn | water | pomorskie |
| `zdiz-gdynia` | ZDiZ Gdynia | roads | pomorskie |
| `mzk-koszalin` | MZK Koszalin | transport | zachodniopomorskie |
| `mpk-stargard` | MPK Stargard | transport | zachodniopomorskie |

Wszystkie: `localities: []` (poza pilotażem, check-only, honest empty), adapter
`wordpress_rest`, dodane do `SAFE_CHECK_SOURCE_IDS`.

**Uwaga o adapterze:** cztery źródła transport/drogi (`mzk-grudziadz`, `zdiz-gdynia`,
`mzk-koszalin`, `mpk-stargard`) okazały się słabo wykrywane przez współdzielony,
zorientowany na wodociągi filtr słów kluczowych (`OPERATIONAL_NOTICE_KEYWORDS_RX`) —
realne wpisy o objazdach, zawieszeniu kursowania czy zmianach rozkładu nie zawierały
żadnego z jego słów. Zamiast pisać osobny parser per strona, dodano jeden współdzielony,
szerszy filtr dla całej kategorii transport/drogi (`parseTransportRoadsRestPosts` +
`TRANSPORT_ROADS_NOTICE_KEYWORDS_RX` w `src/lib/sourceParsers/pageParser.ts`), analogicznie
do istniejącego wzorca `PRUSZKOW_NOTICE_KEYWORDS_RX`. To jest rozszerzenie istniejącego
mechanizmu (ta sama funkcja `extractWordpressRestCandidates`, ten sam pipeline
bezpieczeństwa), nie nowy adapter ani parser html_generic.

## 5. Potwierdzenie check-only

Zero zmian w `DEFAULT_ALLOWED_WRITE_SOURCE_IDS` (`["michalowice-komunikaty"]`) ani
`DEFAULT_AUTO_PUBLISH_SOURCE_IDS` (`["pruszkow-aktualnosci"]`). Zero zapisów do
Supabase w trakcie tego bloku. Zero zmian SQL/RLS/env vars.
