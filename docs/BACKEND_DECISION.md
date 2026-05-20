# Backend Decision

This document captures the analysis and decision around adding a backend to Alertownik. It is a planning document — no backend has been implemented yet.

See also: [LIMITATIONS.md](LIMITATIONS.md) for the full list of current constraints, and [ROADMAP.md](ROADMAP.md) for the broader staged plan.

---

## 1. Current Situation

The app is a fully static Next.js site with no backend, no database, and no server-side state.

Alert data currently lives in two places:

| Source | What it holds | Limitations |
|--------|---------------|-------------|
| `src/data/sampleAlerts.ts` | 6 hardcoded demo alerts | Requires a code change and deployment to update |
| Browser `localStorage` | Drafts and locally published alerts | Per-device, per-browser, not backed up, not shared |

This is sufficient for a solo MVP workflow and for validating the alert format. It is not sufficient for:

- Publishing alerts that multiple people can see
- Sharing drafts between devices or collaborators
- Building any kind of editorial or admin workflow
- Supporting future features (notifications, source monitoring, AI history)

---

## 2. Why a Backend Is Needed

The following capabilities require a backend with persistent storage:

| Capability | Why localStorage is insufficient |
|------------|----------------------------------|
| **Persistent alerts** | Alerts live only in the browser that created them |
| **Admin workflow** | No shared draft queue; no review-before-publish step |
| **Publishing status** | Cannot distinguish draft / published / archived server-side |
| **Future user accounts** | No concept of identity without a backend |
| **Future notifications** | Cannot push alerts to subscribers without a server |
| **Future AI processing history** | No place to store generated prompts or AI responses |
| **Future source monitoring** | Scheduled checks require server-side infrastructure |

The core MVP format and UX are already validated. The next meaningful step is making alerts persistent and sharable.

---

## 3. Backend Options Considered

### Option A — Supabase

Supabase is an open-source Firebase alternative built on PostgreSQL. It provides a hosted database, auto-generated REST and realtime APIs, authentication, and a visual dashboard.

| | |
|-|-|
| **Strengths** | Hosted Postgres — structured data fits the alert schema naturally. Built-in auth with Row Level Security (RLS). Dashboard for browsing and editing data without writing SQL. Good Next.js and TypeScript support. Generous free tier. |
| **Weaknesses** | Adds external service dependency. Free tier has project pause policy (projects pause after inactivity). RLS configuration can be confusing initially. |
| **Fit for Alertownik** | High. The alert data model is relational and well-structured — Postgres is a natural fit. Auth + RLS make it straightforward to separate public reads from admin writes. |
| **Complexity** | Low to medium. Creating a project, connecting to Next.js, and doing basic reads/writes is well-documented and beginner-friendly. |

---

### Option B — Firebase (Firestore)

Firebase is Google's cloud platform. Firestore is its NoSQL document database with real-time sync.

| | |
|-|-|
| **Strengths** | Real-time data sync out of the box. Good SDK for JavaScript/TypeScript. Strong auth (Google, email/password, etc.). Large community and documentation. |
| **Weaknesses** | NoSQL document structure is a less natural fit for structured alert data with fixed fields. Querying across fields (e.g., filter by category + status) can be awkward. Pricing is usage-based and can surprise. Vendor lock-in (Google infrastructure). |
| **Fit for Alertownik** | Medium. The alert schema is fixed and relational; Firestore's flexibility is not needed and its query limitations may cause friction. |
| **Complexity** | Low to medium. Firebase console is well-designed, but Firestore rules and data modelling require care. |

---

### Option C — Managed Postgres (Vercel Postgres, Neon, Railway)

Several providers offer managed PostgreSQL databases that integrate cleanly with Vercel and Next.js API routes: Vercel Postgres (powered by Neon), standalone Neon, Railway, and others.

| | |
|-|-|
| **Strengths** | Pure Postgres — maximum flexibility and no vendor-specific abstractions. Good Vercel integration. No built-in auth layer to work around or learn. Works directly with `pg` or an ORM like Drizzle or Prisma. |
| **Weaknesses** | No built-in auth or dashboard — must be added separately. More setup work than Supabase. An ORM adds another layer to learn and configure. |
| **Fit for Alertownik** | High for the data layer. Neutral to negative for the auth and admin layer — these need to be built or pulled in separately. |
| **Complexity** | Medium to high for a beginner/student project. More moving parts than an all-in-one solution. |

---

### Option D — Stay with localStorage

