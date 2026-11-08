import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { join } from "path";
import { parseWordpressRestPosts, type WordpressRestPost } from "@/lib/sourceParsers/pageParser";
import { buildCheckProposals } from "@/lib/sourceCheck";
import { extractPlace, extractStartDateIso } from "@/lib/candidateWarnings";
import { detectCandidateCategory } from "@/lib/candidateVerifier";
import { isDirectSafePermalink, getAutoPublishSourceIds } from "@/lib/trustedSourceAutoPublish";
import {
  writeCandidatesForSource,
  DEFAULT_ALLOWED_WRITE_SOURCE_IDS,
  type ScheduledSourceWriter,
  type AutoPublishAlertInsertPayload,
} from "@/lib/scheduledWriter";

/**
 * LR-2 — Coverage Activation readiness certification for
 * `wodociagi-michalowice`.
 *
 * This source already has a fully-built, generically-wired REST parser
 * (parseWordpressRestPosts, REST_PARSERS_BY_SOURCE_ID) and is already a
 * member of SAFE_CHECK_SOURCE_IDS — write-candidates/route.ts already
 * passes `apiUrl`/`parseRestPosts` through to fetchAndParseProposals for
 * ANY resolved source generically. The ONLY thing standing between this
 * source and real scheduled-writer eligibility is a Production env
 * change (SCHEDULED_WRITER_ALLOWED_SOURCE_IDS) — a deliberate, separate
 * decision, not made in this commit. These tests exist to prove the
 * pipeline is genuinely ready NOW, so that decision can be made with
 * confidence later, without needing a second round of live verification.
 *
 * The fixture (wodociagi-michalowice-live-2026-11-08.json) captures the
 * REAL most-recent live notice (Michałowice, 6 listopada 2026) verbatim,
 * fetched read-only from the official WordPress REST API on 2026-11-08.
 * The second fixture entry is a representative construction in the same
 * real-observed shape (same source, same generic recurring title
 * "Przerwa w dostawie wody", a different locality/street) — not a second
 * byte-for-byte captured notice — used specifically to exercise the
 * same-title dedup behavior documented below.
 */

const FIXTURE_PATH = join(__dirname, "..", "fixtures", "wodociagi-michalowice-live-2026-11-08.json");

function loadRealPosts(): WordpressRestPost[] {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf-8"));
}

test.describe("wodociagi-michalowice — real live-data parse", () => {
  test("the real current notice parses with correct title, permalink, place, date, and category", () => {
    const posts = loadRealPosts();
    const parsed = parseWordpressRestPosts([posts[0]]);
    const proposals = buildCheckProposals(parsed);
    expect(proposals).toHaveLength(1);

    const p = proposals[0];
    expect(p.title).toBe("Przerwa w dostawie wody");
    expect(p.url).toBe("https://wodociagimichalowice.pl/2026/11/04/przerwa-w-dostawie-wody-213/");
    expect(p.rawText).toContain("Michałowice");
    expect(extractPlace(p.rawText)).toBe("Michałowice");
    expect(extractStartDateIso(p.rawText)).toBe("2026-11-06T00:00:00.000Z");
    expect(detectCandidateCategory(p.rawText)).toBe("water");
  });

  test("the real permalink already passes isDirectSafePermalink — the same gate auto-publish eligibility checks (not auto-publish-enabled here, just proving the URL is already clean)", () => {
    const posts = loadRealPosts();
    const proposals = buildCheckProposals(parseWordpressRestPosts([posts[0]]));
    expect(isDirectSafePermalink(proposals[0].url)).toBe(true);
  });

  // Real, observed behavior: this source reuses the exact same generic
  // title ("Przerwa w dostawie wody") for every notice, regardless of
  // locality — confirmed against 6 consecutive real live posts on
  // 2026-11-08, all sharing this literal title. buildCheckProposals'
  // title-based dedup (seenTitles) therefore collapses multiple distinct
  // real notices from this source down to only the first one encountered
  // per run — a genuine, source-specific limitation worth knowing before
  // relying on this feed, not a parser bug (this is existing, unchanged
  // dedup behavior, shared by every source).
  test("KNOWN LIMITATION — two distinct real notices sharing the same generic title collapse to one proposal per run", () => {
    const posts = loadRealPosts();
    const parsed = parseWordpressRestPosts(posts);
    const proposals = buildCheckProposals(parsed);
    expect(posts).toHaveLength(2);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].rawText).toContain("Michałowice");
    expect(proposals[0].rawText).not.toContain("Komorów");
  });

  test("an empty feed yields zero proposals, never a crash", () => {
    expect(buildCheckProposals(parseWordpressRestPosts([]))).toEqual([]);
  });

  test("a malformed/unexpected post shape (missing every field) is skipped, never a crash", () => {
    const malformed = [{}] as WordpressRestPost[];
    expect(() => buildCheckProposals(parseWordpressRestPosts(malformed))).not.toThrow();
    expect(buildCheckProposals(parseWordpressRestPosts(malformed))).toEqual([]);
  });
});

