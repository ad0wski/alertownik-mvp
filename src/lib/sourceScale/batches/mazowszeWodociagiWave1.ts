// Blok Wykonawczy 1 (Etap E) — first real candidate SourceBatch, extended
// in Blok Wykonawczy 2 from 7 to 10 instances (3 more HTTP-verified
// sources: Ząbki, Józefów, Zielonka). All 10 are now ALSO activated
// check-only in officialSourceChecklist.ts + SAFE_CHECK_SOURCE_IDS
// (sourceCheck.ts) as of Blok Wykonawczy 2 — this file stays the
// sourceScale/Etap E discovery-and-certification record, while
// officialSourceChecklist.ts is the actual live check-only registry the
// app reads from. Keep both in sync if this batch changes again. Still NOT
// added to any writer or auto-publish allowlist, and nothing here performs
// a fetch — see docs/EXEC_BLOCK_1_SOURCE_DISCOVERY_MAZOWIECKIE_V1.md and
// docs/EXEC_BLOCK_2_SOURCE_ACTIVATION_V1.md for full discovery methodology
// (real HTTP verification, not guessed) behind every URL below.
//
// All 10 instances share the exact adapter type already implemented and
// proven in production (wordpress_rest, same mechanics as the existing
// wodociagimichalowice.pl source) — batch onboarding needs zero new parser
// code, only this configuration data.

import type { SourceBatch } from "@/lib/sourceScale/batchOnboardingConfig";

export const MAZOWSZE_WODOCIAGI_WAVE_1: SourceBatch = {
  batchId: "mazowsze-wodociagi-wave-1",
  adapterType: "wordpress_rest",
  instances: [
    {
      id: "eko-raszyn",
      name: "EKO-RASZYN Sp. z o.o.",
      category: "water",
      gmina: "Raszyn",
      config: {
        type: "wordpress_rest",
        officialUrl: "https://www.ekoraszyn.pl",
        apiUrl: "https://www.ekoraszyn.pl/wp-json/wp/v2/posts?per_page=6",
        keywordSetId: "water-interruptions",
      },
    },
    {
      id: "bpwik-brwinow",
      name: "Brwinowskie Przedsiębiorstwo Wodociągów i Kanalizacji",
      category: "water",
      gmina: "Brwinów",
      config: {
        type: "wordpress_rest",
        officialUrl: "https://bpwik.pl",
        apiUrl: "https://bpwik.pl/wp-json/wp/v2/posts?per_page=6",
        keywordSetId: "water-interruptions",
      },
    },
    {
      id: "pkn-nadarzyn",
      name: "Przedsiębiorstwo Komunalne Nadarzyn",
      category: "water",
      gmina: "Nadarzyn",
      config: {
        type: "wordpress_rest",
        officialUrl: "https://pkn.net.pl",
        apiUrl: "https://pkn.net.pl/wp-json/wp/v2/posts?per_page=6",
        keywordSetId: "water-interruptions",
      },
    },
    {
      id: "zwik-ozarow-mazowiecki",
      name: "ZWiK Ożarów Mazowiecki",
      category: "water",
      gmina: "Ożarów Mazowiecki",
      config: {
        type: "wordpress_rest",
        officialUrl: "https://zwik.ozarow-mazowiecki.pl",
        apiUrl: "https://zwik.ozarow-mazowiecki.pl/wp-json/wp/v2/posts?per_page=6",
        keywordSetId: "water-interruptions",
      },
    },
    {
      id: "pwik-radzymin",
      name: "PWiK Radzymin",
      category: "water",
      gmina: "Radzymin",
      config: {
        type: "wordpress_rest",
        officialUrl: "https://www.pwikradzymin.pl",
        apiUrl: "https://www.pwikradzymin.pl/wp-json/wp/v2/posts?per_page=6",
        keywordSetId: "water-interruptions",
      },
    },
    {
      id: "pwk-legionowo",
      name: "PWK „Legionowo”",
      category: "water",
      gmina: "Legionowo",
      config: {
        type: "wordpress_rest",
        officialUrl: "https://pwklegionowo.com",
        apiUrl: "https://pwklegionowo.com/wp-json/wp/v2/posts?per_page=6",
        keywordSetId: "water-interruptions",
      },
    },
    {
      id: "opwik-otwock",
      name: "OPWiK Otwock",
      category: "water",
      gmina: "Otwock",
      config: {
        type: "wordpress_rest",
        officialUrl: "https://opwik.com",
        apiUrl: "https://opwik.com/wp-json/wp/v2/posts?per_page=6",
        keywordSetId: "water-interruptions",
      },
    },
    {
      id: "pwik-zabki",
      name: "PWiK w Ząbkach Sp. z o.o.",
      category: "water",
      gmina: "Ząbki",
      config: {
        type: "wordpress_rest",
        officialUrl: "https://pwikzabki.pl",
        apiUrl: "https://pwikzabki.pl/wp-json/wp/v2/posts?per_page=6",
        keywordSetId: "water-interruptions",
      },
    },
    {
      id: "hydrosfera-jozefow",
      name: "Hydrosfera Józefów Sp. z o.o.",
      category: "water",
      gmina: "Józefów",
      config: {
        type: "wordpress_rest",
        officialUrl: "https://hydrosfera-jozefow.pl",
        apiUrl: "https://hydrosfera-jozefow.pl/wp-json/wp/v2/posts?per_page=6",
        keywordSetId: "water-interruptions",
      },
    },
    {
      id: "pwik-zielonka",
      name: "PWiK w Zielonce Sp. z o.o.",
      category: "water",
      gmina: "Zielonka",
      config: {
        type: "wordpress_rest",
        officialUrl: "https://pwikzielonka.com.pl",
        apiUrl: "https://pwikzielonka.com.pl/wp-json/wp/v2/posts?per_page=6",
        keywordSetId: "water-interruptions",
      },
    },
  ],
};
