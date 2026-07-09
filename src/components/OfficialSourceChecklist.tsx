"use client";

import Link from "next/link";
import {
  OFFICIAL_SOURCE_CHECKS,
  CHECKLIST_PUBLISH_POLICY,
  FOUND_SOMETHING_STEPS,
  FREQUENCY_LABELS,
  RISK_LABELS,
  type OfficialSourceCheck,
} from "@/lib/officialSourceChecklist";
import { getSafeCheckSource } from "@/lib/sourceCheck";
import { SourceApiCheckPanel } from "@/components/SourceApiCheckPanel";
import type { AlertCategory } from "@/types/alert";
import type { AlertSource } from "@/types/alertSource";

// Sprint 129 — Source Checker Dashboard v1 (admin-only, rendered on
// /admin/sources). Static checklist of official sources to check BY HAND —
// honest manual workflow, no monitoring, no autopublish.
//
// Sprint 134 (A2): sources on the safe-check allowlist (Sprint 139: two —
// Gmina Michałowice komunikaty + WKD aktualności) additionally get a manual
// in-app check button (SourceApiCheckPanel → /api/sources/check). Still
// admin-triggered only; every other card stays check-by-hand.

const categoryLabels: Record<AlertCategory, string> = {
  transport: "Transport",
  water:     "Woda",
  power:     "Prąd",
  waste:     "Odpady",
  roads:     "Drogi",
  municipal: "Komunikaty",
};

const categoryBadgeClass: Record<AlertCategory, string> = {
  transport: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
  water:     "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200",
  power:     "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200",
  waste:     "bg-lime-50 text-lime-700 ring-1 ring-lime-200",
  roads:     "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
  municipal: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

const riskBadgeClass: Record<OfficialSourceCheck["risk"], string> = {
  low:    "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  medium: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  high:   "bg-red-50 text-red-700 ring-1 ring-red-200",
};

function ChecklistCard({
  source,
  registrySources,
  dedupTexts,
}: {
  source: OfficialSourceCheck;
  registrySources: AlertSource[];
  dedupTexts: string[];
}) {
  const safeCheckSource = getSafeCheckSource(source.id);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <h4 className="text-sm font-semibold text-slate-800 mr-1">{source.name}</h4>
        <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ${categoryBadgeClass[source.category]}`}>
          {categoryLabels[source.category]}
        </span>
        <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200">
          {FREQUENCY_LABELS[source.frequency]}
          {source.frequencyNote && ` — ${source.frequencyNote}`}
        </span>
        <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ${riskBadgeClass[source.risk]}`}>
          {RISK_LABELS[source.risk]}
        </span>
      </div>

      <p className="text-sm text-slate-600 leading-relaxed mb-2">
        <span className="font-medium text-slate-700">Co sprawdzić: </span>
        {source.whatToCheck}
      </p>

      <p className="text-xs text-slate-500 mb-2">
        <span className="font-medium">Miejscowości: </span>
        {source.localities.join(", ")}
      </p>

      {source.riskNote && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mb-2">
          ⚠ {source.riskNote}
        </p>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
        <a
          href={source.officialUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
        >
          Otwórz oficjalne źródło →
        </a>
        <Link
          href="/admin/new-alert"
          className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
        >
          Nowy alert ze źródła →
        </Link>
        <Link
          href="/builder"
          className="text-sm font-medium text-slate-500 hover:text-slate-700 hover:underline"
        >
          Kreator →
        </Link>
      </div>

      {safeCheckSource && (
        <SourceApiCheckPanel
          source={safeCheckSource}
          registrySources={registrySources}
          dedupTexts={dedupTexts}
        />
      )}
    </div>
  );
}

export function OfficialSourceChecklist({
  registrySources = [],
  dedupTexts = [],
}: {
  /** alert_sources rows — lets the API-check panel attach source_id + log history. */
  registrySources?: AlertSource[];
  /** Existing candidate texts + alert titles for the duplicate heuristic. */
  dedupTexts?: string[];
}) {
  return (
    <section id="checklista" className="mb-8 rounded-2xl border border-blue-200 bg-blue-50/50 p-4 sm:p-5">
      <details open>
        <summary className="cursor-pointer select-none">
          <span className="text-base font-semibold text-slate-800">
            Checklista oficjalnych źródeł
          </span>
          <span className="ml-2 inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 ring-1 ring-slate-200">
            ręczne sprawdzanie
          </span>
        </summary>

        <p className="text-sm text-slate-600 leading-relaxed mt-2 mb-3">
          Stała lista miejsc, które sprawdzasz ręcznie w przeglądarce — żeby nie
          zgadywać za każdym razem, gdzie szukać. To nie jest automatyczny
          monitoring: nic nie pobiera się samo i nic nie publikuje się samo.
        </p>

        {/* Publish policy — one box, project rules, not per-source settings */}
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 mb-3">
          <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1.5">
            Zasady (source-first, tylko draft)
          </h3>
          <ul className="text-sm text-slate-600 space-y-1">
            {CHECKLIST_PUBLISH_POLICY.map((rule) => (
              <li key={rule} className="flex items-start gap-2">
                <span className="text-slate-400 mt-0.5">•</span>
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Found something? — the single source-to-draft flow */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 mb-4">
          <h3 className="text-xs font-semibold text-emerald-800 uppercase tracking-wide mb-1.5">
            Coś znalazłeś? (źródło → szkic)
          </h3>
          <ol className="text-sm text-emerald-900 space-y-1 list-decimal list-inside">
            {FOUND_SOMETHING_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {OFFICIAL_SOURCE_CHECKS.map((source) => (
            <ChecklistCard
              key={source.id}
              source={source}
              registrySources={registrySources}
              dedupTexts={dedupTexts}
            />
          ))}
        </div>

        <p className="text-xs text-slate-500 mt-3">
          Wynik każdego sprawdzenia (także „brak zmian") zaloguj przy odpowiednim
          źródle w rejestrze poniżej — historia checków buduje rytm na przyszłość.
        </p>
      </details>
    </section>
  );
}
