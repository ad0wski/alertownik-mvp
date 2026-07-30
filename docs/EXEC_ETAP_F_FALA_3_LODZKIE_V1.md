# Etap F, Fala 3 — pierwsze źródła z województwa łódzkiego

Status: **6 źródeł aktywowanych check-only na Production. Zero zapisów,
zero writera, zero auto-publish.**

Data: 2026-07-30. Wszystkie 16 kandydatów osobiście zweryfikowanych
rzeczywistym HTTP requestem przez głównego agenta — **zero subagentów w
całym tym bloku**, zgodnie z zakazem po incydencie (`CLAUDE.md`).

---

## 1. Metodologia

Discovery: WebSearch + bezpośredni `WebFetch` na
`{domena}/wp-json/wp/v2/posts?per_page=3`, wykonane osobiście. Każde
źródło zakwalifikowane jako GO zweryfikowane **dwukrotnie** (osobny fetch
w odstępie czasu w tej samej sesji) — potwierdzone stabilne, nie
przypadkowe. Priorytet: spółki wodociągowe (najbardziej sprawdzony,
stabilny wzorzec z Fal 1–2), pierwsza fala celowo wychodzi poza
województwo mazowieckie.

## 2. Wszystkie 16 osobiście sprawdzonych kandydatów

| Domena | Instytucja/miasto | Wynik | Powód |
|---|---|---|---|
| zwik.lodz.pl | ZWiK Łódź | ❌ NO-GO | HTTP 500 (potwierdzone dwukrotnie, błąd strukturalny) |
| zwik.pabianice.pl | ZWiK Pabianice | ✅ **GO** | Realne komunikaty o awariach (Warszawska/Batorego), zweryfikowane 2× |
| www.wodkan.zgierz.pl | Wodociągi i Kanalizacja Zgierz | ✅ **GO** | Realne komunikaty (awaria, przerwa w dostawie), zweryfikowane 2× |
| pwik.piotrkow.pl | Piotrkowskie Wodociągi i Kanalizacja | ✅ **GO** | Realne komunikaty o awariach sieci, zweryfikowane 2× |
| www.zgwk.pl | ZGWK Tomaszów Mazowiecki | ❌ NO-GO | Realny endpoint, ale treść wyłącznie edukacyjna/PR (segregacja odpadów, wycieczki szkolne) |
| wodkan-belchatow.pl | WOD-KAN Bełchatów | ❌ NO-GO | Realny endpoint, próbka 6 wpisów: 5/6 to oferty pracy/PR/konkurs fotograficzny, tylko 1 potencjalnie operacyjny |
| www.mpwikzdw.com.pl | MPWiK Zduńska Wola | ❌ NO-GO | Realny endpoint, ale treść wyłącznie przetargowa (ten sam wzorzec co Ciechanów/Ostrów Mazowiecka z Fali 2) |
| www.pwik.kutno.pl | PWiK Kutno | ❌ NO-GO | HTTP 404 |
| www.mpwiksieradz.pl | MPWiK Sieradz | ❌ NO-GO | HTTP 404 |
| wodkan-skierniewice.com.pl | WOD-KAN Skierniewice | ❌ NO-GO | HTTP 401 Unauthorized |
| pgk-radomsko.pl | PGK Radomsko | ❌ NO-GO | HTTP 404 |
| pgkimal.pl | PGKiM Aleksandrów Łódzki | ✅ **GO** | Realne komunikaty „Brak wody!", zweryfikowane 2× |
| opkspzoo.eu | OPK Ozorków | ❌ NO-GO | Błąd certyfikatu TLS (hostname mismatch) |
| www.pkgkl.pl | PK Gminy Konstantynów Łódzki | ❌ NO-GO | Błąd certyfikatu TLS (hostname mismatch) |
| mzwikglowno.pl | MZWiK Głowno | ✅ **GO** (najsłabszy sygnał) | Realny endpoint, mieszana treść (apel o oszczędzanie wody, 1 przetarg) — filtr operacyjności obsługuje, kontrolowany check zwrócił 0 propozycji na tej konkretnej próbce (poprawne, fail-closed) |
| komunalne.wielun.pl | Przedsiębiorstwo Komunalne Wieluń | ✅ **GO** | Wszystkie próbkowane wpisy w pełni operacyjne (przerwy w dostawie wody z ulicami i datami), zweryfikowane 2× |

**Nie zbadane (brak znalezionej dedykowanej domeny lub API):** Łowicz
(Gminna Spółka Wodna, brak strony), MPK Łódź (transport — strona istnieje,
ale brak wykrytego API, celowo nie badane głębiej w tej fali zgodnie z
briefem: „nie buduj kruchego scrapera").

## 3. Wynik: 6 GO, 10 NO-GO — batch nie naciągany do górnej granicy

Zgodnie z briefem: nie dodano źródeł tylko dla osiągnięcia liczby. 6 GO
mieści się w wymaganym przedziale 5–10.

## 4. Wspólny adapter

**`wordpress_rest`** — identyczny mechanizm co Fale 1–2, zero nowego kodu
parsera (domyślny filtr `parseWordpressRestPosts`).

## 5. Realny kontrolowany check (6/6)

Wykonany przez bezpośrednie wywołanie `fetchAndParseManualCheck` (funkcja
używana przez `/api/sources/check`, zero zapisu do Supabase — potwierdzone
czytaniem kodu). Jednorazowy skrypt, usunięty po użyciu.

| id | Fetch | Propozycje | Przykład |
|---|---|---|---|
| zwik-pabianice | ✅ | 5 | „Awaria wodociągu ul. Warszawska/Batorego" |
| wodkan-zgierz | ✅ | 2 | „AWARIA" / „PRZERWA W DOSTAWIE WODY" |
| pwik-piotrkow | ✅ | 5 | „Awaria na sieci wodociągowej –ul. Prosta 28" |
| pgkim-aleksandrow-lodzki | ✅ | 5 | „Brak wody !" |
| komunalne-wielun | ✅ | 5 | „przerwa w dostawie wody w dniu 30.07.2026 : Urbanice" |
| mzwik-glowno | ✅ | 0 (poprawne — filtr odrzucił próbkę bez operacyjnej treści) | — |

Zero 500/timeout, wszystkie permalinki prowadzą do oficjalnych domen z §2.

## 6. Potwierdzenie: wyłącznie check-only

Żadne z 6 źródeł nie zostało dodane do `DEFAULT_ALLOWED_WRITE_SOURCE_IDS`
ani `DEFAULT_AUTO_PUBLISH_SOURCE_IDS` (oba niezmienione, potwierdzone
testami parametryzowanymi). Pierwsza fala poza województwem mazowieckim —
`localities: []`, ten sam uczciwy wzorzec co Fale 1–2.
