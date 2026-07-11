# Sprint 149 — First Schedule Readiness v1

**Status: READINESS ASSESSMENT ONLY. No `vercel.json`, no Vercel Cron, no
schedule, no env change, no live request was created or executed by this
document or this sprint.** This is a decision document for Adam — every
action item below is explicitly a future, separately-approved step.

---

## 1. Aktualny stan bezpieczeństwa (jak jest dziś)

- **Trzy niezależne bramki**, wszystkie muszą być prawdziwe jednocześnie
  (dziś żadna nie jest ustawiona na produkcji ani domyślnie):
  1. `SCHEDULED_CHECKS_ENABLED=true`
  2. `SCHEDULED_WRITES_ENABLED=true`
  3. Poprawne poświadczenia konta technicznego + jego członkostwo w
     `automation_identities` (weryfikowane przez realne logowanie, nie
     przez odczyt bazy)
- **RLS jako ostateczna granica**, nie tylko kod aplikacji: nawet błąd w
  każdej warstwie kodu powyżej zostałby zatrzymany przez polityki bazy —
  writer nigdy nie ma dostępu do `alerts`, `admin_profiles`, ani
  UPDATE/DELETE na `source_notice_candidates`/`source_checks`.
- **Ograniczenie źródła**: domyślnie wyłącznie `michalowice-komunikaty`
  (`DEFAULT_ALLOWED_WRITE_SOURCE_IDS`), WKD jawnie wykluczone z pisania
  (choć włączone w dry-run).
- **Limit 1 kandydata na wywołanie** (`DEFAULT_MAX_CANDIDATES_PER_INVOCATION`).
- **`published: false` zawsze** — brak jakiejkolwiek ścieżki kodu do
  publikacji; potwierdzone statycznym audytem (jedyny literał
  `published:` w źródle to `published: false`).
- **Izolacja błędów per-źródło** (Sprint 149): błąd jednego źródła
  (fetch, parse, lub błąd zapisu do bazy) nigdy nie przerywa całego
  batcha — każde źródło jest opakowane w try/catch, degraduje się do tego
  samego bezpiecznego kształtu odpowiedzi.
- **Brak Vercel Cron, brak `vercel.json`, brak harmonogramu** — potwierdzone
  ponownie w tym sprincie.

## 2. Co już potwierdził Sprint 148

- Pierwszy, w pełni kontrolowany, ręczny zapis na żywo: **sukces**,
  zweryfikowany 1:1 przez SQL SELECT-only (`candidatesInserted: 1`,
  `published: false`, WKD i `alerts` nietknięte).
- Vercel Deployment Protection poprawnie blokuje nieautoryzowane żądania
  do Preview — pierwsza próba bez bypass secreta została przechwycona
  *przed* dotarciem do aplikacji (potwierdzone: zero śladu w bazie).
- Write mode przywrócony do `false` po teście — bezpieczny stan spoczynku
  potwierdzony jako domyślna praktyka tego projektu.

## 3. Wymagania przed pierwszym harmonogramem

Niezbędne (blokujące):
- [ ] Decyzja Adama o zakresie: tylko Michałowice, tylko Preview czy
      Production, jaka częstotliwość (patrz punkt 7 — świadomie nie
      zgaduję).
- [ ] Osobna bramka zgody: **FIRST SCHEDULE ACTIVATION APPROVAL REQUIRED**
      (patrz punkt 8).

Rekomendowane, nie blokujące dziś (ale silnie zalecane przed aktywacją
realnego harmonogramu, w odróżnieniu od jednorazowych ręcznych testów):
- [ ] Zamknięcie luki race condition opisanej w
      `docs/SPRINT_149_RACE_CONDITION_MIGRATION_PROPOSAL_V1.md` — przy
      jednorazowym ręcznym teście ryzyko nakładających się wywołań jest
      praktycznie zerowe (wymaga przypadkowego podwójnego kliknięcia);
      przy realnym harmonogramie (dwa tiki blisko siebie, retry
      nakładający się na zaplanowane uruchomienie) ryzyko staje się
      realne, nie tylko teoretyczne.
- [ ] Decyzja o monitoringu: czy wystarczy dzisiejszy panel
      `/admin/sources` (Scheduled Writer Monitoring v1, Sprint 149), czy
      Adam chce dodatkowo obserwować Vercel Cron Logs / alerty na błędy.

## 4. Możliwe warianty uruchomienia harmonogramu

### Wariant A — Vercel Cron w Preview (nie realne dla crona)

Vercel Cron **wymaga środowiska Production** — Vercel nie uruchamia
zaplanowanych zadań (`vercel.json` → `crons`) dla deploymentów Preview w
ogóle. **Ten wariant nie istnieje technicznie** — zaznaczam to wprost, bo
byłoby łatwo błędnie założyć, że można "przetestować cron w Preview" tak
jak testowaliśmy ręczny zapis. Nie da się.

### Wariant B — Vercel Cron w Production, wąski zakres (rekomendowany punkt startowy, gdy Adam zdecyduje się aktywować)

