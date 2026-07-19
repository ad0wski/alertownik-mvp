import Link from "next/link";
import { buildFeedbackQuickReasons } from "@/lib/feedbackMailto";

// Sprint 98 — a calm, single-glance "is this safe to trust" card for a
// first-time visitor, instead of requiring a click to /about to find the
// same facts spread across several sections there. No new claims: every
// line restates something already true and already documented elsewhere
// in the app (hero's pilot line, /about's "Kto przygotowuje alerty" and
// "Źródła pozostają najważniejsze" sections, the per-alert "Zatwierdzone
// ręcznie" line added Sprint 96).
//
// Sprint 156B — real-device smoke found this card, in its original
// 5-bullet form, dominating the first mobile viewport and pushing actual
// alerts below the fold. Compacted to two lines: a one-line status
// summary linking to /about (which still carries the full detail — manual
// publish, AI never auto-publishes, source precedence — nothing removed,
// just not repeated on first paint) plus the independence line, kept
// verbatim since it's asserted directly on the homepage.
export function BetaStatusCard() {
  const missingSourceReason = buildFeedbackQuickReasons().find((r) => r.id === "missing-alert");

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-1 mb-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Status pilotażu
        </span>
        <span className="text-slate-300" aria-hidden="true">•</span>
        <span className="text-slate-500 dark:text-slate-400">Wczesna beta, alerty sprawdzane ręcznie</span>
        <Link href="/about" className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline">
          Jak działa pilotaż →
        </Link>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-snug">
        Alertownik jest niezależnym projektem — nie jest oficjalną aplikacją WKD, PGE ani żadnej gminy.
        {missingSourceReason && (
          <>
            {" "}
            <a
              href={missingSourceReason.mailto}
              className="font-medium hover:text-blue-700 dark:hover:text-blue-300 hover:underline whitespace-nowrap"
            >
              Zgłoś brakujące źródło lub błąd →
            </a>
          </>
        )}
      </p>
    </div>
  );
}
