-- ============================================================================
-- LR-8A — Web Push subscriptions (PROPOSED, NOT EXECUTED ON PRODUCTION)
-- ============================================================================
-- Status: written in LR-8A, hardened in LR-8A.1 (server gateway token,
-- global throttle). Executed only on a local, throwaway Supabase Postgres
-- 17.6 container by tests/sql/pushSql.integration.mjs. Run manually in
-- LR-8B on Production. Never run automatically, never via MCP.
--
-- What it creates
--   push_subscriptions    one row per browser push subscription
--   push_deliveries       one row per (alert, subscription) — idempotency key
--   push_gateway_secret   SHA-256 of the server-only gateway token (1 row)
--   push_subscribe()      SECURITY DEFINER — the ONLY write path for visitors
--   push_unsubscribe()    SECURITY DEFINER — deletes by endpoint
--
-- Access model
--   anon           NO grant and NO policy on any of the three tables. May
--                  EXECUTE the two functions, but both refuse to do anything
--                  without the gateway token, which exists only as a Vercel
--                  server env var (PUSH_GATEWAY_TOKEN). So calling the RPC
--                  directly with the public anon key fails: the only working
--                  path is /api/push/subscribe (origin check, size cap,
--                  validation, rate limit) → RPC with the token.
--   authenticated  table grants on the two push tables, but RLS lets through
--                  only accounts with an admin_profiles row (same EXISTS check
--                  as alerts, source_checks, alert_sources). The scheduled-
--                  writer automation identity has no admin_profiles row →
--                  denied. No access at all to push_gateway_secret.
--   service_role   not used by the app.
--
-- Data stored: endpoint URL, p256dh, auth (needed to encrypt), locality,
-- enabled flag and timestamps. No name, e-mail, phone, account, IP, user
-- agent or GPS position.
--
-- After running this file, set the token hash (LR-8B step, see
-- docs/LR8A_PUSH_NOTIFICATIONS_DESIGN_V1.md §5):
--   insert into public.push_gateway_secret (token_sha256)
--   values (decode('<64 hex chars printed by the generator>', 'hex'));
-- Until that row exists every subscribe/unsubscribe fails closed.
--
-- Keep in sync with src/lib/push/pushPolicy.ts (endpoint host allowlist,
-- localities) — tests/e2e/pushSecurity.spec.ts checks this file.
-- ============================================================================

begin;

create table if not exists public.push_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  endpoint         text not null unique
                   check (char_length(endpoint) <= 1024 and endpoint like 'https://%'),
  p256dh           text not null check (p256dh ~ '^[A-Za-z0-9_-]{86,88}$'),
  auth             text not null check (auth ~ '^[A-Za-z0-9_-]{21,24}$'),
  locality         text not null
                   check (locality in ('Komorów', 'Nowa Wieś', 'Granica', 'Michałowice', 'Reguły', 'Pruszków')),
  enabled          boolean not null default true,
  disabled_reason  text check (disabled_reason in ('gone')),
  disabled_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists push_subscriptions_locality_enabled_idx
  on public.push_subscriptions (locality) where enabled;
-- Used by the global throttle in push_subscribe().
create index if not exists push_subscriptions_created_at_idx
  on public.push_subscriptions (created_at);

create table if not exists public.push_deliveries (
  id               uuid primary key default gen_random_uuid(),
  alert_id         uuid not null references public.alerts(id) on delete cascade,
  subscription_id  uuid not null references public.push_subscriptions(id) on delete cascade,
  status           text not null default 'claimed'
                   check (status in ('claimed', 'sent', 'failed', 'gone')),
  http_status      integer,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- Idempotency: one notification per alert per subscription, ever.
  constraint push_deliveries_alert_subscription_key unique (alert_id, subscription_id)
);

-- Server gateway token: only its SHA-256 is stored, in a table nobody but
-- the owner (and so the two SECURITY DEFINER functions) can read.
create table if not exists public.push_gateway_secret (
  id            smallint primary key default 1 check (id = 1),
  token_sha256  bytea not null check (octet_length(token_sha256) = 32),
  created_at    timestamptz not null default now()
);

-- ── Privileges: nothing for anon on the tables ──────────────────────────────
-- Supabase's default privileges grant table access to anon/authenticated
-- in the public schema; remove them explicitly, then grant back only what
-- the admin path needs (RLS still decides per row).
revoke all on table public.push_subscriptions  from anon, authenticated, public;
revoke all on table public.push_deliveries     from anon, authenticated, public;
revoke all on table public.push_gateway_secret from anon, authenticated, public;
grant select, update, delete on table public.push_subscriptions to authenticated;
grant select, insert, update on table public.push_deliveries    to authenticated;

alter table public.push_subscriptions  enable row level security;
alter table public.push_deliveries     enable row level security;
alter table public.push_gateway_secret enable row level security;
-- push_gateway_secret deliberately has no policy: with RLS on and no grant,
-- anon and authenticated get nothing even if a grant is added by mistake.

