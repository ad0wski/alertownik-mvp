import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { buildCheckProposals, type CheckProposal } from "@/lib/sourceCheck";
import * as writerModule from "@/lib/scheduledWriter";
import { writeCandidatesForSource, type ScheduledSourceWriter, type DedupComparisonItem } from "@/lib/scheduledWriter";
import { extractStartDateIso } from "@/lib/candidateWarnings";

/**
 * LR-5 — historical replay of the REAL scheduled-writer logic over the
 * REAL 2026 archive of the official Gmina Michałowice notices feed
 * (tests/fixtures/michalowice-komunikaty-archive-2026.json — 180 notices,
 * 43 of them water interruptions, captured read-only on 2026-11-11).
 *
 * Why this exists: LR-4 found that the writer would have withheld ~31 of
 * the 43 real water notices, because templated "Brak wody" notices score
 * 0.5–0.7 word-overlap against each other and same-source dedup had no
 * place/date check. This spec pins that it can never silently regress.
 *
 * Nothing here is simplified: every run goes through the real
 * buildCheckProposals() and the real writeCandidatesForSource(), with an
 * in-memory writer. Only the TIMELINE is modelled, because the archive
 * cannot tell us everything:
 *   - 14 water notices show only an event date; their publication time is
 *     assumed (ASSUMED_LEAD_HOURS before the event),
 *   - the main listing is assumed newest-first, 8 parsed items,
 *   - a water notice is assumed to leave the main listing 14 h after its
 *     start (the gmina archives finished notices),
 *   - one run per day at the observed 06:21 UTC.
 */

type Item = { date: string; url: string; title: string; teaser: string };
type Sim = Item & { pub: number; pubKnown: boolean; start: number | null; expiry: number; water: boolean; upstreamLate: boolean };
const H = 3600_000;
const RUN_HOUR_UTC = 6.35;

const classifySameSource: (p: { text: string; url?: string; title?: string }, pool: DedupComparisonItem[]) => string =
  (writerModule as Record<string, unknown>).classifyProposalAgainstSameSourceItems as never ??
  writerModule.classifyProposalAgainstExisting;

function wawToUtc(y: number, m: number, d: number, hh: number, mm: number): number {
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  const dst = naive >= Date.UTC(2026, 2, 29, 1) && naive < Date.UTC(2026, 9, 25, 1);
  return naive - (dst ? 2 : 1) * H;
}

const MONTHS: Record<string, number> = {
  stycznia: 1, lutego: 2, marca: 3, kwietnia: 4, maja: 5, czerwca: 6,
  lipca: 7, sierpnia: 8, wrzesnia: 9, pazdziernika: 10, listopada: 11, grudnia: 12,
};

/** Timeline model only (independent of the code under test, so the same
 *  model can replay any version of the writer): when the notice's event
 *  starts, read from its teaser. A stated time is used via the app's own
 *  extractStartDateIso; a date without a time is assumed to start at
 *  09:00 Warsaw; "D miesiąca br." / "D miesiąca" without a year takes the
 *  post year. */
function modelEventStart(teaser: string, postYear: number): number | null {
  const iso = extractStartDateIso(teaser);
  if (iso) {
    const dt = new Date(iso);
    return dt.getUTCHours() === 0 && dt.getUTCMinutes() === 0
      ? wawToUtc(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), 9, 0)
      : dt.getTime();
  }
  const m = teaser.match(/\b(\d{1,2})\s+(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)\b/i);
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase().replace("ś", "s").replace("ź", "z")];
  const hour = teaser.match(/godz\.?:?\s*(\d{1,2})[:.](\d{2})/);
  return wawToUtc(postYear, month, +m[1], hour ? +hour[1] : 9, hour ? +hour[2] : 0);
}

function loadItems(): Item[] {
  return JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "michalowice-komunikaty-archive-2026.json"), "utf-8"));
}

function build(items: Item[], assumedLeadH: number): Sim[] {
  return items.map((it) => {
    const water = /brak wody/i.test(it.title);
    const pm = it.date.match(/^(\d\d)\.(\d\d)\.(\d{4}) (\d\d):(\d\d)/);
    const em = it.date.match(/Data wydarzenia: (\d\d)\.(\d\d)\.(\d{4})(?: (\d\d):(\d\d))?/);
    let start: number | null = null;
    if (em) start = wawToUtc(+em[3], +em[2], +em[1], em[4] ? +em[4] : 9, em[5] ? +em[5] : 0);
    else start = modelEventStart(it.teaser, pm ? +pm[3] : 2026);
    let pub: number;
    let pubKnown = false;
    if (pm) {
      pub = wawToUtc(+pm[3], +pm[2], +pm[1], +pm[4], +pm[5]);
      pubKnown = true;
    } else pub = (start ?? Date.UTC(2026, 0, 1)) - assumedLeadH * H;
    // The gmina itself published at/after the outage began — no schedule can be early for these.
    const upstreamLate = water && pubKnown && start !== null && start <= pub + 1 * H;
    const expiry = water && start !== null ? Math.max(start, pub) + 14 * H : Number.POSITIVE_INFINITY;
    return { ...it, pub, pubKnown, start, expiry, water, upstreamLate };
  });
}

