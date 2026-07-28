import { test, expect } from "@playwright/test";
import {
  classifyProposalAgainstExisting,
  writeCandidatesForSource,
  buildPendingCandidateInsert,
  type ScheduledSourceWriter,
  type DedupComparisonItem,
} from "@/lib/scheduledWriter";
import { stripConfirmedDedupBoilerplate } from "@/lib/candidateWarnings";

/**
 * Sprint 177D/177E — cross-table dedup hardening. Confirms a proposal is
 * checked against readable alerts (draft, published, and archived alike
 * as of 177E), not just other candidates of the same source, closing the
 * gap independently found in Sprint 175D (computed similarity) and
 * Sprint 177C (a live Pruszków/Michałowice DW-719 example). No test here
 * touches Supabase — classifyProposalAgainstExisting is a pure function,
 * and writeCandidatesForSource is exercised with a hand-written
 * in-memory fake writer, matching this suite's existing convention.
 *
 * IMPORTANT SCOPE NOTE: the classifier and writer orchestration below are
 * status-agnostic by design — a DedupComparisonItem returned by
 * findExistingAlertComparisons() is compared identically regardless of
 * which alert status it came from. Real draft/published/archived
 * coverage depends on the proposed, NOT YET APPLIED RLS migration
 * (docs/sql/PROPOSED_SPRINT_177_AUTOMATION_ALERT_READ_POLICY_V1.sql) —
 * see automationAlertReadPolicySqlAntiDrift.spec.ts for that migration's
 * own static audit. Until Adam applies it on Production, the real
 * createSupabaseScheduledWriter implementation reads through the
 * writer's authenticated session and gets RLS-filtered to zero rows —
 * safe, but not yet exercising the draft/archived coverage these tests
 * verify at the decision-logic level.
 */

function makeFakeWriter(existingAlerts: DedupComparisonItem[] = []) {
  const insertedCandidates: ReturnType<typeof buildPendingCandidateInsert>[] = [];
  const writer: ScheduledSourceWriter = {
    async findExistingCandidateTexts() {
      return [];
    },
    async findExistingAlertComparisons() {
      return existingAlerts;
    },
    async insertPendingCandidate(payload) {
      insertedCandidates.push(payload);
      return { ok: true };
    },
    async insertSourceCheck() {
      return { ok: true };
    },
  };
  return { writer, insertedCandidates };
}

const baseSourceInfo = {
  sourceKey: "pruszkow-aktualnosci",
  sourceName: "Miasto Pruszków — aktualności",
  sourceUrl: "https://www.pruszkow.pl/mieszkancy/aktualnosci-mieszkaniec/",
  writerUserId: "fake-writer-uuid",
};

// ── 1. Identical URL — published alert ───────────────────────────────────────

test.describe("Identical URL against a published alert", () => {
  test("classifyProposalAgainstExisting: exact URL match is a confident duplicate regardless of text drift", () => {
    const existing: DedupComparisonItem[] = [
      {
        text: "Zupełnie inaczej sformułowany opis tego samego zdarzenia, żadnych wspólnych słów kluczowych",
        url: "https://www.pruszkow.pl/mieszkancy/czasowa-organizacja-ruchu-na-ul-dzialkowej-od-31-lipca-2026-r/",
      },
    ];
    const proposal = {
      text: "Kompletnie inny tekst proposal, celowo bez podobieństwa tekstowego do powyższego",
      url: "https://www.pruszkow.pl/mieszkancy/czasowa-organizacja-ruchu-na-ul-dzialkowej-od-31-lipca-2026-r/",
    };
    expect(classifyProposalAgainstExisting(proposal, existing)).toBe("duplicate");
  });

  test("writeCandidatesForSource: a proposal matching a published alert's URL is never inserted", async () => {
    const { writer, insertedCandidates } = makeFakeWriter([
      {
        text: "Czasowa organizacja ruchu na ul. Działkowej w Pruszkowie",
        url: "https://www.pruszkow.pl/mieszkancy/czasowa-organizacja-ruchu-na-ul-dzialkowej-od-31-lipca-2026-r/",
      },
    ]);
    const result = await writeCandidatesForSource(writer, {
      ...baseSourceInfo,
      proposals: [
        {
          title: "Czasowa organizacja ruchu na ul. Działkowej od 31 lipca 2026 r.",
          excerpt: "e",
          rawText: "Tekst z ponownego sprawdzenia tego samego źródła, mógł się nieznacznie zmienić w treści",
          hasDate: true,
          url: "https://www.pruszkow.pl/mieszkancy/czasowa-organizacja-ruchu-na-ul-dzialkowej-od-31-lipca-2026-r/",
        },
      ],
      registrySourceId: null,
    });
    expect(result.candidatesInserted).toBe(0);
    expect(result.duplicatesSkipped).toBe(1);
    expect(insertedCandidates).toHaveLength(0);
  });

  test("normalization tolerates a trailing slash difference, nothing else", () => {
    const existing: DedupComparisonItem[] = [
      { text: "Istniejący alert", url: "https://www.pruszkow.pl/mieszkancy/artykul" },
    ];
    const proposal = { text: "Zupełnie inny tekst bez podobieństwa", url: "https://www.pruszkow.pl/mieszkancy/artykul/" };
    expect(classifyProposalAgainstExisting(proposal, existing)).toBe("duplicate");
  });

  test("a different path is never treated as a match, even on the same domain", () => {
    const existing: DedupComparisonItem[] = [
      { text: "Istniejący alert", url: "https://www.pruszkow.pl/mieszkancy/artykul-a/" },
    ];
    const proposal = { text: "Zupełnie inny tekst bez podobieństwa", url: "https://www.pruszkow.pl/mieszkancy/artykul-b/" };
    expect(classifyProposalAgainstExisting(proposal, existing)).toBe("new");
  });
});

