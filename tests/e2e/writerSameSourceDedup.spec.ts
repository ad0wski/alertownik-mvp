import { test, expect } from "@playwright/test";
import {
  writeCandidatesForSource,
  classifyProposalAgainstSameSourceItems,
  classifyProposalAgainstExisting,
  prioritizeActionableProposals,
  getMaxCandidatesPerInvocation,
  MAX_ALLOWED_CANDIDATES_PER_INVOCATION,
  DEFAULT_MAX_CANDIDATES_PER_INVOCATION,
  type ScheduledSourceWriter,
} from "@/lib/scheduledWriter";
import { extractEventDateIso, extractEventPlaces } from "@/lib/candidateWarnings";
import { buildCheckProposals, type CheckProposal } from "@/lib/sourceCheck";
import {
  evaluateAutoPublishEligibility,
  getMaxAutoPublishPerInvocation,
  DEFAULT_MAX_AUTO_PUBLISH_PER_INVOCATION,
} from "@/lib/trustedSourceAutoPublish";

/**
 * LR-5 — Operational Freshness Hardening.
 *
 * An official source reuses one template for every notice of a kind
 * ("Brak wody - <miejscowość>": same sentence, different locality, streets
 * and date). Word-overlap similarity alone cannot tell "the same notice
 * again" from "another event of the same kind", and used to withhold most
 * real water notices as ambiguous. These tests pin the rule that replaced
 * it: similarity may not block a pair that provably differs in event date
 * or locality — while every strong duplicate signal still wins, and
 * missing information keeps the old conservative behavior.
 *
 * Texts are in the real shape the listing parser produces
 * ("<post timestamp>\n<teaser>"); wording follows real 2026 notices.
 */

const POOL_REGULY_10_NOV =
  "06.11.2026 14:55\nInformujemy, że 10 listopada 2026 r., w godz. 11:00 - 15:00 nastąpi przerwa w dostawie wody do posesji położonych w miejscowości Reguły, przy ulicach: Królewskiej, Bocznej, Działkowej, Zacisznej.";
