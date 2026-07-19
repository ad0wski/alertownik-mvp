import { buildFeedbackQuickReasons } from "@/lib/feedbackMailto";

// Sprint 98 — one-click feedback reasons so a tester doesn't have to think
// about what to write. Each chip opens a mailto with its own subject and a
// short prompt already filled in; the existing general "Napisz do nas" CTA
// (buildFeedbackMailto, Sprint 93/95) stays as the catch-all "Inna
// sugestia" option instead of a duplicate flow.
export function FeedbackQuickOptions() {
  const reasons = buildFeedbackQuickReasons();

  return (
    <div className="flex flex-wrap gap-2">
      {reasons.map((reason) => (
        <a
          key={reason.id}
          href={reason.mailto}
          className="inline-flex items-center rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:border-blue-300 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
        >
          {reason.label}
        </a>
      ))}
    </div>
  );
}