// ── 2 & 3. Draft / archived alerts — real coverage once the proposed
// migration (docs/sql/PROPOSED_SPRINT_177_AUTOMATION_ALERT_READ_POLICY_V1.sql)
// is applied and findExistingAlertComparisons() returns them ────────────────

test.describe("Identical URL against a draft alert", () => {
  test("a draft alert's URL still protects against a duplicate candidate — status is never consulted by the classifier", async () => {
    const { writer, insertedCandidates } = makeFakeWriter([
      {
        text: "Remont chodnika przy wiadukcie na ul. Poznańskiej — wciąż w draftcie, nieopublikowany",
        url: "https://www.pruszkow.pl/mieszkancy/remont-chodnika-przy-wiadukcie/",
      },
    ]);
    const result = await writeCandidatesForSource(writer, {
      ...baseSourceInfo,
      proposals: [
        {
          title: "Remont chodnika przy wiadukcie",
          excerpt: "e",
          rawText: "Zupełnie inaczej sformułowany opis tego samego artykułu draftu",
          hasDate: true,
          url: "https://www.pruszkow.pl/mieszkancy/remont-chodnika-przy-wiadukcie/",
        },
      ],
      registrySourceId: null,
    });
    expect(result.candidatesInserted).toBe(0);
    expect(result.duplicatesSkipped).toBe(1);
    expect(insertedCandidates).toHaveLength(0);
  });
});

test.describe("Identical URL against an archived alert", () => {
  test("an archived alert's URL still protects against re-creating a candidate for the same official article", async () => {
    const { writer, insertedCandidates } = makeFakeWriter([
      {
        text: "Brak wody — Granica, Nowa Wieś, już zarchiwizowany",
        url: "https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty/rok-2026/brak-wody-granica-nowa-wies,p1882508487",
      },
    ]);
    const result = await writeCandidatesForSource(writer, {
      ...baseSourceInfo,
      sourceKey: "michalowice-komunikaty",
      proposals: [
        {
          title: "Brak wody — Granica, Nowa Wieś",
          excerpt: "e",
          rawText: "Ten sam artykuł, ponownie wykryty przez scheduled writer po zarchiwizowaniu",
          hasDate: true,
          url: "https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty/rok-2026/brak-wody-granica-nowa-wies,p1882508487",
        },
      ],
      registrySourceId: null,
    });
    expect(result.candidatesInserted).toBe(0);
    expect(result.duplicatesSkipped).toBe(1);
    expect(insertedCandidates).toHaveLength(0);
  });
});

