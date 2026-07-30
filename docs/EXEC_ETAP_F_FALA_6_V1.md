# Etap F — Fala 6: Lubelskie + Podkarpackie + Podlaskie

**Data:** 2026-07-30
**Status:** ZAKOŃCZONA ✅

Ten dokument łączy ustalenia sesji przerwanej limitem WebSearch
(`docs/EXEC_ETAP_F_FALA_6_CHECKPOINT_PAUSED_V1.md`, teraz usunięty jako
zastąpiony przez ten plik) z dokończonym discovery tej sesji. Metoda
weryfikacji niezmienna przez cały blok: bezpośredni request HTTP do
`{domena}/wp-json/wp/v2/posts?per_page=N`, ocena statusu HTTP, typu
zawartości i — dla działających endpointów — próbki tytułów/dat pod kątem
dominacji treści operacyjnej vs przetargi/PR/rekrutacja/administracja. Brak
subagentów w całym bloku (post-incydentowy zakaz w CLAUDE.md).

---

## 1. Baseline (potwierdzony na starcie tej sesji, bez zmian)

- Git: `main` = `origin/main` = `caa79ac`, working tree czysty poza
  niepowiązanym `.vscode/` i tym checkpointem.
- `SAFE_CHECK_SOURCE_IDS` = 37, `OFFICIAL_SOURCE_CHECKS` = 42.
- Production: strona główna 200, oba endpointy cron (`write-candidates`,
  `auto-publish-trusted-source`) 503.
- Supabase (read-only): alerts 8 (5 published), source_notice_candidates 8
  (6 pending), alert_sources 4, source_checks 2, scheduled_writer_runs 7,
  automation_identities 2, operational_notification_events 1.

Wszystkie te liczby zweryfikowane osobiście na starcie tej sesji i zgodne
1:1 z checkpointem — zero rozbieżności.

---

## 2. Pełne zestawienie GO/NO-GO — 51 kandydatów łącznie

### Lubelskie — 16 sprawdzonych, 0 GO

Sesja poprzednia (8, patrz checkpoint): zdtm.lublin.eu, mpk.lublin.pl,
um.bialapodlaska.pl, gminachelm.pl, chelm.pl, lublin.eu, pulawy.eu,
mpwik.lublin.pl (PR/przetargi dominują), starostwo.hrubieszow.pl (403),
zamosc.pl (403) — wszystkie NO-GO.

Ta sesja (8 nowych):

| Domena | Instytucja | Wynik | Dowód |
|---|---|---|---|
| www.swidnik.pl | Urząd Miasta Świdnik | NO-GO | wp-json 200 JSON, ale ogólny portal newsowy (sport/kultura/PR) — zero treści operacyjnej w próbce 12 |
| krasnik.eu | Urząd Miasta Kraśnik | NO-GO | 404 na wp-json po przekierowaniu |
| lukow.pl / miastolukow.pl | Urząd Miasta Łuków | NO-GO | www.lukow.pl HTTP 200 ale HTML (nie WP REST); miastolukow.pl nie istnieje |
| lubartow.pl | Urząd Miasta Lubartów | NO-GO | wp-json 200 JSON, ale mieszany kanał — ok. 5/12 operacyjne (drogowe/alarm), reszta PR/wydarzenia — niewystarczająca dominacja |
| radzyn-podl.pl | Urząd Miasta Radzyń Podlaski | NO-GO | 404 na wp-json |
| tomaszow-lubelski.pl | Urząd Miasta Tomaszów Lubelski | NO-GO | wp-json 200 JSON, ale zdominowane przez biurokratyczne zawiadomienia administracyjne (IR.xxxx, decyzje lokalizacyjne) — nie komunikaty o utrudnieniach |
| krasnystaw.pl | Urząd Miasta Krasnystaw | NO-GO | przekierowanie do strony błędu (`?code=404`) |
| wlodawa.eu | Urząd Miasta Włodawa | NO-GO | wp-json 200 JSON, ale tylko 1/6 realnie operacyjne (syreny alarmowe), reszta ogólne informacje publiczne |

### Podkarpackie — 17 sprawdzonych, **1 GO**

Sesja poprzednia (8, patrz checkpoint): erzeszow.pl (404), **mzd.erzeszow.pl
GO**, mpk.rzeszow.pl (HTML nie JSON), przemysl.pl (404),
stalowawola.pl (403), wodociagi.tarnobrzeg.pl (404), zdm-przemysl.com
(Cloudflare block), zdm.przemysl.eu (404), krosno.pl (404).

Ta sesja (9 nowych):

