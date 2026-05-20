-- ============================================================================
-- Alertownik — Database Schema Draft
-- ============================================================================
-- STATUS: DRAFT — do not execute on a production database without review.
-- This file is a reference for Sprint 18 planning. It has not been applied
-- to any Supabase project yet.
--
-- Before executing:
--   1. Review every field name and type against src/types/alert.ts
--   2. Decide whether severity should be 'urgent' (this schema) or 'critical'
--      (current TypeScript enum) — update both before integration
--   3. Enable Row Level Security (RLS) immediately after creating tables
--   4. Add appropriate RLS policies before inserting any data
--
-- See docs/SUPABASE_SETUP_CHECKLIST.md for the full setup process.
-- ============================================================================


-- ============================================================================
-- alert_categories
-- ============================================================================
-- Reference table for the fixed set of alert categories.
-- In the current MVP, category validation is enforced in application code.
-- This table makes categories explicit at the database level and supports
-- foreign key references from the alerts table.

create table alert_categories (
  id        text primary key,   -- e.g. 'transport', 'water', 'power'
  label_pl  text not null       -- Polish UI label, e.g. 'Transport', 'Woda'
);

-- Seed with the current six categories (matches src/types/alert.ts AlertCategory)
insert into alert_categories (id, label_pl) values
  ('transport', 'Transport'),
  ('water',     'Woda'),
  ('power',     'Prąd'),
  ('waste',     'Odpady'),
  ('roads',     'Drogi'),
  ('municipal', 'Komunikaty');


-- ============================================================================
-- alert_sources
-- ============================================================================
-- Known official sources that could eventually be monitored for new
-- announcements. Not required for Stage 2 or Stage 3.
-- Introduce when source monitoring work begins.

create table alert_sources (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,         -- e.g. 'WKD', 'Urząd Gminy Michałowice'
  url         text,                         -- homepage or announcement feed URL
  category    text        references alert_categories(id),
  active      boolean     not null default false,  -- whether this source is being monitored
  created_at  timestamptz not null default now()
);


-- ============================================================================
-- alerts
-- ============================================================================
-- Primary content table. Mirrors the Alert TypeScript interface in
-- src/types/alert.ts, extended with workflow fields (status, timestamps).

create table alerts (

  -- ── Identity ──────────────────────────────────────────────────────────────
  id            uuid        primary key default gen_random_uuid(),
  slug          text        unique not null,
  -- slug is used in /alerts/[slug] URL routes.
  -- Must be URL-safe (lowercase, hyphens only, no Polish characters).

  -- ── Classification ────────────────────────────────────────────────────────
  category      text        not null references alert_categories(id),
  severity      text        not null,
  -- DRAFT NOTE: The current TypeScript enum uses 'critical' as the highest
  -- severity value. This schema uses 'urgent'. Align the canonical value
  -- across the schema and TypeScript type before integration.

  -- ── Content ───────────────────────────────────────────────────────────────
  title         text        not null,
  location      text,
  -- location: general area or district, e.g. 'Komorów / Pruszków'
  -- Used for broader geographic context.

  place         text,
  -- place: precise address or location description shown on the alert card.
  -- Maps to alert.place in the current TypeScript type.

  starts_at     timestamptz,
  ends_at       timestamptz,
  -- Both nullable. ends_at may be unknown at time of publication.
  -- Use timestamptz (timezone-aware) so times are stored consistently
  -- regardless of where the editor is located.

  change        text,
  -- What is actually changing or happening — factual description.
  -- Answers: "what is happening?"

  action        text,
  -- What the resident should do in response.
  -- Answers: "what should I do?"

  -- ── Source ────────────────────────────────────────────────────────────────
  source_name   text,
  -- Name of the official institution that published the original announcement.

  source_url    text,
  -- URL to the original announcement. Nullable — some sources may not have
  -- a stable permalink.

  -- ── Workflow ──────────────────────────────────────────────────────────────
  status        text        not null default 'draft',
  -- Lifecycle: draft → published → archived
  -- Only rows with status = 'published' should be visible to the public.
  -- RLS policies enforce this; see SUPABASE_SETUP_CHECKLIST.md.

  -- ── Timestamps ────────────────────────────────────────────────────────────
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- updated_at is maintained by the set_updated_at trigger below.

  published_at  timestamptz,
  -- Set when status is changed to 'published'. Nullable — null means
  -- the alert has never been published.

  -- ── Constraints ───────────────────────────────────────────────────────────
  constraint alerts_severity_check
    check (severity in ('info', 'warning', 'urgent')),
  -- See draft note above regarding 'urgent' vs 'critical'.

  constraint alerts_status_check
    check (status in ('draft', 'published', 'archived'))

);


-- ============================================================================
-- Trigger: keep updated_at current on every row update
-- ============================================================================

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger alerts_set_updated_at
  before update on alerts
  for each row
  execute procedure set_updated_at();


-- ============================================================================
-- Row Level Security
-- ============================================================================
-- Enable RLS on all tables before inserting any real data.
-- Without RLS, the anon (public) key grants unrestricted read access to
-- every row in every table.

alter table alerts           enable row level security;
alter table alert_categories enable row level security;
alter table alert_sources    enable row level security;

-- ── Public read policies ─────────────────────────────────────────────────────
-- Allow unauthenticated users to read published alerts and category labels.
-- Sufficient for Stage 2 (read-only public access).

create policy "Public can read published alerts"
  on alerts for select
  using (status = 'published');

create policy "Public can read categories"
  on alert_categories for select
  using (true);

-- ── Admin write policies (Stage 4 — add after auth is configured) ─────────────
-- Uncomment and adjust once Supabase Auth is set up.

-- create policy "Admin full access to alerts"
--   on alerts for all
--   using (auth.role() = 'authenticated');

-- create policy "Admin full access to sources"
--   on alert_sources for all
--   using (auth.role() = 'authenticated');


-- ============================================================================
-- END OF SCHEMA DRAFT
-- ============================================================================
-- Next step: review this file, resolve the 'urgent' vs 'critical' question,
-- then execute in the Supabase SQL editor on a freshly created project.
-- ============================================================================