test.describe("Similar text (no URL) against draft and archived alerts", () => {
  test("high word-overlap against a draft alert's text is classified duplicate using the existing threshold", () => {
    const draftAlertText = "przerwa dostawa wody komorow ulica krakowska godzina dziewiata czternasta czwartek";
    const proposal = { text: "przerwa dostawa wody komorow ulica krakowska godzina dziewiata czternasta czwartek" };
    expect(classifyProposalAgainstExisting(proposal, [{ text: draftAlertText }])).toBe("duplicate");
  });

  test("high word-overlap against an archived alert's text is classified duplicate using the existing threshold", () => {
    const archivedAlertText = "brak wody granica nowa wies ulica glowna godziny konserwacja sieci wodociagowej";
    const proposal = { text: "brak wody granica nowa wies ulica glowna godziny konserwacja sieci wodociagowej" };
    expect(classifyProposalAgainstExisting(proposal, [{ text: archivedAlertText }])).toBe("duplicate");
  });

  test("a genuinely new proposal is still inserted when only unrelated draft/archived alerts exist", async () => {
    const { writer, insertedCandidates } = makeFakeWriter([
      { text: "Zupełnie niepowiązany, stary, zarchiwizowany komunikat o czymś innym" },
    ]);
    const result = await writeCandidatesForSource(writer, {
      ...baseSourceInfo,
      proposals: [
        { title: "Nowy komunikat", excerpt: "e", rawText: "Treść niepowiązana z żadnym istniejącym alertem w tym teście", hasDate: false },
      ],
      registrySourceId: null,
    });
    expect(result.candidatesInserted).toBe(1);
    expect(insertedCandidates).toHaveLength(1);
  });
});

// ── 4. Same communique, lightly reworded text (no URL available) ────────────

test.describe("Same communique, lightly reworded — no URL, falls back to existing text-similarity threshold", () => {
  test("high word-overlap against a published alert's text is classified duplicate using the existing, unmodified threshold", () => {
    // Same overlap construction as this suite's existing ambiguous/duplicate
    // fixtures (scheduledWriter.spec.ts) — DUPLICATE_CONFIDENCE_THRESHOLD is
    // 0.9, unmodified by this sprint.
    const existingAlertText =
      "przerwa dostawa wody komorow ulica krakowska godzina dziewiata czternasta czwartek";
    const proposal = {
      text: "przerwa dostawa wody komorow ulica krakowska godzina dziewiata czternasta czwartek",
    };
    const existing: DedupComparisonItem[] = [{ text: existingAlertText }];
    expect(classifyProposalAgainstExisting(proposal, existing)).toBe("duplicate");
  });
});

// ── 5. Ambiguous similarity — not new, not duplicate ─────────────────────────

test.describe("Ambiguous similarity against a published alert", () => {
  test("moderate overlap is classified ambiguous, not duplicate, not new — and never inserted", async () => {
    // Identical overlap construction to the existing ambiguous fixture in
    // scheduledWriter.spec.ts: 5 significant words in the existing text,
    // candidate shares 4 of them + 3 new ones → 4/5 = 0.8, between
    // AMBIGUOUS_SIMILARITY_THRESHOLD (0.6) and DUPLICATE_CONFIDENCE_THRESHOLD (0.9).
    const existingText = "syren alarmowych testowe uruchomienie gminie";
    const proposalText = "gminie syren testowe uruchomienie zupelnie inny dodatkowy";
    expect(
      classifyProposalAgainstExisting({ text: proposalText }, [{ text: existingText }])
    ).toBe("ambiguous");

    const { writer, insertedCandidates } = makeFakeWriter([{ text: existingText }]);
    const result = await writeCandidatesForSource(writer, {
      ...baseSourceInfo,
      proposals: [{ title: "T", excerpt: "e", rawText: proposalText, hasDate: false }],
      registrySourceId: null,
    });
    expect(result.ambiguousCandidates).toBe(1);
    expect(result.candidatesInserted).toBe(0);
    expect(insertedCandidates).toHaveLength(0);
  });
});

// ── 6. Same road, different event — must NOT be forced duplicate ────────────

