"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import { CandidateCard } from "@/components/CandidateCard";
import {
  getSourceCandidates,
  getSourceChecks,
  getAlertSources,
  type SourceCandidate,
} from "@/lib/supabaseSourceWrites";
import {
  getSourceCandidateNotices,
  updateCandidateStatus,
  saveCandidateVerification,
} from "@/lib/supabaseCandidateWrites";
import {
  ruleBasedVerifyCandidate,
  type CandidateVerification,
} from "@/lib/candidateVerifier";
import { getAdminSupabaseAlerts, type AdminAlert } from "@/lib/getAdminSupabaseAlerts";
import { getCandidateWarnings, trimAtWord } from "@/lib/candidateWarnings";
import { CANDIDATE_STATUS_LABELS } from "@/lib/candidateStatusLabels";
import type { SourceCheck } from "@/types/alertSource";
import type { SourceNoticeCandidate, SourceCandidateStatus } from "@/types/sourceCandidate";
import type { AlertCategory } from "@/types/alert";

// ── Constants — same sessionStorage contracts already used by /admin/sources
// and /ai-helper, so this page is just another producer/consumer, not a new
// handoff mechanism. ─────────────────────────────────────────────────────────

const PENDING_SOURCE_KEY = "alertownik_pending_source_for_ai";
const AI_PENDING_KEY = "alertownik_pending_ai_alert_json";
const AI_PENDING_SOURCE_ID_KEY = "alertownik_pending_alert_source_id";
// Sprint 78 — carries a persistent candidate's id through AI Helper to
// Builder, so Builder can mark it "converted" once an alert is saved.
const PENDING_CANDIDATE_ID_KEY = "alertownik_pending_candidate_notice_id";

const categoryLabels: Record<AlertCategory, string> = {
  transport: "Transport",
  water: "Woda",
  power: "Prąd",
  waste: "Odpady",
  roads: "Drogi",
  municipal: "Komunikaty",
};

