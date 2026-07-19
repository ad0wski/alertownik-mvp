"use client";

import { useState } from "react";

interface Props {
  title: string;
  text: string;
}

type Status = "idle" | "shared" | "copied" | "error";

// Sprint 163 — native share on the alert detail page. Uses the Web Share
// API when the browser exposes it (most mobile browsers, some desktop
// ones); falls back to copying the current URL to the clipboard otherwise.
// No new permission is requested — both APIs are user-gesture-triggered
// and require none. Nothing is sent anywhere except through the OS's own
// native share sheet (which the browser, not this app, controls) or the
// browser's own clipboard API — this component never makes a network
// request itself.
export function ShareAlertButton({ title, text }: Props) {
  const [status, setStatus] = useState<Status>("idle");

  async function handleShare() {
    const url = window.location.href;

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        setStatus("shared");
      } catch (err) {
        // AbortError = the visitor closed the native share sheet themselves
        // — that's not a failure worth reporting.
        if (err instanceof Error && err.name === "AbortError") return;
        setStatus("error");
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
  }

  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div>
      <button
        type="button"
        onClick={handleShare}
        className="inline-flex items-center gap-1.5 min-h-[44px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
      >
        <span aria-hidden="true">↗</span>
        {canNativeShare ? "Udostępnij" : "Skopiuj link"}
      </button>
      <p role="status" aria-live="polite" className="text-xs mt-1.5 text-slate-500 dark:text-slate-400 min-h-[1rem]">
        {status === "shared" && "Udostępniono."}
        {status === "copied" && "Link skopiowany do schowka."}
        {status === "error" && "Nie udało się udostępnić — spróbuj skopiować link ręcznie z paska adresu."}
      </p>
    </div>
  );
}
