# Sprint 176 — Pruszków Controlled Pipeline (Day 8 closeout)

Status: **CLOSED, full success.** First real end-to-end scheduled-writer run on a second source (Miasto Pruszków — aktualności), taken all the way from a controlled `write-candidates` HTTP call through human review to a published public alert. Automation kill switches confirmed off at the end. Documentation-only branch, no merge to `main`.

## 1. Cel Dnia 8

Rozszerzyć zweryfikowany pipeline scheduled-writera (zbudowany i po raz pierwszy uruchomiony w Sprincie 174 na kanarku Michałowice) na drugie źródło — Miasto Pruszków — w pełni kontrolowany, wieloetapowy sposób: audyt ryzyka źródeł → symulacja lokalna → tymczasowa allowlist → jeden kontrolowany request → ręczna weryfikacja kandydata → Approve → draft → publikacja → pełny rollback → dokumentacja.

## 2. Stan wejściowy (start Dnia 8)

- `SCHEDULED_CHECKS_ENABLED=true` (pre-existing od Sprintu 152, nieszkodliwe — tylko dry-run)
- `SCHEDULED_WRITES_ENABLED=false`
- Allowlist writera: domyślna, tylko `michalowice-komunikaty`
- `alerts=7` (4 opublikowane), `source_notice_candidates=4`, `scheduled_writer_runs=2`

## 3. Audyt trzech źródeł (Sprint 175C)

Porównano WKD, Wodociągi Michałowice i Miasto Pruszków pod kątem: aktywności, typu parsera, obecności filtra słów kluczowych, jakości dat/lokalizacji, ryzyka duplikatów/false-positive, aktualnej zawartości live.

- **WKD** — najwyższe ryzyko: parser bez filtra słów kluczowych (`extractBlogPostItems`), realne podobieństwo do już zarchiwizowanego alertu.
- **Wodociągi Michałowice** — bezpieczne, ale źródło aktualnie puste (brak nowych komunikatów do przetestowania).
- **Miasto Pruszków** — najlepsza kombinacja: filtr słów kluczowych obecny (`PRUSZKOW_NOTICE_KEYWORDS_RX`), 2 wcześniej opublikowane alerty z tego źródła (sprawdzona wartość), aktualny, tematyczny komunikat live w momencie audytu.

Rekomendacja: Pruszków.

## 4. Wynik symulacji Pruszkowa (Sprint 175D)

Lokalna, tymczasowa (usunięta po użyciu) reimplementacja parsera + dedup + cap logiki uruchomiona przeciwko prawdziwemu publicznemu WordPress REST API Pruszkowa. Wynik: 3 propozycje (ul. Działkowa, DW nr 719/Nowa Wieś, ul. Bryły), przewidziano `candidatesInserted=1` (najnowsza — ul. Działkowa), pozostałe `cappedSkipped=2`. **Przewidywanie potwierdzone dokładnie w realnym runie.**

Przy okazji policzono realny `textSimilarity()` między ryzykowną propozycją "DW nr 719" (Pruszków) a już opublikowanym alertem Michałowic o tej samej drodze: **0.25** — poniżej nawet progu "ambiguous" (0.6). Potwierdza to architektoniczną lukę: `findExistingCandidateTexts()` porównuje kandydatów tylko w obrębie tego samego `source_key`, nigdy z tabelą `alerts` ani między źródłami.

## 5. Checkpointy aktywacji

Każdy krok zatwierdzony osobno przez Adama w chacie, z checkpointem przed każdym Save/click:

1. Sprint 176A — przygotowanie (nie zapisanie) Production-only wpisu allowlisty
2. Sprint 176B — potwierdzenie Save + jeden redeploy
3. Sprint 176C — przygotowanie (nie zapisanie) `SCHEDULED_WRITES_ENABLED=true` + audyt one-shot skryptu PowerShell
4. Sprint 176D — potwierdzenie Save + jeden redeploy + instrukcje dla Adama
5. Sprint 176E — weryfikacja jednego kontrolowanego runu wykonanego ręcznie przez Adama + przygotowanie rollbacku
6. Sprint 176F — potwierdzenie rollbacku `SCHEDULED_WRITES_ENABLED=false` + usunięcie tymczasowej allowlisty + 2 redeploye
7. Sprint 176G — weryfikacja artykułu źródłowego, Approve, utworzenie i uzupełnienie draftu
8. Sprint 176H — publikacja + dokumentacja (ten dokument)

