# Project Status

Last updated: May 2026

---

## What Currently Works

### Alert List (Homepage)
- Displays all alerts in a clean card layout
- Category filters: Transport, Water, Power, Waste, Roads, Municipal
- Filter counter showing how many alerts match
- Each card shows title, location, date, and severity badge
- Cards are expandable in-place to reveal full details (change, action, source)

### Alert Detail Pages
- Dedicated URL for each alert: `/alerts/[slug]`
- Statically generated for sample alerts
- Also resolves locally published alerts from localStorage
- 404 state with a helpful message if the alert is not found

### Alert Builder (`/builder`)
- Full form for creating an alert manually
- All fields: title, category, severity, location, dates, change, action, source
- Live preview panel showing the card as it will appear in the list
- Save as draft (localStorage)
- Publish to local list (localStorage — alert appears in the homepage list immediately)
- JSON Import — paste a raw JSON object to prefill the entire form
- Basic field validation before publishing

### AI Helper (`/ai-helper`)
- Form to enter: raw source text, source name, source URL, suggested category
- Generates a structured prompt for pasting into ChatGPT or Claude
- Copy-to-clipboard button
- No API key or network connection required

### Navigation
- Sticky app header on all pages
- Active navigation highlight (current section)
- Mobile-friendly responsive layout

---

## Completed Milestones

| Sprint | Goal |
|--------|------|
| 1–3    | Project setup, data model, sample alerts, homepage with card list |
| 4–6    | Category filters, expandable card details, source links |
| 7–8    | Alert Builder with live preview |
| 9      | JSON Import into builder |
| 10     | Local draft saving and local publishing |
| 11     | Detail pages for locally published alerts |
| 12     | Consistent UI/UX, mobile layout, navigation header |
| 13     | Full visual redesign — light civic interface, dark mode fix |

---

## Intentionally Not Included Yet

The following are out of scope for this MVP stage:

- **No authentication** — there are no user accounts or login
- **No database** — all data lives in localStorage; nothing is persisted server-side
- **No backend** — the app is a fully static Next.js site; no API routes
- **No real AI calls** — the AI Helper only generates a prompt; it does not call any AI API
- **No notifications** — no push alerts, email, or SMS
- **No automated source scraping** — alerts are entered manually
- **No multi-user support** — localStorage is per-browser, per-device
- **No deployment** — the app runs locally only at this stage

---

## Known Limitations

- **localStorage is ephemeral** — clearing browser data removes all locally created alerts; there is no sync or backup
- **No slug conflict detection** — if two alerts are created with the same slug, the second will overwrite the first in the localStorage list
- **Sample alerts are hardcoded** — they do not reflect real-time data and may become outdated
- **No search** — alerts can only be filtered by category, not searched by keyword
- **Single device** — locally published alerts are visible only in the browser where they were created
- **No validation for date logic** — the builder does not prevent `endsAt` being before `startsAt`
