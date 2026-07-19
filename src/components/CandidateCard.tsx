"use client";

import type {
  CandidateStatus,
  RiskLevel,
  VerificationStatus,
} from "@/types/sourceCandidate";
import {
  RECOMMENDATION_LABELS,
  VERIFIER_DISCLAIMER,
  type CandidateVerification,
} from "@/lib/candidateVerifier";
import {
  canVerify,
  canApprove,
  canReject,
  canArchive,
  canRestore,
  canConvertToDraft,
  canSendToAiHelper,
  suggestedActionFor,
  APPROVED_CARD_NOTE,
  APPROVE_BUTTON_LABEL,
  CONVERT_FROM_APPROVED_LABEL,
} from "@/lib/candidateReviewActions";

// Sprint 131 — reusable candidate card for /admin/queue (and, later, any
// automation surface that shows candidates). Sprint 132 aligned it with
// the v2 data model (docs/sprint132_candidate_persistence_schema_proposal
// .sql): risk/verification enums now come from src/types/sourceCandidate,
// and the reject action writes the v2 `rejected` status. Every future
// field stays optional and is rendered only when actually present —
// nothing in production sets them yet (no table, no fake data); the only
// always-visible future element is the honest "AI verifier: wkrótce"
// placeholder on pending cards.

export interface CandidateCardData {
  id: string;
  title: string;
  sourceName: string;
  sourceUrl?: string;
  candidateUrl?: string;
  excerpt?: string;
  detectedAt: string;
  categoryLabel?: string;
  // ── Future fields (v2 model — not persisted anywhere yet) ──
  severityLabel?: string;
  locality?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  confidenceScore?: number | null;
  riskLevel?: RiskLevel | null;
  verificationStatus?: VerificationStatus;
  duplicateWarning?: string | null;
}

interface CandidateCardProps {
  candidate: CandidateCardData;
  status: CandidateStatus;
  warnings?: string[];
  convertedAlertTitle?: string | null;
  busy?: boolean;
  sent?: boolean;
  onSendToAiHelper?: () => void;
  onCreateBuilderDraft?: () => void;
  onSetStatus?: (status: CandidateStatus) => void;
  // Sprint 135 (A3) — rule-based verifier: report just produced for this
  // card (transient; the persisted fields render via the badges above).
  onVerify?: () => void;
  verifying?: boolean;
  verification?: CandidateVerification | null;
}

const RISK_LABELS: Record<RiskLevel, { label: string; color: string }> = {
  low:    { label: "Ryzyko: niskie",  color: "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/30" },
  medium: { label: "Ryzyko: średnie", color: "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/30" },
  high:   { label: "Ryzyko: wysokie", color: "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30" },
};

const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  unverified:     "Niezweryfikowany",
  auto_checked:   "Sprawdzony automatycznie",
  ai_verified:    "Zweryfikowany przez AI",
  human_verified: "Zweryfikowany ręcznie",
  failed:         "Weryfikacja nieudana",
};

