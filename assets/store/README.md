# Store assets (not served by the app)

Files here exist only for a FUTURE Google Play listing (Sprint 128).
Nothing in this folder is referenced by the app or deployed anywhere.

- `play-icon-512.png` — Play app icon (512×512, full-bleed square; Play applies its own mask)
- `feature-graphic-1024x500.png` — Play feature graphic

Regenerate everything (plus the served PWA icons in `public/` and
`src/app/apple-icon.png`) with:

```bash
node scripts/generate-mobile-assets.mjs
```

Rules: no institution logos (WKD/PGE/gmina/Google), no claims of official
affiliation, no store badges before an actual listing exists. Visual review
by Adam before any of this is used anywhere public.

Screenshots are deliberately NOT stored in the repo — see the Obsidian page
`Mobile Screenshot Pack` for the capture checklist.
