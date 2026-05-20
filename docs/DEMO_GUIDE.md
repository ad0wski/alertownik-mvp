# Demo Guide

This guide is for presenting Alertownik to reviewers, collaborators, or potential users. It covers what to say, what to show, and how to be honest about current limitations.

The app UI is in **Polish** — this is intentional. The target users are Polish-speaking local residents.

---

## What Alertownik Is (30-second version)

> "Alertownik is a local alerts app. It takes official announcements — from train operators, utilities, and municipalities — and reformats them into a short, scannable structure: what's changing, where, when, and what you should do. This is an early MVP demonstrating the format and user flow."

Keep this short. Do not oversell. The demo shows a prototype with sample data, not a live product.

---

## What to Show First

Start on the **homepage** at the root URL (`/`).

Do not start with the builder or AI Helper — those are internal tools that appear secondary to reviewers who haven't seen the public view yet.

---

## Suggested Demo Flow

### 1. Homepage — Alert List

Open `/` and walk through what's visible:

- The list shows 6 sample alerts covering different categories (transport, water, power, waste, roads, municipal).
- Point to the category filter pills at the top.
- Note the alert card structure: title, location, date, severity badge.

**What to say:** *"This is the public-facing view. A resident would see alerts relevant to their area — in a consistent, readable format."*

---

### 2. Category Filtering

Click **Transport** in the filter row.

- The list narrows to transport-only alerts.
- The counter updates.

**What to say:** *"Residents can filter by category. In a real version, they could also filter by location or subscribe to a category."*

---

### 3. Alert Details — Expanded Card

On a transport alert, click **Szczegóły ▼** (Details).

- The card expands in place showing: When, Where, What's changing, What to do, Source.
- Note the source name and link.

**What to say:** *"Every alert answers the same four questions. The source field always links to the original official announcement — Alertownik summarizes, it doesn't replace the source."*

---

### 4. Alert Detail Page

Click **Otwórz alert →** (Open alert) on any card.

- The full detail page opens at `/alerts/[slug]`.
- Each alert has its own URL — linkable and shareable.

**What to say:** *"Each alert has a dedicated page. It could be linked from social media, a community group, or a local newsletter."*

---

### 5. Builder — Internal MVP Tool

Navigate to **/builder** using the "Kreator alertu" link in the header.

Walk through the sections:

- **JSON Import** — paste an AI-generated JSON object to fill the form automatically
- **Form** — manual entry for all alert fields
- **Save draft / Publish locally** — saves to browser localStorage; the alert immediately appears on the homepage
- **Live preview** — shows how the card will look
- **JSON output** — copy the structured object for manual insertion into the codebase

**What to say:** *"This is an internal tool for creating alerts. It's not visible to end users — it's how an editor would prepare content. Right now it saves to the browser only; in a real version this would save to a server."*

---

### 6. AI Helper — Internal MVP Tool

Navigate to **/ai-helper** using the "AI Helper" link in the header.

Walk through the sections:

- **Raw text input** — paste a raw official announcement (e.g., copied from a train operator's website)
- **Optional fields** — source name, URL, suggested category
- **Generated prompt** — a structured prompt to paste into ChatGPT or Claude
- **Copy button** — copies the prompt to clipboard

Optionally: copy the prompt, paste it into Claude or ChatGPT, and show the resulting JSON.

**What to say:** *"This tool doesn't call any AI API — it generates a ready-made prompt. The editor pastes that prompt into any AI assistant, gets a structured JSON response, and pastes it back into the Builder. It's a manual-but-fast workflow."*

---

## What Not to Overclaim

| Do say | Do not say |
|--------|------------|
| "This is a prototype with sample data." | "This shows live local alerts." |
| "Alerts are created manually via the builder." | "Alerts are generated automatically." |
| "The AI Helper generates a prompt for you to paste into ChatGPT/Claude." | "The app uses AI to generate alerts." |
| "Locally published alerts live in your browser." | "Published alerts are visible to other users." |
| "This is an early MVP." | "This is ready to launch." |

---

## How to Describe Current Status Honestly

- The public alert list shows **6 sample/demo alerts**. They are realistic in format but not real-time data.
- The Builder and AI Helper are **internal MVP tools** — not end-user features.
- All persistence is **browser localStorage** — no backend, no database, no sync across devices.
- The app is **deployed on Vercel** and accessible at the public URL, but it is not a production service.
- The goal at this stage is to **validate the format and flow**, not to replace existing information sources.