test.describe("Same road, different permalink/segment/date — never a forced duplicate on topic alone", () => {
  test("DW nr 719 in Nowa Wieś: a genuinely new phase of roadworks, different URL, low text overlap, is NOT classified duplicate", () => {
    // Modeled on the real Sprint 177C finding: the existing published
    // alert text (STRABAG contractor, km markers omitted, "sierpień")
    // and a new official notice about the same road (different permalink,
    // different contractor/segment framing) share very little vocabulary
    // once boilerplate words are excluded — computed overlap in the real
    // case was ~0.25, well under AMBIGUOUS_SIMILARITY_THRESHOLD (0.6).
    // This is the explicit false-positive case this sprint's brief
    // requires to stay open, not auto-blocked.
    const existingAlert: DedupComparisonItem = {
      text:
        "Od 9 lipca 2026 r. na odcinku DW nr 719 w Nowej Wsi obowiązuje czasowa organizacja ruchu " +
        "w związku z pracami prowadzonymi przez STRABAG. Jezdnia jest zwężona, ale ruch dwukierunkowy " +
        "pozostaje zachowany. Przewidywane zakończenie prac: sierpień 2026 r.",
      url: "https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty/rok-2026/utrudnienia-w-ruchu-drogowym-dw-nr-719-nowa-wies,p2027957373",
    };
    const newProposal = {
      text:
        "Od 29 lipca 2026 r. od godz. 9:00 zostanie wprowadzona czasowa organizacja ruchu na drodze " +
        "wojewódzkiej nr 719 w Nowej Wsi, na terenie gminy Michałowice. Zmiany obejmą odcinek od km 22+531 do km 23+27",
      url: "https://www.pruszkow.pl/mieszkancy/aktualnosci-mieszkaniec/zmiana-organizacji-ruchu-na-drodze-wojewodzkiej-nr-719/",
    };
    const classification = classifyProposalAgainstExisting(newProposal, [existingAlert]);
    expect(classification).not.toBe("duplicate");
  });
});

// ── 7. Cross-source: identical URL still protects, regardless of source_key ──

test.describe("Cross-source identical URL still protects against duplication", () => {
  test("a proposal from a different source_key than the alert's own source is still caught by exact URL match", () => {
    const existingAlert: DedupComparisonItem = {
      text: "Komunikat opublikowany pierwotnie z innego źródła",
      url: "https://example-official-site.pl/aktualnosci/konkretny-artykul/",
    };
    const proposal = {
      text: "Zupełnie inaczej sformułowany, ten sam artykuł namierzony przez inne źródło",
      url: "https://example-official-site.pl/aktualnosci/konkretny-artykul/",
    };
    expect(classifyProposalAgainstExisting(proposal, [existingAlert])).toBe("duplicate");
  });
});

// ── 8. No alerts available — pre-existing candidate-vs-candidate dedup unaffected ──

test.describe("No published alerts available", () => {
  test("candidate-vs-candidate dedup still works exactly as before this sprint", async () => {
    const existing = ["Testowe uruchomienie syren alarmowych w gminie 16 lipca 2026 roku o godzinie 12:00"];
    const insertedCandidates: ReturnType<typeof buildPendingCandidateInsert>[] = [];
    const writer: ScheduledSourceWriter = {
      async findExistingCandidateTexts() {
        return [...existing];
      },
      async findExistingAlertComparisons() {
        return [];
      },
      async insertPendingCandidate(payload) {
        insertedCandidates.push(payload);
        return { ok: true };
      },
      async insertSourceCheck() {
        return { ok: true };
      },
    };
    const result = await writeCandidatesForSource(writer, {
      ...baseSourceInfo,
      proposals: [
        {
          title: "Syreny",
          excerpt: "e",
          rawText: "Testowe uruchomienie syren alarmowych w gminie 16 lipca 2026 roku o godzinie 12:00",
          hasDate: true,
        },
      ],
      registrySourceId: null,
    });
    expect(result.duplicatesSkipped).toBe(1);
    expect(insertedCandidates).toHaveLength(0);
  });

  test("a writer that doesn't implement findExistingAlertComparisons at all (older fake) behaves identically to an empty result", async () => {
    const insertedCandidates: ReturnType<typeof buildPendingCandidateInsert>[] = [];
    const writer: ScheduledSourceWriter = {
      async findExistingCandidateTexts() {
        return [];
      },
      async insertPendingCandidate(payload) {
        insertedCandidates.push(payload);
        return { ok: true };
      },
      async insertSourceCheck() {
        return { ok: true };
      },
    };
    const result = await writeCandidatesForSource(writer, {
      ...baseSourceInfo,
      proposals: [{ title: "T", excerpt: "e", rawText: "Zupełnie nowa treść testowa", hasDate: false }],
      registrySourceId: null,
    });
    expect(result.candidatesInserted).toBe(1);
    expect(insertedCandidates).toHaveLength(1);
  });
});

