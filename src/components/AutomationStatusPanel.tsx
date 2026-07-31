"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/apiClientAuth";
import {
  AUTOMATION_STATUS_TITLE,
  AUTOMATION_STATUS_NO_PUBLISH_NOTE,
  AUTOMATION_STATUS_INFO_ONLY_NOTE,
  AUTOMATION_STATUS_AUTO_PUBLISH_TITLE,
  AUTOMATION_STATUS_AUTO_PUBLISH_NOTE,
  type AutomationStatusSnapshot,
} from "@/lib/automationStatus";
import type { ScheduledWriterSourceActivity } from "@/lib/writerCandidateActivity";
import { AUTOMATION_ERROR_CATEGORY_LABELS_PL, AUTOMATION_SEVERITY_LABELS_PL } from "@/lib/automationErrorClassifier";
import { RUN_OUTCOME_LABELS_PL, formatRunTrigger } from "@/lib/runHistoryStatus";
import {
  EMAIL_ALERT_PROVIDER_RESEND,
  EMAIL_ALERT_DISABLED_NOTE,
  EMAIL_ALERT_MISCONFIGURED_NOTE,
  EMAIL_ALERT_READY_NOT_WIRED_NOTE,
  EMAIL_ALERT_ACTIVE_PROVIDER_DISABLED_LABEL,
  EMAIL_ALERT_ACTIVE_PROVIDER_MISCONFIGURED_LABEL,
  OPERATIONAL_EMAIL_TEST_SECTION_TITLE,
  OPERATIONAL_EMAIL_TEST_DISABLED_LABEL,
  OPERATIONAL_EMAIL_TEST_CONFIRM_MESSAGE,
  OPERATIONAL_EMAIL_TEST_RESULT_LABELS_PL,
  OPERATIONAL_EMAIL_TEST_GENERIC_ERROR_LABEL,
} from "@/lib/emailAlertConfig";
import { getClientEnvironmentIdentity } from "@/lib/environmentIdentity";
import type { OperationalEmailTestResponse } from "@/app/api/admin/operational-email-test/route";

type AutomationStatusResponse =
  | { ok: true; status: AutomationStatusSnapshot }
  | { ok: false; error: string };

// Sprint 164B — Safe Auto-Candidate Canary Foundation. Admin-only,
// read-only status panel rendered on /admin/sources. Fetches its status
// ONCE on mount (GET /api/admin/automation-status — no side effects, no
// write, mirrors how the rest of this page auto-loads its own read-only
// data) and never again unless the page reloads. There is no button here
// that triggers anything — this panel cannot activate automation, cannot
// run a canary check, and cannot be used to change any switch.

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Warsaw",
  });
}

