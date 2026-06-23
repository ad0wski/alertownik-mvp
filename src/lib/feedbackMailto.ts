// Sprint 93 — the existing feedback flow (mailto links on /about, the
// alert detail page, and the footer) never pre-filled a body, despite
// "Napisz do nas"/"Kontakt" being the main feedback entry points. This
// adds the brief's suggested short-question template as the email body
// — still just a mailto link, no in-app form, no new Supabase table,
// because the brief explicitly asked to improve the *existing*
// implementation rather than build a new one.

export const FEEDBACK_EMAIL = "ak.jurkowski@gmail.com";

export const FEEDBACK_QUESTIONS = [
  "Czy od razu rozumiesz, do czego służy aplikacja?",
  "Czy alerty są czytelne?",
  "Czy daty i źródła wyglądają wiarygodnie?",
  "Czy funkcja odpadów/przypomnień jest dla Ciebie przydatna?",
  "Czego najbardziej brakuje?",
  "Czy wróciłbyś/wróciłabyś do tej aplikacji ponownie?",
];

// General feedback link (about page "Napisz do nas", footer "Kontakt") —
// Sprint 95: leads with one trivially-easy ask (the rest of the list is
// kept as an optional bonus, not the headline request) — a 6-question list
// up front reads as a survey, which is exactly the friction a low-response
// beta needs less of.
export function buildFeedbackMailto(): string {
  const body = [
    "Jedna prosta prośba: napisz jedną rzecz, która była niejasna — albo po prostu czy to ma sens. To już bardzo pomaga.",
    "",
    "Jeśli masz chwilę więcej, możesz też odpowiedzieć na:",
    ...FEEDBACK_QUESTIONS.map((q) => `- ${q}`),
  ].join("\n");
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent("Alertownik — opinia o pilotażu")}&body=${encodeURIComponent(body)}`;
}

// Per-alert "report a problem" link — a single targeted question instead
// of the general list, since someone clicking this already knows exactly
// what they're reporting.
export function buildAlertReportMailto(alertTitle: string): string {
  const subject = `Alertownik — zgłoszenie: ${alertTitle}`;
  const body = "Co jest nieaktualne albo błędne w tym alercie?\n\n";
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
