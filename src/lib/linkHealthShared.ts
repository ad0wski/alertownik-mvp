// Sprint 164A — types, pure helpers, and copy shared between the
// server-only checker (src/lib/linkHealthCheck.ts, which imports
// ssrfGuard.ts and therefore Node's `dns`/`net`) and the client component
// (src/components/LinkHealthPanel.tsx). Kept in its own file with zero
// Node-only imports so a "use client" component can import it directly
// without Next.js trying to bundle `dns`/`net` into the browser.

export type LinkHealthOutcome = "healthy" | "needs_attention" | "blocked";

export interface LinkHealthResult {
  outcome: LinkHealthOutcome;
  httpStatus: number | null;
  reasonCode: string;
  finalUrl: string | null;
  checkedAt: string;
}

export interface LinkHealthTarget {
  id: string;
  name: string;
  url: string;
}

export interface LinkHealthRow extends LinkHealthTarget, LinkHealthResult {}

export interface LinkHealthSummary {
  total: number;
  healthy: number;
  needsAttention: number;
  blocked: number;
}

export function summarizeLinkHealth(rows: LinkHealthResult[]): LinkHealthSummary {
  return {
    total: rows.length,
    healthy: rows.filter((r) => r.outcome === "healthy").length,
    needsAttention: rows.filter((r) => r.outcome === "needs_attention").length,
    blocked: rows.filter((r) => r.outcome === "blocked").length,
  };
}

// Hard cap on how many links a single admin-triggered request may check —
// this is a manual, on-demand tool (button click), never a cron, but an
// unbounded list from the browser could still turn one click into an
// unreasonably large fan-out of outbound requests. Enforced server-side in
// the route, not just documented here.
export const MAX_LINK_HEALTH_TARGETS_PER_REQUEST = 40;

export const LINK_HEALTH_DISCLAIMER =
  "Kontrola dostępności linków — sprawdzenie na żądanie (przycisk), nic nie " +
  "uruchamia się automatycznie. Wynik nie jest zapisywany w bazie — widoczny " +
  "tylko w tej sesji przeglądarki.";

export const LINK_HEALTH_BLOCKED_NOTE =
  "„Zablokowane” oznacza adres odrzucony przez reguły bezpieczeństwa aplikacji " +
  "(np. adres prywatny/lokalny) — to nie jest błąd źródła, tylko ochrona przed " +
  "SSRF. Błędy parsowania treści (inna kategoria problemu) widać osobno w " +
  "historii sprawdzeń i w dry-run crona.";