const resultLabels: Record<string, { label: string; color: string }> = {
  found_notice: { label: "Znaleziono komunikat", color: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/15 border-blue-200 dark:border-blue-500/30" },
  needs_followup: { label: "Wymaga późniejszego sprawdzenia", color: "text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/30" },
};

// v2 status labels moved to src/lib/candidateStatusLabels.ts (Sprint 133)
// so unit tests can verify the map without importing this client page.

const SEVERITY_LABELS: Record<string, string> = {
  info: "Info",
  warning: "Ostrzeżenie",
  urgent: "Pilne",
};

const POLISH_MAP: Record<string, string> = {
  ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z",
  Ą: "a", Ć: "c", Ę: "e", Ł: "l", Ń: "n", Ó: "o", Ś: "s", Ź: "z", Ż: "z",
};

function toSlug(text: string): string {
  const slug = text
    .split("")
    .map((c) => POLISH_MAP[c] ?? c)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "kandydat";
}

function formatCheckedAt(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function draftTitleFromCandidate(c: SourceCandidate): string {
  const fromNotes = c.notes?.trim() ? trimAtWord(c.notes.trim(), 80) : "";
  return fromNotes || `${c.sourceName} — do uzupełnienia`;
}

// Module-level on purpose: this runs at click time only, but since Sprint
// 131 the callback travels through a CandidateCard prop, so the
// react-hooks/purity lint can no longer see it's an event handler — at
// module scope the Date.now() slug suffix is out of the rule's reach.
function buildDraftFromNotice(n: SourceNoticeCandidate, category: AlertCategory) {
  return {
    category,
    severity: "info",
    title: n.title,
    slug: `${toSlug(n.title)}-${Date.now()}`,
    place: "",
    startsAt: new Date().toISOString().slice(0, 10),
    endsAt: null,
    change: n.rawText || n.excerpt || "",
    action: "",
    sourceName: n.sourceName,
    sourceUrl: n.sourceUrl || null,
  };
}

// ── Page content (auth-gated) ──────────────────────────────────────────────────

function QueueContent() {
  const router = useRouter();

  // Legacy (source_checks-derived) view — unchanged since Sprint 74/75.
  const [candidates, setCandidates] = useState<SourceCandidate[]>([]);
  const [allChecks, setAllChecks] = useState<SourceCheck[]>([]);

  // Persistent (source_notice_candidates) view — new in Sprint 78.
  const [notices, setNotices] = useState<SourceNoticeCandidate[]>([]);
  const [noticesError, setNoticesError] = useState<string | null>(null);
  const [noticesTableMissing, setNoticesTableMissing] = useState(false);
  const [noticeStatusFilter, setNoticeStatusFilter] = useState<SourceCandidateStatus>("pending");
  const [noticeActionId, setNoticeActionId] = useState<string | null>(null);
  // Sprint 135 — verifier: which card is verifying + transient reports by id.
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verificationById, setVerificationById] = useState<Record<string, CandidateVerification>>({});
  const [sourceCategoryById, setSourceCategoryById] = useState<Record<string, AlertCategory>>({});

  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);
  // Same window.location.search pattern builder.tsx already uses for its
  // ?edit= param — avoids the Suspense-boundary requirement of useSearchParams().
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);

  async function loadPersistentNotices() {
    const result = await getSourceCandidateNotices();
    setNotices(result.candidates);
    setNoticesError(result.tableMissing ? null : result.error ?? null);
    setNoticesTableMissing(Boolean(result.tableMissing));
  }

  useEffect(() => {
    setSourceFilter(new URLSearchParams(window.location.search).get("source"));

    Promise.all([
      getSourceCandidates(100),
      getAdminSupabaseAlerts(),
      getSourceChecks(),
      getAlertSources(),
    ]).then(([candidatesResult, alertsResult, checksResult, sourcesResult]) => {
      setCandidates(candidatesResult.candidates);
      setError(candidatesResult.error ?? null);
      setAlerts(alertsResult.alerts);
      setAllChecks(checksResult.checks);
      const catById: Record<string, AlertCategory> = {};
      for (const s of sourcesResult.sources) catById[s.id] = s.category;
      setSourceCategoryById(catById);
      setLoading(false);
    });

    loadPersistentNotices();
  }, []);

  function clearSourceFilter() {
    setSourceFilter(null);
    router.push("/admin/queue");
  }

  function alertFor(id?: string | null): AdminAlert | null {
    if (!id) return null;
    return alerts.find((a) => a.id === id) ?? null;
  }

  // Lightweight, schema-free duplicate/stale detection — see
  // src/lib/candidateWarnings.ts. Compares against the chronologically
  // previous check of the same source (allChecks is already sorted
  // checked_at desc by getSourceChecks()) and against known alert titles.
  function warningsFor(c: SourceCandidate): string[] {
    const sourceHistory = allChecks.filter((chk) => chk.sourceId === c.sourceId);
    const idx = sourceHistory.findIndex((chk) => chk.id === c.id);
    const previousCheckNotes = idx >= 0 ? sourceHistory[idx + 1]?.notes : undefined;

    return getCandidateWarnings(
      { sourceUrl: c.sourceUrl, notes: c.notes },
      { previousCheckNotes, alertTitles: alerts.map((a) => a.title) }
    );
  }

  function sendToAiHelper(c: SourceCandidate) {
    sessionStorage.setItem(
      PENDING_SOURCE_KEY,
      JSON.stringify({
        sourceName: c.sourceName,
        sourceUrl: c.sourceUrl,
        suggestedCategory: c.sourceCategory,
        sourceId: c.sourceId,
        checkNotes: c.notes ?? "",
      })
    );
    setSentId(c.id);
    router.push("/ai-helper");
  }

  function createBuilderDraft(c: SourceCandidate) {
    const title = draftTitleFromCandidate(c);
    const draft = {
      category: c.sourceCategory,
      severity: "info",
      title,
      slug: `${toSlug(title)}-${Date.now()}`,
      place: "",
      startsAt: new Date().toISOString().slice(0, 10),
      endsAt: null,
      change: c.notes || "",
      action: "",
      sourceName: c.sourceName,
      sourceUrl: c.sourceUrl || null,
    };
    sessionStorage.setItem(AI_PENDING_KEY, JSON.stringify(draft));
    sessionStorage.setItem(AI_PENDING_SOURCE_ID_KEY, c.sourceId);
    setSentId(c.id);
    router.push("/builder");
  }

  // ── Persistent candidate actions (Sprint 78) ──────────────────────────────

  // Sprint 90: the legacy view above has shown these warnings since
  // candidateWarnings.ts existed; the persistent view never wired them
  // in, despite being the primary path going forward. "Previous text for
  // this source" here means the most recently detected *other* notice
  // from the same source (persistent notices have no source_checks row
  // to compare against), not a perfect analogue of warningsFor() above —
  // close enough to catch the same "looks like last time" case.
  function noticeWarningsFor(n: SourceNoticeCandidate): string[] {
    const text = n.rawText || n.excerpt || "";
    const previousFromSameSource = notices
      .filter((other) => other.id !== n.id && other.sourceId === n.sourceId)
      .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))[0];

    return getCandidateWarnings(
      { sourceUrl: n.sourceUrl ?? "", notes: text },
      {
        previousCheckNotes: previousFromSameSource?.rawText || previousFromSameSource?.excerpt,
        alertTitles: alerts.map((a) => a.title),
      }
    );
  }

  function sendNoticeToAiHelper(n: SourceNoticeCandidate) {
    sessionStorage.setItem(
      PENDING_SOURCE_KEY,
      JSON.stringify({
        sourceName: n.sourceName,
        sourceUrl: n.sourceUrl ?? "",
        suggestedCategory: (n.sourceId && sourceCategoryById[n.sourceId]) || "municipal",
        sourceId: n.sourceId ?? "",
        checkNotes: n.rawText || n.excerpt || "",
        candidateNoticeId: n.id,
      })
    );
    setSentId(n.id);
    router.push("/ai-helper");
  }

  function createBuilderDraftFromNotice(n: SourceNoticeCandidate) {
    const draft = buildDraftFromNotice(
      n,
      (n.sourceId && sourceCategoryById[n.sourceId]) || "municipal"
    );
    sessionStorage.setItem(AI_PENDING_KEY, JSON.stringify(draft));
    if (n.sourceId) sessionStorage.setItem(AI_PENDING_SOURCE_ID_KEY, n.sourceId);
    sessionStorage.setItem(PENDING_CANDIDATE_ID_KEY, n.id);
    setSentId(n.id);
    router.push("/builder");
  }

  async function setNoticeStatus(n: SourceNoticeCandidate, status: SourceCandidateStatus) {
    setNoticeActionId(n.id);
    const result = await updateCandidateStatus(n.id, status);
    setNoticeActionId(null);
    if (!result.ok) {
      setNoticesError(result.error ?? "Nie udało się zmienić statusu kandydata.");
      return;
    }
    await loadPersistentNotices();
  }

  // ── Verifier v1 (Sprint 135, A3) — deterministic rules, runs in this
  // browser; the report is persisted onto the candidate's verification
  // columns (Sprint 132 schema) through the admin session. It NEVER touches
  // the candidate's status — acting on the recommendation is the admin's
  // separate click on the existing buttons. ─────────────────────────────────
  async function verifyNotice(n: SourceNoticeCandidate) {
    setVerifyingId(n.id);

    const verification = ruleBasedVerifyCandidate(
      {
        title: n.title,
        sourceUrl: n.sourceUrl,
        excerpt: n.excerpt,
        rawText: n.rawText,
      },
      {
        alertTitles: alerts.map((a) => a.title),
        otherCandidateTexts: notices
          .filter((other) => other.id !== n.id)
          .map((other) => other.rawText || other.excerpt || other.title),
      }
    );

    // If the duplicate match is an existing alert's title, persist the FK
    // so the card shows the duplicate warning permanently, not just now.
    const duplicateAlert = verification.duplicateMatch
      ? alerts.find((a) => a.title === verification.duplicateMatch)
      : undefined;

    const result = await saveCandidateVerification(n.id, {
      confidence: verification.confidence,
      riskLevel: verification.riskLevel,
      verificationStatus: "auto_checked",
      verificationNotes: [verification.summary, ...verification.reasons].join("\n"),
      duplicateOfAlertId: duplicateAlert?.id ?? null,
    });

    setVerifyingId(null);
    if (!result.ok) {
      setNoticesError(result.error ?? "Nie udało się zapisać raportu weryfikacji.");
      return;
    }
    setVerificationById((prev) => ({ ...prev, [n.id]: verification }));
    await loadPersistentNotices();
  }

  const bySource = sourceFilter
    ? candidates.filter((c) => c.sourceId === sourceFilter)
    : candidates;
  const pending = bySource.filter((c) => !c.relatedAlertId);
  const converted = bySource.filter((c) => c.relatedAlertId);
  const filteredSourceName = sourceFilter ? bySource[0]?.sourceName : undefined;

  const noticesBySource = sourceFilter
    ? notices.filter((n) => n.sourceId === sourceFilter)
    : notices;
  const noticeCounts: Record<SourceCandidateStatus, number> = {
    pending: 0, needs_review: 0, approved: 0, rejected: 0,
    converted_to_draft: 0, published: 0, archived: 0,
  };
  for (const n of noticesBySource) noticeCounts[n.status]++;
  const filteredNotices = noticesBySource.filter((n) => n.status === noticeStatusFilter);

  return (
    <main className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-10">
      {/* Page header */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2.5 mb-1">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Kandydaci na alerty
          </h1>
          <span className="inline-flex items-center text-xs font-medium text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 rounded-full px-2.5 py-0.5">
            Admin
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          Tu będą trafiały komunikaty znalezione przez Source Checker / automatyzację.
          Na razie publikacja zawsze wymaga ręcznego zatwierdzenia.
        </p>
      </div>

      {/* ── Pipeline status cards (Sprint 131) ─────────────────────────────
          Live counts come from today's v1 statuses; the two stages that
          exist only in the v2 plan (AI review, approve) are honestly marked
          "wkrótce" instead of showing a made-up zero as if they ran. */}
      <section className="mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
            <p className="text-2xl font-bold text-purple-600">{noticeCounts.pending}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-snug">Oczekujące</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-4">
            <p className="text-sm font-semibold text-slate-400 dark:text-slate-500">wkrótce</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 leading-snug">Do przeglądu (AI verifier)</p>
          </div>
          {/* Live since Sprint 136 — the manual "Zatwierdź" action sets it. */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
            <p className="text-2xl font-bold text-emerald-600">{noticeCounts.approved}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-snug">Zatwierdzone</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
            <p className="text-2xl font-bold text-slate-700 dark:text-slate-300">{noticeCounts.rejected}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-snug">Odrzucone</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{noticeCounts.converted_to_draft + noticeCounts.published}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-snug">Przekształcone w draft</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <Link
            href="/admin/sources"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:border-slate-300 transition-colors"
          >
            Sprawdź źródła →
          </Link>
          <Link
            href="/admin/new-alert"
            className="inline-flex items-center gap-1 rounded-lg border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/15 px-3 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition-colors"
          >
            Utwórz draft ze źródła →
          </Link>
          <Link
            href="/builder"
            className="inline-flex items-center gap-1 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15 px-3 py-1.5 text-sm font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100 transition-colors"
          >
            Otwórz Builder →
          </Link>
        </div>
      </section>

      {/* Workflow explanation */}
      <section className="mb-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">Jak to działa</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Kandydaci trafiają tutaj w dwóch miejscach: (1) gdy w{" "}
            <Link href="/admin/sources" className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
              Źródłach
            </Link>{" "}
            klikniesz „Zapisz jako kandydata” przy fragmencie z „Sprawdź stronę” — trwały
            wpis z akcjami ignoruj/przywróć/archiwizuj — albo (2) automatycznie, gdy w
            Historii sprawdzenia zapiszesz wynik „Znaleziono komunikat” albo „Wymaga
            późniejszego sprawdzenia” (starszy widok, bez tych akcji). Ścieżka przeglądu
            kandydata: „Zweryfikuj (pomocnik)” podpowiada → Ty klikasz „Zatwierdź” albo
            „Odrzuć” → z zatwierdzonego „Utwórz draft z kandydata” (draft NIE jest
            publiczny) → ręczna publikacja z Kreatora.{" "}
            <strong className="font-semibold text-slate-800 dark:text-slate-100">
              AI nigdy nie publikuje samodzielnie — zatwierdzenie i publikacja zawsze należą do admina.
            </strong>
          </p>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-4 py-3 mb-6">
          <p className="text-sm font-medium text-red-700 dark:text-red-400">
            Nie udało się pobrać kandydatów z Supabase.
          </p>
          <p className="text-xs text-red-500 mt-1 font-mono">{error}</p>
        </div>
      )}

      {sourceFilter && (
        <div className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 mb-6 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-purple-800">
            Filtr: {filteredSourceName ? <strong className="font-semibold">{filteredSourceName}</strong> : "jedno źródło"}
          </p>
          <button
            onClick={clearSourceFilter}
            className="text-xs font-medium text-purple-700 hover:text-purple-900 hover:underline"
          >
            Wyczyść filtr ×
          </button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          Kandydaci (trwali) — Sprint 78, source_notice_candidates
      ════════════════════════════════════════════════════════════════════ */}
      <section className="mb-10">
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-4">Kandydaci (trwali)</h2>

        {noticesTableMissing ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Supabase nie widzi tabeli kandydatów.
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Migracja{" "}
              <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                docs/sprint132_candidate_persistence_schema_proposal.sql
              </span>{" "}
              została zatwierdzona i uruchomiona (Sprint 133). Jeśli widzisz ten
              komunikat tuż po migracji, cache schematu PostgREST mógł się jeszcze
              nie odświeżyć — odśwież stronę za chwilę. Jeśli to nowe środowisko,
              uruchom migrację ręcznie w SQL Editorze. Do tego czasu działa tylko
              starszy widok poniżej.
            </p>
          </div>
        ) : (
          <>
            {noticesError && (
              <div className="rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-4 py-3 mb-4">
                <p className="text-sm font-medium text-red-700 dark:text-red-400">{noticesError}</p>
              </div>
            )}

            {/* Status tabs — needs_review/approved appear only when such a
                candidate actually exists (no process sets them yet, but a
                candidate must never become invisible because of its status). */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {(
                [
                  "pending",
                  ...(noticeCounts.needs_review > 0 ? ["needs_review" as const] : []),
                  // approved is a standard tab since Sprint 136 — the
                  // "Zatwierdź" action can produce it any time.
                  "approved",
                  "rejected",
                  "converted_to_draft",
                  "published",
                  "archived",
                ] as SourceCandidateStatus[]
              ).map((s) => (
                <button
                  key={s}
                  onClick={() => setNoticeStatusFilter(s)}
                  className={`px-3 py-1.5 text-sm rounded-full font-medium transition-colors ${
                    noticeStatusFilter === s
                      ? "bg-slate-800 text-white"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
                  }`}
                >
                  {CANDIDATE_STATUS_LABELS[s]} ({noticeCounts[s]})
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex flex-col gap-3">
                {[1, 2].map((i) => (
                  <div key={i} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 animate-pulse">
                    <div className="h-4 w-2/3 bg-slate-100 dark:bg-slate-800 rounded mb-2" />
                    <div className="h-3 w-1/3 bg-slate-100 dark:bg-slate-800 rounded" />
                  </div>
                ))}
              </div>
            ) : filteredNotices.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {noticeStatusFilter === "pending"
                    ? "Brak kandydatów. Na tym etapie źródła sprawdzamy ręcznie lub przez Draft from Source."
                    : `Brak kandydatów ze statusem „${CANDIDATE_STATUS_LABELS[noticeStatusFilter]}”.`}
                </p>
                {noticeStatusFilter === "pending" && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                    Zapisz fragment komunikatu jako kandydata w{" "}
                    <Link href="/admin/sources" className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
                      Źródłach
                    </Link>{" "}
                    albo przygotuj szkic przez{" "}
                    <Link href="/admin/new-alert" className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
                      Draft from Source
                    </Link>
                    .
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredNotices.map((n) => {
                  const convertedAlert = alertFor(n.convertedAlertId);
                  // v2: the candidate's own category (from the proposed schema)
                  // wins over the source's category; both may be absent.
                  const category =
                    (n.category as AlertCategory | null) ??
                    (n.sourceId ? sourceCategoryById[n.sourceId] : undefined);
                  const duplicateAlert = alertFor(n.duplicateOfAlertId);
                  return (
                    <CandidateCard
                      key={n.id}
                      candidate={{
                        id: n.id,
                        title: n.title,
                        sourceName: n.sourceName,
                        sourceUrl: n.sourceUrl,
                        candidateUrl: n.candidateUrl,
                        excerpt: n.excerpt,
                        detectedAt: n.detectedAt,
                        categoryLabel: category ? categoryLabels[category] : undefined,
                        severityLabel: n.severity ? SEVERITY_LABELS[n.severity] : undefined,
                        locality: n.locality ?? undefined,
                        startsAt: n.startsAt,
                        endsAt: n.endsAt,
                        confidenceScore: n.confidenceScore,
                        riskLevel: n.riskLevel,
                        verificationStatus: n.verificationStatus,
                        duplicateWarning: duplicateAlert
                          ? `Możliwy duplikat alertu: „${duplicateAlert.title || "Bez tytułu"}”`
                          : n.duplicateOfAlertId
                            ? "Oznaczony jako możliwy duplikat istniejącego alertu."
                            : null,
                      }}
                      status={n.status}
                      warnings={
                        // Warnings matter wherever a review decision is still
                        // ahead (pending/needs_review/approved) — not on
                        // rejected/converted/archived cards.
                        ["pending", "needs_review", "approved"].includes(n.status)
                          ? noticeWarningsFor(n)
                          : []
                      }
                      convertedAlertTitle={
                        convertedAlert ? convertedAlert.title || "Bez tytułu" : null
                      }
                      busy={noticeActionId === n.id}
                      sent={sentId === n.id}
                      onSendToAiHelper={() => sendNoticeToAiHelper(n)}
                      onCreateBuilderDraft={() => createBuilderDraftFromNotice(n)}
                      onSetStatus={(status) => setNoticeStatus(n, status)}
                      onVerify={() => verifyNotice(n)}
                      verifying={verifyingId === n.id}
                      verification={verificationById[n.id] ?? null}
                    />
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          Starsze (z historii sprawdzeń źródeł) — Sprint 74/75, unchanged
      ════════════════════════════════════════════════════════════════════ */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-1">
          Starsze (z historii sprawdzeń źródeł)
        </h2>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
          Wykryte automatycznie z wyników sprawdzenia źródła — bez statusu ignoruj/archiwizuj
          (patrz wyjaśnienie powyżej).
        </p>

        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
          Do przygotowania {!loading && `(${pending.length})`}
        </h3>

        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2].map((i) => (
              <div key={i} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 animate-pulse">
                <div className="h-4 w-2/3 bg-slate-100 dark:bg-slate-800 rounded mb-2" />
                <div className="h-3 w-1/3 bg-slate-100 dark:bg-slate-800 rounded" />
              </div>
            ))}
          </div>
        ) : pending.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Brak kandydatów na alerty.</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              Gdy podczas sprawdzania źródła zapiszesz wynik „Znaleziono komunikat” albo
              „Wymaga późniejszego sprawdzenia” w{" "}
              <Link href="/admin/sources" className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
                Źródłach
              </Link>
              , kandydat pojawi się tutaj automatycznie.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {pending.map((c) => {
              const cfg = resultLabels[c.result] ?? { label: c.result, color: "text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-800" };
              const isRealLink = Boolean(c.sourceUrl);
              const warnings = warningsFor(c);
              return (
                <div key={c.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5 flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2.5 py-1">
                      {categoryLabels[c.sourceCategory] ?? c.sourceCategory}
                    </span>
                    <span className={`text-xs font-medium rounded-full px-2.5 py-1 border ${cfg.color}`}>
                      {cfg.label}
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">{formatCheckedAt(c.checkedAt)}</span>
                  </div>

                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{c.sourceName}</p>

                  {c.notes ? (
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">{c.notes}</p>
                  ) : (
                    <p className="text-sm text-slate-400 dark:text-slate-500 italic">Brak zapisanej notatki z tego sprawdzenia.</p>
                  )}

                  {warnings.length > 0 && (
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 px-3 py-2">
                      <ul className="space-y-0.5">
                        {warnings.map((w, wi) => (
                          <li key={wi} className="text-xs text-amber-700 dark:text-amber-300">⚠ {w}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    {isRealLink && (
                      <a
                        href={c.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:border-slate-300 transition-colors"
                      >
                        Otwórz źródło →
                      </a>
                    )}
                    <button
                      onClick={() => sendToAiHelper(c)}
                      className="inline-flex items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-sm font-medium text-purple-700 hover:bg-purple-100 transition-colors"
                    >
                      Wyślij do AI Helpera →
                    </button>
                    <button
                      onClick={() => createBuilderDraft(c)}
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15 px-3 py-1.5 text-sm font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100 transition-colors"
                    >
                      Utwórz szkic w Kreatorze →
                    </button>
                    {sentId === c.id && (
                      <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">Wysłano ✓</span>
                    )}
                  </div>
                </div>
              );
            })}

            <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed mt-1">
              Ten widok nie obsługuje ignorowania/archiwizacji (brak statusu w
              <span className="font-mono"> source_checks</span>) — zapisz fragment jako
              trwałego kandydata w Źródłach, aby zarządzać nim w sekcji „Kandydaci (trwali)” powyżej.
            </p>
          </div>
        )}

        {/* Converted candidates — de-emphasized, shown for reference only */}
        {!loading && converted.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
              Wykorzystane ({converted.length})
            </h3>
            <div className="flex flex-col gap-3 opacity-70">
              {converted.map((c) => {
                const alert = alertFor(c.relatedAlertId);
                return (
                  <div key={c.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{c.sourceName}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{formatCheckedAt(c.checkedAt)}</p>
                    </div>
                    {alert ? (
                      <Link
                        href={`/builder?edit=${alert.slug}`}
                        className="shrink-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                      >
                        {alert.title || "Bez tytułu"} →
                      </Link>
                    ) : (
                      <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500 italic">Alert niedostępny</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

export default function QueuePage() {
  return (
    <AuthGate>
      <QueueContent />
    </AuthGate>
  );
}
