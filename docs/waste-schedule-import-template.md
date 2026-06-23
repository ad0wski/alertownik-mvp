# Waste Schedule — Import Template & Checklist

Sprint 96. A single, canonical reference for getting real waste-collection
data into `waste_schedule_items` — consolidates (does not duplicate) two
existing docs:

- `docs/OFFICIAL_DATA_NEEDED.md` — the actual official sources found for
  Gmina Michałowice, and why automated PDF extraction failed.
- `docs/WASTE_SCHEDULE_SAMPLE_DATA.md` — a full worked (fake) JSON example
  to test the import mechanic.

Use this file as the "what field goes where, and how do I mark a row as
trustworthy" reference; use the other two for "where do I get real data"
and "what does a working example look like."

**No SQL or schema change is proposed here.** Every field below already
exists in `waste_schedule_items` (Sprint 83, applied) — this is a usage
guide, not a migration.

---

## Field reference

| Field | Required | Notes |
|---|---|---|
| `locality` | Yes | Town/locality name. Never a street address. |
| `areaName` | No | Coarse named zone within the locality (e.g. "Strefa A"). |
| `streetGroup` | No | A *range* of streets (e.g. "ul. Główna – ul. Sportowa"), never one house number. |
| `wasteType` | Yes | One of: `mixed`, `paper`, `plastics_metals`, `glass`, `bio`, `bulky`, `other`. |
| `collectionDate` | Yes | ISO format `RRRR-MM-DD`. |
| `sourceName` | Recommended | Plain text label for the official source. |
| `sourceUrl` | Recommended | Link to the official page/PDF the date came from. |
| `notes` | No | Free text — see "Marking a row as verified" below. |

Enforced by `validateWasteScheduleInput()` (`src/lib/wasteSchedule.ts`) on
both the single-row form and the JSON import at `/admin/waste` — identical
rules on both entry paths, so they can't drift apart.

## Marking a row as verified (convention, not a schema field)

The brief for this sprint asked for a "verified flag" and "last verified
date." **Neither exists as a real column in `waste_schedule_items`** —
adding them would be a schema change, which this sprint deliberately did
not make without your explicit confirmation (see the SQL proposal below if
you want this built for real).

Until then, the practical equivalent costs nothing extra: put the
verification fact directly in `notes`, e.g.:

```
notes: "Zweryfikowano 2026-06-23 na podstawie Harmonogram_2026.pdf (Gmina Michałowice)."
```

This is searchable, visible to you in `/admin/waste`'s list, and never
shown to the public as anything but a plain note — same as any other
`notes` value today.

### If you actually want a real `verified` / `last_verified_at` column later

Only build this if the `notes` convention above turns out to be
insufficient in practice (e.g. you want to filter/sort by verification
status). If so, the proposal would be:

```sql
-- PROPOSAL ONLY — NOT APPLIED. Do not run without confirming you want this.
alter table public.waste_schedule_items
  add column if not exists verified boolean not null default false,
  add column if not exists last_verified_at timestamptz;
```

Flag this to Claude Code explicitly in a future sprint if you want it —
don't run it speculatively now.

## Admin checklist — importing a real locality's calendar

1. Open the official source (see `docs/OFFICIAL_DATA_NEEDED.md` for the
   ones already found for Gmina Michałowice, or find your own for a
   different locality).
2. Transcribe rows into the JSON shape above — one row per
   locality + waste type + date combination.
3. Add a `notes` line per row stating what you verified it against (see
   above) — optional, but cheap insurance for future-you.
4. Paste into `/admin/waste` → "Import z JSON →". Review the preview table
   and the duplicate/past-date/missing-source warnings (non-blocking) before
   clicking "Zaimportuj."
5. Open `/odpady` in a private/incognito window and confirm the dates,
   grouping, and source link look correct to a resident with no admin
   access — not just "did the import succeed."
6. If you imported `docs/WASTE_SCHEDULE_SAMPLE_DATA.md`'s example rows to
   test the mechanic first, delete them via "Usuń" before leaving real data
   live alongside them.

## What must never happen

- No plausible-looking date entered as if verified — every row needs a
  source you actually read.
- No exact street address or house number — locality, named zone, or a
  street *range* only.
- No automated insert — the JSON/SQL is always reviewed and the
  "Zaimportuj"/SQL-run step is always a manual, human click.
