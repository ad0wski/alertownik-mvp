-- LR-8A — rollback for PROPOSED_LR8A_PUSH_SUBSCRIPTIONS_V1.sql (NOT EXECUTED
-- ON PRODUCTION; tested on a local throwaway database in LR-8A.1).
-- Removes every stored push subscription, the delivery log and the gateway
-- token hash. Before running, set PUSH_NOTIFICATIONS_ENABLED to anything but
-- "true" and redeploy, so nothing writes to these objects meanwhile.

begin;
drop function if exists public.push_subscribe(text, text, text, text, text);
drop function if exists public.push_unsubscribe(text, text);
-- LR-8A (pre-8A.1) signatures, in case that version was ever applied.
drop function if exists public.push_subscribe(text, text, text, text);
drop function if exists public.push_unsubscribe(text);
drop table if exists public.push_deliveries;
drop table if exists public.push_subscriptions;
drop table if exists public.push_gateway_secret;
commit;
