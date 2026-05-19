# Alertownik

**Alertownik** is a local civic alerts web app that helps residents quickly understand nearby disruptions — transport delays, water outages, power cuts, road works, and municipal announcements.

The app presents alerts in plain, scannable language: what's happening, where, when, and what to do. Each alert links back to the original official source.

> This is an early-stage MVP built for learning and product validation. No real user data is stored or included in this repository.

---

## Problem

Local official announcements — from train operators, municipalities, water utilities — are often:
- published in bureaucratic language that is hard to scan quickly
- scattered across multiple websites with inconsistent formatting
- not optimized for mobile reading

Residents often miss important information that directly affects their day.

## What Alertownik Does

Alertownik provides a single, consistent view of local alerts in a clean, readable format. Each alert has a fixed structure:

- **What's changing** — a factual description
- **What to do** — a clear resident-facing action
- **When and where** — a precise time and location
- **Source** — a link to the original official announcement

---

## Current Features (MVP)

- Homepage with alert list and category filters (Transport, Water, Power, Waste, Roads, Municipal)
- Expandable alert cards with full details
- Dedicated detail pages at `/alerts/[slug]`
- Alert Builder — a form to create new alerts manually
- JSON Import — paste a JSON alert object directly into the builder
- AI Helper — generates a structured prompt for ChatGPT or Claude to convert a raw announcement into the Alertownik alert format (no API key required)
- Local draft saving (localStorage)
- Local alert publishing (localStorage — alerts appear in the list without a backend)
- Realistic sample alerts included for demonstration

---

## Tech Stack

| Layer       | Technology                        |
|-------------|-----------------------------------|
| Framework   | Next.js 16 (App Router)           |
| Language    | TypeScript 5                      |
| UI          | React 19                          |
| Styling     | Tailwind CSS v4                   |
| Storage     | localStorage (no database)        |
| Hosting     | — (local dev only at this stage)  |
| Font        | Geist (via Next.js font system)   |

No external APIs, no authentication, no database.

---

## Run Locally

**Prerequisites:** Node.js 18+

```bash
git clone <repo-url>
cd alertownik-mvp
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Project Status

Early MVP — functional and usable locally, not yet deployed publicly.

See [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) for a detailed breakdown of what works, what's limited, and what's intentionally out of scope.

---

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for planned stages: online demo, backend, AI integration, source monitoring, and notifications.

---

## Notes

- The app UI is in **Polish** (target users are Polish-speaking local residents).
- No real user data, survey results, or private contact information is included in this repository.
- WKD (a Warsaw suburban railway) is used as the first test case for alert sourcing; the product is not limited to WKD.

See [docs/PRODUCT_NOTES.md](docs/PRODUCT_NOTES.md) for product thinking and design principles.
