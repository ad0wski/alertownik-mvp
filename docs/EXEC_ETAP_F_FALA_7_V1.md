# Etap F — Fala 7: Małopolskie + Śląskie

**Data:** 2026-07-30
**Status:** ZAKOŃCZONA ✅

Metoda weryfikacji niezmienna przez cały blok: bezpośredni request HTTP do
`{domena}/wp-json/wp/v2/posts?per_page=N`, ocena statusu HTTP, typu
zawartości i — dla działających endpointów — próbki tytułów/dat pod kątem
dominacji treści operacyjnej vs przetargi/PR/rekrutacja/administracja. Brak
subagentów w całym bloku (post-incydentowy zakaz w CLAUDE.md).

---

## 1. Baseline (potwierdzony na starcie tej sesji, bez zmian)

- Git: `main` = `origin/main` = `110028a` (głowa Fali 6), working tree
  czysty poza niepowiązanym `.vscode/`.
- `SAFE_CHECK_SOURCE_IDS` = 39, `OFFICIAL_SOURCE_CHECKS` = 44.
- Production: strona główna 200, oba endpointy cron (`write-candidates`,
  `auto-publish-trusted-source`) 503.
- Supabase (read-only): alerts 8 (5 published), source_notice_candidates 8
  (6 pending), alert_sources 4, source_checks 2, scheduled_writer_runs 7,
  automation_identities 2, operational_notification_events 1.

Wszystkie te liczby zweryfikowane osobiście na starcie tej sesji i zgodne
1:1 z raportem końcowym Fali 6 — zero rozbieżności.

---

## 2. Pełne zestawienie GO/NO-GO — 69 kandydatów łącznie

### Małopolskie — 29 sprawdzonych, **2 GO**