function proposalsAt(sim: Sim[], t: number): CheckProposal[] {
  const list = sim
    .filter((s) => s.pub <= t && t < s.expiry)
    .sort((a, b) => b.pub - a.pub)
    .slice(0, 8);
  return buildCheckProposals({
    title: "Gmina Michałowice — komunikaty",
    candidates: list.map((s) => ({ heading: s.title, text: `${s.date}\n${s.teaser}`, hasDate: true, url: s.url })),
  } as never);
}

interface ReplayResult {
  firstInserted: Map<string, number>;
  lastVerdict: Map<string, string>;
  everProposed: Set<string>;
  maxInsertedInOneRun: number;
  totalInserted: number;
  /** Inserts of a notice that was still inside the writer's own
   *  50-candidate comparison window — i.e. a duplicate the dedup missed. */
  reinsertedWithinWindow: number;
}

async function replay(sim: Sim[], cap: number): Promise<ReplayResult> {
  const stored: { text: string; url?: string }[] = [];
  let reinsertedWithinWindow = 0;
  const firstInserted = new Map<string, number>();
  const lastVerdict = new Map<string, string>();
  const everProposed = new Set<string>();
  let maxInsertedInOneRun = 0;
  for (let day = Date.UTC(2026, 0, 2); day < Date.UTC(2026, 10, 11); day += 24 * H) {
    const t = day + RUN_HOUR_UTC * H;
    const proposals = proposalsAt(sim, t);
    const pool = stored.slice(-50).map((s) => ({ text: s.text }));
    for (const p of proposals) everProposed.add(p.url!);
    let insertedThisRun = 0;
    const insertedTextsThisRun: { text: string }[] = [];
    const writer: ScheduledSourceWriter = {
      async findExistingCandidateTexts() {
        return pool.map((p) => p.text);
      },
      async findExistingAlertComparisons() {
        return [];
      },
      async findPendingCandidatesFromOtherSources() {
        return [];
      },
      async insertPendingCandidate(payload: { raw_text: string; candidate_url?: string | null; status?: string }) {
        expect(payload.status).toBe("pending");
        if (payload.candidate_url && stored.slice(-50).some((s) => s.url === payload.candidate_url)) reinsertedWithinWindow++;
        stored.push({ text: payload.raw_text, url: payload.candidate_url ?? undefined });
        insertedTextsThisRun.push({ text: payload.raw_text });
        if (payload.candidate_url && !firstInserted.has(payload.candidate_url)) firstInserted.set(payload.candidate_url, t);
        insertedThisRun++;
        return { ok: true };
      },
      async insertSourceCheck() {
        return { ok: true };
      },
      async insertPublishedAlert() {
        throw new Error("auto-publish must never be reached from the candidate writer");
      },
      async markCandidateAutoPublished() {
        throw new Error("auto-publish must never be reached from the candidate writer");
      },
    } as never;
    await writeCandidatesForSource(
      writer,
      { sourceKey: "michalowice-komunikaty", sourceName: "n", sourceUrl: "u", proposals, registrySourceId: null, writerUserId: "w" },
      cap
    );
    maxInsertedInOneRun = Math.max(maxInsertedInOneRun, insertedThisRun);
    // Reporting only: why a proposal was NOT inserted in this run — judged
    // against everything the writer itself compared it with (the stored
    // pool plus the candidates created earlier in this same run).
    for (const p of proposals) {
      if (firstInserted.has(p.url!)) continue;
      lastVerdict.set(p.url!, classifySameSource({ text: p.rawText, title: p.title }, [...pool, ...insertedTextsThisRun]));
    }
  }
  return { firstInserted, lastVerdict, everProposed, maxInsertedInOneRun, totalInserted: stored.length, reinsertedWithinWindow };
}