Continue the current approach: sample alerts in code, drafts and published alerts in localStorage.

| | |
|-|-|
| **Strengths** | No additional services, dependencies, or API keys. Zero risk of breaking the working app. |
| **Weaknesses** | Blocks every meaningful next step: sharing, persistence, admin workflow, notifications, AI history. |
| **Fit for Alertownik** | Only appropriate if the goal is to freeze scope at the current MVP level. |
| **Complexity** | None — but not because it's simple, because it defers the problem. |

---

## 4. Recommended Option: Supabase

**Supabase is the recommended next backend.**

Reasons:

- **Postgres fits the alert schema.** Alerts have a fixed, well-defined structure with typed fields — a relational table is the right model, not a document store.
- **All-in-one for this stage.** Supabase bundles database + auth + dashboard + auto-generated API in one service. For a solo or small-team project, this avoids assembling multiple tools.
- **Clean Next.js integration.** The Supabase JavaScript client works well in Next.js App Router. Server Components can fetch directly from Supabase on the server side.
- **Row Level Security (RLS) is a natural fit.** Public users can read published alerts. Admins (authenticated) can create, edit, and delete. RLS enforces this at the database level.
- **The free tier is workable.** For an MVP with low traffic and no realtime requirements, the free plan is sufficient.
- **Gradual adoption is easy.** Start by reading from Supabase only; keep localStorage as a fallback during transition.

**The recommendation is Supabase, introduced gradually, starting with read-only access to the alerts table.**

---

## 5. Proposed Initial Database Schema

This is a description of the intended tables and fields. The corresponding SQL draft is in [supabase/schema-draft.sql](supabase/schema-draft.sql).

---

### `alerts` (primary table)

The main content table. Maps closely to the current `Alert` TypeScript type.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Auto-generated primary key |
| `slug` | text | URL-safe identifier, unique, used in `/alerts/[slug]` |
| `category` | text | One of: transport, water, power, waste, roads, municipal |
| `severity` | text | One of: info, warning, critical |
| `title` | text | Short plain-language summary |
| `place` | text | Precise location (address, area) |
| `starts_at` | date or timestamp | When the disruption begins |
| `ends_at` | date or timestamp | When it ends — nullable |
| `change` | text | What is happening — factual description |
| `action` | text | What the resident should do |
| `source_name` | text | Name of the official source institution |
| `source_url` | text | URL to the original announcement — nullable |
| `status` | text | draft / published / archived |
| `created_at` | timestamp | Auto-set on insert |
| `updated_at` | timestamp | Auto-updated on edit |
| `published_at` | timestamp | Set when status changes to published — nullable |

---

### `categories` (reference table — optional)

A lookup table for valid categories if enum-style validation is preferred at the database level.

| Field | Type | Notes |
|-------|------|-------|
| `id` | text | e.g. "transport", "water" |
| `label_pl` | text | e.g. "Transport", "Woda" |

Initially this can be enforced in application code (as it is now) rather than a separate table.

---

### `sources` (optional — for later)

A table of known official sources that can be tracked for new announcements.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | |
| `name` | text | e.g. "WKD", "Urząd Gminy Michałowice" |
| `url` | text | Homepage or announcement feed URL |
| `category` | text | Default category for alerts from this source |
| `active` | boolean | Whether this source is being monitored |

Not needed in Stage 2 or 3. Introduced when source monitoring begins.

---

### `locations` (optional — for later)

A table for defining geographic areas if location-based filtering or subscriptions are added.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | |
| `name` | text | e.g. "Komorów", "Pruszków" |
| `region` | text | Broader area grouping |

Not needed initially. Add when user location preferences become relevant.

---

### `alert_drafts` (admin drafts — optional separate table)

If the Builder workflow requires a distinct concept of "in-progress drafts" separate from the `alerts` table's `draft` status, a dedicated drafts table can be useful.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | |
| `form_data` | jsonb | Full form state as JSON — flexible, no strict schema |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |
| `created_by` | UUID | References users table — nullable until auth is added |

Using `jsonb` for the form state keeps the draft schema flexible during early development.

---

### `users` / `admins` (future — not in initial scope)

A users table managed by Supabase Auth. Initially, the only users are admins (editors). Public alert readers do not need accounts.

No design required until Stage 4 of the migration plan.

---

## 6. Migration Plan

Migration should be staged. Each stage should be tested and stable before the next begins. The existing app should not break at any stage.

---

### Stage 1 — Design (current sprint)

