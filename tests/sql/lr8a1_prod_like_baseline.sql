-- LR-8A.1 — minimal Production-like baseline for the push SQL integration
-- test. Runs ONLY against the throwaway local container started by
-- tests/sql/run-push-sql-integration.sh (supabase/postgres:17.6.1.170, the
-- same PostgreSQL 17.6 build as Production). Never run anywhere else.
--
-- Mirrors what LR-8A.1 read (read-only, via MCP) from Production:
--   * auth.uid() reads request.jwt.claim.sub OR request.jwt.claims->>'sub'
--   * alerts / admin_profiles / automation_identities owned by postgres,
--     default ACL grants anon + authenticated full table privileges and
--     EXECUTE on new functions (RLS is the boundary)
--   * alerts policies: admins (admin_profiles EXISTS), public published,
--     scheduled writer (automation_identities) select
--   * admin_profiles policy: auth.uid() = user_id

-- Run as supabase_admin (auth schema is owned by it).
create or replace function auth.uid() returns uuid language sql stable as $$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

set role postgres;

create table public.admin_profiles (
  user_id uuid primary key,
  created_at timestamptz not null default now()
);
alter table public.admin_profiles enable row level security;
create policy "Admins can read their own admin profile" on public.admin_profiles
  for select to authenticated using (auth.uid() = user_id);

create table public.automation_identities (
  user_id uuid primary key,
  created_at timestamptz default now()
);
alter table public.automation_identities enable row level security;
create policy "Automation identities read own row" on public.automation_identities
  for select to authenticated using (auth.uid() = user_id);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  category text not null,
  severity text,
  title text not null,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  place text,
  change text,
  action text,
  source_name text,
  source_url text,
  status text not null default 'draft',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  published_at timestamptz,
  source_id uuid
);
alter table public.alerts enable row level security;
create policy "Public can read published alerts" on public.alerts
  for select to anon using (status = 'published');
create policy "Admins can read all alerts" on public.alerts
  for select to authenticated using (exists (select 1 from admin_profiles ap where ap.user_id = auth.uid()));
create policy "Admins can update alerts" on public.alerts
  for update to authenticated
  using (exists (select 1 from admin_profiles ap where ap.user_id = auth.uid()))
  with check (exists (select 1 from admin_profiles ap where ap.user_id = auth.uid()));
create policy "Scheduled writer can select alerts for deduplication" on public.alerts
  for select to authenticated using (exists (select 1 from automation_identities where automation_identities.user_id = auth.uid()));

-- Synthetic identities (fixed test UUIDs, not real accounts).
insert into public.admin_profiles (user_id) values ('00000000-0000-4000-8000-00000000a001');
insert into public.automation_identities (user_id) values ('00000000-0000-4000-8000-00000000b001');

insert into public.alerts (slug, category, severity, title, place, starts_at, ends_at, change, action, source_name, source_url, status, published_at)
values
  ('test-brak-wody-granica', 'water', 'high', 'Brak wody – Granica', 'Granica, ul. Testowa',
   now() + interval '1 hour', now() + interval '5 hours', 'Przerwa w dostawie wody', 'Zrób zapas wody',
   'Test', 'https://example.invalid/notice', 'published', now()),
  ('test-szkic-komorow', 'water', 'high', 'Szkic – Komorów', 'Komorów',
   now() + interval '1 hour', now() + interval '5 hours', 'x', 'y', 'Test', 'https://example.invalid/2', 'draft', null);

reset role;
