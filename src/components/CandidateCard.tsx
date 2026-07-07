"use client";

import type {
  CandidateStatus,
  RiskLevel,
  VerificationStatus,
} from "@/types/sourceCandidate";

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
}

const RISK_LABELS: Record<RiskLevel, { label: string; color: string }> = {
  low:    { label: "Ryzyko: niskie",  color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  medium: { label: "Ryzyko: średnie", color: "text-amber-700 bg-amber-50 border-amber-200" },
  high:   { label: "Ryzyko: wysokie", color: "text-red-700 bg-red-50 border-red-200" },
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
}: CandidateCardProps) {
  const risk = c.riskLevel ? RISK_LABELS[c.riskLevel] : null;
  const hasPeriod = Boolean(c.startsAt || c.endsAt);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 flex flex-col gap-3">
      {/* Badge row */}
      <div className="flex flex-wrap items-center gap-2">
        {c.categoryLabel && (
          <span className="text-xs font-medium text-slate-600 bg-slate-100 rounded-full px-2.5 py-1">
            {c.categoryLabel}
          </span>
        )}
        {c.severityLabel && (
          <span className="text-xs font-medium text-slate-600 bg-slate-100 rounded-full px-2.5 py-1">
            {c.severityLabel}
          </span>
        )}
        {risk && (
          <span className={`text-xs font-medium rounded-full px-2.5 py-1 border ${risk.color}`}>
            {risk.label}
          </span>
        )}
        {typeof c.confidenceScore === "number" && (
          <span className="text-xs font-medium text-slate-600 bg-slate-100 rounded-full px-2.5 py-1">
            Pewność: {Math.round(c.confidenceScore * 100)}%
          </span>
        )}
        {c.verificationStatus && c.verificationStatus !== "unverified" && (
          <span className="text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-1">
            {VERIFICATION_LABELS[c.verificationStatus]}
          </span>
        )}
        <span className="text-xs text-slate-400">{formatDetectedAt(c.detectedAt)}</span>
      </div>

      <p className="text-sm font-semibold text-slate-900">{c.title}</p>
      <p className="text-xs text-slate-500">
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
        <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{c.excerpt}</p>
      )}

      {convertedAlertTitle && (
        <p className="text-xs text-emerald-700">
          → przekształcone w alert:{" "}
          <strong className="font-semibold">{convertedAlertTitle}</strong>
        </p>
      )}

      {(warnings.length > 0 || c.duplicateWarning) && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
          <ul className="space-y-0.5">
            {c.duplicateWarning && (
              <li className="text-xs text-amber-700">⚠ {c.duplicateWarning}</li>
            )}
            {warnings.map((w, wi) => (
              <li key={wi} className="text-xs text-amber-700">⚠ {w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Honest future-flow note: the AI verifier (plan A3) doesn't exist
          yet, so a pending candidate is by definition manually reviewed. */}
      {status === "pending" && (!c.verificationStatus || c.verificationStatus === "unverified") && (
        <p className="text-xs text-slate-400 italic">
          Weryfikacja: ręczna (admin). Raport AI verifiera — wkrótce, w kolejnym etapie automatyzacji.
        </p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {c.sourceUrl && (
          <a
            href={c.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
          >
            Otwórz źródło →
          </a>
        )}
        {c.candidateUrl && (
          <a
            href={c.candidateUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
          >
            Otwórz link kandydata →
          </a>
        )}

        {status === "pending" && (
          <>
            {onSendToAiHelper && (
              <button
                onClick={onSendToAiHelper}
                className="inline-flex items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-sm font-medium text-purple-700 hover:bg-purple-100 transition-colors"
              >
                Wyślij do AI Helpera →
              </button>
            )}
            {onCreateBuilderDraft && (
              <button
                onClick={onCreateBuilderDraft}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100 transition-colors"
              >
                Utwórz szkic w Kreatorze →
              </button>
            )}
            {onSetStatus && (
              <>
                <button
                  disabled={busy}
                  onClick={() => onSetStatus("rejected")}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  Odrzuć
                </button>
                <button
                  disabled={busy}
                  onClick={() => onSetStatus("archived")}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  Archiwizuj
                </button>
              </>
            )}
          </>
        )}

        {(status === "rejected" || status === "archived") && onSetStatus && (
          <button
            disabled={busy}
            onClick={() => onSetStatus("pending")}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            Przywróć do oczekujących
          </button>
        )}

        {sent && <span className="text-xs text-emerald-700 font-medium">Wysłano ✓</span>}
      </div>
    </div>
  );
}
