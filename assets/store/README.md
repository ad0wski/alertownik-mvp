# Store assets (not served by the app)

Files here exist only for the Google Play Console listing. Nothing in this
folder is referenced by the app or deployed anywhere.

- `play-icon-512.png` — Play app icon (512×512, full-bleed square; Play applies its own mask)
- `feature-graphic-1024x500.png` — Play feature graphic
- `screenshots/phone/` — 4 phone screenshots (1080×1920)
- `screenshots/tablet-7/` — 2 tablet 7″ screenshots (1920×1080, landscape)
- `screenshots/tablet-10/` — 2 tablet 10″ screenshots (1920×1080, landscape)

Regenerate the icon (plus the served PWA icons in `public/` and
`src/app/apple-icon.png`) with:

```bash
node scripts/generate-mobile-assets.mjs
```

That script also regenerates `feature-graphic-1024x500.png`, but with a
placeholder tagline ("Lokalne alerty w jednym miejscu") — the version
currently in this folder was regenerated separately with the approved
store-listing slogan below. If you re-run `generate-mobile-assets.mjs`,
re-apply the slogan afterwards (or update the script's tagline text, which
is a deliberate content decision, not something to change casually).

The screenshots were captured against the **live production app**
(`https://alertownik-mvp.vercel.app`) with Playwright (already a
devDependency — no new packages installed), at exact pixel output via
`deviceScaleFactor`, on 2026-08-04. They are not stored generation scripts
in this repo (one-off capture, run from a temp file) — to refresh them,
recreate a small Playwright script that navigates to each public route at
the viewport/scale combos below and re-run it, then replace the files here.

Rules: no institution logos (WKD/PGE/gmina/Google), no claims of official
affiliation, no store badges, no unreleased features (push notifications,
live tracking, full Poland coverage). Visual review by Adam before any of
this is used anywhere public.

---

## Co przesłać do którego pola w Google Play Console

| Plik | Pole w Play Console | Format | Wymiary | Rozmiar | Źródłowy ekran |
|---|---|---|---|---|---|
| `play-icon-512.png` | **Ikona aplikacji** (App icon) | PNG | 512×512 | 208 KB (limit 1 MB) | Zatwierdzone logo Alertownika (`assets/brand/alertownik-logo-master.png`), bez tekstu |
| `feature-graphic-1024x500.png` | **Grafika promocyjna** (Feature graphic) | PNG | 1024×500 | 44 KB (limit 15 MB) | To samo logo + nazwa „Alertownik” + slogan „Ważne informacje z Twojej okolicy w jednym miejscu” |
| `screenshots/phone/phone-01-dzisiaj.png` | **Zrzuty ekranu telefonu** #1 | PNG | 1080×1920 | 84 KB (limit 8 MB) | `/` — ekran „Dzisiaj” (najbliższy alert + najbliższy odbiór odpadów) |
| `screenshots/phone/phone-02-alerty.png` | **Zrzuty ekranu telefonu** #2 | PNG | 1080×1920 | 94 KB (limit 8 MB) | `/alerty` — pełna lista alertów z wyszukiwarką i filtrem kategorii |
| `screenshots/phone/phone-03-szczegoly-alertu.png` | **Zrzuty ekranu telefonu** #3 | PNG | 1080×1920 | 66 KB (limit 8 MB) | `/alerts/wkd-rozklad-jazdy-od-2026-06-29` — szczegóły prawdziwego, opublikowanego alertu |
| `screenshots/phone/phone-04-moja-okolica.png` | **Zrzuty ekranu telefonu** #4 | PNG | 1080×1920 | 94 KB (limit 8 MB) | `/alerty` — panel „Moja okolica” otwarty (wybór miejscowości/kategorii) |
| `screenshots/tablet-7/tablet7-01-dzisiaj.png` | **Zrzuty ekranu — tablet 7″** #1 | PNG | 1920×1080 (16:9, landscape) | 53 KB (limit 8 MB) | `/` przy szerokości ~960 CSS px (układ tabletowy) |
| `screenshots/tablet-7/tablet7-02-alerty.png` | **Zrzuty ekranu — tablet 7″** #2 | PNG | 1920×1080 (16:9, landscape) | 68 KB (limit 8 MB) | `/alerty` przy szerokości ~960 CSS px |
| `screenshots/tablet-10/tablet10-01-dzisiaj.png` | **Zrzuty ekranu — tablet 10″** #1 | PNG | 1920×1080 (16:9, landscape) | 51 KB (limit 8 MB) | `/` przy szerokości ~1280 CSS px (szerszy układ tabletowy) |
| `screenshots/tablet-10/tablet10-02-alerty.png` | **Zrzuty ekranu — tablet 10″** #2 | PNG | 1920×1080 (16:9, landscape) | 60 KB (limit 8 MB) | `/alerty` przy szerokości ~1280 CSS px |

**Pola pozostawione puste celowo** (zgodnie z zakresem zlecenia): film YouTube,
materiały na Chromebooka, materiały Android XR.

## Uwagi weryfikacyjne

- Wszystkie wymiary i rozmiary powyżej zostały zmierzone automatycznie
  (nagłówek PNG + rozmiar pliku), nie oszacowane.
- Wszystkie zrzuty ekranu pokazują wyłącznie publiczne, rzeczywiście
  renderowane widoki aplikacji (produkcja: `alertownik-mvp.vercel.app`) —
  brak panelu admina, logowania, danych deweloperskich, pustych stanów lub
  błędów.
- Alert użyty w zrzucie „szczegóły alertu” („Rozkład jazdy WKD od 29
  czerwca”) to prawdziwy, opublikowany wpis w bazie produkcyjnej, nie dane
  testowe.
- Ikona i grafika promocyjna pochodzą z tego samego zatwierdzonego pliku
  źródłowego marki co ikony PWA aplikacji (`public/icon-*.png`) — ten sam
  wygląd na urządzeniu i w sklepie.

## Wciąż wymaga Twojej decyzji

1. **Wizualne zatwierdzenie** wszystkich 10 plików przed przesłaniem do
   Play Console (zasada z `docs/google-play/PLAY_STORE_READINESS.md`,
   sekcja 4, nadal obowiązuje).
2. Wybór ekranu alertu w zrzucie #3 — jeśli wolisz inny opublikowany alert
   niż rozkład WKD (np. ze względu na aktualność dat), łatwo podmienić.