// ── 9. Cap enforcement unaffected ────────────────────────────────────────────

test.describe("Cap enforcement unaffected by the wider comparison pool", () => {
  test("default cap (1) still applies with published alerts present in the comparison pool", async () => {
    const { writer, insertedCandidates } = makeFakeWriter([
      { text: "Jakiś niepowiązany opublikowany alert", url: "https://example.pl/inny-artykul/" },
    ]);
    const result = await writeCandidatesForSource(writer, {
      ...baseSourceInfo,
      proposals: [
        { title: "Komunikat A", excerpt: "e", rawText: "Zamknięcie przejazdu kolejowego na ulicy Kolejowej w Komorowie od piątku", hasDate: true },
        { title: "Komunikat B", excerpt: "e", rawText: "Przerwa w dostawie prądu w Nowej Wsi zaplanowana na środę wieczorem", hasDate: false },
      ],
      registrySourceId: null,
    });
    expect(result.candidatesInserted).toBe(1);
    expect(result.cappedSkipped).toBe(1);
    expect(insertedCandidates).toHaveLength(1);
  });
});

// ── 10. candidate_url still flows through unaffected ─────────────────────────

test.describe("candidate_url still reaches the insert payload alongside the new dedup check", () => {
  test("a genuinely new proposal with a safe url still saves candidate_url correctly", async () => {
    const { writer, insertedCandidates } = makeFakeWriter([]);
    await writeCandidatesForSource(writer, {
      ...baseSourceInfo,
      proposals: [
        {
          title: "Nowy, niepowiązany komunikat",
          excerpt: "e",
          rawText: "Treść zupełnie nowego, wcześniej nieznanego komunikatu operacyjnego",
          hasDate: true,
          url: "https://www.pruszkow.pl/mieszkancy/nowy-artykul/",
        },
      ],
      registrySourceId: null,
    });
    expect(insertedCandidates).toHaveLength(1);
    expect(insertedCandidates[0].candidate_url).toBe("https://www.pruszkow.pl/mieszkancy/nowy-artykul/");
  });
});

// ── 11. Pruszków 177C regression — same official communique, reworded ───────

test.describe("Sprint 177C regression — same official communique reported with recognizably similar wording is caught", () => {
  test("a paraphrased repost of an already-published notice (high text overlap) is classified duplicate before insert", async () => {
    // This models the CLASS of risk 177C surfaced — the same official
    // communique reappearing without an identical permalink — using text
    // with genuinely high overlap (the case a text-similarity check can
    // honestly catch). The real, live 177C example (DW-719, different
    // contractor framing, ~0.25 overlap) is deliberately NOT force-flagged
    // here or anywhere in this suite — seetest group 6 above — because
    // its actual textual similarity is too low to distinguish from a
    // genuinely new phase of roadworks without inventing an unjustified
    // same-road heuristic this sprint's brief explicitly rules out.
    const publishedAlertText =
      "czasowa organizacja ruchu ulica dzialkowa pruszkow lipca zamkniety pas ruchu mijanka oznakowanie tymczasowe";
    const repostedProposalText =
      "czasowa organizacja ruchu ulica dzialkowa pruszkow lipca zamkniety pas ruchu mijanka szczegolna ostroznosc";
    const { writer, insertedCandidates } = makeFakeWriter([{ text: publishedAlertText }]);
    const result = await writeCandidatesForSource(writer, {
      ...baseSourceInfo,
      proposals: [{ title: "Repost", excerpt: "e", rawText: repostedProposalText, hasDate: true }],
      registrySourceId: null,
    });
    expect(result.candidatesInserted).toBe(0);
    expect(result.duplicatesSkipped + result.ambiguousCandidates).toBeGreaterThan(0);
    expect(insertedCandidates).toHaveLength(0);
  });
});

// ── 12. Sprint 180B — the real live case, confirmed ─────────────────────────

