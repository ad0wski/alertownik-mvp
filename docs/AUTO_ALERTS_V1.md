# AUTO ALERTS V1 — automatyczne alerty dla `michalowice-komunikaty`

Status (2026-11-20): **zaimplementowane, NIEaktywne na Produkcji.** Wszystkie flagi OFF, migracja SQL nieuruchomiona.

## Przebieg

```
writer (write-candidates, 2×/dzień) → kandydat `pending`
cron auto-publish-trusted-source (1×/dzień, 05:45 UTC):
  1. kontrola „writer stale” (brak zakończonego uruchomienia writera > 26 h)
  2. auto-archiwizacja (published + ends_at + grace → archived)
  3. bramka V1 → publikacja max. 1 alertu / uruchomienie
  4. powiadomienia operacyjne tylko przy problemach
```

Kod: `src/lib/autoAlertsV1.ts` (bramka + orkiestracja), `src/lib/autoArchive.ts`, `src/lib/autoAlertsCycle.ts`,
route `src/app/api/cron/auto-publish-trusted-source/route.ts`. Testy: `tests/e2e/autoAlertsV1.spec.ts`.

## Bramka auto-publish (każdy warunek musi przejść, inaczej kandydat zostaje `pending`)

1. `source_key` ∈ `AUTO_ALERTS_V1_SOURCE_IDS` (w kodzie: tylko `michalowice-komunikaty`) ∩ `SCHEDULED_AUTO_PUBLISH_SOURCE_IDS`.
2. Istniejąca bramka pochodzenia: `pending`, `converted_alert_id IS NULL`, kandydat < 24 h, `source_id` = mapowanie z `SCHEDULED_WRITER_SOURCE_REGISTRY_IDS`.
3. Permalink: https, host `www.michalowice.pl`, ścieżka `/dzieje-sie/aktualnosci/komunikaty/…`, bez query/fragmentu; potem DNS-owy `assertPublicHttpUrl` (SSRF) przed zapisem.
4. Brak HTML w treści, długość ≤ 3000 znaków (sygnał zmiany struktury źródła).
5. Nie jest ogłoszeniem (nabór, oferta pracy, konkurs, kampania, wystawa, koncert, sesja, posiedzenie…).
6. Nie jest zmianą/odwołaniem (odwołan-, zmiana terminu, nowy termin, sprostowanie, aktualizacja, „do odwołania”) → ręcznie.
7. Kategoria: słowa kluczowe + ścisłe frazy (woda: „przerwa w dostawie wody”/„brak wody”; drogi: „organizacja ruchu”, „zamknięcie drogi”…; odpady: „odbiór odpadów”), brak konfliktu kategorii, kategoria włączona w `SCHEDULED_AUTO_PUBLISH_CATEGORIES`.
8. Dokładnie jedna data zdarzenia i dokładnie jeden zakres `godz. HH:MM–HH:MM` (Europe/Warsaw); zgodność z etykietą „Data wydarzenia”, zgodność dnia tygodnia; brak zakresów wielodniowych i dat bez roku.
9. `starts_at < ends_at`, czas trwania ≤ 24 h, `ends_at > teraz` (trwające — OK), start ≤ 45 dni naprzód.
10. Dokładnie jedna miejscowość pilotażowa, bez nazw złożonych (Komorów-Wieś), tytuł nie wskazuje innej miejscowości.
11. Deduplikacja: identyczny permalink → duplikat; ta sama data+miejsce i podobny tekst → duplikat/niejednoznaczny; prawie identyczny tekst, to samo miejsce, inna data → „możliwa zmiana” → ręcznie.
12. Pula alertów do deduplikacji musi się odczytać i nie być pusta (inaczej cały krok fail-closed).
13. Confidence (deterministyczny) ≥ 80: −15 brak słowa kategorii w tytule, −10 brak miejscowości w tytule, −10 brak etykiety „Data wydarzenia”, −10 treść < 80 lub > 1500 znaków.

Opublikowany alert zawsze ma: `source_url` = dokładny permalink, `source_name`, `source_id`, `starts_at`, `ends_at`, `severity = info`, standardowe „co zrobić” dla kategorii. Nie wysyła push.

## Auto-archiwizacja

`published` → `archived` + `auto_archived_at`, gdy `ends_at + grace < teraz`. Grace domyślnie 60 min (env 30–1440; DB wymusza ≥ 30 min).
Pomija drafty, zarchiwizowane, brak/niepoprawne `ends_at`, `ends_at ≤ starts_at`. Maks. 20 na uruchomienie. Idempotentne (UPDATE z warunkiem `status='published'`).
Nigdy DELETE. W bazie: polityka UPDATE tylko dla tożsamości automatyzacji + trigger blokujący zmianę jakiejkolwiek innej kolumny.
Ponieważ cron działa raz dziennie, faktyczne opóźnienie = grace + czas do najbliższego uruchomienia (do ~24 h). UI już wcześniej oznacza zakończone alerty przez `getAlertTimeStatus`, więc opóźnienie jest kosmetyczne.