function formatDetectedAt(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateOnly(iso: string): string {
  return new Date(iso).toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const RECOMMENDATION_BADGE_CLASS: Record<CandidateVerification["recommendation"], string> = {
  approve:      "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/30",
  needs_review: "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/30",
  reject:       "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30",
};

export function CandidateCard({
  candidate: c,
  status,
  warnings = [],
  convertedAlertTitle,
  busy = false,
  sent = false,
  onSendToAiHelper,
  onCreateBuilderDraft,
  onSetStatus,
  onVerify,
  verifying = false,
  verification = null,
}: CandidateCardProps) {
  const risk = c.riskLevel ? RISK_LABELS[c.riskLevel] : null;
  const hasPeriod = Boolean(c.startsAt || c.endsAt);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5 flex flex-col gap-3">
      {/* Badge row */}
      <div className="flex flex-wrap items-center gap-2">
        {c.categoryLabel && (
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2.5 py-1">
            {c.categoryLabel}
          </span>
        )}
        {c.severityLabel && (
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2.5 py-1">
            {c.severityLabel}
          </span>
        )}
        {risk && (
          <span className={`text-xs font-medium rounded-full px-2.5 py-1 border ${risk.color}`}>
            {risk.label}
          </span>
        )}
        {typeof c.confidenceScore === "number" && (
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2.5 py-1">
            Pewność: {Math.round(c.confidenceScore * 100)}%
          </span>
        )}
        {c.verificationStatus && c.verificationStatus !== "unverified" && (
          <span className="text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/30 rounded-full px-2.5 py-1">
            {VERIFICATION_LABELS[c.verificationStatus]}
          </span>
        )}
        <span className="text-xs text-slate-400 dark:text-slate-500">{formatDetectedAt(c.detectedAt)}</span>
      </div>

      <p className="text-sm font-semibold text-slate-900 dark:text-white">{c.title}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Źródło: {c.sourceName}
        {c.locality && <> · {c.locality}</>}
        {hasPeriod && (
          <>
            {" · "}
            {c.startsAt ? formatDateOnly(c.startsAt) : "?"}
            {" – "}
            {c.endsAt ? formatDateOnly(c.endsAt) : "?"}
          </>
        )}
      </p>

      {c.excerpt && (
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">{c.excerpt}</p>
      )}

      {convertedAlertTitle && (
        <p className="text-xs text-emerald-700 dark:text-emerald-300">
          → przekształcone w alert:{" "}
          <strong className="font-semibold">{convertedAlertTitle}</strong>
        </p>
      )}

      {(warnings.length > 0 || c.duplicateWarning) && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 px-3 py-2">
          <ul className="space-y-0.5">
            {c.duplicateWarning && (
              <li className="text-xs text-amber-700 dark:text-amber-300">⚠ {c.duplicateWarning}</li>
            )}
            {warnings.map((w, wi) => (
              <li key={wi} className="text-xs text-amber-700 dark:text-amber-300">⚠ {w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Sprint 136: approved cards say explicitly what "approved" means —
          and what it does NOT mean (no publication). */}
      {status === "approved" && (
        <p className="text-xs text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 rounded-lg px-3 py-2">
          {APPROVED_CARD_NOTE}
        </p>
      )}

      {/* Honest verification note (Sprint 135): a rule-based helper exists
          now — a pending, unverified candidate can be checked with one
          click, but review and every decision stay manual. */}
      {canVerify(status) &&
        !verification &&
        (!c.verificationStatus || c.verificationStatus === "unverified") && (
          <p className="text-xs text-slate-400 dark:text-slate-500 italic">
            Weryfikacja: ręczna (admin). Możesz użyć pomocnika „Zweryfikuj” — deterministyczny
            raport reguł (źródło, data, duplikaty), nie AI. Decyzje zawsze należą do Ciebie.
          </p>
        )}

      {/* Verifier report (Sprint 135) — transient panel shown right after a
          run; the persisted confidence/risk/verification badges above pick
          the values up from the DB on the next load. */}
      {verification && (
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className={`text-xs font-medium rounded-full px-2.5 py-0.5 border ${RECOMMENDATION_BADGE_CLASS[verification.recommendation]}`}>
              {RECOMMENDATION_LABELS[verification.recommendation]}
            </span>
            <span className="text-xs text-slate-600 dark:text-slate-400">
              Pewność: {verification.confidence}%
            </span>
            <span className="text-xs text-slate-600 dark:text-slate-400">
              Ryzyko: {verification.riskLevel === "low" ? "niskie" : verification.riskLevel === "medium" ? "średnie" : "wysokie"}
            </span>
            {verification.detectedCategory && (
              <span className="text-xs text-slate-600 dark:text-slate-400">
                Kategoria (sugestia): {verification.detectedCategory}
              </span>
            )}
          </div>
          <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{verification.summary}</p>
          <ul className="space-y-0.5 mb-1.5">
            {verification.reasons.map((r, ri) => (
              <li key={ri} className="text-xs text-slate-600 dark:text-slate-400">• {r}</li>
            ))}
          </ul>
          {/* Sprint 136: point at the matching button — the click is still
              the admin's; nothing below happens automatically. */}
          <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
            {suggestedActionFor(verification.recommendation).hint}
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">{VERIFIER_DISCLAIMER}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {c.sourceUrl && (
          <a
            href={c.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:border-slate-300 transition-colors"
          >
            Otwórz źródło →
          </a>
        )}
        {c.candidateUrl && (
          <a
            href={c.candidateUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:border-slate-300 transition-colors"
          >
            Otwórz link kandydata →
          </a>
        )}

        {/* Sprint 136: buttons are gated by the pure transition predicates
            in src/lib/candidateReviewActions.ts — every status change is an
            explicit admin click; the verifier only suggests. */}
        {canVerify(status) && onVerify && (
          <button
            disabled={verifying}
            onClick={onVerify}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 disabled:opacity-50 transition-colors"
          >
            {verifying ? "Weryfikowanie…" : "Zweryfikuj (pomocnik) →"}
          </button>
        )}
        {canApprove(status) && onSetStatus && (
          <button
            disabled={busy}
            onClick={() => onSetStatus("approved")}
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
          >
            {APPROVE_BUTTON_LABEL} →
          </button>
        )}
        {canSendToAiHelper(status) && onSendToAiHelper && (
          <button
            onClick={onSendToAiHelper}
            className="inline-flex items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-sm font-medium text-purple-700 hover:bg-purple-100 transition-colors"
          >
            Wyślij do AI Helpera →
          </button>
        )}
        {canConvertToDraft(status) && onCreateBuilderDraft && (
          <button
            onClick={onCreateBuilderDraft}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15 px-3 py-1.5 text-sm font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100 transition-colors"
          >
            {status === "approved" ? CONVERT_FROM_APPROVED_LABEL : "Utwórz szkic w Kreatorze"} →
          </button>
        )}
        {canReject(status) && onSetStatus && (
          <button
            disabled={busy}
            onClick={() => onSetStatus("rejected")}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 disabled:opacity-50 transition-colors"
          >
            Odrzuć
          </button>
        )}
        {canArchive(status) && onSetStatus && (
          <button
            disabled={busy}
            onClick={() => onSetStatus("archived")}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 disabled:opacity-50 transition-colors"
          >
            Archiwizuj
          </button>
        )}
        {canRestore(status) && onSetStatus && (
          <button
            disabled={busy}
            onClick={() => onSetStatus("pending")}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 disabled:opacity-50 transition-colors"
          >
            {status === "approved" ? "Cofnij do oczekujących" : "Przywróć do oczekujących"}
          </button>
        )}

        {sent && <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">Wysłano ✓</span>}
      </div>
    </div>
  );
}
