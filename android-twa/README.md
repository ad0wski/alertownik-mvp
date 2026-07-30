# Android TWA scaffold (not built, not published)

**Status: configuration template only. No Bubblewrap project has been
initialized, no signing key exists, no build has been run.** Nothing here
is served by the app or referenced by any deployment.

## Why this stops here

Bubblewrap (Google's official PWA→TWA packaging tool, chosen by
`docs/SPRINT_186A_STORE_READINESS_V1.md` §6 as the canonical Android
wrapper approach) **generates a real signing keystore during `bubblewrap
init` itself** — not only at build time. That means running `init` is
already an irreversible key-generation step, and the `packageId` chosen at
that same step is a permanent, unchangeable app identity once anything is
ever uploaded to Google Play. Both are decisions for Adam, not something
to guess — so this scaffold stops one step before running any Bubblewrap
command.

## What already exists and is reused as-is (nothing duplicated here)

Bubblewrap reads these directly from the live PWA — no need to restate
values by hand once `packageId` is decided:

- Manifest: `https://alertownik-mvp.vercel.app/manifest.webmanifest`
  (`src/app/manifest.ts` — name, short_name, theme/background color,
  start_url, icons, screenshots, categories).
- Icons: `public/icon-512.png`, `public/icon-maskable-512.png` (already
  correct sizes for Android — see `docs/EXEC_BLOCK_ACCELERATE_ABCD_V1.md`
  §2.2).

## What's in `twa-manifest.example.json`

A hand-written **template**, not a real Bubblewrap output — fields copied
directly from the live manifest above, so Bubblewrap's own prompts should
mostly just confirm these same values rather than ask from scratch. The one
field intentionally left as a placeholder is `packageId` — see below.

## The one decision Adam must make before anything else here can proceed

**`packageId`** (Android application ID, reverse-domain style, e.g.
`pl.alertownik.app` or `com.alertownik.twa`) — **permanent once the app is
ever uploaded to Google Play**, cannot be changed or reused later even if
the app is deleted. Not guessed in this template.

## Exact next steps (for a future session, after the packageId decision)

1. Confirm the environment has **JDK 17+** (this session's environment has
   JDK 16 — Bubblewrap's own first-run setup can download a matching JDK
   automatically if allowed, or an existing JDK/Android SDK can be pointed
   to manually).
2. Confirm/install the **Android SDK** — not present in this session's
   environment (`ANDROID_HOME`/`ANDROID_SDK_ROOT` unset). Bubblewrap can
   also fetch this automatically on first run if allowed.
3. Run (from a clean working directory, **not** committed into this repo
   until reviewed):
   ```bash
   npx @bubblewrap/cli init --manifest=https://alertownik-mvp.vercel.app/manifest.webmanifest
   ```
   Bubblewrap will ask to confirm values (name, colors, icons — pre-filled
   from the manifest) and for the `packageId` — **this is the step that
   generates the signing keystore**, so it should only run once Adam has
   chosen the package ID and is ready to treat that keystore as a real,
   permanent credential (back it up immediately, never commit it to git).
4. `bubblewrap build` produces a debug-signed `.apk`/`.aab` installable
   locally via `adb install` **without any Google Play account** — useful
   for Adam to sanity-check the wrapper before ever creating a Play Console
   account.
5. Only once satisfied: `assetlinks.json` (Digital Asset Links, proving the
   Android app and the website are the same origin) is generated using the
   keystore's SHA-256 fingerprint from step 3–4, and served at
   `public/.well-known/assetlinks.json` — **cannot be prepared correctly
   before the real fingerprint exists**, so it is not templated here to
   avoid shipping a file with a fabricated, wrong fingerprint.
6. Only after that: Google Play Console account (§2.6 of
   `docs/EXEC_BLOCK_ACCELERATE_ABCD_V1.md`), 12 testers/14 days, submission.

None of steps 3–6 were performed in this session.