test.describe("wodociagi-michalowice — full writer pipeline (fake writer, no Production access)", () => {
  function makeFakeWriter(existingTexts: string[] = []) {
    const insertedCandidates: unknown[] = [];
    const insertedChecks: unknown[] = [];
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
        insertedCandidates.push(payload);
        return { ok: true };
      },
      async insertSourceCheck(payload) {
        insertedChecks.push(payload);
        return { ok: true };
      },
      // Deliberately present but never expected to be called by this
      // test — proves the real-source pipeline never reaches auto-publish
      // machinery on its own.
      async insertPublishedAlert(_payload: AutoPublishAlertInsertPayload) {
        throw new Error("insertPublishedAlert must never be called for a plain writer run");
      },
      async markCandidateAutoPublished() {
        throw new Error("markCandidateAutoPublished must never be called for a plain writer run");
      },
    };
    return { writer, insertedCandidates, insertedChecks };
  }

  test("a real notice flows through writeCandidatesForSource into a pending, correctly-shaped candidate insert", async () => {
    const posts = loadRealPosts();
    const proposals = buildCheckProposals(parseWordpressRestPosts([posts[0]]));
    const { writer, insertedCandidates, insertedChecks } = makeFakeWriter();

    const result = await writeCandidatesForSource(writer, {
      sourceKey: "wodociagi-michalowice",
      sourceName: "Wodociągi Michałowice — awarie i przerwy",
      sourceUrl: "https://wodociagimichalowice.pl/category/aktualnosci/",
      proposals,
      registrySourceId: null,
      writerUserId: "test-writer-user-id",
    });

    expect(result.candidatesInserted).toBe(1);
    expect(result.duplicatesSkipped).toBe(0);
    expect(insertedCandidates).toHaveLength(1);
    const inserted = insertedCandidates[0] as Record<string, unknown>;
    expect(inserted.status).toBe("pending");
    expect(inserted.source_key).toBe("wodociagi-michalowice");
    expect(inserted.candidate_url).toBe("https://wodociagimichalowice.pl/2026/11/04/przerwa-w-dostawie-wody-213/");
    expect(inserted.source_id).toBeNull(); // no registry row exists yet — see Phase 4's prepared (not applied) SQL
    expect(insertedChecks).toHaveLength(0); // no registrySourceId → check-logging correctly skipped, not a crash
  });

  test("dedup still blocks re-detecting the exact same real notice on a second run", async () => {
    const posts = loadRealPosts();
    const proposals = buildCheckProposals(parseWordpressRestPosts([posts[0]]));
    const { writer, insertedCandidates } = makeFakeWriter([proposals[0].rawText]);

    const result = await writeCandidatesForSource(writer, {
      sourceKey: "wodociagi-michalowice",
      sourceName: "Wodociągi Michałowice — awarie i przerwy",
      sourceUrl: "https://wodociagimichalowice.pl/category/aktualnosci/",
      proposals,
      registrySourceId: null,
      writerUserId: "test-writer-user-id",
    });

    expect(result.candidatesInserted).toBe(0);
    expect(result.duplicatesSkipped).toBe(1);
    expect(insertedCandidates).toHaveLength(0);
  });

  test("this source is not on the default scheduled-writer allowlist today — confirming no silent activation", () => {
    // DEFAULT_ALLOWED_WRITE_SOURCE_IDS stays exactly Michałowice-komunikaty
    // only — adding wodociagi-michalowice requires an explicit, separate
    // SCHEDULED_WRITER_ALLOWED_SOURCE_IDS env change (LR-2 report §4), not
    // a code change, and is NOT made by this commit.
    // (Imported directly rather than duplicated, so this test breaks
    // loudly if that default ever silently changes.)
    expect(DEFAULT_ALLOWED_WRITE_SOURCE_IDS).toEqual(["michalowice-komunikaty"]);
  });

  test("this source is not, and must never become, auto-publish-eligible by this change alone", () => {
    const original = process.env.SCHEDULED_AUTO_PUBLISH_SOURCE_IDS;
    delete process.env.SCHEDULED_AUTO_PUBLISH_SOURCE_IDS;
    try {
      expect(getAutoPublishSourceIds()).not.toContain("wodociagi-michalowice");
    } finally {
      if (original === undefined) delete process.env.SCHEDULED_AUTO_PUBLISH_SOURCE_IDS;
      else process.env.SCHEDULED_AUTO_PUBLISH_SOURCE_IDS = original;
    }
  });
});
