# Sprint 181B — PWA Installation Audit + Screenshot/Icon Package

Status: **technical audit closed and shipped to Production. Real-device confirmation still pending (Adam).**

Date: 2026-07-28.

Note on numbering: `docs/NEXT_MILESTONES.md` listed "Sprint 128 — PWA phone install test + screenshot/icon pack" as a recommended *next* step. Git history shows Sprint 128 already happened (commit `sprint-128-pwa-phone-test-screenshot-pack`, 2026-07-07) and delivered the icon set + Play Store assets — the roadmap doc's numbering was stale, not the actual sprint sequence. This sprint is correctly numbered **181B**, continuing the current sequence; no sprint numbers were reused or rewound.

---

## 1. State before this sprint

The PWA foundation was already substantially built, across three prior sprints:

- **Sprint 128** (2026-07-07): icon set (192/512/512-maskable PNGs, `apple-icon.png`, `favicon.ico`), Play Store asset stubs (`assets/store/`, not deployed).
- **Sprint 158B**: manifest completed (`id`, `orientation`, `lang`), full service worker (`public/sw.js`) with a strict allowlist (only `/offline.html` + one icon ever cached; `/admin*`, `/api*`, non-GET, cross-origin all structurally excluded), offline fallback page, `/instalacja` install-instructions page + `InstallAppButton`, update-lifecycle banner (`PwaController.tsx`), a dedicated `tests/pwa/pwa.spec.ts` suite (13 tests) run against a real production build (`npm run test:pwa`).
- **Sprint 162**: dual light/dark theming extended to `offline.html` and the manifest's static `theme_color`/`background_color`.
- **Explicitly logged as NOT done** (Sprint 158B's own "Known Limitations"): *"Device installation (real Android/iPhone/desktop install flow) has not been manually verified yet."* This gap is still open after this sprint — see §6.

## 2. Audit method — what this actually was and was not

No Lighthouse CLI was available in this environment (`npx lighthouse` failed to resolve). The audit instead used:
- The existing hand-written `tests/pwa/pwa.spec.ts` suite (manifest fields, icon/screenshot resolution + exact pixel-size decoding, service worker registration + headers, cache-content safety, offline fallback, install UX, network-status banner) — run against a real `next build && next start`, not dev mode.
- Direct inspection of `manifest.ts`, `layout.tsx`, `sw.js`, `offline.html`, and every icon/screenshot file (`file`/dimension checks, not just presence).
- A real Chrome tab (Claude in Chrome) console-error check against the live Production site.
- `git log` archaeology to establish what previous sprints actually shipped vs. what the roadmap doc claimed.

**This is not a Lighthouse report and not a real-device test.** It is a codified, repeatable equivalent for what's programmatically verifiable, plus real (not emulated-only) HTTP/console checks against Production. Real-device installability is explicitly still open (§6).

## 3. Findings

### 3a. Already solid, reconfirmed (no change needed)
- Manifest: `name`, `short_name`, `description`, `id`, `start_url`, `scope`, `display=standalone`, `orientation`, `lang=pl-PL`, `theme_color`, `background_color` — all present and correct.
- Icons: 192×192, 512×512, 512×512 maskable (full-bleed, no transparency), SVG, favicon — all resolve, all decode to their declared pixel size, none are placeholders.
- Service worker: registers cleanly, correct `Cache-Control: no-cache` + `Service-Worker-Allowed: /` headers, cache contains only the offline fallback (never `/`, `/admin*`, `/api*`).
- Offline fallback: honest "no old alerts shown as current" messaging, themed for light/dark, no horizontal overflow at 375/390/414px.
- Install UX: `/instalacja` covers Android/Chrome, iPhone/Safari, and desktop Chrome/Edge; install button correctly absent without a real `beforeinstallprompt` event (never shown on iOS, by design).
- HTTPS: yes (Vercel-served, confirmed via every check in this sprint).
- No app-level console errors on Production (the only console warnings present came from an unrelated browser extension, not the app).

### 3b. Two real gaps found and fixed

1. **Safe-area no-op on iOS (`src/app/layout.tsx`).** The `viewport` export never set `viewportFit: "cover"`. Without it, iOS Safari never applies `viewport-fit=cover`, so `env(safe-area-inset-bottom)` silently resolves to `0` everywhere. `BottomNav.tsx`'s `pb-[env(safe-area-inset-bottom)]` (Sprint 163) has therefore been a no-op on notched/Dynamic-Island iPhones since it was written — the fixed bottom nav could sit flush against (or visually crowd) the home-indicator area in standalone/installed mode. **Fixed** with one line; covered by a new test asserting the rendered `<meta name="viewport">` actually contains `viewport-fit=cover`.

2. **No manifest `screenshots` field.** Missing entirely. Added three real captures of the live Production site — `home-narrow.png` and `alerty-narrow.png` (390×844, phone viewport) and `home-wide.png` (1280×800, desktop) — captured via `npx playwright screenshot` against `https://alertownik-mvp.vercel.app/` and `/alerty`. All three show real, current, public alert content; none show admin panels, private data, emails, or secrets (visually confirmed). This enables the richer Android/desktop install-prompt preview carousel (optional per spec — its absence was never a hard installability blocker, but its presence is what PWA audit tooling checks for). Covered by a new test asserting every declared screenshot resolves and decodes to its declared pixel size.

## 4. Files changed

- `src/app/layout.tsx` — `viewportFit: "cover"` added to the `viewport` export.
- `src/app/manifest.ts` — `screenshots` array added (3 entries).
- `public/screenshots/home-narrow.png`, `alerty-narrow.png`, `home-wide.png` — new, real captures.
- `tests/pwa/pwa.spec.ts` — 2 new tests (screenshots resolve + decode correctly; viewport meta contains `viewport-fit=cover`).
- `tests/e2e/themeSystem.spec.ts` — extended the existing "no horizontal overflow at 375/390/414px" coverage (previously homepage-only) to `/alerty` and `/instalacja`.
- `docs/NEXT_MILESTONES.md` — Sprint 180C standing-rule correction (previous sprint), untouched further here.

## 5. Test results

- `npm run test:pwa`: **19/19 passed** (17 pre-existing + 2 new), run against a real production build.
- Full `npx playwright test`: **1398/1398 passed**.
- `npm run check` (typecheck + lint + build): zero errors, zero warnings.
- Security self-audit: no `.env`/secret/token references in the diff; no RLS/SQL changes; no new npm dependencies; no auto-publish/writer/cron env vars touched.
- Production data/flags confirmed unchanged post-deploy: 8 alerts, both canary candidates (`758819cc`, `72a7ee42`) still `pending` / `converted_alert_id: null`, `SCHEDULED_AUTO_PUBLISH_ENABLED` untouched.

## 6. Real-device test — status: **oczekuje na Adama**

Everything automatable is done. Confirming actual install/launch/offline/rotation behavior on a real iPhone requires Adam's physical device. See the single consolidated block below (Etap 6) — do all of it in one pass, no separate checkpoints needed in between.

### Instrukcja dla Adama (iPhone, Safari) — jeden blok

1. **Otwórz w Safari** (nie Chrome — iOS wymaga Safari do dodania do ekranu głównego): `https://alertownik-mvp.vercel.app/`
2. Stuknij ikonę **Udostępnij** (kwadrat ze strzałką w górę, na dolnym pasku Safari).
3. Przewiń w dół i wybierz **„Dodaj do ekranu początkowego"**.
4. Potwierdź nazwę „Alertownik" i stuknij **„Dodaj"** (prawy górny róg).
5. Wróć na ekran początkowy, znajdź ikonę Alertownika i **uruchom ją** z ekranu głównego (nie z Safari).
6. Sprawdź:
   - Czy aplikacja otwiera się **bez paska adresu Safari** (pełnoekranowo, jak natywna appka)?
   - Czy ikona na ekranie głównym wygląda poprawnie (niebieski kwadrat z białym kółkiem)?
   - Czy dolna nawigacja (Dzisiaj/Alerty/Odpady/Więcej) **nie nachodzi** na pasek gestów/home indicator na dole ekranu?
   - Włącz **tryb samolotowy**, poczekaj chwilę, spróbuj odświeżyć lub przejść na nową podstronę — czy pojawia się ekran „Brak połączenia z internetem" (a NIE stare/nieaktualne alerty)?
   - Wyłącz tryb samolotowy, sprawdź czy aplikacja znowu działa normalnie.
7. Zrób **3–5 zrzutów ekranu**:
   - ikona na ekranie głównym,
   - aplikacja uruchomiona pełnoekranowo (strona główna),
   - dolna nawigacja z bliska (widoczny dół ekranu z home indicator),
   - ekran offline (tryb samolotowy),
   - (opcjonalnie) `/alerty` uruchomione z zainstalowanej aplikacji.
8. Odeślij mi: te zrzuty + odpowiedzi na powyższe pytania (tak/nie + ewentualny opis, co wygląda nie tak).

Po otrzymaniu wyniku zaktualizuję ten dokument i domknę Sprint 181B w 100%.

## 7. Gate map (1–5)

| Gate | Status |
|---|---|
| 1. Utility MVP | ✅ passed |
| 2. Local Beta | ⬜ in progress — this sprint closed most of the remaining technical PWA gap |
| 3. Partner Demo | 🔶 close |
| 4. Monetization Test | ⬜ |
| 5. Store Launch | ⬜ |

## 8. Estimated readiness percentages (my own estimate, not an official/precise metric)

1. **Techniczny pilot webowy** (technical web pilot, ≈ Gate 1): **100%** — unchanged, already passed.
2. **Zamknięta beta** (closed beta, ≈ Gate 2): **~75%** — PWA technical foundation (manifest, service worker, offline, install UX, safe-area, screenshots) is now essentially complete and tested; still missing: real-device confirmation (this sprint's own §6), and the 5–10 real testers Gate 2 requires, which hasn't started.
3. **Gotowość do rozpoczęcia procesu sklepowego** (store-submission readiness, feeds Gate 5): **~40%** — icons and Play Store asset stubs exist (Sprint 128), manifest is store-audit-clean; still missing: the PWA-vs-TWA packaging decision, any actual Play Console/App Store account work, listing copy, and legal/policy review (all explicitly out of scope for this sprint).

## 9. Next biggest step

Send Adam the §6 instruction block; once real-device results come back, close this sprint's remaining item. In parallel, per `NEXT_MILESTONES.md`, the next product-level step (independent of the phone test) is recruiting the 5–10 Local Beta testers and reaching 3–5 fresh alert categories — the actual Gate 2 blocker is coverage and testers, not technical readiness anymore.