function StatusBadge({ active, activeLabel, inactiveLabel }: { active: boolean; activeLabel: string; inactiveLabel: string }) {
  return (
    <span
      className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ring-1 ${
        active
          ? "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-200"
          : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 ring-slate-200"
      }`}
    >
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

export function AutomationStatusPanel({ activityRows }: { activityRows: ScheduledWriterSourceActivity[] }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [status, setStatus] = useState<AutomationStatusSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testState, setTestState] = useState<"idle" | "loading">("idle");
  const [testResultLabel, setTestResultLabel] = useState<string | null>(null);
  const isPreview = getClientEnvironmentIdentity() === "preview";

  async function runOperationalEmailTest() {
    if (testState === "loading") return;
    if (!confirm(OPERATIONAL_EMAIL_TEST_CONFIRM_MESSAGE)) return;
    setTestState("loading");
    setTestResultLabel(null);
    try {
      const res = await authFetch("/api/admin/operational-email-test", { method: "POST" });
      const data = (await res.json()) as OperationalEmailTestResponse;
      if ("status" in data) {
        setTestResultLabel(OPERATIONAL_EMAIL_TEST_RESULT_LABELS_PL[data.status] ?? OPERATIONAL_EMAIL_TEST_GENERIC_ERROR_LABEL);
      } else {
        setTestResultLabel(OPERATIONAL_EMAIL_TEST_GENERIC_ERROR_LABEL);
      }
    } catch {
      setTestResultLabel(OPERATIONAL_EMAIL_TEST_GENERIC_ERROR_LABEL);
    } finally {
      setTestState("idle");
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch("/api/admin/automation-status");
        const data = (await res.json()) as AutomationStatusResponse;
        if (cancelled) return;
        if (!data.ok) {
          setError(data.error);
          setState("error");
          return;
        }
        setStatus(data.status);
        setState("ready");
      } catch {
        if (!cancelled) {
          setError("Błąd połączenia z serwerem.");
          setState("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mb-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-4 sm:p-5">
      <details>
        <summary className="cursor-pointer select-none">
          <span className="text-base font-semibold text-slate-800 dark:text-slate-100">
            {AUTOMATION_STATUS_TITLE}
          </span>
          <span className="ml-2 inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 ring-1 ring-purple-200 dark:ring-purple-500/30">
            informacyjny — bez przycisku aktywacji
          </span>
        </summary>

        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mt-2 mb-1.5">
          {AUTOMATION_STATUS_NO_PUBLISH_NOTE}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
          {AUTOMATION_STATUS_INFO_ONLY_NOTE}
        </p>

        {state === "loading" && (
          <p className="text-sm text-slate-500 dark:text-slate-400">Wczytywanie stanu…</p>
        )}

        {state === "error" && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {state === "ready" && status && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">Automatyczne sprawdzanie:</span>
              <StatusBadge active={status.checksEnabled} activeLabel="aktywne" inactiveLabel="wyłączone" />
              <span className="text-xs text-slate-500 dark:text-slate-400 ml-3">Automatyczne tworzenie kandydatów:</span>
              <StatusBadge active={status.writesEnabled} activeLabel="aktywne" inactiveLabel="wyłączone" />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">CRON_SECRET:</span>
              <StatusBadge active={status.cronSecretConfigured} activeLabel="skonfigurowany" inactiveLabel="brak" />
              <span className="text-xs text-slate-500 dark:text-slate-400 ml-3">Dane konta writer:</span>
              <StatusBadge active={status.writerCredentialsConfigured} activeLabel="skonfigurowane" inactiveLabel="brak" />
            </div>

            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400">Źródło canary: </span>
              <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                {status.canarySources.map((s) => s.name).join(", ") || "brak"}
              </span>
              {!status.isSingleSourceCanary && (
                <span className="ml-2 inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200">
                  uwaga: nie jest to pojedyncze źródło canary
                </span>
              )}
            </div>

            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400">Limit nowych kandydatów na uruchomienie: </span>
              <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{status.maxCandidatesPerRun}</span>
            </div>

            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400">Zapis możliwy przy obecnej konfiguracji: </span>
              <StatusBadge active={status.writeAttemptsPossible} activeLabel="tak — wszystkie bramy spełnione" inactiveLabel="nie — co najmniej jedna brama zamknięta" />
            </div>

            <div className="pt-1 border-t border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400">Ostatni bezpieczny wynik: </span>
              {(() => {
                const canaryActivity = activityRows.find((row) =>
                  status.canarySources.some((s) => s.id === row.sourceKey)
                );
                if (!canaryActivity || !canaryActivity.lastCandidateAt) {
                  return (
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      brak — automat jeszcze nie zapisał tu żadnego kandydata
                    </span>
                  );
                }
                return (
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    ostatni kandydat: {formatTimestamp(canaryActivity.lastCandidateAt)} ({canaryActivity.pendingCandidates} oczekuje na weryfikację)
                  </span>
                );
              })()}
            </div>

            {/* Run history (Sprint 166D-2B) — reads status.runHistory, built
                server-side by GET /api/admin/automation-status from a
                read-only, explicit-columns, environment_tag-filtered
                SELECT against scheduled_writer_runs (admin-only RLS
                policy, no migration needed). ONE aggregate block for the
                whole run — this table has no per-source breakdown, so no
                per-canary-source list is rendered here (see
                ScheduledWriterMonitoring above for the per-source
                candidate view, a different data source). error_summary is
                never selected by the route, so it structurally cannot
                appear here or anywhere in this panel. */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Stan operacyjny automatyzacji
              </p>

              {!status.runHistory.configured && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Historia przebiegów: nieskonfigurowana (brak ustawionego tagu środowiska bazy danych).
                </p>
              )}

              {status.runHistory.configured && !status.runHistory.lastClosedRun && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Brak historii przebiegów — automat jeszcze nigdy nie zakończył uruchomienia w tym środowisku.
                </p>
              )}

              {status.runHistory.lastClosedRun && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/60 p-2.5 text-xs text-slate-600 dark:text-slate-400 space-y-0.5">
                  <p>Wynik ostatniego przebiegu: {RUN_OUTCOME_LABELS_PL[status.runHistory.lastClosedRun.outcome]}</p>
                  <p>Rozpoczęcie: {formatTimestamp(status.runHistory.lastClosedRun.startedAt)}</p>
                  <p>Zakończenie: {formatTimestamp(status.runHistory.lastClosedRun.finishedAt)}</p>
                  <p>Czas trwania: {status.runHistory.lastClosedRun.durationSeconds} s</p>
                  <p>Wywołanie: {formatRunTrigger(status.runHistory.lastClosedRun.trigger)}</p>
                  <p>
                    Kategoria / ważność błędu:{" "}
                    {AUTOMATION_ERROR_CATEGORY_LABELS_PL[status.runHistory.lastClosedRun.category]} /{" "}
                    {AUTOMATION_SEVERITY_LABELS_PL[status.runHistory.lastClosedRun.severity]}
                  </p>
                  <p>
                    Wymagana akcja administratora:{" "}
                    {status.runHistory.lastClosedRun.adminActionRequired ? "tak" : "nie"}
                  </p>
                </div>
              )}

              {status.runHistory.openRun ? (
                <div className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-300 space-y-0.5">
                  <p>
                    Aktualnie otwarty przebieg: tak ({formatRunTrigger(status.runHistory.openRun.trigger)}, trwa{" "}
                    {status.runHistory.openRun.ageSeconds} s)
                  </p>
                  {status.runHistory.openRun.likelyStuck && (
                    <p>Uwaga: przebieg trwa dłużej niż zwykle — może być zawieszony, wymaga sprawdzenia.</p>
                  )}
                </div>
              ) : (
                status.runHistory.configured && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">Aktualnie otwarty przebieg: nie.</p>
                )
              )}

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {status.runHistory.retryInfoNote}
              </p>
            </div>

            {/* Operational notification ledger runtime (Sprint 166N-A) —
                reads status.operationalNotificationRuntimeEnabled, built
                server-side from OPERATIONAL_NOTIFICATION_RUNTIME_ENABLED
                presence only. Purely informational, no control — mirrors
                every other badge in this panel. Deliberately separate from
                the email section below: this flag governs whether the
                writer ever attempts a ledger claim/finish cycle at all,
                independent of whether email sending is also enabled. */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">Runtime ledgera powiadomień operacyjnych:</span>
              <StatusBadge
                active={status.operationalNotificationRuntimeEnabled}
                activeLabel="aktywny"
                inactiveLabel="wyłączony"
              />
            </div>

            {/* Trusted-source auto-publish (Sprint 180C) — the one, scoped
                exception to "every alert is published manually" (CLAUDE.md
                Security Rule #10 amendment). Purely informational, same
                convention as every other section here: no button, no
                control, just presence/boolean/allowlist visibility. */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {AUTOMATION_STATUS_AUTO_PUBLISH_TITLE}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {AUTOMATION_STATUS_AUTO_PUBLISH_NOTE}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">Auto-publikacja:</span>
                <StatusBadge active={status.autoPublish.enabled} activeLabel="aktywna" inactiveLabel="wyłączona" />
                <span className="text-xs text-slate-500 dark:text-slate-400 ml-3">Limit publikacji na uruchomienie:</span>
                <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{status.autoPublish.maxPerRun}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400">Allowlista auto-publikacji: </span>
                <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  {status.autoPublish.allowlistedSources.map((s) => s.name).join(", ") || "brak"}
                </span>
                {!status.autoPublish.isSingleSourceAllowlist && (
                  <span className="ml-2 inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200">
                    uwaga: nie jest to pojedyncze źródło
                  </span>
                )}
              </div>
            </div>

            {/* Email alerting (Sprint 166E-1) — reads status.emailAlertConfig,
                built server-side from presence-only booleans
                (OPERATIONAL_EMAIL_ALERTS_ENABLED / RESEND_API_KEY /
                OPERATIONAL_ALERT_EMAIL_FROM / OPERATIONAL_ALERT_EMAIL_TO).
                Never renders a key, an address, or any part of one — only
                enabled/disabled, provider name, and config-complete/
                incomplete. No send button exists anywhere in this panel. */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Alerty e-mail (fundament)
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">Alerty e-mail:</span>
                <StatusBadge
                  active={status.emailAlertConfig.enabled}
                  activeLabel="włączone"
                  inactiveLabel="wyłączone"
                />
                <span className="text-xs text-slate-500 dark:text-slate-400 ml-3">Skonfigurowany dostawca:</span>
                <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  {status.emailAlertConfig.configuredProvider === EMAIL_ALERT_PROVIDER_RESEND ? "Resend" : "nieskonfigurowany"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">Konfiguracja:</span>
                <StatusBadge
                  active={status.emailAlertConfig.configComplete}
                  activeLabel="kompletna"
                  inactiveLabel="niekompletna"
                />
                <span className="text-xs text-slate-500 dark:text-slate-400 ml-3">Aktywny dostawca:</span>
                <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  {status.emailAlertConfig.activeProvider === EMAIL_ALERT_PROVIDER_RESEND
                    ? "Resend"
                    : !status.emailAlertConfig.enabled
                      ? EMAIL_ALERT_ACTIVE_PROVIDER_DISABLED_LABEL
                      : EMAIL_ALERT_ACTIVE_PROVIDER_MISCONFIGURED_LABEL}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">Ostatnia wysyłka:</span>
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  brak danych, ponieważ trwała historia nie istnieje
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {!status.emailAlertConfig.enabled
                  ? EMAIL_ALERT_DISABLED_NOTE
                  : !status.emailAlertConfig.configComplete
                    ? EMAIL_ALERT_MISCONFIGURED_NOTE
                    : EMAIL_ALERT_READY_NOT_WIRED_NOTE}
              </p>

              {/* Sprint 166E-2A — Preview-only controlled test. Rendered
                  only when the CLIENT build's own environment identity is
                  "preview" (build-time constant, never a runtime fetch —
                  see environmentIdentity.ts) — this section structurally
                  cannot appear in a Production build's HTML output. No
                  request fires on mount; the button requires an explicit
                  confirm() before any network call, and is disabled while
                  a request is in flight or when alerts are disabled. */}
              {isPreview && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {OPERATIONAL_EMAIL_TEST_SECTION_TITLE}
                  </p>
                  <button
                    type="button"
                    disabled={!status.emailAlertConfig.enabled || testState === "loading"}
                    onClick={runOperationalEmailTest}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg ring-1 ring-slate-300 dark:ring-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    {testState === "loading" ? "Wysyłanie…" : "Wyślij jeden testowy e-mail"}
                  </button>
                  {!status.emailAlertConfig.enabled && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{OPERATIONAL_EMAIL_TEST_DISABLED_LABEL}</p>
                  )}
                  {testResultLabel && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{testResultLabel}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </details>
    </section>
  );
}
