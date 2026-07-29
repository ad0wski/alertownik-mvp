# Sprint 185A — Partner Demo v1: publiczna strona /demo

Status: **wdrożone na Production.**

Data: 2026-08-01 (Dzień 18).

---

## 1. Co dokładnie wdrożono

Nowa, publiczna, niewymagająca logowania trasa **`/demo`** — krótka (2–3 minuty czytania), pisana prostym językiem, bez żargonu technicznego (`cron`, `RLS`, `parser`, `dedup`), przeznaczona do bezpośredniego wysłania jednej gminie/powiatowi/partnerowi.

`/partnerzy` pozostaje bez zmian — nadal pełna strona współpracy (typy współpracy, kontakt, uczciwe zastrzeżenia), użyteczna do realnej rozmowy o współpracy, nie do pierwszego, szybkiego zerknięcia.

### Audyt `/partnerzy` (Część B)

- Co nadaje się bez zmian: sekcje „Gdzie jesteśmy dzisiaj”, „Komu pomagamy”, realne zrzuty ekranu, 4-krokowy scenariusz, „Uczciwe zastrzeżenia” — wszystko trafne i aktualne.
- Co jest zbyt techniczne/długie dla urzędnika przy pierwszym kontakcie: cała strona to 8 sekcji + 5 kart form współpracy — dobre do rozmowy, za długie do samodzielnego wysłania jako pierwszy link.
- Czego brakowało do samodzielnego demo: krótszej, samodzielnej wersji bez listy 5 form współpracy i bez sekcji negocjacyjnych.

Decyzja: nie skracać `/partnerzy` (nadal użyteczna), tylko dodać osobną, krótszą `/demo`.

### Struktura `/demo`

1. Nagłówek „Lokalne komunikaty w jednym miejscu” + jedno zdanie problemu.
2. „Co robi Alertownik” — 4 punkty.
3. „Jak to działa” — 4 kroki (oficjalne źródło → analiza → alert → mieszkaniec).
4. „Zobacz sami” — realny zrzut ekranu (`/screenshots/alerty-narrow.png`, bez retuszu).
5. „Obecny zakres pilotażu” — Gmina Michałowice, Miasto Pruszków, Powiat Pruszkowski; kategorie: drogi, komunikaty gminne, transport (WKD), wodociągi.
6. „Uczciwie o statusie” — wczesny pilot, niezależny projekt, nie oficjalna aplikacja żadnej gminy/WKD/PGE, część źródeł sprawdzana automatycznie, ale każdy alert zatwierdza człowiek.
7. „Zobacz więcej” — 3 CTA: „Zobacz działającą aplikację →” (`/`), „Zobacz wszystkie alerty →” (`/alerty`), „Zgłoś zainteresowanie pilotażem →” (mailto na istniejący publiczny adres `alertownik.kontakt@gmail.com`, nie prywatny adres Adama).

## 2. Zmienione pliki

- `src/app/demo/page.tsx` (nowy) — strona `/demo`.
- `src/lib/feedbackMailto.ts` — nowa funkcja `buildPilotInterestMailto()`, ten sam wzorzec co pozostałe mailto w tym pliku.
- `tests/e2e/demoPage.spec.ts` (nowy) — 13 testów.

## 3. Wyniki testów

- **13/13** testów `/demo` (status 200, nagłówek, 3 CTA i ich href, nazwany zakres pilotażu, uczciwy status, brak przechwalania się pełną automatyzacją, brak linków do admina/loginu w treści strony, brak żargonu technicznego, prawdziwy zrzut ekranu, dostępność klawiaturowa, brak scrolla poziomego na 375/390/414/1280px).
- `npm run check` — zielony (typecheck + lint + build).
- Pełny Playwright — **1452/1452**, zero regresji (środowisko sprawdzone czyste przed uruchomieniem: brak zawieszonych procesów `next dev`, ~1.5GB wolnej pamięci).

## 4. Preview i Production

- Preview zbudowany czysto (logi bez błędów), zweryfikowany wizualnie przez przeglądarkę (Chrome + rozszerzenie Claude in Chrome) — treść, zrzut ekranu i CTA wyglądają dokładnie zgodnie z projektem, brak elementów urwanych czy nakładających się.
- Fast-forward merge do `main` → Production redeploy → **smoke test zielony**: `/`, `/alerty`, `/partnerzy`, `/demo`, `/admin/sources` → 200; `/api/cron/write-candidates` i `/api/cron/auto-publish-trusted-source` → 503 (fail-closed, bez zmian).
- Zweryfikowany dokładny deployowany commit (`dd0ce2b`).

## 5. Potwierdzenie zerowych zmian w bazie i flagach

- Read-only zapytanie: `source_notice_candidates` dla `powiat-pruszkowski-wiadomosci` = **0** wierszy, bez zmian.
- `SCHEDULED_WRITES_ENABLED` i `SCHEDULED_AUTO_PUBLISH_ENABLED` — bez zmian (503 na obu endpointach, przed i po).
- Żadna migracja SQL, żadna zmiana RLS, żaden nowy sekret.

## 6. Link do publicznego /demo

**https://alertownik-mvp.vercel.app/demo**

## 7. Gotowa wiadomość outreachowa (przygotowana, NIE wysłana)

> Cześć! Piszę w sprawie Alertownika — niewielkiego, niezależnego projektu, który zbiera lokalne komunikaty (drogi, wodociągi, transport, ogłoszenia gminne) w jednym miejscu dla mieszkańców Komorowa, Pruszkowa i okolic. To wczesny pilotaż, wciąż rozwijany, bez żadnych zobowiązań z Waszej strony.
>
> Przygotowałem krótkie demo (2–3 minuty): https://alertownik-mvp.vercel.app/demo
>
> Byłbym bardzo wdzięczny za kilka zdań opinii — czy taki format komunikatów ma sens, czy czegoś ważnego brakuje, i czy widzicie potencjał w małym, niezobowiązującym pilotażu dla Waszej okolicy. Dziękuję za czas!

## 8. Gotowy scenariusz 5-minutowego demo (przygotowany, NIE wykonany)

1. **Problem** (30 s) — ważne informacje dla mieszkańców są dziś rozproszone po wielu stronach urzędów i przewoźników.
2. **Przykład komunikatu** (1 min) — pokaż jeden realny, aktualny alert na `/alerty` (miejsce, data, źródło).
3. **Działająca aplikacja** (1.5 min) — strona główna, wyszukiwanie, filtrowanie kategorii, „Moja okolica”.
4. **Bezpieczeństwo i źródła** (1 min) — wyłącznie oficjalne źródła, ręczna weryfikacja przed publikacją, deduplikacja, niezależność projektu.
5. **Prośba o feedback** (1 min) — czy format jest zrozumiały, czego brakuje, czy widzą sens małego pilotażu.

## 9. Lista pytań do partnera (przygotowana)

1. Jakie komunikaty są dla Was najważniejsze?
2. Gdzie obecnie publikujecie te informacje?
3. Które informacje mieszkańcy najczęściej przeoczają?
4. Czy obecny format Alertownika jest wystarczająco prosty?
5. Czy widzicie sens małego, niezobowiązującego pilotażu?

## 10. Blockery

Brak. Żaden krok nie wymagał sekretu, SQL ani nieodwracalnej decyzji.

## 11. Czy Dzień 18 można uznać za zakończony

**Tak.** Cel Dnia 18 (podniesienie gotowości Gate 3 przez publiczną stronę demo) został zrealizowany end-to-end: kod, testy, Preview, Production, smoke test, materiały outreachowe — wszystko gotowe, nic nie wysłano bez wiedzy Adama.
