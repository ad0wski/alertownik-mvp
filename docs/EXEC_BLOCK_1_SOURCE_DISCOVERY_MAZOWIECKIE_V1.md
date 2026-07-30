# Blok Wykonawczy 1 — discovery pierwszego batcha źródeł (Etap E)

Status: **read-only discovery zakończone. Zero źródeł aktywowanych na
Production.**

Data: 2026-08-03 (Blok Wykonawczy 1, po Sprincie 188A).

---

## 1. Metodologia

Discovery wykonane wyłącznie przez realne zapytania HTTP (WebSearch do
znalezienia kandydatów + WebFetch do weryfikacji `{domena}/wp-json/wp/v2/posts?per_page=1`
zwracającego prawdziwy JSON, nie zgadywanie). Główny agent niezależnie
zweryfikował ponownie 3 z 7 wyników (`ekoraszyn.pl`, `bpwik.pl`, `opwik.com`)
— wszystkie potwierdzone jako żywe, prawdziwe REST API z realną treścią
operacyjną (komunikaty o pracach na sieci/zakazach podlewania).

Przetestowano ok. 18 domen. Portale gminne (`raszyn.pl`, `nadarzyn.pl`,
`brwinow.pl`, `milanowek.pl`, `piaseczno.eu`) jednolicie zwróciły 404/401 na
`/wp-json/` — działają na innym niż WordPress systemie CMS typowym dla
polskich portali samorządowych. Produktywnym segmentem okazały się **spółki
komunalne wodociągowe** — dokładnie ten sam wzorzec instytucjonalny co
istniejące, działające źródło pilotażu (`wodociagimichalowice.pl`).

## 2. Zweryfikowany batch: `wordpress_rest`, 7 źródeł

| Instytucja | Lokalizacja (gmina/powiat) | Oficjalny URL | Adres REST (zweryfikowany) | Kategoria | Gotowość | Ryzyka/uwagi |
|---|---|---|---|---|---|---|
| EKO-RASZYN Sp. z o.o. | Gmina Raszyn, pow. pruszkowski | https://www.ekoraszyn.pl | `/wp-json/wp/v2/posts?per_page=1` | water | wysoka | Sąsiedni powiat istniejącego pilotażu — łatwy sanity-check dedupu |
| Brwinowskie Przedsiębiorstwo Wodociągów i Kanalizacji | Gmina Brwinów, pow. pruszkowski | https://bpwik.pl | `/wp-json/wp/v2/posts?per_page=1` | water | wysoka | Treść bezpośrednio operacyjna (zakaz podlewania) |
| Przedsiębiorstwo Komunalne Nadarzyn | Gmina Nadarzyn, pow. pruszkowski | https://pkn.net.pl | `/wp-json/wp/v2/posts?per_page=1` | water | wysoka | Ten sam powiat co istniejący pilotaż |
| ZWiK Ożarów Mazowiecki | Gmina Ożarów Mazowiecki, pow. warszawski zachodni | https://zwik.ozarow-mazowiecki.pl | `/wp-json/wp/v2/posts?per_page=1` | water | wysoka | Komunikat sanepidu o jakości wody (załącznik PDF) |
| PWiK Radzymin | Gmina Radzymin, pow. wołomiński | https://www.pwikradzymin.pl | `/wp-json/wp/v2/posts?per_page=1` | water | wysoka | — |
| PWK „Legionowo" | Miasto Legionowo, pow. legionowski | https://pwklegionowo.com | `/wp-json/wp/v2/posts?per_page=1` | water | wysoka | Treść bywa edukacyjna/PR — filtr słów kluczowych wymaga strojenia, ten sam wzorzec co istniejące `wodociagimichalowice.pl` |
| OPWiK Otwock | Miasto Otwock, pow. otwocki | https://opwik.com | `/wp-json/wp/v2/posts?per_page=1` | water | wysoka | Realny komunikat o pracach na sieci (przerwa w dostawie wody) |

**Jednorodność:** wszystkie 7 to dokładnie ten sam typ adaptera
(`wordpress_rest`), ta sama kategoria instytucjonalna (spółka komunalna
wodociągowa, nie sam portal gminy), a 6 z 7 leży w powiatach bezpośrednio
sąsiadujących z obecnym pilotażem (pruszkowski ×3, warszawski zachodni,
wołomiński, legionowski), 7. (otwocki) nieco dalej. Fetch/parse mechanika
jest identyczna z już działającym `wodociagimichalowice.pl` — zero nowego
kodu parsera.

## 3. Kandydaci odrzuceni / niezweryfikowani z tej fali

Portale gminne (404 na wp-json — inny CMS, kandydaci na `html_generic` w
przyszłej fali, niezweryfikowane głębiej w tym bloku): `raszyn.pl`,
`nadarzyn.pl`, `brwinow.pl`, `milanowek.pl`, `piaseczno.eu` (401, prawdopodobnie
zablokowane, nie nieobecne).

Inne spółki komunalne — 404/błąd certyfikatu, nie potwierdzone jako
`wordpress_rest`: `zwik-grodzisk.pl`, `zgk-konstancin.pl`, `pgk.zyrardow.pl`,
`pwik.wolomin.pl`, `zakladkomunalny.pl` (Halinów), `mzwiksulejowek.pl`,
`wodociagmarecki.pl` (Marki), `zwik.grojec.eu`. **`zwik.lomianki.pl`** ma
realny błąd konfiguracji TLS (certyfikat) — oznaczony jako zepsuty, nie do
użycia bez ręcznej weryfikacji, niezależnie od typu adaptera.

## 4. Wybrany wspólny typ adaptera

**`wordpress_rest`** — jedyny w pełni zaimplementowany, wysokojakościowy
adapter w obecnym kodzie (`parseWordpressRestPosts`, `pageParser.ts`),
całkowicie generyczny względem lokalizacji (potwierdzone w audycie Sprintu
188A). Batch nie wymaga żadnego nowego kodu parsera — różni się wyłącznie
danymi konfiguracyjnymi (`officialUrl`, `apiUrl`, `keywordSetId`) per
instancja.

## 5. Co dalej (poza tym blokiem)

- Fala `html_generic` dla portali gminnych bez REST API — wymaga osobnej,
  płytszej weryfikacji struktury strony (nie tylko fetch), niewykonanej w
  tym bloku.
- Aktywacja tego batcha na Production wymaga: (1) migracji geograficznej
  PROPOSED z Sprintu 188A (opcjonalnie — batch działa też bez niej, z
  `gmina`/`powiat` jako zwykłym stringiem), (2) jawnej zgody Adama, (3)
  dopisania do `officialSourceChecklist.ts`/`SAFE_CHECK_SOURCE_IDS` — żaden z
  tych trzech kroków nie został wykonany w tym bloku.
