"use client";

import { getClientEnvironmentIdentity, ENVIRONMENT_LABELS, type EnvironmentIdentity } from "@/lib/environmentIdentity";

// Sprint 165B — visible environment badge for the logged-in admin panel
// only (AppHeader renders this exclusively inside its `session &&` block,
// so a public/anonymous visitor never sees it — Requirement C.6).
//
// Shows only one of four fixed labels — PRODUCTION / PREVIEW /
// DEVELOPMENT / UNKNOWN — never a URL, project ref, or any other
// technical identifier. UNKNOWN is styled to read as a warning (red,
// pulsing) on purpose: an admin should never mistake "we couldn't
// determine the environment" for a calm, known state.

const BADGE_STYLES: Record<EnvironmentIdentity, string> = {
  production:
    "text-slate-600 bg-slate-100 border-slate-300 dark:text-slate-300 dark:bg-slate-800 dark:border-slate-600",
  preview:
    "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-500/10 dark:border-blue-500/30",
  development:
    "text-purple-700 bg-purple-50 border-purple-200 dark:text-purple-300 dark:bg-purple-500/10 dark:border-purple-500/30",
  unknown:
    "text-red-700 bg-red-50 border-red-300 animate-pulse dark:text-red-300 dark:bg-red-500/10 dark:border-red-500/40",
};

export function EnvironmentBadge({ className = "" }: { className?: string }) {
  const identity = getClientEnvironmentIdentity();
  const label = ENVIRONMENT_LABELS[identity];

  return (
    <span
      role="status"
      aria-label={`Środowisko: ${label}`}
      title={`Środowisko: ${label}`}
      className={`text-xs font-semibold tracking-wide rounded-full border px-2 py-0.5 select-none cursor-default whitespace-nowrap ${BADGE_STYLES[identity]} ${className}`}
    >
      {label}
    </span>
  );
}