## 6. Tymczasowa Production allowlista

Na czas jednego kontrolowanego runu ustawiono osobny, Production-only wpis `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS=["pruszkow-aktualnosci"]` w Vercel Environment Variables — nigdy nie edytując istniejącego, osobnego wpisu Preview. Po runie i rollbacku flagi writera usunięto wyłącznie ten Production wpis (potwierdzone przez jednoznaczny dialog potwierdzający "Environments Using This Variable: Production" przed Delete). Preview pozostał nietknięty przez cały czas. Production wrócił do domyślnej allowlisty z kodu (`DEFAULT_ALLOWED_WRITE_SOURCE_IDS = ["michalowice-komunikaty"]`).

## 7. Dokładnie jeden request

Wykonany ręcznie przez Adama przez purpose-built, statycznie zaudytowany, jednorazowy skrypt PowerShell (sekret wpisywany przez `Read-Host -AsSecureString`, nigdy niezapisywany, jedno żądanie GET, zero retry, sekret czyszczony w `finally`). Claude nigdy nie widział sekretu ani nie wysłał tego requesta.

## 8. Wynik requestu

- HTTP 200
- `dryRun=false`
- `sourceKey=pruszkow-aktualnosci`
- `checkedSources=1`, `successfulSources=1`, `failedSources=0`
- `proposalsFound=3`
- `candidatesInserted=1`
- `duplicatesSkipped=0`, `ambiguousCandidates=0`
- `cappedSkipped=2`
- `sourceChecksInserted=0`
- `published=false`

## 9. ID runu

`scheduled_writer_runs.id = 0aafa326-3b1a-4448-959f-4ce8e9115733` — `outcome=success`, czas trwania ~2.5s, zamknięty poprawnie, zero otwartych runów przed i po.

## 10. ID kandydata

`source_notice_candidates.id = 9518079b-b211-4bc0-9667-5b419248c6d7` — "Czasowa organizacja ruchu na ul. Działkowej od 31 lipca 2026 r." (źródło: `pruszkow-aktualnosci`).

## 11. ID alertu

`alerts.id = 5fdb619f-aa40-459e-a107-6206f42a2989`.

## 12. Proces: source → candidate → approve → draft → publish

1. **Source**: WordPress REST API Miasta Pruszkowa (`https://www.pruszkow.pl/wp-json/wp/v2/posts?categories=371`), sparsowane przez `parsePruszkowRestPosts()`.
2. **Candidate**: automatycznie wstawiony przez `write-candidates`, `status=pending`, `candidate_url=null` (parser nie zapisuje bezpośredniego URL).
3. **Weryfikacja**: ręcznie znaleziony bezpośredni permalink artykułu przez REST API (`link` z obiektu posta), potwierdzony jako oficjalna domena `pruszkow.pl`, treść zgodna z kandydatem, brak duplikatu wśród istniejących kandydatów/alertów.
4. **Approve**: kliknięte w `/admin/queue`, `status: pending → approved`.
5. **Draft**: utworzony przez "Utwórz draft z kandydata", uzupełniony ręcznie (kategoria `roads`, lokalizacja "Pruszków, ul. Działkowa", data startu 2026-07-31, brak daty końcowej — nie podana oficjalnie, opis i "co zrobić" oparte wyłącznie na treści oficjalnego artykułu, bezpośredni URL źródła), zapisany jako `status=draft`.
6. **Publish**: kliknięte dokładnie raz w Kreatorze, `status: draft → published`, `published_at` ustawiony.

## 13. Pełny rollback flagi i allowlisty

- `SCHEDULED_WRITES_ENABLED`: `false → true` (Sprint 176D) `→ false` (Sprint 176F), każda zmiana + osobny redeploy Production.
- `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS` (Production): utworzony (176A/B) → usunięty (176F), Preview nietknięty przez cały czas.
- Łącznie 4 redeploye Production w Dniu 8, każdy pojedynczy, bez retry.

## 14. Końcowe liczniki

| Tabela | Przed Dniem 8 | Po Dniu 8 |
|---|---|---|
| alert_sources | 4 | 4 |
| source_checks | 2 | 2 |
| source_notice_candidates | 4 | 5 |
| alerts | 7 | 8 |
| alerts published | 3 | 5 |
| scheduled_writer_runs | 2 | 3 |
| operational_notification_events | 1 | 1 |
| automation_identities | 2 | 2 |
| otwarte scheduled_writer_runs | 0 | 0 |

