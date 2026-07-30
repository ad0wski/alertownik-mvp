// Blok Wykonawczy 1 (Etap E) — first real candidate SourceBatch, prepared
// only. NOT wired into officialSourceChecklist.ts, NOT added to
// SAFE_CHECK_SOURCE_IDS, NOT fetched by anything at runtime — see
// docs/EXEC_BLOCK_1_SOURCE_DISCOVERY_MAZOWIECKIE_V1.md for the discovery
// methodology (real HTTP verification, not guessed) behind every URL below.
//
// All 7 instances share the exact adapter type already implemented and
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
  ],
};
