# Official Waste Schedule Data Needed — Sprint 88

`waste_schedule_items` has **0 real rows** (confirmed live, 2026-06-22, via
a direct read against the public Supabase REST endpoint — not guessed).
This sprint searched for a real official source to transcribe from
instead of inventing example data. Here's exactly what was found, what's
still missing, and what to do next.

## What was found this sprint

A real, current official source **does exist** for Gmina Michałowice:

- **Main schedule (single-family homes), 2026:**
  `https://www.michalowice.pl/files/685683571/lib/Harmonogram_2026.pdf`
- **Multi-family housing schedule, 2026:**
  `https://www.michalowice.pl/files/685683571/lib/Harmonogram_Wielorodzinna_2026.pdf`
- **General waste-collection info leaflet:**
  `https://www.michalowice.pl/files/685683571/lib/Niezbednik_2026.pdf`

Found via the municipality's own "Harmonogram odbioru odpadów komunalnych"
page: `https://www.michalowice.pl/ochrona-srodowiska/odbior-odpadow/nowy-harmonogram-odbioru-odpadow-komunalnych`

The two other previously-documented candidate sources (Pruszków's
Eco-Harmonogram and "terminy odbioru odpadów" page — see
`Research.md`'s "Waste Schedule Source Strategy") both still return
**HTTP 403** to automated fetches, same as every prior sprint that
checked.

## Why Claude Code couldn't finish this automatically

The Michałowice PDFs above were fetched successfully (no bot-block), but
the file content is a compressed/scanned PDF — automated text extraction
returned only binary stream data, not readable text, and this
environment has no PDF-to-image rendering tool (`pdftoppm`) available to
fall back to a visual read. Per this project's standing rule, OCR is
explicitly out of scope unless already simple and safe — it isn't, here.
**No row in `waste_schedule_items` was guessed or invented to work
around this.**

## What you need to provide (or do) to unblock a real import

Pick whichever is easiest:

1. **Open the PDF yourself** (a real browser/PDF viewer renders it fine —
   only this sandboxed environment's automated tools can't) and transcribe
   the rows you care about into the JSON format below, **or**
2. **Paste the schedule text** here in the next session (e.g. copy-paste
   from your PDF viewer) and Claude Code will format it into the import
   JSON for you to review before saving, **or**
3. **Point at a different, already-text-readable official source** (a
   plain HTML page with a visible table, not a scanned PDF) if one exists
   for an area you care about more than Michałowice.

Whichever path: every row still needs you to confirm it before it's
imported — the admin import workflow at `/admin/waste` always requires a
manual "Zaimportuj" click, never automatic.

### Exact fields needed per row

```json
{
  "locality": "Required — town/village name, never a street address.",
  "areaName": "Optional — a coarse named zone, e.g. \"Strefa A\".",
  "streetGroup": "Optional — a street RANGE, e.g. \"ul. Główna – ul. Sportowa\", never one house number.",
  "wasteType": "Required — one of: mixed, paper, plastics_metals, glass, bio, bulky, other.",
  "collectionDate": "Required — ISO format RRRR-MM-DD.",
  "sourceName": "Recommended — e.g. \"Harmonogram 2026 — Gmina Michałowice\".",
  "sourceUrl": "Recommended — the exact PDF/page URL the date came from.",
  "notes": "Optional."
}
```

See `docs/WASTE_SCHEDULE_SAMPLE_DATA.md` for a full worked (but
explicitly fake/PRZYKŁAD) example of this same shape, and
`/admin/waste`'s "Import z JSON →" panel for where real rows actually
get saved — it now shows a preview table and warns (non-blocking) on
duplicate rows, past dates, and missing source links before you click
"Zaimportuj" (Sprint 88).

## What must never happen

- No plausible-looking date gets entered as if verified — every row
  needs a real source you actually read, not a guess at "probably every
  two weeks."
- No exact street address or house number — locality, named zone, or a
  street *range* only.
- No automated insert — Claude Code prepares the JSON/SQL for you to
  review; you click "Zaimportuj" or run the SQL yourself.