| Domena | Instytucja | Wynik | Dowód |
|---|---|---|---|
| sanok.pl | Urząd Miasta Sanok | NO-GO | ASP-owy CMS (`/asp/`), 404 na wp-json |
| mielec.pl | Urząd Miasta Mielec | NO-GO | www.mielec.pl HTTP 200 ale pusta odpowiedź (nie WP REST) |
| debica.pl | Urząd Miasta Dębica | NO-GO | HTTP 401 na wp-json — niedostępne |
| jaroslaw.pl | Urząd Miasta Jarosław | NO-GO | przekierowanie do strony głównej HTML zamiast JSON |
| um.jaslo.pl | Urząd Miasta Jasło | NO-GO | wp-json 200 JSON, ale zdominowane przez przetargi na nieruchomości i nabory — 4/6 przetargowych |
| lancut.pl | Urząd Miasta Łańcut | NO-GO | ASP-owy CMS (`/asp/pl_start.asp`), 404 na wp-json |
| nisko.pl | Urząd Miasta Nisko | NO-GO | 404 na wp-json |
| miastolezajsk.pl | Urząd Miasta Leżajsk | NO-GO | 404 na wp-json |
| ropczyce.eu | Urząd Gminy Ropczyce | NO-GO | wp-json 200 JSON, ale ogólny portal PR/inwestycyjny — zero treści operacyjnej w próbce |

**mzd.erzeszow.pl — GO, podwójnie zweryfikowany** (raz w poprzedniej sesji,
raz w tej — 10/10 próbkowanych wpisów w pełni operacyjne: utrudnienia
Rzeszów Bike Festival, budowy dróg KDZ/KDL, rozbudowa ul. Ropczyckiej,
budowa ul. Robotniczej, chodnik ul. Skrajnej, zakończenie DW 878 —
"WISŁOKOSTRADA", kładka nad Strugiem. Zero przetargów/PR w obu próbkach).

### Podlaskie — 18 sprawdzonych, **1 GO** — priorytet tej fali

Sesja poprzednia (4, patrz checkpoint): bialystok.pl (404),
komunikacja.bialystok.pl (404), urzad.augustow.pl (404), um.suwalki.pl
(HTML wyszukiwarki, nie JSON) — wszystkie NO-GO.

Ta sesja (14 nowych):

| Domena | Instytucja | Wynik | Dowód |
|---|---|---|---|
| um.lomza.pl / www.lomza.pl | Urząd Miasta Łomża | NO-GO | um.lomza.pl to frameset przekierowujący na www.lomza.pl, które daje 404 na wp-json |
| bielsk-podlaski.pl | Urząd Miasta Bielsk Podlaski | NO-GO | 404 / brak połączenia |
| hajnowka.pl | Urząd Miasta Hajnówka | NO-GO | 404 na wp-json |
| grajewo.pl | Urząd Miasta Grajewo | NO-GO | brak połączenia / 404 |
| zambrow.pl | Urząd Miasta Zambrów | NO-GO | HTTP 403 Forbidden na wp-json |
| sokolka.pl | Urząd Miasta Sokółka | NO-GO | HTTP 200 z nagłówkiem `application/json`, ale realna treść to HTML (fałszywy content-type) |
| siemiatycze.eu | Urząd Miasta Siemiatycze | NO-GO | HTTP 403 po przekierowaniu |
| kolno.pl | Urząd Miasta Kolno | NO-GO | brak połączenia / 403 |
| pzdw.bialystok.pl | Podlaski Zarząd Dróg Wojewódzkich | NO-GO | 404 na wp-json |
| wobi.pl | Wodociągi Białostockie | NO-GO | 404 na wp-json (po przekierowaniu www) |
| pksnova.pl | PKS Nova (transport regionalny) | NO-GO | wp-json 200 JSON, ale tylko ok. 3/12 operacyjne (opóźnienie, zmiana przystanku, więcej połączeń) — reszta marketing/PR/personalne (voucher, fotorelacja, nowy prezes) |
| mpo.bialystok.pl | MPO Białystok (odpady) | NO-GO | Joomla CMS, HTML nie WP REST |
| odpady.bialystok.pl | Nasz Białystok jest Eko (odpady) | NO-GO | 404 na wp-json |

**www.pgk.suwalki.pl — GO, podwójnie zweryfikowany** (dwie osobne próbki tej
samej sesji, per_page=6 i per_page=12 — 18/18 łącznie wpisów w pełni
operacyjnych: przywrócenie przejazdu ul. Piaskowej, zamknięcie stacji
kontroli pojazdów, zmiany tras linii nr 26, nowe przystanki, bezpłatne
przejazdy specjalne, rozkłady świąteczne. Zero przetargów/PR w żadnej z
dwóch próbek).

---

## 3. Podsumowanie liczbowe

| Województwo | Sprawdzonych | GO | NO-GO |
|---|---|---|---|
| Lubelskie | 16 | 0 | 16 |
| Podkarpackie | 17 | 1 (mzd.erzeszow.pl) | 16 |
| Podlaskie | 18 | 1 (pgk.suwalki.pl) | 17 |
| **Razem** | **51** | **2** | **49** |

Cel briefu (36–45 łącznie) przekroczony celowo — Podlaskie wymagało
dogłębnego domknięcia (priorytet briefu), a każdy dodatkowy kandydat to
realna weryfikacja HTTP, nie zgadywanie.

---

## 4. Zaimplementowane źródła (2, oba check-only)

