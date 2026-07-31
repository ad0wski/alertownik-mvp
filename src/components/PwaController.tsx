"use client";

import { useEffect, useRef, useState } from "react";

// Sprint 158B — registers the service worker (production only, so `next dev`
// never risks intercepting dev-server assets/HMR) and surfaces a small,
// dismissible "new version available" banner when an updated worker is
// waiting to take over. The user must explicitly click "Odśwież" — this
// never auto-reloads mid-session.
//
// The reload-on-controllerchange must only fire for a reload the user asked
// for (via userRequestedUpdate). The very first activation of a service
// worker (uncontrolled page -> controlled) also fires "controllerchange" —
// reloading unconditionally on that event would refresh every first-time
// visitor mid-session for no reason.
export function PwaController() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const userRequestedUpdate = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let refreshed = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshed || !userRequestedUpdate.current) return;
      refreshed = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          setWaitingWorker(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;

          installing.addEventListener("statechange", () => {
            if (
              installing.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              setWaitingWorker(registration.waiting ?? installing);
            }
          });
        });
      })
      .catch(() => {
        // Registration failures (unsupported browser, blocked scope, etc.)
        // must never break the app — the site works fully without a worker.
      });
  }, []);

  if (!waitingWorker || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      // Sprint 163 — bottom-20 (not bottom-4) on mobile so this never sits
      // on top of the new fixed bottom nav on public pages; sm: and up
      // reverts to the original bottom-4 since desktop has no bottom nav.
      className="fixed bottom-20 inset-x-4 sm:bottom-4 sm:inset-x-auto sm:right-4 sm:left-auto z-50 max-w-sm sm:w-96 mx-auto sm:mx-0 rounded-xl border border-blue-200 bg-white shadow-lg px-4 py-3 flex items-center gap-3 dark:border-blue-500/30 dark:bg-slate-800"
    >
      <p className="text-sm text-slate-700 flex-1 dark:text-slate-200">
        Dostępna jest nowa wersja Alertownika.
      </p>
      <button
        type="button"
        onClick={() => {
          userRequestedUpdate.current = true;
          waitingWorker.postMessage("SKIP_WAITING");
        }}
        className="text-sm font-medium text-blue-700 hover:text-blue-800 whitespace-nowrap dark:text-blue-400 dark:hover:text-blue-300"
      >
        Odśwież
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Zamknij"
        className="text-slate-500 hover:text-slate-600 text-sm leading-none px-1 dark:text-slate-400 dark:hover:text-slate-300"
      >
        ✕
      </button>
    </div>
  );
}
