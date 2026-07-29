// Sprint 93 — the existing feedback flow (mailto links on /about, the
// alert detail page, and the footer) never pre-filled a body, despite
// "Napisz do nas"/"Kontakt" being the main feedback entry points. This
// adds the brief's suggested short-question template as the email body
// — still just a mailto link, no in-app form, no new Supabase table,
// because the brief explicitly asked to improve the *existing*
// implementation rather than build a new one.

export const FEEDBACK_EMAIL = "alertownik.kontakt@gmail.com";

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

// Sprint 98 — quick-pick feedback reasons. The general mailto above still
// works, but it asks someone to compose a message from a blank line. These
// give a tester a one-click starting point for the most common kinds of
// feedback, each with its own subject and a short prompt instead of a
// shared 6-question body. "Inna sugestia" intentionally reuses the general
// mailto above instead of a near-duplicate body.
export interface FeedbackQuickReason {
  id: string;
  label: string;
  mailto: string;
}

function buildReasonMailto(subjectSuffix: string, prompt: string): string {
  const subject = `Alertownik — opinia: ${subjectSuffix}`;
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(prompt)}`;
}

// Sprint 185A — /demo's single CTA for institutions/partners interested in
// a pilot. Reuses the same mailto pattern as every other feedback link on
// the site (no new form, no new Supabase table) — just its own subject and
// prompt, since "zainteresowanie pilotażem" is a different ask than a bug
// report or general opinion.
export function buildPilotInterestMailto(): string {
  const subject = "Alertownik — zainteresowanie pilotażem";
  const body =
    "Cześć, jesteśmy zainteresowani krótką rozmową o pilotażu Alertownika dla naszej okolicy/instytucji.\n\n" +
    "Kilka słów o nas i o czym chcielibyśmy porozmawiać:\n\n";
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function buildFeedbackQuickReasons(): FeedbackQuickReason[] {
  return [
    {
      id: "missing-alert",
      label: "Brakuje ważnego alertu",
      mailto: buildReasonMailto(
        "brakuje alertu",
        "Jaki alert/komunikat brakuje? Skąd pochodzi (link do źródła, jeśli masz)?\n\n"
      ),
    },
    {
      id: "outdated",
      label: "Dane są nieaktualne",
      mailto: buildReasonMailto(
        "dane nieaktualne",
        "Który alert albo która informacja jest nieaktualna?\n\n"
      ),
    },
    {
      id: "confusing",
      label: "Nie rozumiem tej strony",
      mailto: buildReasonMailto(
        "niejasna strona",
        "Która strona/sekcja była niejasna? Co próbowałeś/aś zrobić?\n\n"
      ),
    },
    {
      id: "add-area",
      label: "Chcę dodać swoją okolicę",
      mailto: buildReasonMailto(
        "nowa okolica",
        "Jakiej okolicy/miejscowości brakuje?\n\n"
      ),
    },
    {
      id: "other",
      label: "Inna sugestia",
      mailto: buildFeedbackMailto(),
    },
  ];
}
