-- LR-8A — rollback for PROPOSED_LR8A_PUSH_SUBSCRIPTIONS_V1.sql (NOT EXECUTED).
-- Removes every stored push subscription and the delivery log. Before
-- running, set PUSH_NOTIFICATIONS_ENABLED to anything but "true" and
-- redeploy, so nothing writes to these objects meanwhile.

begin;
drop function if exists public.push_subscribe(text, text, text, text);
drop function if exists public.push_unsubscribe(text);
drop table if exists public.push_deliveries;
drop table if exists public.push_subscriptions;
commit;
