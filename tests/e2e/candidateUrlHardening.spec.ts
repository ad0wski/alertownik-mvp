import { test, expect } from "@playwright/test";
import {
  parsePruszkowRestPosts,
  parseWordpressRestPosts,
  type WordpressRestPost,
} from "@/lib/sourceParsers/pageParser";
import { buildCheckProposals } from "@/lib/sourceCheck";
import { buildPendingCandidateInsert, writeCandidatesForSource, type ScheduledSourceWriter } from "@/lib/scheduledWriter";

/**
 * Sprint 177A — candidate_url hardening. Confirms the direct public
 * permalink (WordpressRestPost.link) survives the full pipeline —
 * parser → CheckProposal → writeCandidatesForSource → the Supabase insert
 * payload — instead of being silently dropped, and that an unsafe/missing
 * link never produces an incorrect candidate_url (wp-json endpoint,
 * relative path, or empty string).
 */

function post(overrides: Partial<WordpressRestPost>): WordpressRestPost {
  return {
    title: { rendered: "Tytuł testowy" },
    excerpt: { rendered: "<p>Remont chodnika przy wiadukcie rozpocznie się 22 lipca 2026 roku.</p>" },
    date: "2026-07-27T09:00:00",
    link: "https://www.pruszkow.pl/mieszkancy/remont-chodnika-przy-wiadukcie/",
    slug: "remont-chodnika-przy-wiadukcie",
    ...overrides,
  };
}

test.describe("Pruszków REST parser — candidate_url survives to the proposal", () => {
  test("a post with a genuine article permalink keeps it on the candidate and proposal", () => {
    const parse = parsePruszkowRestPosts([post({})]);
    expect(parse.candidates[0].url).toBe("https://www.pruszkow.pl/mieszkancy/remont-chodnika-przy-wiadukcie/");

    const proposals = buildCheckProposals(parse);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].url).toBe("https://www.pruszkow.pl/mieszkancy/remont-chodnika-przy-wiadukcie/");
  });

  test("a missing link field results in candidate.url undefined, never a crash or empty string", () => {
    const parse = parsePruszkowRestPosts([post({ link: undefined })]);
    expect(parse.candidates[0].url).toBeUndefined();
    expect(buildCheckProposals(parse)[0].url).toBeUndefined();
  });

  test("a link pointing at the wp-json REST endpoint itself is rejected, not saved as candidate_url", () => {
    const parse = parsePruszkowRestPosts([
      post({ link: "https://www.pruszkow.pl/wp-json/wp/v2/posts/149542" }),
    ]);
    expect(parse.candidates[0].url).toBeUndefined();
  });

  test("a relative or malformed link is rejected, never thrown on", () => {
    expect(() => parsePruszkowRestPosts([post({ link: "/mieszkancy/relative-only/" })])).not.toThrow();
    expect(parsePruszkowRestPosts([post({ link: "/mieszkancy/relative-only/" })]).candidates[0].url).toBeUndefined();

    expect(() => parsePruszkowRestPosts([post({ link: "not a url at all" })])).not.toThrow();
    expect(parsePruszkowRestPosts([post({ link: "not a url at all" })]).candidates[0].url).toBeUndefined();
  });

  test("a non-http(s) link (e.g. javascript:) is rejected", () => {
    const parse = parsePruszkowRestPosts([post({ link: "javascript:alert(1)" })]);
    expect(parse.candidates[0].url).toBeUndefined();
  });
});

test.describe("Wodociągi REST parser — shares the same safe-link path", () => {
  test("a genuine article permalink is kept", () => {
    const wodociagiPost = post({
      title: { rendered: "Przerwa w dostawie wody" },
      excerpt: {
        rendered:
          "<p>Przerwa w dostawie wody w dniu 27 lipca 2026 roku w godzinach 8:00-16:00 na terenie Komorowa.</p>",
      },
      link: "https://wodociagimichalowice.pl/2026/07/27/przerwa-w-dostawie-wody/",
    });
    const parse = parseWordpressRestPosts([wodociagiPost]);
    expect(parse.candidates[0].url).toBe("https://wodociagimichalowice.pl/2026/07/27/przerwa-w-dostawie-wody/");
    expect(buildCheckProposals(parse)[0].url).toBe(
      "https://wodociagimichalowice.pl/2026/07/27/przerwa-w-dostawie-wody/"
    );
  });

  test("a wp-json link is rejected here too (same shared helper, not a Pruszków-only rule)", () => {
    const wodociagiPost = post({
      title: { rendered: "Przerwa w dostawie wody" },
      excerpt: { rendered: "<p>Przerwa w dostawie wody w dniu 27 lipca 2026 roku.</p>" },
      link: "https://wodociagimichalowice.pl/wp-json/wp/v2/posts/1",
    });
    expect(parseWordpressRestPosts([wodociagiPost]).candidates[0].url).toBeUndefined();
  });
});

// ── writeCandidatesForSource / buildPendingCandidateInsert — candidate_url
// reaches the actual Supabase insert payload ────────────────────────────────

