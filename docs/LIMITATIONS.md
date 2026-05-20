# Current Limitations

This document describes what Alertownik does not yet do. It is intended to be read alongside the demo guide and project status, and to support honest communication with reviewers and collaborators.

These are not design failures — they are intentional deferrals. Each limitation reflects a deliberate choice to keep the MVP scope small while validating the core idea.

---

## No Backend

The app is a fully static Next.js site. There are no API routes, no server-side data processing, and no external services called at runtime. All logic runs in the browser.

**Consequence:** Alerts cannot be published or managed from a server. Creating an alert in the Builder saves it only to the local browser.

---

## No Database

There is no database of any kind — no SQL, no document store, no hosted storage. Alert data exists in two places only:

1. **Hardcoded in the source code** — the 6 sample alerts in `src/data/sampleAlerts.ts`
2. **Browser localStorage** — drafts and locally published alerts created via the Builder

**Consequence:** There is no persistent, shared, or backed-up store of alerts. Clearing the browser removes all locally created content.

---

## No Authentication

There are no user accounts, login flows, or role-based permissions. The Builder and AI Helper are accessible to anyone who knows the URL.

**Consequence:** In its current form, the app is not suitable for a real editorial workflow where access needs to be controlled.

---

## No Real AI Integration

The AI Helper generates a structured prompt for pasting into an external AI assistant (ChatGPT, Claude, etc.). It does not call any AI API and does not process or return any AI-generated content automatically.

**Consequence:** Converting a raw announcement to an alert still requires a manual step: copy the prompt → paste into an AI tool → copy the JSON response → paste it into the Builder.

---

## No Automatic Source Monitoring

There is no mechanism to watch, scrape, or subscribe to official announcement sources. New alerts cannot be discovered automatically.

**Consequence:** Finding relevant announcements, deciding they are worth publishing, and entering them into the Builder is entirely manual.

---

## LocalStorage Is Per-Browser and Ephemeral

Locally published alerts and saved drafts are stored in `localStorage` under the keys:

- `alertownik-published-alerts`
- `alertownik-drafts`

This data is:
- **Not shared** across browsers or devices
- **Not backed up** anywhere
- **Lost permanently** if the user clears their browser data or uses a private/incognito window

**Consequence:** The Builder workflow is useful for preparing and previewing alerts, but it is not a durable editorial system.

---

## Public Alerts Are Sample Data

The alerts visible on the homepage are demo/sample alerts included in the source code. They are realistic in format but:

- Not sourced from real-time official feeds
- Not verified against actual current events
- Not automatically updated
- May become outdated over time

**Consequence:** The app demonstrates what real alerts would look like, but does not currently surface real alerts.

---

## No Multi-User Support

Because all data is browser-local and there is no backend, the app has no concept of multiple editors, shared queues, or collaborative workflows.

**Consequence:** Two people cannot collaborate on creating alerts in the current version.

---

## No Search

Alerts can be filtered by category only. There is no keyword search, location search, or date range filter.

---

## This Is Early-Stage Software

Alertownik is an MVP built for concept validation, not production use. It has not been tested under real usage conditions and is not suitable as a primary information source for residents at this stage.

See [ROADMAP.md](ROADMAP.md) for the planned path toward a backend, real AI integration, source monitoring, and multi-user support.
