import { authFetch } from "@/lib/apiClientAuth";

// LR-8A — Builder side of push: called only AFTER a manual publish has
// already succeeded. Whatever happens here, the alert stays published; the
// admin just gets a one-line note about the notifications.

interface PushRouteResponse {
  ok?: boolean;
  skipped?: string;
  error?: string;
  matched?: number;
  sent?: number;
  failed?: number;
  gone?: number;
  alreadyDelivered?: number;
}

const SKIP_TEXT: Record<string, string> = {
  category: "ta kategoria nie wysyła powiadomień (tylko woda, drogi, odpady).",
  ended: "alert jest już zakończony.",
  no_locality: "nie rozpoznano miejscowości w polu „Gdzie” ani w tytule.",
  not_published: "alert nie jest opublikowany.",
  invalid_slug: "nieprawidłowy slug.",
};

/** null = push switched off → nothing worth showing. */
export function describePushResult(httpOk: boolean, data: PushRouteResponse | null): string | null {
  if (data?.skipped === "push_disabled") return null;
  if (!httpOk || !data?.ok) return "Powiadomienia: nie udało się wysłać. Alert pozostaje opublikowany.";
  if (data.skipped) return `Powiadomienia: nie wysłano — ${SKIP_TEXT[data.skipped] ?? data.skipped}`;
  const sent = data.sent ?? 0;
  const failed = data.failed ?? 0;
  const gone = data.gone ?? 0;
  const already = data.alreadyDelivered ?? 0;
  if ((data.matched ?? 0) === 0) return "Powiadomienia: brak subskrybentów dla tej miejscowości.";
  if (sent === 0 && failed === 0 && gone === 0 && already > 0) {
    return "Powiadomienia dla tego alertu były już wysłane — nie wysłano ponownie.";
  }
  const extra = [failed ? `błędy: ${failed}` : "", gone ? `wygasłe subskrypcje: ${gone}` : ""].filter(Boolean).join(", ");
  return `Powiadomienia: wysłano ${sent}${extra ? ` (${extra})` : ""}.`;
}

export async function notifyPushAfterManualPublish(slug: string): Promise<string | null> {
  try {
    const res = await authFetch("/api/admin/push/alert-published", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    const data = (await res.json().catch(() => null)) as PushRouteResponse | null;
    return describePushResult(res.ok, data);
  } catch {
    return "Powiadomienia: brak połączenia z serwerem. Alert pozostaje opublikowany.";
  }
}
