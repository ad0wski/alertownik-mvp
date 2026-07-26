# Sprint 173 — Scheduled Source Checks Foundation (Plan Day 6)

**Status: foundation fix implemented and tested. Cron NOT activated, no
Environment Variable changed. Not merged to `main`.**

---

## 1. Audit — what already exists (read before any code)

This sprint's brief describes building "a scheduled source-check
harmonogram" from what reads like a green-field starting point. The audit
found the opposite: **an extensive, already-hardened, already-tested
scheduled-writer system exists from Sprints 142–166**, dormant behind
multiple independent kill switches. Building a new system on top of it
would have violated "nie przebudowuj rzeczy, które już działają." This
sprint's real job was to audit it, find the one genuine gap that would
have broken it for 2 of the 4 current sources, fix that, and document an
activation path — not to reinvent it.

### Existing pieces (all read in full this sprint)

| Piece | File | Status |
|---|---|---|
| Dry-run cron endpoint (all safe-check sources) | `src/app/api/cron/check-sources/route.ts` | Zero writes, by construction (no Supabase import at all — enforced by its own static-import test) |
| Dry-run cron endpoint (Michałowice only) | `src/app/api/cron/check-michalowice/route.ts` | Same zero-write guarantee; **already wired into `vercel.json`'s live cron schedule** (`0 5 * * *`, daily 05:00 UTC) |
| Write-capable cron endpoint | `src/app/api/cron/write-candidates/route.ts` | Four independent kill-switch layers (environment-pairing guard, `SCHEDULED_CHECKS_ENABLED`, `SCHEDULED_WRITES_ENABLED`, writer credentials + `automation_identities` membership); atomic run-locking (open/close history row, Sprint 166C); per-source try/catch isolation; never publishes an alert; never imports any alert-publishing/Builder/candidate-approval helper |
| Dry-run business logic | `src/lib/cronCheckSources.ts` | Auth (constant-time secret comparison), kill switch, source resolution (allowlist-only), per-source fetch+classify |
| Write business logic | `src/lib/scheduledWriter.ts` | Credential resolution, sign-in, duplicate/ambiguous candidate classification, insert construction (`status: pending` always, no other value reachable), source-write allowlist (`SCHEDULED_WRITER_ALLOWED_SOURCE_IDS`, defaults to Michałowice only), first-live-write cap |
| Run history + locking | `src/lib/scheduledWriterHistory.ts`, `scheduledWriterRunSafety.ts` | Atomic open/close via `scheduled_writer_runs`, partial-unique-index-backed lock (one run per trigger+environment at a time), bounded retry (`MAX_FETCH_ATTEMPTS=2`, transient-only) |
| Fetch layer | `src/lib/scheduledSourceFetch.ts` | Bounded-retry HTML fetch — **the one piece with a real gap, fixed this sprint (§2)** |
| Operational notification (optional email layer) | `src/lib/operationalNotification*.ts` | Off by default (`OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED` unset); a fifth independent switch, not touched this sprint |
| Live cron config | `vercel.json` | One entry: `/api/cron/check-michalowice`, daily `0 5 * * *`. **Dry-run only** — points at a zero-write endpoint, not `write-candidates` |

