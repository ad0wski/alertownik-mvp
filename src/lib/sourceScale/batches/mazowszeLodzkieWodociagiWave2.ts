// Blok Wykonawczy 3 (Etap E/F, patrz docs/EXEC_BLOCK_3_ETAP_E_AUDIT_V1.md
// dla dyskusji etykiety) — second real, HTTP-verified SourceBatch, kept as
// its own wave (not appended to mazowszeWodociagiWave1) matching the
// "fala 1 / fala 2" wave terminology in docs/MASTER_ROADMAP_V2.md's Etap F
// section. Extends Mazowieckie (3 towns) and adds the first Łódzkie
// sources (4 towns) — same wordpress_rest adapter, zero new parser code.
// ALSO activated check-only in officialSourceChecklist.ts +
// SAFE_CHECK_SOURCE_IDS (sourceCheck.ts) as of this block — this file
// stays the sourceScale discovery/certification record.

import type { SourceBatch } from "@/lib/sourceScale/batchOnboardingConfig";

export const MAZOWSZE_LODZKIE_WODOCIAGI_WAVE_2: SourceBatch = {
  batchId: "mazowsze-lodzkie-wodociagi-wave-2",
  adapterType: "wordpress_rest",
  instances: [
    {
      id: "pwik-minsk-mazowiecki",
      name: "PWiK Mińsk Mazowiecki",
      category: "water",
      gmina: "Mińsk Mazowiecki",
      config: {
        type: "wordpress_rest",
        officialUrl: "https://www.pwikminsk.pl",
        apiUrl: "https://www.pwikminsk.pl/wp-json/wp/v2/posts?per_page=6",
        keywordSetId: "water-interruptions",
      },
    },
    {
      id: "pwik-wyszkow",
      name: "PWiK Wyszków",
      category: "water",
      gmina: "Wyszków",
      config: {
        type: "wordpress_rest",
        officialUrl: "https://pwikwyszkow.pl",
        apiUrl: "https://pwikwyszkow.pl/wp-json/wp/v2/posts?per_page=6",
        keywordSetId: "water-interruptions",
      },
    },
    {
      id: "pwik-pultusk",
      name: "PWiK Pułtusk",
      category: "water",
      gmina: "Pułtusk",
      config: {
        type: "wordpress_rest",
        officialUrl: "https://pwikpultusk.pl",
        apiUrl: "https://pwikpultusk.pl/wp-json/wp/v2/posts?per_page=6",
        keywordSetId: "water-interruptions",
      },
    },
    {
      id: "wodkan-zgierz",
      name: "Wodociągi i Kanalizacja — Zgierz",
      category: "water",
      gmina: "Zgierz",
      config: {
        type: "wordpress_rest",
        officialUrl: "https://www.wodkan.zgierz.pl",
        apiUrl: "https://www.wodkan.zgierz.pl/wp-json/wp/v2/posts?per_page=6",
        keywordSetId: "water-interruptions",
      },
    },
    {
      id: "zwik-pabianice",
      name: "ZWiK Pabianice",
      category: "water",
      gmina: "Pabianice",
      config: {
        type: "wordpress_rest",
        officialUrl: "https://zwik.pabianice.pl",
        apiUrl: "https://zwik.pabianice.pl/wp-json/wp/v2/posts?per_page=6",
        keywordSetId: "water-interruptions",
      },
    },
    {
      id: "pgkim-aleksandrow-lodzki",
      name: "PGKiM Aleksandrów Łódzki",
      category: "water",
      gmina: "Aleksandrów Łódzki",
      config: {
        type: "wordpress_rest",
        officialUrl: "https://pgkimal.pl",
        apiUrl: "https://pgkimal.pl/wp-json/wp/v2/posts?per_page=6",
        keywordSetId: "water-interruptions",
      },
    },
    {
      id: "rawik-rawa-mazowiecka",
      name: "RAWiK Rawa Mazowiecka",
      category: "water",
      gmina: "Rawa Mazowiecka",
      config: {
        type: "wordpress_rest",
        officialUrl: "https://rawik.pl",
        apiUrl: "https://rawik.pl/wp-json/wp/v2/posts?per_page=6",
        keywordSetId: "water-interruptions",
      },
    },
  ],
};