function makeFakeWriter() {
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
  return { writer, insertedCandidates };
}

const baseSourceInfo = {
  sourceKey: "pruszkow-aktualnosci",
  sourceName: "Miasto Pruszków — aktualności",
  sourceUrl: "https://www.pruszkow.pl/mieszkancy/aktualnosci-mieszkaniec/",
  writerUserId: "fake-writer-uuid",
};

test.describe("buildPendingCandidateInsert — candidate_url mapping", () => {
  test("a provided candidateUrl is trimmed and saved as candidate_url", () => {
    const payload = buildPendingCandidateInsert({
      sourceId: null,
      sourceKey: "pruszkow-aktualnosci",
      sourceName: "Miasto Pruszków — aktualności",
      sourceUrl: "https://www.pruszkow.pl/mieszkancy/aktualnosci-mieszkaniec/",
      title: "t",
      excerpt: "e",
      rawText: "r",
      candidateUrl: "  https://www.pruszkow.pl/mieszkancy/remont-chodnika/  ",
    });
    expect(payload.candidate_url).toBe("https://www.pruszkow.pl/mieszkancy/remont-chodnika/");
  });

  test("an absent candidateUrl saves candidate_url as null, never undefined or empty string", () => {
    const payload = buildPendingCandidateInsert({
      sourceId: null,
      sourceKey: "wkd-aktualnosci",
      sourceName: "WKD — aktualności",
      sourceUrl: "https://wkd.com.pl/aktualnosci",
      title: "t",
      excerpt: "e",
      rawText: "r",
    });
    expect(payload.candidate_url).toBeNull();
  });
});

test.describe("writeCandidatesForSource — proposal.url reaches the insert payload", () => {
  test("a proposal with a safe url inserts candidate_url matching it exactly", async () => {
    const { writer, insertedCandidates } = makeFakeWriter();
    await writeCandidatesForSource(writer, {
      ...baseSourceInfo,
      proposals: [
        {
          title: "Remont chodnika",
          excerpt: "e",
          rawText: "Remont chodnika przy wiadukcie rozpocznie się 22 lipca 2026 roku",
          hasDate: true,
          url: "https://www.pruszkow.pl/mieszkancy/remont-chodnika-przy-wiadukcie/",
        },
      ],
      registrySourceId: null,
    });
    expect(insertedCandidates).toHaveLength(1);
    expect(insertedCandidates[0].candidate_url).toBe(
      "https://www.pruszkow.pl/mieszkancy/remont-chodnika-przy-wiadukcie/"
    );
  });

  test("a proposal with no url inserts candidate_url as null (HTML-scraped sources, unchanged behavior)", async () => {
    const { writer, insertedCandidates } = makeFakeWriter();
    await writeCandidatesForSource(writer, {
      ...baseSourceInfo,
      sourceKey: "wkd-aktualnosci",
      proposals: [
        { title: "Komunikat", excerpt: "e", rawText: "Zupełnie nowa treść testowa bez linku", hasDate: false },
      ],
      registrySourceId: null,
    });
    expect(insertedCandidates).toHaveLength(1);
    expect(insertedCandidates[0].candidate_url).toBeNull();
  });
});

// ── Existing dedup/cap behavior is unaffected by this change ────────────────

test.describe("writeCandidatesForSource — dedup and cap still function identically with url present", () => {
  test("a duplicate proposal (by text) is still skipped even when it carries a url", async () => {
    const existing = ["Testowe uruchomienie syren alarmowych w gminie 16 lipca 2026 roku o godzinie 12:00"];
    const insertedCandidates: ReturnType<typeof buildPendingCandidateInsert>[] = [];
    const writer: ScheduledSourceWriter = {
      async findExistingCandidateTexts() {
        return [...existing];
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
          url: "https://www.pruszkow.pl/mieszkancy/syreny/",
        },
      ],
      registrySourceId: null,
    });
    expect(result.duplicatesSkipped).toBe(1);
    expect(result.candidatesInserted).toBe(0);
    expect(insertedCandidates).toHaveLength(0);
  });

  test("the default per-invocation cap (1) still applies with two url-bearing proposals", async () => {
    const { writer, insertedCandidates } = makeFakeWriter();
    const result = await writeCandidatesForSource(writer, {
      ...baseSourceInfo,
      proposals: [
        {
          title: "Komunikat A",
          excerpt: "e",
          rawText: "Zamknięcie przejazdu kolejowego na ulicy Kolejowej w Komorowie od piątku",
          hasDate: true,
          url: "https://www.pruszkow.pl/mieszkancy/a/",
        },
        {
          title: "Komunikat B",
          excerpt: "e",
          rawText: "Przerwa w dostawie prądu w Nowej Wsi zaplanowana na środę wieczorem",
          hasDate: false,
          url: "https://www.pruszkow.pl/mieszkancy/b/",
        },
      ],
      registrySourceId: null,
    });
    expect(result.candidatesInserted).toBe(1);
    expect(result.cappedSkipped).toBe(1);
    expect(insertedCandidates).toHaveLength(1);
  });
});