- Keep `sampleAlerts.ts` and localStorage unchanged
- Finalise the database schema design (this document)
- Identify which environment variables will be needed (without creating them yet)

**Output:** This document. The app is unchanged.

---

### Stage 2 — Supabase Setup and Read Integration

- Create a Supabase project manually in the dashboard
- Create the `alerts` table using the schema above
- Insert the 6 sample alerts into the table manually (via dashboard or SQL)
- Add environment variables: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- In `AlertList`, fetch published alerts from Supabase as well as (or instead of) `sampleAlerts.ts`
- Keep `sampleAlerts.ts` as a fallback if Supabase is unavailable
- No Builder integration yet — this stage is read-only

**Output:** The public alert list reads from a real database. No auth needed yet.

---

### Stage 3 — Builder Writes to Supabase

- The Builder's "Publish locally" action calls a Supabase insert instead of (or in addition to) localStorage
- Drafts can optionally be saved to Supabase as `alert_drafts` rows
- localStorage becomes a local fallback cache rather than the primary store
- The alert detail page resolves published alerts from Supabase, not localStorage

**Output:** The full editor workflow (create → draft → publish) is persistent and device-independent.

---

### Stage 4 — Admin Access Control

- Add simple auth using Supabase Auth (email/password for a single admin account)
- Apply Row Level Security:
  - Public (unauthenticated): can only read rows with `status = 'published'`
  - Authenticated admin: can read, insert, update, and delete all rows
- The Builder and AI Helper are accessible only after login
- The public alert list at `/` remains open

**Output:** The Builder is protected. Public readers see only published alerts.

---

### Stage 5 — AI Helper Integration

- The AI Helper can save a generated draft (prompt + source metadata) to `alert_drafts`
- The Builder can load drafts from Supabase in addition to localStorage
- Optionally: a draft queue view for the admin

**Output:** The AI-assisted workflow is persistent and trackable.

---

## 7. What Not to Do Yet

The following are explicitly out of scope until the core backend is stable:

- **No public user accounts** — residents do not need accounts to read alerts
- **No push notifications** — requires a notification service and subscriber management
- **No automated source scraping** — requires server-side scheduling infrastructure
- **No AI API integration** — the AI Helper continues to generate prompts manually for now
- **No complex admin roles** — a single admin account is sufficient initially
- **No multi-region or multi-city scope** — keep the schema simple until the local use case is validated

---

## 8. Risks

| Risk | Mitigation |
|------|-----------|
| **Exposing API keys** | Use Supabase anon key (safe for public reads) server-side where possible; keep service role key server-only via environment variables |
| **Overcomplicating auth too early** | Add auth only in Stage 4; keep Stages 2–3 auth-free |
| **Breaking the working app** | Introduce Supabase reads alongside existing data sources first; don't remove localStorage until Stage 3 is stable |
| **Schema changes after data is inserted** | Migrate carefully; avoid breaking changes to `slug` or `id` once alerts are in the database |
| **Relying on AI output without review** | Always require a human to review and confirm before an AI-generated draft is published |
| **Supabase project pausing** | Free tier projects pause after inactivity; upgrade or keep the project active ahead of demos |

---

## 9. Next Recommended Sprint

**Sprint 18 — in progress:**

> "Prepare Supabase integration plan and environment setup"

Sprint 18 deliverables:

| Deliverable | Status |
|-------------|--------|
| [docs/SUPABASE_SETUP_CHECKLIST.md](SUPABASE_SETUP_CHECKLIST.md) | ✅ Created |
| [docs/supabase/schema-draft.sql](supabase/schema-draft.sql) | ✅ Created |
| [.env.example](../.env.example) with placeholder variable names | ✅ Created |
| Create Supabase project in dashboard | ⬜ Pending |
| Execute schema in SQL editor | ⬜ Pending |
| Insert sample alerts manually | ⬜ Pending |
| Verify test query works locally | ⬜ Pending |

The setup checklist ([SUPABASE_SETUP_CHECKLIST.md](SUPABASE_SETUP_CHECKLIST.md)) covers every manual step, key safety rules, RLS configuration, and the pre-connection verification checklist.

**Sprint 19 (planned):**

> "Connect Supabase to the app — read-only integration"

Install `@supabase/supabase-js`, initialise the client, and fetch published alerts from the database in `AlertList`. Keep `sampleAlerts.ts` and localStorage as fallbacks. No auth, no writes, no UI changes.
