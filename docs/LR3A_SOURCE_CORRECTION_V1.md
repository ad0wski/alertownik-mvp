# LR-3A — Source Correction & Coverage Re-baseline (2026-11-11)

## 1. What went wrong — REJECTED — WRONG MUNICIPALITY

`wodociagi-michalowice` → `wodociagimichalowice.pl` is the water utility of
**Gmina Michałowice in Małopolska** (postal code 32-091, near Kraków; its
notices name Masłomiąca, Raciborowice, Kończyce, Książniczki).

Alertownik's pilot is **Gmina Michałowice near Warsaw** (05-816, powiat
pruszkowski: Komorów, Nowa Wieś, Granica, Michałowice, Reguły). Same name,
different municipality, ~300 km apart.

From Sprint 168 until LR-3 the Małopolska site was configured as the pilot's
water source and described as covering the pilot localities. LR-3's live
preflight caught it one step before Production activation.

**Production was never affected:** no `alert_sources` row, never in
`SCHEDULED_WRITER_ALLOWED_SOURCE_IDS` (unset → default Michałowice only),
never in `SCHEDULED_WRITER_SOURCE_REGISTRY_IDS`, never in
`SCHEDULED_AUTO_PUBLISH_SOURCE_IDS`, no candidate and no alert ever created
from it.

## 2. What was removed

| Item | Kind | Action |
|---|---|---|
| `OFFICIAL_SOURCE_CHECKS` entry (`officialSourceChecklist.ts`) | runtime | removed |
| `SAFE_CHECK_SOURCE_IDS` entry (`sourceCheck.ts`) | runtime (base of writer + auto-publish allowlists) | removed |
| `REST_PARSERS_BY_SOURCE_ID` entry (`pageParser.ts`) | runtime | removed |
| `PILOT_SOURCE_SUGGESTIONS` entry (`/admin/sources`) | admin UI | removed |
| `tests/e2e/wodociagiMichalowiceReadiness.spec.ts` | test (LR-2 "readiness certification") | deleted |
| `tests/fixtures/wodociagi-michalowice-live-2026-11-08.json` | fixture (its 2nd entry was an invented "Komorów" notice) | deleted |
| `docs/sql/PROPOSED_LR2_WODOCIAGI_MICHALOWICE_ALERT_SOURCES_ROW_V1.sql` | proposed, never applied | deleted |
| Generic-parser test fixtures using the wrong domain | tests | switched to neutral `wodociagi.example` |
| Historical sprint docs mentioning the source | docs | kept, bannered `REJECTED — WRONG MUNICIPALITY` |

**Kept on purpose:** the generic WordPress REST adapter
(`parseWordpressRestPosts`) — it is shared by the other, correctly identified
water-utility sources. Its internal page title was renamed from
"Wodociągi Michałowice — Aktualności" to the neutral
"Komunikaty wodociągowe — aktualności".

Regression guard: `tests/e2e/wrongMunicipalitySourceGuard.spec.ts`.

## 3. Real coverage of `michalowice-komunikaty` (correct gmina)

Measured on 2026-11-11 against the official site's full 2026 archive
(`/komunikaty/rok-2026`, 180 notices), classified with the app's own
`detectCandidateCategory` / `extractPlace` / `extractStartDateIso`.

| Category | Real examples in 2026 | Sample | Classifier | Place | Date/time | Permalink |
|---|---|---|---|---|---|---|
| water | **YES — 43 "Brak wody" notices** | "Brak wody – Granica", 06.11.2026 09:00–13:00 | correct (43/43) | 34/43 (misses Opacz, Pęcice — not pilot localities) | start date yes; start hour when the teaser states it; end time not extracted | yes |
| roads | YES — ~8 | "Utrudnienia w ruchu drogowym - DW nr 719 Nowa Wieś", 03.07.2026 | unreliable (several land in `transport`; false positives such as "Rozlicz PIT") | partial | usually only the publication date | yes |
| transport | YES — ~8 (M2/M21 buses, WKD, level crossings) | "Zmiany na trasach gminnych linii M2 i M21 od 5 września 2026 r." | partly (also tags unrelated events) | mostly none (line-wide) | partial | yes |
| waste | YES — ~7 (PSZOK closures, collection-date change) | "PSZOK - nieczynny 2 maja 2026 r." | mostly correct | mostly none | partial | yes |
| power | NO real outage notices (gmina refers residents to PGE) | — | 1 false positive | — | — | — |
| municipal / informational | YES — the majority (~95 of 180) | job offers, consultations, events | n/a (no category → never auto-publish eligible) | — | — | yes |

Water notices by locality (2026): Komorów 14, Nowa Wieś 12, Granica 11,
Opacz 6, Reguły 3, Pęcice 3, Sokołów 1.

## 4. Water conclusion

**A separate water source is NOT required for Coverage v1.** In this gmina
the municipality itself publishes water interruptions, in the same official
feed Alertownik already monitors. There is no separate utility site to add.

Known limits (not fixed here — recorded for a later decision):

- **Timeliness.** Median notice lead time is roughly 15 hours; a share are
  same-day. The writer runs once a day (05:30 UTC) and inserts at most one
  candidate per run, in listing order — so a water notice can be picked up
  late, or queue behind unrelated informational notices.
- **Main listing drops event-dated notices** once the event has passed (they
  stay in the yearly archive). Fine for daily monitoring, but it means the
  main listing is not a history.
- **Place extraction** only matches the six pilot locality names in their
  base form.

## 5. "Brak wody - Reguły" alert (read-only observation)

- Stored 10.11.2026 11:00–15:00 Europe/Warsaw; `getAlertTimeStatus` returns
  `ended` — the existing freshness logic handles it with no manual action.
- Its official notice URL now returns 404 and is absent from the 2026
  archive (a different Reguły notice, for 06.11, is still archived). Dead
  source links on ended alerts are a separate UX / data-retention question.
- Nothing was changed in the database.