function summarize(sim: Sim[], r: ReplayResult) {
  const water = sim.filter((s) => s.water);
  const counts = { total: water.length, queued: 0, never: 0, neverDedup: 0, neverUpstreamLate: 0, neverOther: 0, beforeStart: 0, afterStart: 0 };
  const leads: number[] = [];
  const rows: string[] = [];
  for (const w of water) {
    const ins = r.firstInserted.get(w.url);
    let verdict: string;
    if (ins !== undefined) {
      counts.queued++;
      const lead = w.start !== null ? (w.start - ins) / H : NaN;
      if (lead > 0) {
        counts.beforeStart++;
        leads.push(lead);
      } else counts.afterStart++;
      verdict = lead > 0 ? `QUEUED ${Math.round(lead)}h before` : `QUEUED ${Math.round(-lead)}h after start${w.upstreamLate ? " (upstream late)" : ""}`;
    } else {
      counts.never++;
      const last = r.lastVerdict.get(w.url);
      if (r.everProposed.has(w.url) && (last === "ambiguous" || last === "duplicate")) {
        counts.neverDedup++;
        verdict = `NEVER — dedup:${last}`;
      } else if (w.upstreamLate) {
        counts.neverUpstreamLate++;
        verdict = "NEVER — published by the gmina at/after the outage began, gone before the next run";
      } else {
        counts.neverOther++;
        verdict = `NEVER — ${r.everProposed.has(w.url) ? `capacity (last verdict: ${last})` : "never among the proposals (listing window / title)"}`;
      }
    }
    rows.push(`${new Date(w.pub).toISOString().slice(0, 16)}${w.pubKnown ? " " : "~"} start=${w.start ? new Date(w.start).toISOString().slice(0, 16) : "?"} | ${verdict} | ${w.title}`);
  }
  leads.sort((a, b) => a - b);
  return { counts, rows, medianLeadH: leads.length ? Math.round(leads[Math.floor(leads.length / 2)]) : null, minLeadH: leads.length ? Math.round(leads[0]) : null };
}

/** Assumption-free: every water notice against ALL earlier water notices. */
function sequentialWaterDedup(items: Item[]) {
  const water = build(items, 15)
    .filter((s) => s.water)
    .sort((a, b) => a.pub - b.pub);
  const counts: Record<string, number> = { new: 0, ambiguous: 0, duplicate: 0 };
  const flagged: string[] = [];
  water.forEach((w, i) => {
    const pool = water.slice(0, i).map((p) => ({ text: `${p.date}\n${p.teaser}` }));
    const verdict = classifySameSource({ text: `${w.date}\n${w.teaser}`, title: w.title }, pool);
    counts[verdict]++;
    if (verdict !== "new") flagged.push(`${verdict} | ${w.title} | ${w.date} | ${w.teaser.slice(0, 140)}`);
  });
  return { counts, flagged };
}

const CAP = Number(process.env.LR5_REPLAY_CAP ?? "2");

test.describe("historical replay — 2026 Gmina Michałowice archive", () => {
  test("fixture is the full real archive: 180 notices, 43 water interruptions", () => {
    const items = loadItems();
    expect(items).toHaveLength(180);
    expect(items.filter((i) => /brak wody/i.test(i.title))).toHaveLength(43);
  });

  test("distinct water notices are not mass-rejected by template similarity (assumption-free)", () => {
    const { counts, flagged } = sequentialWaterDedup(loadItems());
    if (process.env.LR5_REPLAY_OUT) writeFileSync(process.env.LR5_REPLAY_OUT + ".sequential.txt", JSON.stringify(counts) + "\n" + flagged.join("\n"));
    // Before LR-5: 3 new / 36 ambiguous / 4 duplicate.
    expect(counts.new).toBeGreaterThanOrEqual(38);
    expect(counts.duplicate).toBe(0);
    expect(counts.ambiguous).toBeLessThanOrEqual(5);
  });

  test("no real notice is ever 'new' against its own stored copy — the veto cannot fire on a notice vs itself", () => {
    for (const it of loadItems()) {
      const text = `${it.date}\n${it.teaser}`;
      // Exactly the two shapes the writer compares against: a stored candidate (text only) …
      expect(classifySameSource({ text, title: it.title }, [{ text }]), it.title).toBe("duplicate");
    }
  });

  for (const lead of [15, 40]) {
    test(`replay (unknown publication times assumed ${lead} h before the event): water notices reach the queue`, async () => {
      test.setTimeout(180_000);
      const sim = build(loadItems(), lead);
      const result = await replay(sim, CAP);
      const s = summarize(sim, result);
      if (process.env.LR5_REPLAY_OUT) {
        writeFileSync(
          `${process.env.LR5_REPLAY_OUT}.lead${lead}.cap${CAP}.txt`,
          [JSON.stringify(s.counts), `medianLeadH=${s.medianLeadH} minLeadH=${s.minLeadH} maxInsertedInOneRun=${result.maxInsertedInOneRun} totalInserted=${result.totalInserted} reinsertedWithinWindow=${result.reinsertedWithinWindow}`, ...s.rows].join("\n")
        );
      }
      expect(result.maxInsertedInOneRun).toBeLessThanOrEqual(CAP);
      // The veto must never turn a notice into "new" against its own stored copy.
      expect(result.reinsertedWithinWindow).toBe(0);
      if (!process.env.LR5_REPLAY_BASELINE) {
        // Before LR-5 (same model, original writer, cap 1): 12 queued,
        // 31 never — 25 of them withheld by dedup. After: 36 queued, 7
        // never — 3 by dedup (same day AND same locality as a sibling
        // notice, i.e. genuinely uncertain), the rest published by the
        // gmina on the day itself or squeezed out on one 5-notice day.
        expect(s.counts.queued).toBeGreaterThanOrEqual(34);
        expect(s.counts.neverDedup).toBeLessThanOrEqual(4);
      }
    });
  }
});
