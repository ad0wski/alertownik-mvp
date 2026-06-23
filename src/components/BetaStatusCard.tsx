import Link from "next/link";
import { buildFeedbackQuickReasons } from "@/lib/feedbackMailto";

// Sprint 98 — a calm, single-glance "is this safe to trust" card for a
// first-time visitor, instead of requiring a click to /about to find the
// same facts spread across several sections there. No new claims: every
// line restates something already true and already documented elsewhere
// in the app (hero's pilot line, /about's "Kto przygotowuje alerty" and
// "Źródła pozostają najważniejsze" sections, the per-alert "Zatwierdzone
// ręcznie" line added Sprint 96).
export function BetaStatusCard() {
  const missingSourceReason = buildFeedbackQuickReasons().find((r) => r.id === "missing-alert");

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 mb-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
        Status pilotażu
      </p>
      <ul className="text-sm text-slate-600 space-y-1 leading-relaxed list-disc list-inside">
        <li>Alertownik jest w kontrolowanej becie — liczba alertów i okolic stale rośnie.</li>
        <li>Każdy alert jest sprawdzany i publikowany ręcznie przez administratora.</li>
        <li>AI może pomagać w przygotowaniu treści, ale nigdy nie publikuje samodzielnie.</li>
        <li>Oficjalne źródło zawsze ma pierwszeństwo przed szybkością Alertownika.</li>
      </ul>
      <div className="flex flex-wrap items-center gap-3 mt-3">
        <Link href="/about" className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline">
          Więcej o pilotażu →
        </Link>
        {missingSourceReason && (
          <a
            href={missingSourceReason.mailto}
            className="text-sm font-medium text-slate-500 hover:text-blue-700 hover:underline"
          >
            Zgłoś brakujące źródło lub błąd →
          </a>
        )}
      </div>
    </div>
  );
}