## 15. Potwierdzenie braku e-maila i automatycznej publikacji

`operational_notification_events` niezmienione (1→1) przez cały dzień. `operationalNotificationRuntimeEnabled=false`, `emailAlertConfig.enabled=false` przez cały czas. Alert opublikowany wyłącznie przez ręczne kliknięcie administratora w Kreatorze — writer nigdy nie miał uprawnień do publikacji (architektonicznie: `published=false` zawsze w odpowiedzi write-candidates).

## 16. Wynik publicznego smoke testu

`/alerty`: alert widoczny dokładnie raz, poprawny tytuł, kategoria "Drogi", lokalizacja "Pruszków, ul. Działkowa", data 31.07.2026, źródło "Miasto Pruszków — aktualności", badge "Nowe / Nadchodzące". DW nr 719 nadal widoczny dokładnie raz, brak duplikatów. Strona główna (`/`) pokazuje domyślnie tylko alerty ze statusem "Trwa" (currently active) w sekcji głównej — nowy alert "Nadchodzące" (start 31.07, jeszcze się nie rozpoczął) poprawnie nie pojawia się tam jeszcze, co jest istniejącym, zamierzonym zachowaniem aplikacji (nie błędem tego sprintu), i staje się widoczny przez link "Zobacz wszystkie alerty →" prowadzący do `/alerty`.

## 17. Znane ograniczenia

- Parser Pruszkowa (`WordpressRestPost.link`) nie zapisuje bezpośredniego URL artykułu do `candidate_url` — musi być znaleziony i wpisany ręcznie przy tworzeniu draftu.
- Brak automatycznej lokalizacji — pole `place` zawsze puste w kandydacie, uzupełniane ręcznie.
- Brak automatycznego przypisania kategorii — zawsze wymaga ręcznej decyzji admina.
- Brak wykrywania daty w treści kandydata/proposal — daty startu/końca zawsze ręcznie odczytywane z oficjalnego źródła.
- Deduplikacja (`findExistingCandidateTexts`) porównuje wyłącznie kandydatów w obrębie tego samego `source_key` — nigdy nie porównuje z tabelą `alerts`, ani między różnymi źródłami. Cross-source duplikaty (np. ten sam fizyczny remont opisany przez dwa różne źródła) są strukturalnie niewykrywalne automatycznie i zależą wyłącznie od ręcznej weryfikacji.
- `content_fingerprint=null` — wtórny, dokładny hash-based guard (`SCHEDULED_WRITER_FINGERPRINT_ENABLED`) pozostaje wyłączony; nie wpływa na główną fuzzy-dedup logikę.
- Mobile QA (390×844, 360×800) nie zostało potwierdzone na prawdziwym mobilnym viewporcie w tym sprincie — narzędzie `resize_window` nie zmieniało realnie `window.innerWidth` w testowanej sesji przeglądarki; zastąpione częściowym, jawnie oznaczonym audytem na poziomie kodu (klasy Tailwind, `min-h-[44px]`, `flex-wrap`).
- Drobne, powtarzające się problemy z klikaniem elementów przez `ref`-based accessibility-tree click w panelu administratora (Vercel UI i `/admin/queue`) — konsekwentnie obchodzone przez bezpośrednie natywne `.click()` na elemencie DOM i odczyt read-only z Supabase do weryfikacji, zamiast polegania na samym UI.

## 18. Rekomendowany następny etap hardeningu

Rozszerzenie parsera Pruszkowa o zapisywanie `WordpressRestPost.link` bezpośrednio do `candidate_url` — usunęłoby to najbardziej pracochłonny ręczny krok (wyszukiwanie oficjalnego linku) przy każdym kolejnym kandydacie z tego źródła. Osobno, do rozważenia: cross-source dedup porównujący nowe kandydaty również z istniejącą tabelą `alerts`, nie tylko z innymi kandydatami tego samego źródła.

## 19. Status automatycznej publikacji

Pełna automatyzacja (source → candidate → draft → publish bez udziału człowieka) pozostaje długoterminowym celem architektury, ale **automatyczna publikacja jest i pozostaje wyłączona** — każdy alert opublikowany do tej pory (Michałowice w Sprincie 174, Pruszków w Sprincie 176) przeszedł przez w pełni ręczną decyzję administratora na etapie Approve, uzupełnienia draftu i finalnego kliknięcia Publish. Writer nie ma i nigdy nie miał technicznej możliwości publikacji.
