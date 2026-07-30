# Etap F — Fala 8: Dolnośląskie + Opolskie + Lubuskie + Warmińsko-Mazurskie

**Data:** 2026-07-30
**Status:** ZAKOŃCZONA ✅

Ostatnie cztery województwa bez wykonanego discovery. Metoda weryfikacji
niezmienna przez cały blok: bezpośredni request HTTP do
`{domena}/wp-json/wp/v2/posts?per_page=N`, ocena statusu HTTP, typu
zawartości i — dla działających endpointów — próbki tytułów/dat pod kątem
dominacji treści operacyjnej vs przetargi/PR/rekrutacja/administracja/
ostrzeżenia pogodowe (poza zakresem aplikacji). Brak subagentów w całym
bloku (post-incydentowy zakaz w CLAUDE.md).

---

## 1. Baseline (potwierdzony na starcie tej sesji)

- Git: `main` = `origin/main` = `c9b9fc7` — **1 commit ponad oczekiwany
  `ae2e2b4`**, wyjaśnione: `c9b9fc7` to własna, mała korekta dokumentacji
  wykonana w Części 1 tego samego bloku (audyt statusu B/C/D), autoryzowana
  w tej samej wiadomości użytkownika. Poza tym working tree czysty poza
  niepowiązanym `.vscode/`.
- `SAFE_CHECK_SOURCE_IDS` = 42, `OFFICIAL_SOURCE_CHECKS` = 47.
- Production: strona główna 200, oba endpointy cron (`write-candidates`,
  `auto-publish-trusted-source`) 503.
- Supabase (read-only): alerts 8 (5 published), source_notice_candidates 8
  (6 pending), alert_sources 4, source_checks 2, scheduled_writer_runs 7,
  automation_identities 2, operational_notification_events 1. Brak
  otwartego runu (wszystkie 3 najnowsze `scheduled_writer_runs` mają
  `finished_at` ustawione).

Wszystkie te liczby zweryfikowane osobiście na starcie tej sesji.

---

## 2. Pełne zestawienie GO/NO-GO — 73 kandydatów łącznie

### Dolnośląskie — 25 sprawdzonych, **0 GO**