| Domena/instytucja | Kategoria | Wynik | Powód |
|---|---|---|---|
| Kraków (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Tarnów (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Nowy Sącz (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Zakopane (miasto) | urząd miasta | NO-GO | przekierowanie na inny CMS, 404 na wp-json |
| Oświęcim (miasto) | urząd miasta | NO-GO | wp-json 200 JSON, ale zdominowane przez ogłoszenia o dzierżawie nieruchomości i PR |
| Chrzanów (miasto) | urząd miasta | NO-GO | brak połączenia / 404 |
| Olkusz (miasto) | urząd miasta | NO-GO | brak połączenia |
| Wadowice (miasto) | urząd miasta | NO-GO | wp-json 200 JSON, ale ogólny portal PR/wydarzenia |
| Bochnia (miasto) | urząd miasta | NO-GO | wp-json 200 JSON (bochnia.eu), ale mieszany kanał — ok. 1/3 operacyjne w skali 12, reszta wydarzenia/PR |
| Brzesko (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Gorlice (miasto) | urząd miasta | NO-GO | brak połączenia |
| Limanowa (miasto) | urząd miasta | NO-GO | wp-json 200 JSON, ale ogólny portal PR/kultura |
| Myślenice (miasto) | urząd miasta | NO-GO | przekierowanie do strony głównej HTML |
| Nowy Targ (miasto) | urząd miasta | NO-GO | brak połączenia / 404 |
| Sucha Beskidzka (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Miechów (miasto) | urząd miasta | NO-GO | HTML, nie JSON |
| ZDMK Kraków | drogi miejskie | NO-GO | wp-json istnieje, ale zwraca pusty feed (`/wp/v2/posts` bez treści — aktualności prawdopodobnie w niestandardowym typie wpisu) |
| MPK Kraków | transport | NO-GO | 404 na wp-json (nie WordPress) |
| MPK Tarnów | transport | NO-GO | HTTP 500 |
| **Tarnowska Komunikacja** | **transport** | **GO** | wp-json 200 JSON, 11/12 próbkowanych wpisów w pełni operacyjne (zmiany rozkładów, skrócone trasy, objazdy) |
| Wieliczka (gmina) | gmina | NO-GO | przekierowanie, 404 na wp-json |
| Skawina (gmina) | gmina | NO-GO | brak połączenia |
| Zabierzów (gmina) | gmina | NO-GO | HTTP 403 |
| Krzeszowice (gmina) | gmina | NO-GO | brak połączenia |
| Trzebinia (gmina) | gmina | NO-GO | 404 na wp-json |
| Chełmek (gmina) | gmina | NO-GO | 404 na wp-json |
| ZDPK Kraków (drogi powiatowe) | drogi | NO-GO | przekierowanie do strony głównej HTML |
| Wodociągi Kraków (MPWiK) | woda | NO-GO | HTTP 403 |
| **ZDW Kraków** | **drogi** | **GO** | wp-json 200 JSON, 6/6 i 12/12 próbkowanych wpisów w pełni na temat inwestycji drogowych, zero PR |

### Śląskie — 40 sprawdzonych, **1 GO**

| Domena/instytucja | Kategoria | Wynik | Powód |
|---|---|---|---|
| Katowice (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Częstochowa (miasto) | urząd miasta | NO-GO | HTML, nie JSON |
| Bielsko-Biała (miasto, 2 domeny) | urząd miasta | NO-GO | HTTP 403 / 404 |
| Gliwice (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Zabrze (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Bytom (miasto) | urząd miasta | NO-GO | 404 / brak połączenia |
| Rybnik (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Sosnowiec (miasto) | urząd miasta | NO-GO | wp-json 200 JSON, ale ogólny portal PR/kultura |
| Dąbrowa Górnicza (miasto) | urząd miasta | NO-GO | wp-json 200 JSON, ale feed praktycznie pusty (2 wpisy) |
| Chorzów (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Ruda Śląska (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Tychy (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Jaworzno (miasto) | urząd miasta | NO-GO | wp-json 200 JSON, ale ogólny portal PR/wydarzenia |
| Mysłowice (miasto) | urząd miasta | NO-GO | 404 / przekierowanie |
| Siemianowice Śląskie (miasto) | urząd miasta | NO-GO | wp-json 200 JSON, ale zdominowane przez PR/wydarzenia (1/6 operacyjne) |
| Świętochłowice (miasto) | urząd miasta | NO-GO | wp-json 200 JSON, ale tylko 2/12 operacyjne, reszta webinary/programy/PR |
| Piekary Śląskie (miasto) | urząd miasta | NO-GO | wp-json 200 JSON, ale ogólny portal PR |
| Zawiercie (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Tarnowskie Góry (miasto) | urząd miasta | NO-GO | wp-json 200 JSON, ale zero operacyjnej treści w próbce |
| Racibórz (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Wodzisław Śląski (miasto) | urząd miasta | NO-GO | HTTP 403 |
| Cieszyn (miasto) | urząd miasta | NO-GO | 404 / brak połączenia |
| Będzin (miasto) | urząd miasta | NO-GO | HTTP 403 / brak połączenia |
| Knurów (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Mikołów (gmina) | gmina | NO-GO | wp-json 200 JSON, ale zdominowane przez planowanie przestrzenne/PR (1/6 operacyjne) |
| Pszczyna (gmina) | gmina | NO-GO | 404 na wp-json |
| Żory (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Jastrzębie-Zdrój (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| Ustroń (miasto) | urząd miasta | NO-GO | HTML, nie JSON |
| **ZDW Katowice** | **drogi** | **GO** | wp-json 200 JSON, większość próbkowanych wpisów (6 i 8, dwukrotnie zweryfikowane) o inwestycjach drogowych, nieliczne administracyjne/PR |
| ZTM (następca KZK GOP) | transport | NO-GO | strona to SPA/HTML, nie WordPress REST |
| GPW Katowice (wodociągi) | woda | NO-GO | 404 na wp-json (własny CMS PHP) |
| MZK Tychy | transport | NO-GO | brak połączenia (domena nie istnieje) |
| PKM Katowice | transport | NO-GO | wp-json 200 JSON, ale wyłącznie ogłoszenia PR o zakupie taboru, bardzo rzadkie wpisy |
| MZK Rybnik | transport | NO-GO | brak połączenia |
| Bieruń (gmina) | gmina | NO-GO | 404 na wp-json |
| Lędziny (gmina) | gmina | NO-GO | 404 na wp-json |
| Orzesze (gmina) | gmina | NO-GO | 404 na wp-json |
| Żywiec (miasto) | urząd miasta | NO-GO | 404 na wp-json |
| WCZK Katowice (CZK) | CZK | NO-GO | podstrona portalu gov.pl (katowice.uw.gov.pl) — brak stabilnego API, wymagałby dedykowanego parsera (poza zakresem) |

---

## 3. Podsumowanie liczbowe

| Województwo | Sprawdzonych | GO |
|---|---|---|
| Małopolskie | 29 | 2 (tarnowska-komunikacja, zdw-krakow) |
| Śląskie | 40 | 1 (zdw-katowice) |
| **Razem** | **69** | **3** |

Cel briefu (12–15 na województwo) przekroczony celowo dla obu — niski
wskaźnik trafień (miejskie kanały WordPress w tych dwóch województwach są w
większości ogólnymi portalami PR/kultura, nie operacyjnymi kanałami
alertowymi) wymagał szerszego przeszukania, aby honestly ustalić realny
zakres pokrycia, zamiast zatrzymać się arbitralnie na dolnej granicy celu.

---

## 4. Zaimplementowane źródła (3, wszystkie check-only)

| id | Nazwa | Kategoria | apiUrl |
|---|---|---|---|
| `tarnowska-komunikacja` | Tarnowska Komunikacja (MPK Tarnów + linie regionalne) | transport | `https://tarnowska-komunikacja.pl/wp-json/wp/v2/posts?per_page=6` |
| `zdw-krakow` | Zarząd Dróg Wojewódzkich w Krakowie | roads | `https://zdw.krakow.pl/wp-json/wp/v2/posts?per_page=6` |
| `zdw-katowice` | Zarząd Dróg Wojewódzkich w Katowicach | roads | `https://www.zdw.katowice.pl/wp-json/wp/v2/posts?per_page=6` |

Wszystkie trzy: `localities: []` (poza pilotażem, uczciwie), adapter
`wordpress_rest` przez istniejący `parseTransportRoadsRestPosts` (ten sam
filtr słów kluczowych co Fala 5/6's transport/roads sources — żaden nowy
parser). Żadne z trzech nie jest na `DEFAULT_ALLOWED_WRITE_SOURCE_IDS` ani
`DEFAULT_AUTO_PUBLISH_SOURCE_IDS` — niezmienne od Fali 1.

**Liczniki przed/po:**
- `SAFE_CHECK_SOURCE_IDS`: 39 → 42
- `OFFICIAL_SOURCE_CHECKS`: 44 → 47

---

## 5. Zmienione pliki

- `src/lib/officialSourceChecklist.ts` — 3 nowe wpisy + komentarz Fala 7
- `src/lib/sourceCheck.ts` — 3 nowe id w `SAFE_CHECK_SOURCE_IDS`
- `src/lib/sourceParsers/pageParser.ts` — 3 nowe wpisy w
  `REST_PARSERS_BY_SOURCE_ID` (wszystkie → `parseTransportRoadsRestPosts`)
- `tests/e2e/sourceScaleEtapFWave7Batch.spec.ts` — nowy plik, parametryzowane
  testy batcha (wzorowany na `sourceScaleEtapFWave6Batch.spec.ts`)
- `tests/e2e/cronCheckSourcesRoute.spec.ts` — liczniki 39→42, lista id,
  successfulSources 38→41
- `tests/e2e/sourceCheck.spec.ts` — pełna lista `SAFE_CHECK_SOURCE_IDS`
  (42 pozycje)
- `tests/e2e/sourceChecklist.spec.ts` — `OFFICIAL_DOMAINS` +3,
  `EXPECTED_EMPTY_LOCALITIES_IDS` +3
- `tests/e2e/sourceHealth.spec.ts` — `apiSupported` 39→42, lista id

Żaden plik SQL, RLS, `.env.local`, allowlisty writera/auto-publish, ani
konfiguracji Vercel/Supabase nie został dotknięty.

---

## 6. Wyniki testów (Green Gate)

- `npm run check` (typecheck + lint + build): **PASS**, zero błędów, zero
  nowych ostrzeżeń.
- `npm run test:pwa`: **25/25 PASS**.
- `npm run test:e2e` (pełny): **1721/1721 PASS** (0 failed).
- Security/allowlist audit: brak sekretów/tokenów/kluczy w diffie (grep
  czysty); `tarnowska-komunikacja`/`zdw-krakow`/`zdw-katowice` nieobecne w
  `scheduledWriter.ts`/`trustedSourceAutoPublish.ts` (potwierdzone grep);
  `DEFAULT_ALLOWED_WRITE_SOURCE_IDS` i `DEFAULT_AUTO_PUBLISH_SOURCE_IDS`
  niezmienione (testy to pinują).

---

## 7. Wdrożenie

Branch `etap-f-fala-7-malopolskie-slaskie` → commit → push → Preview →
smoke test Preview → fast-forward merge do `main` → push `main` →
Production deployment → smoke test Production. Szczegóły commit
hash/deployment URL w raporcie końcowym czatu.

Potwierdzenie zerowych zapisów: żadna operacja Supabase w tym bloku poza
`SELECT`. Oba endpointy cron (`write-candidates`,
`auto-publish-trusted-source`) pozostają 503 przed i po tym bloku —
weryfikowane bezpośrednim requestem HTTP do Production.

---

## 8. Stan roadmapy A–F

| Etap | Status |
|---|---|
| A (techniczny) | ✅ ukończony |
| A (walidacja użytkowników) | częściowo — próg testerów nie osiągnięty (Google Play), rekrutacja odrębnym blokiem |
| B | ✅ ukończony (AI Draft Generator) |
| C | ✅ ukończony (Source Monitor + jakość) |
| D | ✅ ukończony (Scheduled Checks/Writer, controlled write verified) |
| E | ✅ ukończony formalnie (closure record, incydent obsłużony) |
| F | **7 fal ukończonych**, 12 województw przebadanych realnym HTTP discovery (Mazowieckie, Łódzkie, Wielkopolskie, Świętokrzyskie, Kujawsko-Pomorskie, Pomorskie, Zachodniopomorskie, Lubelskie, Podkarpackie, Podlaskie, Małopolskie, Śląskie), **11** województw z ≥1 aktywnym źródłem (Lubelskie przebadane w Fali 6 — 16 kandydatów, 0 GO — nadal bez aktywnego źródła), `SAFE_CHECK_SOURCE_IDS` = 42, `OFFICIAL_SOURCE_CHECKS` = 47 |

---

## 9. Województwa pozostające po Fali 7

**Bez żadnego discovery:** Dolnośląskie, Opolskie, Lubuskie,
Warmińsko-Mazowieckie (4 województwa).

**Przebadane, ale wciąż bez aktywnego źródła:** Lubelskie (Fala 6 sprawdziła
16 kandydatów, 0 GO — kandydat do ponownego, głębszego przeszukania w
przyszłej fali, nie do porzucenia).

---

## 10. Rekomendacja Fali 8 (nie rozpoczęta)

Kolejne nieobjęte województwa: Dolnośląskie, Opolskie, Lubuskie,
Warmińsko-Mazowieckie — ten sam wzorzec: HTTP-only discovery, priorytet
drogi/transport/CZK/odpady nad wodociągami (Fala 5/6/7 potwierdziły, że
regionalne zarządy dróg i przewoźnicy dają czystszy sygnał niż urzędy
miast czy wodociągi), zero subagentów, zero zapisów. Po Fali 8 wszystkie
16 województw miałoby przynajmniej jedno badane pokrycie, co byłoby
naturalnym momentem na przegląd całego Etapu F przed ewentualnym
przejściem do innej fazy roadmapy.