test.describe("Sprint 180B regression — the real, live-fired DW nr 719 stage-2 candidate is confirmed 'new', not a duplicate", () => {
  test("candidate 758819cc (2026-07-28, Vercel-Cron-triggered write-candidates run) reproduces classification 'new' with the exact production text", () => {
    // This is not a hypothetical any more — group 6 above ("Same road,
    // different permalink/segment/date") modeled this scenario in advance
    // (Sprint 177C/177E); Sprint 180's first real scheduled Cron run then
    // produced the actual live case it predicted: candidate
    // 758819cc-b532-4b54-af86-d25d28da45b4, "Zmiana organizacji ruchu na
    // drodze wojewódzkiej nr 719", inserted 2026-07-28 06:34:51 UTC. Every
    // string below is copied verbatim from the live Production database
    // (source_notice_candidates.raw_text, truncated to 321 chars by the
    // parser exactly as stored — the trailing "[...]" is real, not an
    // ellipsis added here) and the live published alerts row
    // (80983ceb-3f97-4d7b-8cbc-f2f0083aa7bc, title + change). Forensic
    // audit (docs/SPRINT_180_DW719_DEDUP_AND_CRON_KILLSWITCH_AUDIT_V1.md)
    // reproduced the exact word-overlap score by hand: 8 shared
    // significant words out of a 24-word candidate set = 0.333 — well
    // under AMBIGUOUS_SIMILARITY_THRESHOLD (0.6). Both notices describe
    // the same underlying investment (STRABAG, DW 719, Nowa Wieś, km
    // 22+531–23+274) but a genuinely different, future-dated traffic
    // reorganization stage (9 lipca "obowiązuje" vs 29 lipca "zostanie
    // wprowadzona") — classification B (a distinct stage of a larger
    // event), never C (duplicate), matching this suite's group-6 finding.
    const existingAlert: DedupComparisonItem = {
      text:
        "Utrudnienia w ruchu drogowym – DW nr 719, Nowa Wieś " +
        "Od 9 lipca 2026 r. na odcinku DW nr 719 w Nowej Wsi obowiązuje czasowa organizacja ruchu " +
        "w związku z pracami prowadzonymi przez STRABAG. Jezdnia jest zwężona, ale ruch dwukierunkowy " +
        "pozostaje zachowany. Przewidywane zakończenie prac: sierpień 2026 r.",
      url: "https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty/rok-2026/utrudnienia-w-ruchu-drogowym-dw-nr-719-nowa-wies,p2027957373",
    };
    const liveCandidateProposal = {
      text:
        "Od 29 lipca 2026 r. od godz. 9:00 zostanie wprowadzona czasowa organizacja ruchu na drodze " +
        "wojewódzkiej nr 719 w Nowej Wsi, na terenie gminy Michałowice. Zmiany obejmą odcinek od km " +
        "22+531 do km 23+274 i są związane z realizacją inwestycji pn. „Rozbudowa DW nr 719 od km " +
        "22+531 do km 23+274 w miejscowości Nowa Wieś [...]",
      url: "https://www.pruszkow.pl/mieszkancy/aktualnosci-mieszkaniec/zmiana-organizacji-ruchu-na-drodze-wojewodzkiej-nr-719/",
    };
    expect(classifyProposalAgainstExisting(liveCandidateProposal, [existingAlert])).toBe("new");
  });
});