-- ── RLS: admins only (admin_profiles membership) ────────────────────────────
create policy "Admins can select push subscriptions"
  on public.push_subscriptions for select to authenticated
  using (exists (select 1 from public.admin_profiles where admin_profiles.user_id = auth.uid()));

create policy "Admins can update push subscriptions"
  on public.push_subscriptions for update to authenticated
  using (exists (select 1 from public.admin_profiles where admin_profiles.user_id = auth.uid()))
  with check (exists (select 1 from public.admin_profiles where admin_profiles.user_id = auth.uid()));

create policy "Admins can delete push subscriptions"
  on public.push_subscriptions for delete to authenticated
  using (exists (select 1 from public.admin_profiles where admin_profiles.user_id = auth.uid()));

create policy "Admins can select push deliveries"
  on public.push_deliveries for select to authenticated
  using (exists (select 1 from public.admin_profiles where admin_profiles.user_id = auth.uid()));

create policy "Admins can insert push deliveries"
  on public.push_deliveries for insert to authenticated
  with check (exists (select 1 from public.admin_profiles where admin_profiles.user_id = auth.uid()));

create policy "Admins can update push deliveries"
  on public.push_deliveries for update to authenticated
  using (exists (select 1 from public.admin_profiles where admin_profiles.user_id = auth.uid()))
  with check (exists (select 1 from public.admin_profiles where admin_profiles.user_id = auth.uid()));

-- ── Visitor write path: two validating functions behind the gateway token ──
-- p_token is compared as SHA-256 against push_gateway_secret. A missing,
-- short or wrong token, or no configured hash, fails with 42501 before any
-- read or write — direct anon RPC calls get nothing, not even validation
-- feedback about the other arguments.
create or replace function public.push_subscribe(
  p_token text, p_endpoint text, p_p256dh text, p_auth text, p_locality text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_token is null or char_length(p_token) < 32 or char_length(p_token) > 256
     or not exists (select 1 from public.push_gateway_secret
                     where token_sha256 = sha256(convert_to(p_token, 'UTF8'))) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if p_endpoint is null
     or char_length(p_endpoint) > 1024
     or p_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/' then
    raise exception 'invalid_endpoint' using errcode = '22023';
  end if;
  if p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{86,88}$' then
    raise exception 'invalid_p256dh' using errcode = '22023';
  end if;
  if p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{21,24}$' then
    raise exception 'invalid_auth' using errcode = '22023';
  end if;
  if p_locality is null
     or p_locality not in ('Komorów', 'Nowa Wieś', 'Granica', 'Michałowice', 'Reguły', 'Pruszków') then
    raise exception 'invalid_locality' using errcode = '22023';
  end if;
  if not exists (select 1 from public.push_subscriptions where endpoint = p_endpoint) then
    -- Global throttle across ALL server instances (the per-IP limiter in the
    -- route is per instance): at most 60 new subscriptions per minute.
    if (select count(*) from public.push_subscriptions
         where created_at > now() - interval '1 minute') >= 60 then
      raise exception 'rate_limited' using errcode = '54000';
    end if;
    -- Abuse ceiling far above the pilot area's population of devices.
    if (select count(*) from public.push_subscriptions) >= 20000 then
      raise exception 'capacity_reached' using errcode = '53400';
    end if;
  end if;

  insert into public.push_subscriptions (endpoint, p256dh, auth, locality)
  values (p_endpoint, p_p256dh, p_auth, p_locality)
  on conflict (endpoint) do update
    set p256dh          = excluded.p256dh,
        auth            = excluded.auth,
        locality        = excluded.locality,
        enabled         = true,
        disabled_reason = null,
        disabled_at     = null,
        updated_at      = now();
end;
$$;

-- Deletes the row (and its delivery history via cascade). Returns nothing,
-- so it cannot be used to test whether an endpoint is subscribed.
create or replace function public.push_unsubscribe(p_token text, p_endpoint text) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_token is null or char_length(p_token) < 32 or char_length(p_token) > 256
     or not exists (select 1 from public.push_gateway_secret
                     where token_sha256 = sha256(convert_to(p_token, 'UTF8'))) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if p_endpoint is null or char_length(p_endpoint) > 1024 then
    return;
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
end;
$$;

revoke all on function public.push_subscribe(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.push_unsubscribe(text, text)                 from public, anon, authenticated;
grant execute on function public.push_subscribe(text, text, text, text, text) to anon;
grant execute on function public.push_unsubscribe(text, text)                 to anon;

commit;

-- ── Retention (manual maintenance, run by the admin; NOT scheduled) ─────────
-- Subscriptions the push service reported as gone (404/410), 30 days on:
--   delete from public.push_subscriptions
--    where enabled = false and disabled_reason = 'gone'
--      and disabled_at < now() - interval '30 days';
-- Delivery log older than 90 days:
--   delete from public.push_deliveries where created_at < now() - interval '90 days';
