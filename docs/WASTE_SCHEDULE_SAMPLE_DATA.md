# Waste Schedule — Sample Import Data

Sprint 84 (extended Sprint 85). A safe, copy-pasteable starting point for
`/admin/waste`'s "Import z JSON →" panel — not real data, not inserted
automatically by Claude Code. Use this to see the import format work end
to end, then replace every row with a verified official schedule before
treating it as real.

A SQL-Editor equivalent of these exact rows exists at
`docs/supabase_waste_schedule_seed_example.sql`, for an admin who prefers
running SQL directly over pasting JSON into `/admin/waste` — same rows,
same "PRZYKŁAD" markers, same not-run-automatically rule.

## ⚠️ These rows are EXAMPLES, not verified data

Every row below uses a plausible-looking but **unverified** date and
source. Do not leave example rows live on the public `/odpady` page —
residents would be reading a guessed collection date as if it were real.

Two ways to use this file safely:

1. **Try the import mechanic only.** Paste the JSON below into
   `/admin/waste` → "Import z JSON →" to confirm the workflow (validation,
   duplicate warnings, grouping on `/odpady`) — then delete the rows via
   "Usuń" once you've seen it work.
2. **Replace before keeping.** Copy the JSON's *shape*, but overwrite every
   `collectionDate`, `sourceName`, and `sourceUrl` with what the real
   official source (see `src/app/odpady/page.tsx`'s `OFFICIAL_SOURCES`, or
   `Research.md`'s Source Strategy section in Obsidian) actually says for
   that locality, before importing for real.

## Example payload (paste into "Import z JSON →")

```json
[
  {
    "locality": "Komorów",
    "areaName": "Strefa A",
    "streetGroup": "ul. Główna – ul. Sportowa",
    "wasteType": "mixed",
    "collectionDate": "2026-07-03",
    "sourceName": "Eco-Harmonogram",
    "sourceUrl": "https://www.pruszkow.pl/aplikacja-eco-harmonogram/",
    "notes": "PRZYKŁAD — zweryfikuj datę przed pozostawieniem na żywo."
  },
  {
    "locality": "Komorów",
    "areaName": "Strefa A",
    "streetGroup": "ul. Główna – ul. Sportowa",
    "wasteType": "bio",
    "collectionDate": "2026-07-03",
    "sourceName": "Eco-Harmonogram",
    "sourceUrl": "https://www.pruszkow.pl/aplikacja-eco-harmonogram/",
    "notes": "PRZYKŁAD"
  },
  {
    "locality": "Komorów",
    "areaName": "Strefa A",
    "streetGroup": "ul. Główna – ul. Sportowa",
    "wasteType": "paper",
    "collectionDate": "2026-07-10",
    "sourceName": "Eco-Harmonogram",
    "sourceUrl": "https://www.pruszkow.pl/aplikacja-eco-harmonogram/",
    "notes": "PRZYKŁAD"
  },
  {
    "locality": "Komorów",
    "areaName": "Strefa A",
    "streetGroup": "ul. Główna – ul. Sportowa",
    "wasteType": "plastics_metals",
    "collectionDate": "2026-07-10",
    "sourceName": "Eco-Harmonogram",
    "sourceUrl": "https://www.pruszkow.pl/aplikacja-eco-harmonogram/",
    "notes": "PRZYKŁAD"
  },
  {
    "locality": "Komorów",
    "areaName": "Strefa B",
    "streetGroup": "ul. Kolejowa – ul. Polna",
    "wasteType": "mixed",
    "collectionDate": "2026-07-04",
    "sourceName": "Eco-Harmonogram",
    "sourceUrl": "https://www.pruszkow.pl/aplikacja-eco-harmonogram/",
    "notes": "PRZYKŁAD"
  },
  {
    "locality": "Pruszków",
    "wasteType": "glass",
    "collectionDate": "2026-07-15",
    "sourceName": "MZO Pruszków — terminy odbioru odpadów",
    "sourceUrl": "https://www.pruszkow.pl/mieszkancy/terminy-odbioru-odpadow/",
    "notes": "PRZYKŁAD"
  },
  {
    "locality": "Pruszków",
    "wasteType": "bulky",
    "collectionDate": "2026-08-01",
    "sourceName": "MZO Pruszków — terminy odbioru odpadów",
    "sourceUrl": "https://www.pruszkow.pl/mieszkancy/terminy-odbioru-odpadow/",
    "notes": "PRZYKŁAD — odbiór gabarytów bywa rzadszy, zweryfikuj częstotliwość."
  }
]
```

## Field reference

| Field | Required | Notes |
|---|---|---|
| `locality` | Yes | Town/locality name. Never a street address. |
| `areaName` | No | Coarse named zone within the locality (e.g. "Strefa A"). |
| `streetGroup` | No | A *range* of streets (e.g. "ul. Główna – ul. Sportowa"), never one house number. |
| `wasteType` | Yes | One of: `mixed`, `paper`, `plastics_metals`, `glass`, `bio`, `bulky`, `other`. |
| `collectionDate` | Yes | ISO format `RRRR-MM-DD`. |
| `sourceName` | Recommended | Plain text label for the official source. |
| `sourceUrl` | Recommended | Link to the official page — rows without one are flagged in the admin UI. |
| `notes` | No | Free text. Remove "PRZYKŁAD" notes before treating a row as real. |

These are exactly the rules `validateWasteScheduleInput()`
(`src/lib/wasteSchedule.ts`) enforces on both the single-row form and this
JSON import — the import button only enables once every row in the pasted
array passes.

## Validation / safety rules already enforced by the app

- `locality` and `wasteType` and `collectionDate` are required — the
  import is rejected (with a row-by-row error list) otherwise.
- `wasteType` must be one of the seven allowed values — typos are caught,
  not silently saved as `other`.
- A past `collectionDate` triggers a confirm warning (not a hard block) on
  the single-row form; the bulk import does not currently re-check this —
  review dates before pasting.
- An exact-match duplicate (same locality + waste type + date) triggers a
  warning on the single-row form, via `findDuplicateWasteItem()`.
- No address/house-number field exists anywhere in this table — there is
  nothing to accidentally over-collect.

## After importing real data

1. Delete the example rows above (if you imported them to test the
   mechanic) via "Usuń" on `/admin/waste`.
2. Import the real locality's calendar, with `notes` left empty or
   describing genuine exceptions (not "PRZYKŁAD").
3. Open `/odpady` in a private/incognito window and confirm the dates,
   grouping, and source link look correct to a resident with no admin
   access.

See `Research.md` → "Adding Real Rows via `/admin/waste`" (Obsidian) for
the full step-by-step procedure, including how to pick an official source
per locality.