| | |
|---|---|
| Środowisko | **Production** (jedyna opcja techniczna dla prawdziwego Vercel Cron) |
| Wymagane sekrety | Te same 4 zmienne co w Preview (`SUPABASE_SCHEDULED_WRITER_EMAIL/PASSWORD`, `CRON_SECRET`, `SCHEDULED_WRITER_SOURCE_REGISTRY_IDS`) + oba kill switche — ale **nowe, osobne wartości dla Production**, nigdy skopiowane z Preview (żeby kompromitacja jednego środowiska nie dotyczyła drugiego) |
| Ryzyka | Production jest środowiskiem, które faktycznie widzą użytkownicy — błąd konfiguracji (np. zapomniany kill switch) miałby realny wpływ, nie tylko na testowy deployment. Race condition (patrz punkt 3) staje się realna przy regularnych uruchomieniach. |
| Wpływ na Production | Bezpośredni — to JEST Production. Wymaga świadomej zgody Adama na dotknięcie Production po raz pierwszy w całym tym łańcuchu sprintów (146–149 celowo trzymały wszystko w Preview). |
| Monitoring | Panel `/admin/sources` (Scheduled Writer Monitoring v1) + Vercel Cron Logs/Runtime Logs dla Production |
| Rollback / kill switch | Natychmiastowy: `SCHEDULED_WRITES_ENABLED=false` w Production (efekt na następnym wywołaniu, bez redeployu kodu) lub usunięcie `crons` z `vercel.json` + redeploy (twardsze wyłączenie) |

### Wariant C — Zewnętrzny scheduler (np. GitHub Actions cron) wywołujący ten sam endpoint w Preview

| | |
|---|---|
| Środowisko | Preview (endpoint już tam działa) — harmonogram żyje POZA Vercel |
| Wymagane sekrety | Te same jak dziś w Preview, żadnych nowych; `CRON_SECRET` musiałby trafić do sekretów GitHub Actions (nowa powierzchnia ekspozycji) |
| Ryzyka | Nowa zależność (GitHub Actions), nowy sekret do zarządzania, Preview deployment URL może się zmieniać między deploymentami — kruche |
| Wpływ na Production | Zero — Production nietknięta |
| Monitoring | Logi GitHub Actions + panel admina |
| Rollback / kill switch | Usunięcie/wyłączenie workflow GitHub Actions, niezależnie od `SCHEDULED_WRITES_ENABLED` jako drugiej warstwy |

### Wariant D — Pozostać przy ręcznych testach, nie aktywować żadnego harmonogramu

| | |
|---|---|
| Środowisko | Bez zmian — Preview, ręczne wywołania jak dotąd |
| Wymagane sekrety | Bez zmian |
| Ryzyka | Brak nowych — status quo |
| Wpływ na Production | Zero |
| Monitoring | Bez zmian |
| Rollback / kill switch | Nie dotyczy — nic nie jest aktywowane |

## 5. Rekomendacja techniczna

**Wariant D dziś, Wariant B jako docelowy, dopiero po zamknięciu luki
race condition.** Uzasadnienie: Wariant A nie istnieje technicznie;
Wariant C wprowadza nową, słabiej kontrolowaną powierzchnię (sekret w
GitHub Actions, kruchy URL Preview) dla wątpliwej korzyści, skoro
Production i tak jest jedynym miejscem gdzie prawdziwy Vercel Cron może
w ogóle zadziałać. Skoro docelowym środowiskiem dla realnego harmonogramu
i tak musi być Production (Wariant B), sensowniejsze jest przygotować
się do niego wprost (zamknąć race condition, potwierdzić monitoring),
niż budować tymczasowe obejście w Preview (Wariant C), które i tak
trzeba będzie porzucić.

## 6. Częstotliwość — celowo NIE zgaduję

Częstotliwość pierwszego harmonogramu powinna wynikać z audytu źródła
(jak często faktycznie pojawiają się nowe komunikaty na stronie gminy
Michałowice — to pytanie o rzeczywisty rytm publikacji tej konkretnej
strony, nie o możliwości techniczne Vercel Cron, które pozwalają na
dowolną częstotliwość aż do raz na minutę). To decyzja Adama po
przejrzeniu historii `source_checks`/kandydatów dla tego źródła, nie coś
do wywnioskowania z kodu.

## 7. FIRST SCHEDULE ACTIVATION APPROVAL REQUIRED

**Żaden z poniższych kroków nie zostanie wykonany bez wyraźnej,
osobnej zgody Adama, punkt po punkcie, w osobnej rozmowie poświęconej
wyłącznie tej decyzji:**

- [ ] Wybór wariantu (B, C, lub pozostanie przy D)
- [ ] Jeśli B: zgoda na pierwszą w tym łańcuchu sprintów zmianę Production
- [ ] Częstotliwość (ustalona po audycie źródła, nie zgadywana)
- [ ] Decyzja o zamknięciu luki race condition przed czy po aktywacji
- [ ] Nowe, osobne sekrety Production (nigdy skopiowane z Preview)
- [ ] Potwierdzenie zakresu: tylko Michałowice, bez WKD, bez zmiany capu
      1 kandydata na wywołanie, bez autopublish

## 8. Potwierdzenie zakresu (niezależnie od wybranego wariantu)

- Tylko `michalowice-komunikaty` — WKD pozostaje wyłączone z zapisu
- Maksymalnie 1 nowy kandydat na wywołanie
- Wyłącznie status `pending` — nigdy `converted`/`archived` z tej ścieżki
- `published: false` zawsze, bez wyjątku
- Bez WKD w pierwszym harmonogramie
- Bez autopublish — każdy kandydat nadal wymaga ręcznej weryfikacji w
  kolejce admina

---

## Jeżeli aktywacja wymaga Production lub nowych sekretów Production

**Tak, wymaga — patrz Wariant B, jedyny technicznie realny sposób na
prawdziwy Vercel Cron.** Nie wykonuję żadnej konfiguracji Production w
ramach tego dokumentu ani tego sprintu. To świadomie zaznaczone jako
wymagające osobnej zgody (punkt 7), nie założone ani nie rozpoczęte.