| Domena/instytucja | Kategoria | Wynik | Powód |
|---|---|---|---|
| Wrocław (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Legnica (miasto) | urząd miasta | NO-GO | portal.legnica.eu 404 na wp-json po przekierowaniu |
| Wałbrzych (miasto) | urząd miasta | NO-GO | brak połączenia / HTTP 403 |
| Jelenia Góra (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Głogów (miasto) | urząd miasta | NO-GO | HTTP 403 |
| Zgorzelec (miasto) | urząd miasta | NO-GO | wp-json 200 JSON, ale pusty feed (0 wpisów) |
| Bolesławiec (miasto) | urząd miasta | NO-GO | przekierowanie do innej domeny/CMS, HTML nie JSON |
| Oleśnica (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Oborniki Śląskie (gmina) | gmina | NO-GO | 404 na wp-json |
| DSDiK Wrocław (drogi wojewódzkie) | drogi | NO-GO | 404 na wp-json, alternatywne subdomeny nie rozwiązują się |
| MPK Wrocław | transport | NO-GO | 404 na wp-json (nie WordPress) |
| Świdnica (miasto) | urząd miasta | NO-GO | brak połączenia |
| Dzierżoniów (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Kłodzko (miasto) | urząd miasta | NO-GO | brak połączenia |
| Lubin (miasto) | urząd miasta | NO-GO | wp-json 200 JSON, ale ogólny portal PR/kryminalny/kultura |
| Trzebnica (gmina) | gmina | NO-GO | 404 na wp-json |
| Oława (miasto) | urząd miasta | NO-GO | brak połączenia |
| Środa Śląska (miasto) | urząd miasta | NO-GO | wp-json 200 JSON, ale tylko 5/12 operacyjne (syreny/utrudnienia), reszta ogłoszenia administracyjne/nieruchomości — niewystarczająca dominacja |
| Polkowice (gmina) | gmina | NO-GO | wp-json 200 JSON, ale ogólny portal PR/sport |
| Kąty Wrocławskie (gmina) | gmina | NO-GO | 404 na wp-json |
| Sobótka (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Wołów (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Milicz (gmina) | gmina | NO-GO | wp-json 200 JSON, tylko 1/6 operacyjne (ćwiczenia ALARM-26) |
| Jawor (miasto) | urząd miasta | NO-GO | wp-json 200 JSON, ale zdominowane przez ostrzeżenia pogodowe (poza zakresem aplikacji) i PR |
| MPWiK Wrocław (wodociągi) | woda | NO-GO | wp-json 200 JSON, ale pusty feed (0 wpisów) |

### Opolskie — 15 sprawdzonych, **1 GO**

| Domena/instytucja | Kategoria | Wynik | Powód |
|---|---|---|---|
| Opole (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Kędzierzyn-Koźle (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Nysa (miasto) | urząd miasta | NO-GO | brak połączenia |
| Brzeg (miasto) | urząd miasta | NO-GO | wp-json 200 JSON, ale zero treści operacyjnej w zakresie (ostrzeżenia pogodowe, PR, granty) |
| Kluczbork (miasto) | urząd miasta | NO-GO | przekierowanie, HTML nie JSON |
| Olesno (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Prudnik (miasto) | urząd miasta | NO-GO | wp-json 200 JSON, tylko 2/6 operacyjne w zakresie (organizacja ruchu, syreny), reszta ostrzeżenia pogodowe (poza zakresem) |
| ZDW Opole (drogi wojewódzkie) | drogi | NO-GO | 404 na wp-json |
| **MZD Opole** | **drogi** | **GO** | wp-json 200 JSON, 11/12 próbkowanych wpisów w pełni operacyjne (remonty ulic, budowy dróg pieszo-rowerowych, utrudnienia), zero PR/przetargów administracyjnych niezwiązanych z drogami |
| MZK Opole (transport) | transport | NO-GO | wp-json 200 JSON, ale zdominowane przez ogłoszenia o naborze pracowników (4/6) |
| ZDP Opole (drogi powiatowe) | drogi | NO-GO | 404 na wp-json |
| Głubczyce (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Krapkowice (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Namysłów (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Strzelce Opolskie (miasto) | urząd miasta | NO-GO | przekierowanie, 404 na wp-json |

### Lubuskie — 16 sprawdzonych, **0 GO**

| Domena/instytucja | Kategoria | Wynik | Powód |
|---|---|---|---|
| Zielona Góra (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Gorzów Wielkopolski (miasto) | urząd miasta | NO-GO | brak połączenia / 404 |
| Nowa Sól (miasto) | urząd miasta | NO-GO | wp-json 200 JSON, ale ogólny portal PR/kultura, zero operacyjnej treści w próbce |
| Żagań (miasto) | urząd miasta | NO-GO | brak połączenia |
| Świebodzin (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Żary (miasto) | urząd miasta | NO-GO | 404 na wp-json po przekierowaniu |
| Sulechów (miasto) | urząd miasta | NO-GO | brak połączenia / HTTP 403 |
| Kostrzyn nad Odrą (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Krosno Odrzańskie (miasto) | urząd miasta | NO-GO | wp-json 200 JSON, tylko 4/12 operacyjne w zakresie, reszta ostrzeżenia pogodowe (poza zakresem) i wydarzenia kulturalne (PARKiet Kultury) |
| Międzyrzecz (miasto) | urząd miasta | NO-GO | HTML, nie JSON |
| Słubice (miasto) | urząd miasta | NO-GO | brak połączenia |
| Wschowa (miasto) | urząd miasta | NO-GO | HTTP 403 po przekierowaniu |
| ZDW Zielona Góra (drogi) | drogi | NO-GO | 404 na wp-json (numerowany CMS `.html`, nie WordPress) |
| MZK Gorzów (transport) | transport | NO-GO | HTTP 403 |
| Gubin (miasto) | urząd miasta | NO-GO | przekierowanie, HTML nie JSON |
| MZK Zielona Góra (transport) | transport | NO-GO | 404 na wp-json |

### Warmińsko-Mazurskie — 17 sprawdzonych, **1 GO**

| Domena/instytucja | Kategoria | Wynik | Powód |
|---|---|---|---|
| Olsztyn (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Elbląg (miasto) | urząd miasta | NO-GO | brak połączenia |
| **Ostróda (miasto)** | **municipal** | **GO** | wp-json 200 JSON, 8/12 próbkowanych wpisów w pełni operacyjne (zamknięcia ulic, przerwa w dostawie ciepłej wody, treningi syren, zmiany godzin pracy), reszta to wydarzenia lokalne |
| Ełk (miasto) | urząd miasta | NO-GO | przekierowanie do strony głównej HTML |
| Giżycko (miasto) | urząd miasta | NO-GO | przekierowanie do strony głównej HTML |
| Mrągowo (miasto) | urząd miasta | NO-GO | przekierowanie do strony głównej HTML |
| Iława (miasto) | urząd miasta | NO-GO | brak połączenia |
| Bartoszyce (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Szczytno (miasto) | urząd miasta | NO-GO | brak połączenia |
| Braniewo (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Kętrzyn (miasto) | urząd miasta | NO-GO | brak połączenia |
| Pisz (miasto) | urząd miasta | NO-GO | strona błędu 404 zwrócona z HTTP 200 |
| Górowo Iławeckie (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Nidzica (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| ZDW Olsztyn (drogi) | drogi | NO-GO | numerowany CMS `.html`, nie WordPress |
| ZDZiT Olsztyn (transport) | transport | NO-GO | HTTP 401 — niedostępne |
| MPK Olsztyn (transport) | transport | NO-GO | wp-json 200 JSON, ale zdominowane przez ogłoszenia przetargowe (postępowania na sprzedaż/zakup) |

---

## 3. Podsumowanie liczbowe

| Województwo | Sprawdzonych | GO |
|---|---|---|
| Dolnośląskie | 25 | 0 |
| Opolskie | 15 | 1 (mzd-opole) |
| Lubuskie | 16 | 0 |
| Warmińsko-Mazurskie | 17 | 1 (ostroda-komunikaty) |
| **Razem** | **73** | **2** |

Dolnośląskie i Lubuskie zakończyły się uczciwym zerem GO mimo szerokiego
discovery (odpowiednio 25 i 16 kandydatów) — dokładnie ten sam wzorzec co
Lubelskie w Fali 6. Kilka kandydatów było blisko granicy (Środa Śląska,
Prudnik, Krosno Odrzańskie) i zostało odrzuconych dla spójności ze
standardem stosowanym od Fali 5: brak dominacji treści operacyjnej w
zakresie aplikacji (ostrzeżenia pogodowe i hydrologiczne są jawnie poza
zakresem, tak jak dla `powiat-pruszkowski-wiadomosci`).

---

## 4. Zaimplementowane źródła (2, oba check-only)

| id | Nazwa | Kategoria | apiUrl |
|---|---|---|---|
| `mzd-opole` | Miejski Zarząd Dróg w Opolu | roads | `https://mzd.opole.pl/wp-json/wp/v2/posts?per_page=6` |
| `ostroda-komunikaty` | Urząd Miasta Ostróda — komunikaty | municipal | `https://www.ostroda.pl/wp-json/wp/v2/posts?per_page=6` |

Oba: `localities: []` (poza pilotażem, uczciwie), adapter `wordpress_rest`
przez istniejący `parseTransportRoadsRestPosts` (ten sam filtr słów
kluczowych co poprzednie fale — żaden nowy parser; `ostroda-komunikaty`
świadomie użyto szerszego filtru transport/drogi zamiast domyślnego
wodociągowego, bo lepiej łapie realny, mieszany słownik tego źródła).
Żadne z dwóch nie jest na `DEFAULT_ALLOWED_WRITE_SOURCE_IDS` ani
`DEFAULT_AUTO_PUBLISH_SOURCE_IDS` — niezmienne od Fali 1.

**Liczniki przed/po:**
- `SAFE_CHECK_SOURCE_IDS`: 42 → 44
- `OFFICIAL_SOURCE_CHECKS`: 47 → 49

---

## 5. Zmienione pliki

- `src/lib/officialSourceChecklist.ts` — 2 nowe wpisy + komentarz Fala 8
- `src/lib/sourceCheck.ts` — 2 nowe id w `SAFE_CHECK_SOURCE_IDS`
- `src/lib/sourceParsers/pageParser.ts` — 2 nowe wpisy w
  `REST_PARSERS_BY_SOURCE_ID` (oba → `parseTransportRoadsRestPosts`)
- `tests/e2e/sourceScaleEtapFWave8Batch.spec.ts` — nowy plik, parametryzowane
  testy batcha (wzorowany na `sourceScaleEtapFWave7Batch.spec.ts`)
- `tests/e2e/cronCheckSourcesRoute.spec.ts` — liczniki 42→44, lista id,
  successfulSources 41→43
- `tests/e2e/sourceCheck.spec.ts` — pełna lista `SAFE_CHECK_SOURCE_IDS`
  (44 pozycje)
- `tests/e2e/sourceChecklist.spec.ts` — `OFFICIAL_DOMAINS` +2,
  `EXPECTED_EMPTY_LOCALITIES_IDS` +2
- `tests/e2e/sourceHealth.spec.ts` — `apiSupported` 42→44, lista id

Osobno, w Części 1 tego samego bloku (przed implementacją Fali 8): mała
korekta `docs/MASTER_ROADMAP_V2.md` i `docs/DEFINITION_OF_DONE_V1.md`
(stały status outreachu Etapu B — patrz §6 poniżej), commit `c9b9fc7`.

Żaden plik SQL, RLS, `.env.local`, allowlisty writera/auto-publish, ani
konfiguracji Vercel/Supabase nie został dotknięty.

---

## 6. Audyt statusu Etapów B, C i D (Część 1 tego bloku)

**Ustalenie:** raport końcowy Fali 7 błędnie wpisał B/C/D jako
"✅ ukończony" w tabeli terminalowej czatu. Osobiście zweryfikowano:

- **Przyczyna:** wyłącznie błąd tekstowy w raporcie terminalowym tego
  czatu. Potwierdzone przez `git log` — `docs/MASTER_ROADMAP_V2.md` i
  `docs/DEFINITION_OF_DONE_V1.md` nie były dotykane przez żaden commit
  Fali 1–7 (ostatni dotykający commit: `90d3b78`, Incident Closeout, sprzed
  całej pracy Etapu F). Żaden kanoniczny plik nigdy nie twierdził, że
  B/C/D są ukończone — potwierdzone grepem (`etap [bcd].{0,40}(ukończon|
  zakończon|zamknię)`) na całym `docs/`: zero trafień poza opisową
  definicją kryterium w DoD (nie faktyczny stan).
- **Kryteria DoD nie zostały zmienione** bez zgody Adama — niezmienione od
  `90d3b78`.
- **Znaleziony i naprawiony osobny problem:** `MASTER_ROADMAP_V2.md` i
  `DEFINITION_OF_DONE_V1.md` zawierały nieaktualny fakt — status outreachu
  Etapu B wciąż mówił "niewysłane"/"0%", podczas gdy wiadomość została
  faktycznie wysłana 2026-07-30 (`EXEC_BLOCK_2_OUTREACH_MICHALOWICE_
  FINAL_V1.md` §8). To nie jest "błędnie oznaczone jako ukończone" —
  odwrotnie, dokumentacja była zbyt konserwatywna. Skorygowano wyłącznie tę
  faktografię (commit `c9b9fc7`, przed implementacją Fali 8) — kryteria DoD
  nienaruszone.

**Zweryfikowany status A–F (metodologia z `DEFINITION_OF_DONE_V1.md`,
zero zgadywania procentów):**

| Etap | Status | Dowód |
|---|---|---|
| A (techniczny) | 100% | Sprint 187A, zero regresji utrzymane przez wszystkie fale F |
| A (walidacja użytkowników) | 1/3–5 (20%) | `MASTER_ROADMAP_V2.md` §Etap A — zewnętrzny strumień równoległy, nie blokuje |
| B | **w toku** | wysłano 2026-07-30, odpowiedź nieudokumentowana — DoD wymaga obu |
| C | **0%, nierozpoczęty** | brak jakiegokolwiek dokumentu ofertowego w `docs/`; potwierdzone `ls docs/ | grep monetiz/oferta` — brak wyników |
| D | **~35%** | `SPRINT_186A_STORE_READINESS_V1.md` — audyt+technika gotowe, zero kont/zgłoszeń |
| E | **ZAKOŃCZONY** (2026-07-30) | `STAGE_E_NATIONAL_FOUNDATION_CLOSEOUT_V1.md` |
| F | **8 fal ukończonych** | ten dokument + Fale 1–7 |

---

## 7. Wyniki testów (Green Gate)

- `npm run check` (typecheck + lint + build): **PASS**, zero błędów, zero
  nowych ostrzeżeń.
- `npm run test:pwa`: **25/25 PASS**.
- `npm run test:e2e` (pełny): **1740/1740 PASS** (0 failed).
- Security/allowlist audit: brak sekretów/tokenów/kluczy w diffie (grep
  czysty); `mzd-opole`/`ostroda-komunikaty` nieobecne w
  `scheduledWriter.ts`/`trustedSourceAutoPublish.ts` (potwierdzone grep);
  `DEFAULT_ALLOWED_WRITE_SOURCE_IDS` i `DEFAULT_AUTO_PUBLISH_SOURCE_IDS`
  niezmienione (testy to pinują).

---

## 8. Wdrożenie

Branch `etap-f-fala-8-dolnoslaskie-opolskie-lubuskie-warminsko-mazurskie` →
commit → push → Preview → smoke test Preview → fast-forward merge do
`main` → push `main` → Production deployment → smoke test Production.
Szczegóły commit hash/deployment URL w raporcie końcowym czatu.

Potwierdzenie zerowych zapisów: żadna operacja Supabase w tym bloku poza
`SELECT`. Oba endpointy cron (`write-candidates`,
`auto-publish-trusted-source`) pozostają 503 przed i po tym bloku —
weryfikowane bezpośrednim requestem HTTP do Production.

---

## 9. Pokrycie 16 województw po Fali 8

Wszystkie 16 województw Polski mają teraz wykonane discovery. 13 ma
≥1 aktywne źródło check-only:

Mazowieckie, Łódzkie, Wielkopolskie, Świętokrzyskie, Kujawsko-Pomorskie,
Pomorskie, Zachodniopomorskie, Podkarpackie, Podlaskie, Małopolskie,
Śląskie, Opolskie, Warmińsko-Mazurskie.

3 województwa przebadane, ale wciąż 0 aktywnych źródeł GO:
Lubelskie (Fala 6, 16 kandydatów), Dolnośląskie (Fala 8, 25 kandydatów),
Lubuskie (Fala 8, 16 kandydatów).

**Liczniki:** `SAFE_CHECK_SOURCE_IDS` = 44, `OFFICIAL_SOURCE_CHECKS` = 49.

---

## 10. Formalny audyt Definition of Done — Etap F

Zgodnie z `DEFINITION_OF_DONE_V1.md` §Etap F: **Etap F nie ma jednego
binarnego "koniec"** — kończy się decyzją Adama o zatrzymaniu, nie
automatycznym kryterium. Kryteria per-fala (certyfikacja źródeł,
aktualizacja panelu pokrycia, zero regresji) są spełnione dla wszystkich
8 fal:

- ✅ Wszystkie źródła każdej fali przeszły certyfikację (test dostępności
  realnym HTTP, ocena treści, podwójna weryfikacja GO) przed `active`.
- ✅ Panel pokrycia (ten dokument + poprzednie dokumenty fal) odzwierciedla
  aktualny stan.
- ✅ Zero regresji na istniejących źródłach — `npm run test:e2e` pełny,
  zielony po każdej fali.

Ponieważ Etap F z definicji nie ma jednorazowego "zakończone", **nie
oznaczam go jako zakończony** — pozostaje w toku, zgodnie z jego własną
definicją. Wszystkie 16 województw mają teraz wykonane discovery, co jest
naturalnym, ale nie automatycznym, punktem do decyzji Adama: kontynuować
głębsze fale (gminy/powiaty w ramach już pokrytych województw, ponowna
próba Lubelskiego/Dolnośląskiego/Lubuskiego innymi kategoriami) czy
zatrzymać rollout na obecnym pokryciu.

---

## 11. Rekomendacja dalszego zakresu (nie rozpoczęta)

Skoro wszystkie 16 województw mają wykonane discovery, sensowne kolejne
kierunki (żaden nie rozpoczęty, wymaga osobnej zgody Adama):
- głębsze fale w województwach z niską liczbą źródeł (1 źródło:
  Podkarpackie, Podlaskie, Małopolskie ma 2, Śląskie 1, Opolskie 1,
  Warmińsko-Mazurskie 1) — więcej miast/instytucji per województwo;
- ponowna, inna kategoria dla województw z 0 GO (Lubelskie, Dolnośląskie,
  Lubuskie) — np. powiatowe zarządy dróg zamiast miejskich portali, które
  konsekwentnie zawodzą w tych trzech województwach;
- decyzja Adama o zatrzymaniu Etapu F na obecnym pokryciu i przejściu do
  pełnego podsumowania projektu (zgodnie z `MASTER_ROADMAP_V2.md` §0).

Żadna z tych opcji nie jest rozpoczęta w tym bloku.
