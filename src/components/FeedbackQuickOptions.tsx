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
          className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50 transition-colors"
        >
          {reason.label}
        </a>
      ))}
    </div>
  );
}
