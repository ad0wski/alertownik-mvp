"use client";

import { useEffect, useState } from "react";

// Sprint 158B — compact, non-blocking network status hint. navigator.onLine
// is only a hint (it reflects the network interface, not server
// reachability), so this never claims certainty — it just tells the user
// their device currently reports no connection.
export function NetworkStatusBanner() {
  const [status, setStatus] = useState<"online" | "offline" | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined") return;

    const handleOffline = () => setStatus("offline");
    const handleOnline = () => setStatus((prev) => (prev === "offline" ? "online" : prev));

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    if (!navigator.onLine) setStatus("offline");

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  useEffect(() => {
    if (status !== "online") return;
    const timer = setTimeout(() => setStatus(null), 3000);
    return () => clearTimeout(timer);
  }, [status]);

  if (!status) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`text-xs text-center py-1.5 px-4 ${
        status === "offline"
          ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
          : "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
      }`}
    >
      {status === "offline"
        ? "Brak internetu — nie możemy sprawdzić najnowszych alertów."
        : "Połączenie przywrócone."}
    </div>
  );
}