**17 pre-existing test files** already cover kill switches, auth, retry,
timeouts, per-source isolation, no-publish guarantees, concurrency
locking, idempotency, and notification wiring — re-run this sprint (with
two files' outdated assumptions fixed, see §5), not duplicated.

## 2. The real gap — WordPress-REST-backed sources were invisible to the scheduled path

`scheduledSourceFetch.ts` and `cronCheckSources.ts::checkOneSource` only
ever knew how to fetch a source's `officialUrl` as HTML. Sprints 168/169
added two sources — Wodociągi Michałowice and Pruszków aktualności — that
are deliberately checked via their WordPress REST API instead, precisely
*because* their rendered HTML doesn't work (Wodociągi's homepage yields
zero candidates; Pruszków's HTML is bot-blocked). The manual admin-check
path (`manualSourceCheckFetch.ts`, `route.ts`) already got this fix in
Sprints 168/169. **The scheduled path never did.**

This was not a hypothetical risk: if `write-candidates` or `check-sources`
had been pointed at all four sources today, exactly 2 of them would have
failed on every single run, forever — not due to a bug in the new code,
but because the old code was fetching the wrong thing entirely for
sources that were specifically built to need something else.

### Fix (this sprint)

- **`pageParser.ts`**: `REST_PARSERS_BY_SOURCE_ID` — the per-source
  keyword-filter map — moved here from the manual-check route (single
  source of truth now, was previously only in one of the two places that
  needed it).
- **`scheduledSourceFetch.ts`**: gained a REST-fetch branch
  (`ScheduledFetchTarget` with optional `apiUrl`/`parseRestPosts`,
  mirroring `manualSourceCheckFetch.ts`'s own design exactly), with the
  same bounded-retry policy applied to both branches identically.
  Backward compatible — a plain URL string still works exactly as before.
- **`cronCheckSources.ts::checkOneSource`**: same fix for the dry-run
  path, so a dry-run preview of these two sources reports what a real
  scheduled run would actually see, not a misleading permanent error.
- **`write-candidates/route.ts`, `check-sources/route.ts`**: call sites
  updated to pass `apiUrl`/the matching parser through.
- **`check-michalowice/route.ts`**: unaffected (Michałowice has no
  `apiUrl`) — not modified.

## 3. Test-suite hygiene found and fixed along the way

Running the full existing suite surfaced two **pre-existing** staleness
bugs, unrelated to this sprint's own change, left over from Sprints
168/169 growing `SAFE_CHECK_SOURCE_IDS` from 2 to 4 without updating the
cron test files (a parallel miss to the one the Sprint 168H hotfix caught
in `sourceHealth.spec.ts`):

- `tests/e2e/cronCheckSources.spec.ts` asserted `pruszkow-aktualnosci`
  resolves to zero sources ("real checklist id, but not allowlisted") —
  false since Sprint 169. Fixed to use `pge-planowane` (genuinely never
  allowlisted, WAF-blocked) as the example instead.
- `tests/e2e/cronCheckSourcesRoute.spec.ts` hardcoded `checkedSources: 2`
  in several dry-run tests, assuming only Michałowice+WKD exist. Fixed to
  reflect 4 sources, with a fixture mock that serves the correct content
  type (HTML vs. JSON) per URL — plus two brand-new tests exercising the
  REST-backed sources' dry-run path specifically (a genuine success case
  and a malformed-JSON failure case).
- `tests/e2e/scheduledWriterRoute.spec.ts`'s security-boundary test used
  a bare `/scheduledWriter/` substring match, which false-positived on
  `SourceApiCheckPanel.tsx` importing the *type-only*, credential-free
  sibling module `scheduledWriterRunSafety.ts` (Sprint 172, intentional
  and safe). Tightened to match only an actual import of
  `@/lib/scheduledWriter` (the real, credentialed module).

None of these three were reachable by an admin or a real cron run before
this sprint — they were test-only staleness, not production bugs — but
they would have made the audit and the new REST-fetch tests impossible to
verify honestly if left as-is.

## 4. Answers to the audit questions (brief §13)

- **Czy istnieje już endpoint do automatycznego sprawdzania źródeł?**
  Tak — dwa: dry-run (`check-sources`, `check-michalowice`) i
  write-capable (`write-candidates`), wszystkie od Sprintów 142–166.
- **Czy obecny endpoint może być bezpiecznie wykorzystany przez
  harmonogram?** Tak, `write-candidates` już jest gotowym fundamentem —
  ten sprint naprawił jedyną realną lukę (REST API dla 2 z 4 źródeł).
- **Które źródła mają być objęte automatycznym checkiem?** Docelowo
  wszystkie 4 aktywne (`michalowice-komunikaty`, `wkd-aktualnosci`,
  `wodociagi-michalowice`, `pruszkow-aktualnosci`) — już poprawnie
  wspierane technicznie po tej naprawie. **Nie aktywowane w tym
  sprincie** — patrz §8.
- **Jak często?** Patrz §6.
- **Jak zapobiegamy równoległym/podwójnym runom?** Już istnieje (Sprint
  166C): atomowy `history.openRun()` z partial-unique-index-backed
  lockiem na `(trigger, environmentTag)` — drugi jednoczesny run dostaje
  `opened: false` i kończy się 503 `"Poprzednie uruchomienie wciąż
  trwa."`, zero fetchy, zero zapisów.
- **Jak zapobiegamy publikacji alertów?** Już istnieje: `write-candidates`
  nigdy nie importuje żadnego helpera publikującego/Buildera/zatwierdzania
  kandydatów; każdy insert kandydata wymusza `status: pending`
  (`buildPendingCandidateInsert` — nie ma parametru, którym wynik mógłby
  być inny). Odpowiedź zawsze zawiera `published: false`.
- **Jak zapisujemy sukces i błąd do source_checks?** Sukces: już istnieje
  (`writeCandidatesForSource` insertuje `no_changes`/`found_notice`
  zgodnie z istniejącą, węższą polityką RLS scheduled-writera). Błąd na
  poziomie pojedynczego źródła: **dziś NIE zapisuje się do
  `source_checks`** (tylko do zagregowanego `scheduled_writer_runs.
  error_summary`) — Sprint 172 dodał kolumnę/wartość `'failed'`, ale
  polityka RLS scheduled-writera pozostała świadomie nierozszerzona (patrz
  §7 — udokumentowana, odłożona luka, nie blokująca minimalnego pilota).
- **Jak zamykamy run także po wyjątku?** Już istnieje: cały blok jest w
  `try/catch`, `history.closeRun()` wywoływane w obu ścieżkach (sukces i
  nieoczekiwany błąd), zwalniając lock niezależnie od wyniku.
- **Cooldown/idempotencja?** Duplikat/niejednoznaczność kandydatów już
  klasyfikowane przez `classifyCandidateAgainstExisting` (trzy stany:
  nowy/duplikat/niejednoznaczny — niejednoznaczny nigdy nie jest cicho
  wstawiany ani cicho odrzucany).

## 5. Minimal pilot design (brief §14)

- **Źródła:** wszystkie 4 obecnie aktywne — technicznie gotowe po tej
  naprawie. `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS` już obsługuje
  rozszerzenie przez zmienną środowiskową (JSON-array, filtrowaną przez
  istniejący `SAFE_CHECK_SOURCE_IDS`) — **żadna zmiana kodu nie jest
  potrzebna**, tylko konfiguracja, której ten sprint nie dotyka.
- **Częstotliwość:** patrz §6.
- **Jeden kontrolowany run naraz:** już wymuszone (§4, atomic lock).
- **Zero auto-publikacji:** już wymuszone (§4).
- **Kandydaci najwyżej `pending`:** już wymuszone (`buildPendingCandidateInsert`).
- **Błędy bez sekretów/pełnego HTML:** już przestrzegane w każdej istniejącej
  ścieżce (`diagnostic` to zamknięty słownik kodów, nigdy surowy komunikat).
- **Fail-closed przy braku konfiguracji:** już wymuszone na czterech
  niezależnych warstwach (§1).

## 6. Recommended frequency

**Zalecenie: pozostać przy istniejącym harmonogramie `vercel.json`
(`0 5 * * *`, codziennie 05:00 UTC)** — już skonfigurowany dla
`check-michalowice`, nie wprowadzać nowego wzorca. Uwaga: większość z 4
źródeł ma w `officialSourceChecklist.ts` sugerowaną częstotliwość
**tygodniową** (`frequency: "weekly"`), więc codzienny cron sprawdza
częściej niż administrator ręcznie by to robił — to nieszkodliwe (istniejąca
deduplikacja/klasyfikacja kandydatów zapobiega hałasowi z powtórnych
sprawdzeń), ale warto to świadomie odnotować, nie założyć milcząco.
**Ten sprint nie zmienia `vercel.json`** ani nie przełącza jego celu na
`write-candidates` — to jest część aktywacji (§8), nie fundamentu.

## 7. Schema sufficiency (brief §15) — no migration this sprint

Po Sprincie 172 `source_checks` już obsługuje `result: 'failed'` z
bezpiecznym `error_code`/`error_summary`. To wystarcza dla:
- ręcznych checków administratora (już działa, Sprint 172),
- zapisu sukcesów przez scheduled writer (już działało od Sprintu 147+).

**Nie wystarcza** dla: zapisu pojedynczych błędów źródeł przez scheduled
writer do `source_checks` — polityka RLS scheduled-writera nadal
ogranicza `result` do `('no_changes', 'found_notice')` (świadomie
niezmieniona w Sprincie 172). To jest realna, ale **nieblokująca**
przyszła luka: dzisiejsze zachowanie (błąd trafia tylko do zagregowanego
`scheduled_writer_runs.error_summary`, nie per-source do `source_checks`)
jest bezpieczne i wystarczające dla minimalnego pilota — administrator
nadal widzi, że run miał `partial_failure`/`total_failure` i ile źródeł
zawiodło, tylko nie widzi TEGO per-source w widoku Zdrowia Źródeł, dopóki
scheduled writer nie zostanie osobno dopuszczony do zapisu `'failed'`.
**Migracja nie jest przygotowywana w tym sprincie** — nie jest naprawdę
konieczna do bezpiecznego minimalnego fundamentu, zgodnie z brief §15.

## 8. Activation procedure (for a future, separate approval — NOT done this sprint)

1. Decide the final source list (recommend: start with the same single
   source already proven in a controlled Production write test —
   Michałowice — before widening to all 4, mirroring how this project has
   always widened scope one verified step at a time).
2. Set `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS` (JSON array) if widening
   beyond the Michałowice-only default.
3. Confirm `SUPABASE_SCHEDULED_WRITER_EMAIL`/`_PASSWORD` are configured
   and that account is still a member of `automation_identities` (already
   done per Sprint 166L-D memory — re-verify, don't assume).
4. Confirm `SUPABASE_ENVIRONMENT_TAG` and the Vercel environment pairing
   guard (Sprint 165B, layer 0) actually match Production — this is the
   FIRST gate write-candidates checks, cheapest, no I/O.
5. Set `SCHEDULED_CHECKS_ENABLED=true`.
6. Set `SCHEDULED_WRITES_ENABLED=true`.
7. Decide whether to point `vercel.json`'s cron entry at `write-candidates`
   (replacing or alongside `check-michalowice`) — this is itself a config
   change requiring its own review, not implied by steps 1–6.
8. Manually trigger one controlled dry run first (already the established
   pattern from Sprint 152), confirm the response shape and
   `scheduled_writer_runs` row before trusting the actual cron schedule.
9. Only then let the real Vercel Cron trigger fire unattended.

**Every one of these 9 steps requires Adam's explicit, separate approval.**
None are taken by this sprint.

## 9. Emergency disable procedure

Two independent, immediate options, either one alone fully stops all
writing (checking already never writes):

- Set `SCHEDULED_WRITES_ENABLED` to anything other than the literal
  string `"true"` (or delete it) — `write-candidates` returns 503
  instantly, no fetch, no write, on the very next invocation.
- Set `SCHEDULED_CHECKS_ENABLED` to anything other than `"true"` — stops
  *both* the dry-run and write-capable endpoints at once (checked first,
  cheapest).

No code deploy is needed for either — both are read from
`process.env` on every request, so a Vercel environment-variable change
takes effect on the next invocation (Vercel functions don't cache
`process.env` across warm invocations for a value change like this).
Rotating `CRON_SECRET` is a third, heavier option (also stops manual
testing via `curl`, not just real cron) — not needed for a routine
disable.

## 10. Required Environment Variables (for future activation, NOT set this sprint)

| Variable | Purpose | Set today? |
|---|---|---|
| `CRON_SECRET` | Bearer-token auth for all cron routes | Configured (per Sprint 152/153 memory) |
| `SCHEDULED_CHECKS_ENABLED` | Layer 1 kill switch (dry-run + write) | Not `"true"` |
| `SCHEDULED_WRITES_ENABLED` | Layer 2 kill switch (write only) | Not `"true"` |
| `SUPABASE_SCHEDULED_WRITER_EMAIL` / `_PASSWORD` | Writer technical-account credentials | Configured (per Sprint 166L-D memory) |
| `SUPABASE_ENVIRONMENT_TAG` | Layer 0 environment-pairing guard | Per Sprint 165B — verify current state, don't assume |
| `SCHEDULED_WRITER_ALLOWED_SOURCE_IDS` | Optional widening beyond Michałowice-only | Not set (defaults to Michałowice only) |

## 11. Expected counter changes for one controlled run (once activated)

Mirroring the pattern already established and verified in Sprint 152's
Production dry-run and Sprint 148's controlled write test:

- `scheduled_writer_runs`: **+1** row (opened, then closed with an
  `outcome` of `success`/`partial_failure`/`total_failure`).
- `source_checks`: **+0 to +N** rows (N = number of sources checked that
  didn't error — each logs exactly one `no_changes` or `found_notice` row;
  a source that errors logs **zero** rows here today, per §7).
- `source_notice_candidates`: **+0 to +cap** rows, always `status:
  pending`, capped by `getMaxCandidatesPerInvocation()` (defaults to 1 —
  deliberately conservative for a first live write).
- `alerts`: **+0, always** — no code path in this system can insert into
  `alerts`.
- `operational_notification_events`: **+0** unless
  `OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED=true` (not set) — untouched
  this sprint.

## 12. Test coverage

11 new tests in `tests/e2e/scheduledSourceFetchRest.spec.ts` (REST-branch
retry/failure modes for the scheduled fetch layer, mirroring
`manualSourceCheckWordpressRest.spec.ts`'s pattern), 2 new tests in
`cronCheckSourcesRoute.spec.ts` (REST-backed dry-run success + malformed-
JSON failure), plus fixes to 5 existing tests across 3 files that had
stale assumptions from before this sprint (§3).

Full targeted + regression run this sprint: `cronCheckSources.spec.ts`,
`cronCheckSourcesRoute.spec.ts`, `cronCheckMichalowiceRoute.spec.ts`,
`scheduledSourceFetchRetry.spec.ts`, `scheduledSourceFetchRest.spec.ts`,
`scheduledWriter.spec.ts`, `scheduledWriterRoute.spec.ts`,
`scheduledWriterConcurrency.spec.ts`, `scheduledWriterIdempotency.spec.ts`,
`scheduledWriterCanaryFoundation.spec.ts`,
`scheduledWriterRouteHistoryLock.spec.ts`, `scheduledWriterRunSafety.spec.ts`,
`scheduledWriterNotificationInput.spec.ts`,
`scheduledWriterRouteOperationalNotification.spec.ts`, plus the full
source-health/check suite (`sourceHealth.spec.ts`, `sourceCheck.spec.ts`,
`sourceHealthPersistence.spec.ts`, `sessionCheckOutcome.spec.ts`,
`wordpressRestParser.spec.ts`, `pruszkowRestParser.spec.ts`,
`manualSourceCheckFetchRetry.spec.ts`, `manualSourceCheckWordpressRest.spec.ts`,
`manualSourceCheckPruszkowRest.spec.ts`, `adminApiRouteAuth.spec.ts`,
`candidateQueue.spec.ts`) — **241/241 passed.**

`npm run typecheck`, `npm run lint`, `npm run build` — all clean.

## 13. What this session did NOT do

No Environment Variable was changed — `SCHEDULED_CHECKS_ENABLED`,
`SCHEDULED_WRITES_ENABLED`, `CRON_SECRET`, and
`SCHEDULED_WRITER_ALLOWED_SOURCE_IDS` all remain exactly as they were.
`vercel.json` was not modified (still points only at the zero-write
`check-michalowice` dry-run). No cron was run — no request was made to
any `/api/cron/*` route on Production. No manual source check was run on
Production. No email/Resend was touched
(`OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED` untouched). No alert was
published. No SQL was written or executed — no migration was even
proposed (§7: not necessary). No merge to `main` was performed.

## 14. Branch

`sprint-173-scheduled-source-checks-foundation-v1`, branched from `main`
at `a414e41`. Not merged to `main`.
