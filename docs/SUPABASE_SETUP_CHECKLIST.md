# Supabase Setup Checklist

This document is a preparation guide for integrating Supabase into Alertownik. It covers account setup, project configuration, key management, and what to verify before writing any application code.

**No Supabase library has been installed and no connection has been made yet.** This is a planning and setup reference for Sprint 18.

See [BACKEND_DECISION.md](BACKEND_DECISION.md) for the full rationale behind choosing Supabase.
See [supabase/schema-draft.sql](supabase/schema-draft.sql) for the proposed initial database schema.

---

## Why Supabase

Supabase was chosen for the following reasons:

- **Postgres** is the right fit for the structured, fixed-schema alert data model
- **Built-in dashboard** allows data to be browsed and edited without writing SQL every time
- **Auth + Row Level Security** make it straightforward to protect admin actions while keeping the public alert list open
- **Good Next.js support** — the JavaScript client works in both Server Components and client components
- **Free tier** is sufficient for MVP-level traffic

The full comparison with Firebase, managed Postgres, and localStorage is in [BACKEND_DECISION.md](BACKEND_DECISION.md).

---

## Step 1 — Create a Supabase Account and Project

1. Go to [https://supabase.com](https://supabase.com) and sign in (or create a free account)
2. In the dashboard, click **New project**
3. Fill in:
   - **Organization** — your personal org or a team org
   - **Project name** — e.g. `alertownik-mvp`
   - **Database password** — generate a strong password and save it somewhere safe (you will not need it in code, but it is required for direct DB access)
   - **Region** — choose the closest region to your expected users (e.g. Frankfurt `eu-central-1` for Poland)
4. Click **Create new project** and wait approximately 1–2 minutes for provisioning to complete

---

## Step 2 — Project Settings to Check

Once the project is provisioned, open **Settings → API** in the Supabase dashboard and note:

| Setting | Where to find it | Notes |
|---------|-----------------|-------|
| **Project URL** | Settings → API → Project URL | e.g. `https://xyzxyzxyz.supabase.co` |
| **Anon (public) key** | Settings → API → Project API keys → `anon` `public` | Safe for client-side reads — see key safety section below |
| **Service role key** | Settings → API → Project API keys → `service_role` | **Never expose — bypasses all RLS policies** |
| **Database password** | Set during project creation | Never include in code; only for direct DB tools |
| **Database host** | Settings → Database → Connection string | Only needed if connecting with a raw Postgres client |

Also check under **Settings → General**:
- [ ] Project name matches what you expect
- [ ] Region is correct

---

## Step 3 — Key Safety

Understanding which keys are safe to expose and which are not is critical before any integration.

### Safe for client-side code and public repositories

| Variable | Why it is safe |
|----------|---------------|
| `NEXT_PUBLIC_SUPABASE_URL` | A public URL — not a secret. Anyone can find it by inspecting the network tab of your app |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The anon key. Safe **only if Row Level Security (RLS) is properly enabled** on all tables. Without RLS, the anon key grants read access to every row in the database |

The `NEXT_PUBLIC_` prefix in Next.js embeds these values into the client-side JavaScript bundle. They will be visible to anyone who inspects the page source. This is expected and acceptable for these two values — as long as RLS is configured correctly.

### Must never be exposed

| Key | Why |
|-----|-----|
| **Service role key** | Bypasses RLS entirely. Anyone with this key has unrestricted read/write/delete access to your entire database |
| **Database password** | Grants direct Postgres access — equivalent to root access |

Never commit the service role key or database password to git. Never include them in client-side code or `.env.example`. If either is accidentally exposed, rotate it immediately from the Supabase dashboard.

---

## Step 4 — Environment Variables

Two environment variables are needed to connect the app to Supabase.

### Local development

Create a file called `.env.local` in the project root. **This file is gitignored and must never be committed.**

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-key-here
```

The `.env.example` file in the repository shows the variable names with empty values. Copy it to `.env.local` and fill in the real values from the Supabase dashboard.

> **Naming note:** The official Supabase documentation and starter templates use `NEXT_PUBLIC_SUPABASE_ANON_KEY` for the anon key. This project uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for clarity in the codebase. Either name works — just be consistent within the project.

### Vercel production deployment

1. Go to your Vercel project dashboard
2. Open **Settings → Environment Variables**
3. Add both variables with the same values as `.env.local`
4. Set scope to **Production** (and **Preview** if needed)
5. Redeploy after adding variables — existing deployments do not pick up new env vars automatically

---

## Step 5 — Row Level Security (RLS)

**RLS must be enabled on all tables before any real data is inserted or the app is connected.**

Without RLS, the anon (public) key grants unrestricted read access to all rows in all tables. For a database containing only published public alerts this may seem acceptable, but enabling RLS from the start is the correct default — it prevents accidental data exposure if the schema grows.

### Steps to enable RLS

Run the following in the Supabase SQL editor (or in `schema-draft.sql`):

```sql
alter table alerts enable row level security;
alter table alert_categories enable row level security;
alter table alert_sources enable row level security;
```

### Minimum policies for Stage 2 (read-only public access)

```sql
-- Allow anyone to read published alerts
create policy "Public can read published alerts"
  on alerts for select
  using (status = 'published');

-- Allow anyone to read categories
create policy "Public can read categories"
  on alert_categories for select
  using (true);
```

Admin write policies (insert, update, delete) should be added in Stage 4 when auth is introduced.

---

## Step 6 — Create the Database Schema

See [supabase/schema-draft.sql](supabase/schema-draft.sql) for the full schema.

Steps:
1. Open the Supabase project dashboard
2. Go to **SQL Editor → New query**
3. Paste the contents of `schema-draft.sql` (after reviewing it carefully)
4. Execute the query
5. Verify the tables appear under **Table Editor**

Do not execute the schema on a database that already contains real data without reviewing it first.

---

## Pre-Connection Checklist

Complete this checklist before writing any application code that connects to Supabase.

**Project setup**
- [ ] Supabase account created
- [ ] Project created and fully provisioned
- [ ] Project URL and anon key noted from Settings → API
- [ ] Service role key noted and stored securely (not in code)

**Database**
- [ ] Schema from `docs/supabase/schema-draft.sql` reviewed and approved
- [ ] `alert_categories` table created and seeded with the 6 category rows
- [ ] `alerts` table created
- [ ] RLS enabled on `alerts`, `alert_categories`, and `alert_sources`
- [ ] Public read policy created for `alerts` (status = 'published')
- [ ] Public read policy created for `alert_categories`
- [ ] Sample alerts inserted manually (via Supabase dashboard Table Editor or SQL)

**Environment**
- [ ] `.env.local` created locally with real values (not committed)
- [ ] `.env.example` committed with empty placeholder values
- [ ] Vercel environment variables configured for production

**Library (when ready to connect)**
- [ ] `@supabase/supabase-js` installed (`npm install @supabase/supabase-js`)
- [ ] Supabase client initialised in a utility file (e.g. `src/lib/supabase.ts`)
- [ ] Simple test query executed successfully (e.g. `select * from alerts limit 1`)
- [ ] No service role key present anywhere in source code

---

## What Not to Do Yet

- Do not add auth or login flows (Stage 4)
- Do not expose the service role key in any client-side code
- Do not insert draft or admin-only data without RLS policies in place
- Do not remove `sampleAlerts.ts` or localStorage — keep them as fallbacks during transition