// ── 13. Sprint 181A — confirmed short-text boilerplate false-positive fix ───
//
// Root cause: textSimilarity's ratio divides by the SMALLER text's
// significant-word count. A short comparison text (a real, reachable
// shape — findExistingCandidateTexts falls back to a bare title when
// raw_text/excerpt are both empty) sharing just a handful of generic
// Polish municipal-notice words with an unrelated notice can cross
// AMBIGUOUS_SIMILARITY_THRESHOLD on administrative boilerplate alone,
// with zero shared substance. Confirmed live near-miss (analysis
// 2026-07-28, NOT an actual Production incident — no such short-text
// comparison ever actually occurred; found via a corrected reproduction
// of the Sprint 180C canary): the real DW 719 candidate text against the
// bare title "Czasowa organizacja ruchu na ul. Działkowej w Pruszkowie"
// (no body) scored exactly 0.6000 — the threshold value itself.
test.describe("Sprint 181A — boilerplate-aware dedup: eliminates the confirmed short-text false-positive without weakening real duplicate detection", () => {
  const dw719CandidateText =
    "Od 29 lipca 2026 r. od godz. 9:00 zostanie wprowadzona czasowa organizacja ruchu na drodze " +
    "wojewódzkiej nr 719 w Nowej Wsi, na terenie gminy Michałowice. Zmiany obejmą odcinek od km " +
    "22+531 do km 23+274 i są związane z realizacją inwestycji pn. „Rozbudowa DW nr 719 od km " +
    "22+531 do km 23+274 w miejscowości Nowa Wieś [...]";
  const dw719Url = "https://www.pruszkow.pl/mieszkancy/aktualnosci-mieszkaniec/zmiana-organizacji-ruchu-na-drodze-wojewodzkiej-nr-719/";

  test("the confirmed near-miss: a bare, boilerplate-only alert title no longer crosses ambiguous against an unrelated notice", () => {
    const dzialkowaTitleOnly = "Czasowa organizacja ruchu na ul. Działkowej w Pruszkowie";
    const classification = classifyProposalAgainstExisting(
      { text: dw719CandidateText, url: dw719Url },
      [{ text: dzialkowaTitleOnly, url: "https://www.pruszkow.pl/mieszkancy/czasowa-organizacja-ruchu-na-ul-dzialkowej-od-31-lipca-2026-r/" }]
    );
    expect(classification).toBe("new");
  });

  test("the same DW 719 notice, re-scraped verbatim (genuine exact duplicate), still classifies duplicate", () => {
    const classification = classifyProposalAgainstExisting(
      { text: dw719CandidateText },
      [{ text: dw719CandidateText }]
    );
    expect(classification).toBe("duplicate");
  });

  test("the same DW 719 notice, lightly reworded (genuine near-duplicate, real prose not a synthetic word-list), still classifies duplicate or ambiguous — never new", () => {
    const reworded =
      "Uwaga! Od 29 lipca 2026 r., od godziny 9:00, zostanie wprowadzona czasowa organizacja ruchu na " +
      "drodze wojewódzkiej nr 719 w miejscowości Nowa Wieś (gmina Michałowice). Zmiany obejmą odcinek " +
      "od km 22+531 do km 23+274, w związku z inwestycją „Rozbudowa DW nr 719”.";
    const classification = classifyProposalAgainstExisting({ text: dw719CandidateText }, [{ text: reworded }]);
    expect(classification).not.toBe("new");
  });

  test("different stages of the same DW 719 investment (same road, different segment framing/date, real prose) are still distinguished as new — the existing group-6/12 finding is unaffected by the boilerplate strip", () => {
    const stage1RealAlert =
      "Od 9 lipca 2026 r. na odcinku DW nr 719 w Nowej Wsi obowiązuje czasowa organizacja ruchu w związku z " +
      "pracami prowadzonymi przez STRABAG. Jezdnia jest zwężona, ale ruch dwukierunkowy pozostaje zachowany. " +
      "Przewidywane zakończenie prac: sierpień 2026 r.";
    const classification = classifyProposalAgainstExisting({ text: dw719CandidateText }, [{ text: stage1RealAlert }]);
    expect(classification).toBe("new");
  });

  test("a genuinely ambiguous case (moderate, non-boilerplate overlap) is still ambiguous — the strip only ever removes confirmed filler phrases", () => {
    // Same fixture as test group 5 above — none of these words are on the
    // confirmed boilerplate list, so behavior is provably unchanged.
    const existingText = "syren alarmowych testowe uruchomienie gminie";
    const proposalText = "gminie syren testowe uruchomienie zupelnie inny dodatkowy";
    expect(classifyProposalAgainstExisting({ text: proposalText }, [{ text: existingText }])).toBe("ambiguous");
  });

  test("stripConfirmedDedupBoilerplate never removes a street name, road number, locality, or date token", () => {
    const stripped = stripConfirmedDedupBoilerplate(dw719CandidateText);
    for (const mustSurvive of ["drodze", "wojewodzkiej", "719", "nowej", "wsi", "michalowice", "2026", "lipca"]) {
      expect(stripped).toContain(mustSurvive);
    }
  });

  test("stripConfirmedDedupBoilerplate is symmetric and can only shrink the significant-word set, never grow it", () => {
    const original = dw719CandidateText;
    const stripped = stripConfirmedDedupBoilerplate(original);
    expect(stripped.length).toBeLessThanOrEqual(original.length);
  });
});
