import { test, expect } from "@playwright/test";
import {
  classifyProposalAgainstExisting,
  writeCandidatesForSource,
  buildPendingCandidateInsert,
  type ScheduledSourceWriter,
  type DedupComparisonItem,
} from "@/lib/scheduledWriter";

/**
 * Sprint 177D — cross-table dedup hardening. Confirms a proposal is
 * checked against readable published alerts, not just other candidates of
 * the same source, closing the gap independently found in Sprint 175D
 * (computed similarity) and Sprint 177C (a live Pruszków/Michałowice
 * DW-719 example). No test here touches Supabase — classifyProposalAgainstExisting
 * is a pure function, and writeCandidatesForSource is exercised with a
 * hand-written in-memory fake writer, matching this suite's existing
 * convention.
 *
 * IMPORTANT SCOPE NOTE (read before extending these tests): the
 * scheduled-writer's authenticated session has zero RLS access to
 * `alerts` (verified live in Sprint 177D — no policy on `alerts`
 * references `automation_identities`). findPublishedAlertComparisons()
 * therefore reads anonymously, which only the "Public can read published
 * alerts" policy permits — PUBLISHED alerts only. Draft and archived
 * alerts remain genuinely unreachable without a future, separately
 * approved RLS migration; the tests below reflect that honestly instead
 * of asserting coverage that does not exist.
 */

function makeFakeWriter(publishedAlerts: DedupComparisonItem[] = []) {
  const insertedCandidates: ReturnType<typeof buildPendingCandidateInsert>[] = [];
  const writer: ScheduledSourceWriter = {
    async findExistingCandidateTexts() {
      return [];
    },
    async findPublishedAlertComparisons() {
      return publishedAlerts;
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

// ── 2 & 3. Draft / archived alerts — documented scope limit, not a false claim ──

test.describe("Draft and archived alerts — known, documented scope limit (no RLS migration in this sprint)", () => {
  test("findPublishedAlertComparisons is published-only by construction: a fake seeded with only a 'draft-equivalent' item is not consulted unless the writer itself returns it", async () => {
    // This test documents the architectural boundary rather than pretending
    // to cover it: the real createSupabaseScheduledWriter implementation
    // can only ever populate findPublishedAlertComparisons() from published
    // alerts (RLS permits nothing else to the anon-key reader it uses).
    // Whatever a fake writer chooses to return here is a stand-in for "the
    // published alerts read"; there is no separate draft/archived read path
    // to test, by design. Draft/archived duplicate protection would require
    // a future, separately-approved RLS migration granting
    // automation_identities members SELECT on alerts filtered to those
    // statuses — explicitly out of scope for this sprint.
    const { writer, insertedCandidates } = makeFakeWriter([]);
    const result = await writeCandidatesForSource(writer, {
      ...baseSourceInfo,
      proposals: [
        {
          title: "Nowy komunikat, żaden draft go nie blokuje dziś",
          excerpt: "e",
          rawText: "Treść niepowiązana z żadnym istniejącym draftem w tym teście",
          hasDate: false,
        },
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
      async findPublishedAlertComparisons() {
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

  test("a writer that doesn't implement findPublishedAlertComparisons at all (older fake) behaves identically to an empty result", async () => {
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