## Flagi (wszystkie domyślnie OFF)

| Env | Znaczenie |
|---|---|
| `SCHEDULED_CHECKS_ENABLED=true` | istniejący wspólny włącznik automatyzacji |
| `SCHEDULED_AUTOMATION_DRY_RUN=true` | oba kroki tylko oceniają i logują; wygrywa z flagami live |
| `SCHEDULED_AUTO_PUBLISH_ENABLED=true` | live auto-publish |
| `SCHEDULED_AUTO_ARCHIVE_ENABLED=true` | live auto-archiwizacja (nowy) |
| `SCHEDULED_AUTO_PUBLISH_SOURCE_IDS='["michalowice-komunikaty"]'` | allowlista (istniejąca) |
| `SCHEDULED_AUTO_PUBLISH_CATEGORIES='["water"]'` | kategorie (nowy; pusty = nic) |
| `SCHEDULED_AUTO_ARCHIVE_GRACE_MINUTES` | opcjonalnie, domyślnie 60 |
| `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED` | istniejące — maile o problemach |

Rollback: ustaw `SCHEDULED_AUTOMATION_DRY_RUN=true` albo usuń flagę live + redeploy. Bez zmian w kodzie.

## Monitoring (istniejący ledger `operational_notification_events`, cooldown 6 h na typ)

`auto_alert_needs_review` (prawdziwy komunikat, którego nie dało się bezpiecznie opublikować), `auto_publish_failed`,
`auto_archive_failed`, `writer_stale`. Błędy źródła — bez zmian, raportuje je write-candidates.
Normalne działanie i ogłoszenia niebędące alertami nie generują maili. Każda decyzja trafia do `automation_decisions`.

## Zmiany / odwołania komunikatów — V2

V1 nie śledzi ponownie opublikowanych komunikatów. Bezpiecznie robi tylko tyle: komunikat z markerem zmiany/odwołania
albo prawie identyczny z wcześniejszym (to samo miejsce, inna data) **nigdy** nie jest publikowany automatycznie — trafia do ręcznej decyzji z powiadomieniem.
V2: okresowe pobranie permalinku opublikowanego alertu, hash treści, 404/zmiana treści → powiadomienie admina (bez automatycznej edycji).

## Aktywacja

**Warunki wstępne (przed Phase A):** ręczna migracja `docs/sql/PROPOSED_AUTO_ALERTS_V1.sql` + weryfikacja; poprawienie ręcznie alertu Reguły 23.11 (zła data, kategoria, URL); deploy kodu z wszystkimi flagami OFF.

**Phase A — dry run** (`SCHEDULED_CHECKS_ENABLED=true`, `SCHEDULED_AUTOMATION_DRY_RUN=true`, `SCHEDULED_AUTO_PUBLISH_SOURCE_IDS='["michalowice-komunikaty"]'`, `SCHEDULED_AUTO_PUBLISH_CATEGORIES='["water","roads","waste"]'`).
Przejście do B, gdy łącznie:
- ≥ 14 dni i ≥ 3 realne komunikaty wodne ocenione,
- 0 fałszywych `would_publish` (każdy porównany ręcznie z oficjalną stroną: data, godziny, miejsce, permalink),
- 0 `would_archive` dla alertu, który nie powinien być zarchiwizowany,
- 0 błędów kroku (`hadFailure`), `writer_stale` tylko przy realnej awarii,
- każdy ręcznie publikowany w tym czasie alert wodny z Michałowic sprawdzony: czy V1 dałby ten sam wynik.

**Phase B — canary:** `SCHEDULED_AUTOMATION_DRY_RUN` usunięte, `SCHEDULED_AUTO_PUBLISH_ENABLED=true`, `SCHEDULED_AUTO_PUBLISH_CATEGORIES='["water"]'`, `SCHEDULED_AUTO_ARCHIVE_ENABLED=true`.
Każda auto-publikacja sprawdzona przez admina w ciągu 24 h. Natychmiastowy powrót do A przy: jakimkolwiek błędnym polu, duplikacie, błędnej archiwizacji.
Przejście do C po: ≥ 5 poprawnych auto-publikacjach i ≥ 30 dniach bez incydentu.

**Phase C — normal:** dodanie `roads` (potem ewentualnie `waste`) pojedynczo, każda kategoria z własnym mini-canary (≥ 3 poprawne publikacje). Rozszerzenie na inne źródła = osobny projekt (nowy zakres w kodzie, osobne parsery i testy).