const KOMOROW_30_OCT =
  "29.10.2026 15:45\nInformujemy, że 30 października 2026 r., w godz. 9:00 - 13:00 nastąpi przerwa w dostawie wody do posesji położonych w miejscowości Komorów, ul. Nadarzyńska (od ul. 3 Maja do ul. Józefa Ignacego Kraszewskiego).";

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    previous[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(vars)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

function makeFakeWriter(existingTexts: string[] = []) {
  const insertedCandidates: Array<Record<string, unknown>> = [];
  const insertedChecks: unknown[] = [];
  let autoPublishCalls = 0;
  const writer: ScheduledSourceWriter = {
    async findExistingCandidateTexts() {
      return existingTexts;
    },
    async findExistingAlertComparisons() {
      return [];
    },
    async findPendingCandidatesFromOtherSources() {
      return [];
    },
    async insertPendingCandidate(payload) {
      insertedCandidates.push(payload as unknown as Record<string, unknown>);
      return { ok: true };
    },
    async insertSourceCheck(payload) {
      insertedChecks.push(payload);
      return { ok: true };
    },
    async insertPublishedAlert() {
      autoPublishCalls++;
      return { ok: false, reason: "unknown_error" };
    },
    async markCandidateAutoPublished() {
      autoPublishCalls++;
      return { ok: false };
    },
    async findPendingAutoPublishCandidates() {
      autoPublishCalls++;
      return [];
    },
  };
  return { writer, insertedCandidates, insertedChecks, autoPublishCalls: () => autoPublishCalls };
}

const baseInput = {
  sourceKey: "michalowice-komunikaty",
  sourceName: "Gmina Michałowice — komunikaty",
  sourceUrl: "https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty",
  registrySourceId: "fake-registry-uuid",
  writerUserId: "fake-writer-uuid",
};

function proposal(title: string, rawText: string, url?: string): CheckProposal {
  return { title, excerpt: rawText.slice(0, 120), rawText, hasDate: true, url };
}

test.describe("event signals used by the veto", () => {
  test("the leading post timestamp is never the event date", () => {
    expect(extractEventDateIso(POOL_REGULY_10_NOV)?.slice(0, 10)).toBe("2026-11-10");
    expect(extractEventDateIso("03.11.2026 15:59\nCentrum Usług Wspólnych ogłosiło nabór na stanowisko ds. kadr i płac.")).toBeNull();
  });

  test("a labelled event date is kept", () => {
    expect(extractEventDateIso("Data wydarzenia: 06.11.2026 09:00\nNastąpi przerwa w dostawie wody.")?.slice(0, 10)).toBe("2026-11-06");
  });

  test("'D miesiąca br.' takes the year of the notice's own post timestamp — and stays unknown without one", () => {
    expect(extractEventDateIso("07.04.2026 11:55\nInformujemy, że 8 kwietnia br., w godz.: 8:00-15:00 nastąpi przerwa w dostawie wody.")?.slice(0, 10)).toBe("2026-04-08");
    expect(extractEventDateIso("Informujemy, że 8 kwietnia br. nastąpi przerwa w dostawie wody.")).toBeNull();
  });

  test("a year-less date just after New Year's Eve rolls into the next year", () => {
    expect(extractEventDateIso("30.12.2026 10:00\nInformujemy, że 2 stycznia nastąpi przerwa w dostawie wody.")?.slice(0, 10)).toBe("2027-01-02");
  });

  test("every named pilot locality is read; the municipality's own name is not a locality", () => {
    expect(extractEventPlaces("Brak wody - Granica i Nowa Wieś")).toEqual(["Nowa Wieś", "Granica"]);
    expect(extractEventPlaces("Urząd Gminy Michałowice informuje o przerwie w miejscowości Reguły")).toEqual(["Reguły"]);
    expect(extractEventPlaces("Przerwa w dostawie wody w miejscowości Michałowice, ul. Szkolna")).toEqual(["Michałowice"]);
    expect(extractEventPlaces("Przerwa w dostawie wody w Opaczy-Kolonii")).toEqual([]);
  });
});

test.describe("same-source dedup — place/date veto", () => {
  test("1. same generic title and template, different reliable event date → distinct", () => {
    const next = "12.11.2026 09:00\nInformujemy, że 14 listopada 2026 r., w godz. 11:00 - 15:00 nastąpi przerwa w dostawie wody do posesji położonych w miejscowości Reguły, przy ulicach: Królewskiej, Bocznej.";
    expect(classifyProposalAgainstExisting({ text: next }, [{ text: POOL_REGULY_10_NOV }])).not.toBe("new");
    expect(classifyProposalAgainstSameSourceItems({ text: next, title: "Brak wody - Reguły" }, [{ text: POOL_REGULY_10_NOV }])).toBe("new");
  });

  test("2. same generic title and template, same date, disjoint localities → distinct", () => {
    const granica = "06.11.2026 15:10\nInformujemy, że 10 listopada 2026 r., w godz. 11:00 - 15:00 nastąpi przerwa w dostawie wody do posesji położonych w miejscowości Granica, przy ulicach: Śliwkowej, Długiej.";
    expect(classifyProposalAgainstSameSourceItems({ text: granica, title: "Brak wody - Granica" }, [{ text: POOL_REGULY_10_NOV }])).toBe("new");
  });

  test("3. similar text, same date, same place, same event → still blocked as a duplicate", () => {
    const reworded = "07.11.2026 08:00\nPrzypominamy, że 10 listopada 2026 r., w godz. 11:00 - 15:00 nastąpi przerwa w dostawie wody do posesji położonych w miejscowości Reguły, przy ulicach: Królewskiej, Bocznej, Działkowej, Zacisznej.";
    expect(classifyProposalAgainstSameSourceItems({ text: reworded, title: "Brak wody - Reguły" }, [{ text: POOL_REGULY_10_NOV }])).toBe("duplicate");
  });

  test("4. missing date AND missing place on one side → exactly the previous conservative verdict", () => {
    const noSignals = "Awaria sieci — nastąpi przerwa w dostawie wody do posesji położonych przy ulicach: Królewskiej, Bocznej, Działkowej, Zacisznej. Przepraszamy za utrudnienia.";
    const before = classifyProposalAgainstExisting({ text: noSignals }, [{ text: POOL_REGULY_10_NOV }]);
    expect(before).not.toBe("new");
    expect(classifyProposalAgainstSameSourceItems({ text: noSignals }, [{ text: POOL_REGULY_10_NOV }])).toBe(before);
    // …and symmetrically, when the EXISTING item is the one without signals.
    expect(classifyProposalAgainstSameSourceItems({ text: POOL_REGULY_10_NOV, title: "Brak wody - Reguły" }, [{ text: noSignals }])).toBe(
      classifyProposalAgainstExisting({ text: POOL_REGULY_10_NOV }, [{ text: noSignals }])
    );
  });

  test("4b. a date known on one side only is not a disagreement — still conservative", () => {
    const sameVillageNoDate = "Nastąpi przerwa w dostawie wody do posesji położonych w miejscowości Reguły, przy ulicach: Królewskiej, Bocznej, Działkowej, Zacisznej.";
    expect(classifyProposalAgainstSameSourceItems({ text: sameVillageNoDate }, [{ text: POOL_REGULY_10_NOV }])).not.toBe("new");
  });

  test("5. an identical permalink is always a duplicate — even with a different date and place in the text", () => {
    const url = "https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty/rok-2026/brak-wody-reguly,p1077989952";
    expect(
      classifyProposalAgainstSameSourceItems({ text: KOMOROW_30_OCT, title: "Brak wody - Komorów", url }, [
        { text: POOL_REGULY_10_NOV, url: `${url}/` },
      ])
    ).toBe("duplicate");
  });

  test("6. water notice for Reguły vs an earlier water notice in another village → not ambiguous", () => {
    expect(classifyProposalAgainstSameSourceItems({ text: POOL_REGULY_10_NOV, title: "Brak wody - Reguły" }, [{ text: KOMOROW_30_OCT }])).toBe("new");
  });

  test("7. water notices in the same village on different dates → distinct", () => {
    const komorow5Nov = "04.11.2026 12:00\nInformujemy, że 5 listopada 2026 r., w godz. 10:00 - 14:00 nastąpi przerwa w dostawie wody do posesji położonych w miejscowości Komorów, ul. Spacerowa (od ul. Bolesława Prusa do ul. Marii Konopnickiej).";
    expect(classifyProposalAgainstSameSourceItems({ text: komorow5Nov, title: "Brak wody - Komorów" }, [{ text: KOMOROW_30_OCT }])).toBe("new");
  });

  test("overlapping locality sets are not a disagreement (Granica i Nowa Wieś vs Nowa Wieś, same day)", () => {
    const both = "30.06.2026 13:25\nInformujemy, że 3 lipca 2026 r., w godz.: 10:00 - 16:00 nastąpi przerwa w dostawie wody do posesji położonych w miejscowościach: Granica oraz Nowa Wieś, przy ul. Głównej.";
    const one = "02.07.2026 13:35\nInformujemy, że 3 lipca 2026 r. (piątek), w godz.: 9:00 - 12:00 nastąpi przerwa w dostawie wody do posesji położonych w miejscowości Nowa Wieś, przy ul. Głównej.";
    expect(classifyProposalAgainstSameSourceItems({ text: one, title: "Brak wody - Nowa Wieś" }, [{ text: both }])).not.toBe("new");
  });

  test("a notice is never 'new' against its own stored copy, whatever its title adds", () => {
    for (const [title, text] of [
      ["Brak wody - Reguły", POOL_REGULY_10_NOV],
      ["Brak wody - Komorów", "07.04.2026 11:55\nInformujemy, że 8 kwietnia br., w godz.: 8:00-15:00 nastąpi przerwa w dostawie wody do posesji położonych w miejscowości Komorów."],
      ["Zapisy na dowóz uczniów — do 20 czerwca 2026 r.", "02.06.2026 10:15\nRodzice dzieci proszeni są o zapisywanie dzieci do 20 czerwca na dowóz do szkół gminnych autobusem."],
    ]) {
      expect(classifyProposalAgainstSameSourceItems({ text, title }, [{ text }]), title).toBe("duplicate");
    }
  });

  test("the auto-publish gate keeps the original classifier — its verdict for the same pair is unchanged", () => {
    const next = "12.11.2026 09:00\nInformujemy, że 14 listopada 2026 r., w godz. 11:00 - 15:00 nastąpi przerwa w dostawie wody do posesji położonych w miejscowości Reguły, przy ulicach: Królewskiej, Bocznej.";
    withEnv(
      {
        SCHEDULED_AUTO_PUBLISH_SOURCE_IDS: '["michalowice-komunikaty"]',
        SCHEDULED_WRITER_SOURCE_REGISTRY_IDS: '{"michalowice-komunikaty":"fake-registry-uuid"}',
      },
      () => {
        const result = evaluateAutoPublishEligibility(
          {
            id: "c1",
            sourceKey: "michalowice-komunikaty",
            sourceName: "Gmina Michałowice — komunikaty",
            sourceUrl: baseInput.sourceUrl,
            candidateUrl: "https://www.michalowice.pl/dzieje-sie/aktualnosci/komunikaty/rok-2026/brak-wody-reguly,p1",
            title: "Brak wody - Reguły",
            text: next,
            status: "pending",
            convertedAlertId: null,
            detectedAt: "2026-11-12T08:30:00.000Z",
            registrySourceId: "fake-registry-uuid",
          },
          [{ text: POOL_REGULY_10_NOV }],
          new Date("2026-11-12T09:00:00.000Z")
        );
        // Whatever the ORIGINAL classifier says for this pair is what the
        // gate still returns — while the writer's classifier says "new".
        const original = classifyProposalAgainstExisting({ text: next }, [{ text: POOL_REGULY_10_NOV }]);
        expect(original).not.toBe("new");
        expect(result).toEqual({ eligible: false, reason: original });
        expect(classifyProposalAgainstSameSourceItems({ text: next, title: "Brak wody - Reguły" }, [{ text: POOL_REGULY_10_NOV }])).toBe("new");
      }
    );
  });
});

test.describe("same title, different content is not a repeat (buildCheckProposals)", () => {
  const parse = (candidates: Array<{ heading: string; text: string; url?: string }>) =>
    buildCheckProposals({ title: "t", candidates: candidates.map((c) => ({ ...c, hasDate: true })) } as never);

  test("two different notices sharing one templated title are both proposed", () => {
    const proposals = parse([
      { heading: "Brak wody - Komorów", text: KOMOROW_30_OCT, url: "https://www.michalowice.pl/k/brak-wody-komorow,p1" },
      {
        heading: "Brak wody - Komorów",
        text: "29.10.2026 10:15\nInformujemy, że 30 października 2026 r., w godz. 10:00 - 14:00 nastąpi przerwa w dostawie wody do posesji położonych w miejscowości Komorów, ul. Kolejowa.",
        url: "https://www.michalowice.pl/k/brak-wody-komorow,p2",
      },
    ]);
    expect(proposals).toHaveLength(2);
  });

  test("a pinned/repeated listing item (same title, same permalink or same text) is still proposed once", () => {
    expect(
      parse([
        { heading: "Brak wody - Komorów", text: KOMOROW_30_OCT, url: "https://www.michalowice.pl/k/brak-wody-komorow,p1" },
        { heading: "Brak wody - Komorów", text: KOMOROW_30_OCT, url: "https://www.michalowice.pl/k/brak-wody-komorow,p1" },
      ])
    ).toHaveLength(1);
    expect(
      parse([
        { heading: "Brak wody - Komorów", text: KOMOROW_30_OCT },
        { heading: "Brak wody - Komorów", text: KOMOROW_30_OCT },
      ])
    ).toHaveLength(1);
  });
});

test.describe("actionable priority before the run limit", () => {
  const job = proposal("Oferta pracy w Centrum Usług Wspólnych - Kadry i Płace", "03.11.2026 15:59\nCentrum Usług Wspólnych Gminy Michałowice ogłosiło nabór na stanowisko ds. kadr i płac. Zachęcamy do aplikowania!", "https://www.michalowice.pl/k/oferta,p1");
  const contest = proposal("Konkurs plastyczny dla dzieci", "20.10.2026 15:00\nGminna Biblioteka zaprasza dzieci do udziału w konkursie plastycznym pod hasłem Jesień w ogrodzie.", "https://www.michalowice.pl/k/konkurs,p2");
  const waterReguly = proposal("Brak wody - Reguły", POOL_REGULY_10_NOV, "https://www.michalowice.pl/k/brak-wody-reguly,p3");
  const waterKomorow = proposal("Brak wody - Komorów", KOMOROW_30_OCT, "https://www.michalowice.pl/k/brak-wody-komorow,p4");
  const roads = proposal("Utrudnienia w ruchu drogowym - DW nr 719 Nowa Wieś", "03.07.2026 12:30\nInformujemy, że od 9 lipca 2026 r. na wskazanym odcinku DW nr 719 w Nowej Wsi zostanie wprowadzona czasowa organizacja ruchu.", "https://www.michalowice.pl/k/dw719,p5");

  test("8. a category-detected notice is considered before a job offer listed above it", async () => {
    expect(prioritizeActionableProposals([job, waterReguly]).map((p) => p.title)).toEqual([waterReguly.title, job.title]);
    const { writer, insertedCandidates } = makeFakeWriter();
    const result = await writeCandidatesForSource(writer, { ...baseInput, proposals: [job, waterReguly] }, 1);
    expect(insertedCandidates.map((c) => c.title)).toEqual(["Brak wody - Reguły"]);
    expect(result.cappedSkipped).toBe(1);
  });

  test("the order inside each group is the source's own order — a stable partition, not a re-ranking", () => {
    expect(prioritizeActionableProposals([job, waterKomorow, contest, roads, waterReguly]).map((p) => p.title)).toEqual([
      waterKomorow.title,
      roads.title,
      waterReguly.title,
      job.title,
      contest.title,
    ]);
  });

  test("non-category content is not dropped — it is created whenever a slot is left", async () => {
    const { writer, insertedCandidates } = makeFakeWriter();
    await writeCandidatesForSource(writer, { ...baseInput, proposals: [job, waterReguly] }, 2);
    expect(insertedCandidates.map((c) => c.title)).toEqual(["Brak wody - Reguły", job.title]);
  });

  test("9 + 10 + 12 + 13. three eligible notices, limit 2 → exactly the first two by priority, both pending, auto-publish never touched", async () => {
    const { writer, insertedCandidates, insertedChecks, autoPublishCalls } = makeFakeWriter();
    const result = await writeCandidatesForSource(writer, { ...baseInput, proposals: [job, waterKomorow, roads, waterReguly] }, 2);
    expect(result.candidatesInserted).toBe(2);
    expect(insertedCandidates).toHaveLength(2);
    expect(insertedCandidates.map((c) => c.title)).toEqual([waterKomorow.title, roads.title]);
    expect(result.cappedSkipped).toBe(2);
    for (const candidate of insertedCandidates) {
      expect(candidate.status).toBe("pending");
      expect(candidate.source_key).toBe("michalowice-komunikaty");
      expect(candidate.source_id).toBe("fake-registry-uuid");
    }
    expect(insertedChecks).toHaveLength(1);
    expect(autoPublishCalls()).toBe(0);
  });

  test("11. a proposal skipped by dedup does not use up a slot — the next new one is still created", async () => {
    const { writer, insertedCandidates } = makeFakeWriter([KOMOROW_30_OCT]);
    const result = await writeCandidatesForSource(writer, { ...baseInput, proposals: [waterKomorow, waterReguly, roads, job] }, 2);
    expect(result.duplicatesSkipped).toBe(1);
    expect(insertedCandidates.map((c) => c.title)).toEqual([waterReguly.title, roads.title]);
    expect(result.cappedSkipped).toBe(1);
  });

  test("two templated water notices for different villages in ONE run are both created", async () => {
    const { writer, insertedCandidates } = makeFakeWriter();
    const result = await writeCandidatesForSource(writer, { ...baseInput, proposals: [waterKomorow, waterReguly] }, 2);
    expect(insertedCandidates).toHaveLength(2);
    expect(result.ambiguousCandidates).toBe(0);
  });
});

test.describe("per-run limit — bounded configuration", () => {
  test("default stays 1; the env override is honored up to the hard ceiling of 2 and never beyond", () => {
    expect(DEFAULT_MAX_CANDIDATES_PER_INVOCATION).toBe(1);
    expect(MAX_ALLOWED_CANDIDATES_PER_INVOCATION).toBe(2);
    withEnv({ SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN: undefined }, () => expect(getMaxCandidatesPerInvocation()).toBe(1));
    withEnv({ SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN: "2" }, () => expect(getMaxCandidatesPerInvocation()).toBe(2));
    withEnv({ SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN: "3" }, () => expect(getMaxCandidatesPerInvocation()).toBe(2));
    withEnv({ SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN: "100" }, () => expect(getMaxCandidatesPerInvocation()).toBe(2));
    withEnv({ SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN: "0" }, () => expect(getMaxCandidatesPerInvocation()).toBe(0));
  });

  test("with the Production value (2) a run creates at most two candidates through the real default path", async () => {
    const many = [1, 2, 3, 4, 5].map((n) =>
      proposal(`Zamknięcie ulicy nr ${n}`, `0${n}.11.2026 10:00\nInformujemy, że ${10 + n} listopada 2026 r. zamknięta zostanie ulica o numerze porządkowym ${n} w miejscowości Komorów — objazd wyznaczono.`, `https://www.michalowice.pl/k/zamkniecie-${n},p${n}`)
    );
    const { writer, insertedCandidates } = makeFakeWriter();
    let result: Awaited<ReturnType<typeof writeCandidatesForSource>> | undefined;
    process.env.SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN = "2";
    try {
      result = await writeCandidatesForSource(writer, { ...baseInput, proposals: many });
    } finally {
      delete process.env.SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN;
    }
    expect(insertedCandidates).toHaveLength(2);
    expect(result!.cappedSkipped).toBe(3);
  });

  test("the writer's limit and the auto-publish limit are separate — auto-publish stays at one per invocation", () => {
    expect(DEFAULT_MAX_AUTO_PUBLISH_PER_INVOCATION).toBe(1);
    withEnv({ SCHEDULED_WRITER_MAX_CANDIDATES_PER_RUN: "2", SCHEDULED_AUTO_PUBLISH_MAX_PER_RUN: undefined }, () => {
      expect(getMaxCandidatesPerInvocation()).toBe(2);
      expect(getMaxAutoPublishPerInvocation()).toBe(1);
    });
  });
});