| id | Nazwa | Kategoria | apiUrl |
|---|---|---|---|
| `mzd-rzeszow` | Miejski Zarząd Dróg w Rzeszowie | roads | `https://mzd.erzeszow.pl/wp-json/wp/v2/posts?per_page=6` |
| `pgk-suwalki` | Przedsiębiorstwo Gospodarki Komunalnej w Suwałkach | transport | `https://www.pgk.suwalki.pl/wp-json/wp/v2/posts?per_page=6` |

Oba: `localities: []` (poza pilotażem, uczciwie), adapter `wordpress_rest`
przez istniejący `parseTransportRoadsRestPosts` (ten sam filtr słów
kluczowych co Fala 5's transport/roads sources — żaden nowy parser). Żadne
z dwóch nie jest na `DEFAULT_ALLOWED_WRITE_SOURCE_IDS` ani
`DEFAULT_AUTO_PUBLISH_SOURCE_IDS` — niezmienne od Fali 1.

**Liczniki przed/po:**
- `SAFE_CHECK_SOURCE_IDS`: 37 → 39
- `OFFICIAL_SOURCE_CHECKS`: 42 → 44

---

## 5. Zmienione pliki

- `src/lib/officialSourceChecklist.ts` — 2 nowe wpisy + komentarz Fala 6
- `src/lib/sourceCheck.ts` — 2 nowe id w `SAFE_CHECK_SOURCE_IDS`
- `src/lib/sourceParsers/pageParser.ts` — 2 nowe wpisy w
  `REST_PARSERS_BY_SOURCE_ID` (oba → `parseTransportRoadsRestPosts`)
- `tests/e2e/sourceScaleEtapFWave6Batch.spec.ts` — nowy plik, parametryzowane
  testy batcha (wzorowany na `sourceScaleEtapFWave5Batch.spec.ts`)
- `tests/e2e/cronCheckSourcesRoute.spec.ts` — liczniki 37→39, lista id,
  successfulSources 36→38
- `tests/e2e/sourceCheck.spec.ts` — pełna lista `SAFE_CHECK_SOURCE_IDS`
  (39 pozycji)
- `tests/e2e/sourceChecklist.spec.ts` — `OFFICIAL_DOMAINS` +2,
  `EXPECTED_EMPTY_LOCALITIES_IDS` +2
- `tests/e2e/sourceHealth.spec.ts` — `apiSupported` 37→39, lista id

Żaden plik SQL, RLS, `.env.local`, allowlisty writera/auto-publish, ani
konfiguracji Vercel/Supabase nie został dotknięty.

---

## 6. Wyniki testów (Green Gate)

- `npm run check` (typecheck + lint + build): **PASS**, zero błędów, zero
  nowych ostrzeżeń.
- `npm run test:pwa`: **25/25 PASS**.
- `npm run test:e2e` (pełny): **1697/1697 PASS** (0 failed) po aktualizacji
  liczników w istniejących testach.
- Security/allowlist audit: brak sekretów/tokenów/kluczy w diffie (grep
  czysty); `mzd-rzeszow`/`pgk-suwalki` nieobecne w
  `scheduledWriter.ts`/`trustedSourceAutoPublish.ts` (potwierdzone grep);
  `DEFAULT_ALLOWED_WRITE_SOURCE_IDS` i `DEFAULT_AUTO_PUBLISH_SOURCE_IDS`
  niezmienione (testy to pinują).

---

## 7. Wdrożenie

Branch `etap-f-fala-6-lubelskie-podkarpackie-podlaskie` → commit → push →
Preview → smoke test Preview → fast-forward merge do `main` → push `main`
→ Production deployment → smoke test Production. Szczegóły commit
hash/deployment URL w raporcie końcowym czatu (ten dokument opisuje stan
kodu, nie historię gita).

Potwierdzenie zerowych zapisów: żadna operacja Supabase w tym bloku poza
`SELECT` (liczniki bazowe w §1, niezmienione po zmianach kodu — kod
dodaje wyłącznie check-only definicje, nie wykonuje żadnego zapisu przy
samym zdefiniowaniu). Oba endpointy cron (`write-candidates`,
`auto-publish-trusted-source`) pozostają 503 przed i po tym bloku —
weryfikowane bezpośrednim requestem HTTP do Production.

---

## 8. Stan roadmapy A–F i rekomendacja Fali 7

Etap F (skala krajowa poza pilotażem) po Fali 6: 6 fal, 44 źródła
check-only łącznie (od 9 na starcie Etapu F), pokrycie: Mazowieckie,
Łódzkie, Wielkopolskie, Świętokrzyskie, Kujawsko-Pomorskie, Pomorskie,
Zachodniopomorskie, Lubelskie, Podkarpackie, Podlaskie.

Rekomendacja Fali 7 (nie rozpoczęta, wymaga osobnej zgody Adama): kolejne
nieobjęte województwa (np. Małopolskie, Śląskie, Dolnośląskie,
Opolskie, Lubuskie, Warmińsko-Mazowieckie) — ten sam wzorzec: HTTP-only
discovery, priorytet drogi/transport/CZK nad wodociągami (Fala 5/6
potwierdziły, że kanały wodociągowe częściej mieszają PR/przetargi niż
transport/drogi), zero subagentów, zero zapisów.
