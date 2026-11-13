"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PILOT_LOCALITIES } from "@/lib/officialSourceChecklist";
import { loadPreferences } from "@/lib/userPreferences";
import { disablePush, enablePush, ensureLatestWorkerForPush, readPushState, type PushUiState } from "@/lib/push/pushClient";

// LR-8A — opt-in for locality push notifications. Never asks for the
// browser permission on its own: the prompt appears only after the user
// clicks "Włącz powiadomienia dla …". Hidden entirely unless
// NEXT_PUBLIC_PUSH_NOTIFICATIONS_ENABLED=true and a public VAPID key exist.

function localityFromArea(): string {
  const area = loadPreferences().locationKeywords.toLowerCase();
  return PILOT_LOCALITIES.find((l) => area.includes(l.toLowerCase())) ?? PILOT_LOCALITIES[0];
}

export function PushNotificationsCard({ onlyWithArea = false }: { onlyWithArea?: boolean }) {
  const [state, setState] = useState<PushUiState>({ kind: "hidden" });
  const [locality, setLocality] = useState<string>(PILOT_LOCALITIES[0]);
  const [hasArea, setHasArea] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLocality(localityFromArea());
    setHasArea(loadPreferences().locationKeywords.trim().length > 0);
    // LR-8B.3 — a returning subscriber gets the newest (push-capable)
    // service worker activated before the state is read; never subscribes.
    ensureLatestWorkerForPush()
      .then(readPushState)
      .then(setState)
      .catch(() => setState({ kind: "unsupported" }));
  }, []);

  if (state.kind === "hidden") return null;
  if (onlyWithArea && !hasArea && state.kind !== "subscribed") return null;

  async function handleEnable() {
    setError(null);
    setBusy(true);
    const result = await enablePush(locality);
    setBusy(false);
    if (result.ok) setState({ kind: "subscribed", locality });
    else if (result.state === "denied") setState({ kind: "denied" });
    else if (result.state === "error") setError("Nie udało się włączyć powiadomień. Spróbuj ponownie za chwilę.");
  }

  async function handleDisable() {
    setError(null);
    setBusy(true);
    const ok = await disablePush();
    setBusy(false);
    if (ok) setState({ kind: "default" });
    else setError("Nie udało się wyłączyć powiadomień. Spróbuj ponownie za chwilę.");
  }

  return (
    <section
      aria-labelledby="push-card-title"
      data-testid="push-card"
      data-state={state.kind}
      className="bg-surface rounded-2xl border border-border shadow-sm p-4 sm:p-5"
    >
      <h2 id="push-card-title" className="text-base font-semibold text-text-primary mb-1">
        Powiadomienia
      </h2>

      {state.kind === "subscribed" && (
        <>
          <p className="text-sm text-text-secondary leading-relaxed mb-3">
            Powiadomienia włączone dla: <strong>{state.locality}</strong>. Dostaniesz je tylko o ważnych
            alertach: woda, drogi i odpady.
          </p>
          <button
            type="button"
            onClick={handleDisable}
            disabled={busy}
            className="text-sm font-medium rounded-lg border border-border px-3 py-2 text-text-primary hover:bg-background-subtle disabled:opacity-60"
          >
            Wyłącz powiadomienia
          </button>
        </>
      )}

      {(state.kind === "default" || state.kind === "stale") && (
        <>
          {state.kind === "stale" && (
            <p className="text-sm text-amber-700 dark:text-amber-400 mb-2">
              Powiadomienia dla {state.locality} przestały działać na tym urządzeniu. Włącz je ponownie.
            </p>
          )}
          <p className="text-sm text-text-secondary leading-relaxed mb-3">
            Powiadomimy Cię tylko o ważnych alertach: woda, drogi i odpady.
          </p>
          <label className="block text-sm text-text-secondary mb-3">
            Miejscowość
            <select
              value={locality}
              onChange={(e) => setLocality(e.target.value)}
              disabled={busy}
              className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-text-primary"
            >
              {PILOT_LOCALITIES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={handleEnable}
            disabled={busy}
            className="text-sm font-medium rounded-lg bg-primary text-primary-foreground px-3 py-2 hover:bg-primary-hover disabled:opacity-60"
          >
            Włącz powiadomienia dla {locality}
          </button>
          <p className="text-xs text-text-muted mt-2">
            Przeglądarka zapyta o zgodę. Możesz je wyłączyć w każdej chwili.
          </p>
        </>
      )}

      {state.kind === "denied" && (
        <p className="text-sm text-text-secondary leading-relaxed">
          Powiadomienia są zablokowane w ustawieniach przeglądarki. Jeśli chcesz je włączyć, zezwól na
          powiadomienia dla tej strony w ustawieniach przeglądarki lub telefonu i wróć tutaj.
        </p>
      )}

      {state.kind === "ios-needs-install" && (
        <p className="text-sm text-text-secondary leading-relaxed">
          Na iPhonie i iPadzie powiadomienia działają po dodaniu Alertownika do ekranu początkowego (iOS 16.4
          lub nowszy).{" "}
          <Link href="/instalacja" className="text-primary font-medium">
            Jak to zrobić →
          </Link>
        </p>
      )}

      {state.kind === "unsupported" && (
        <p className="text-sm text-text-secondary leading-relaxed">
          Ta przeglądarka nie obsługuje powiadomień. Alerty nadal zobaczysz po otwarciu Alertownika.
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400 mt-2">
          {error}
        </p>
      )}
    </section>
  );
}
