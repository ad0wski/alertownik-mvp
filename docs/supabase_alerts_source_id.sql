-- Sprint 44: link alerts to their source
-- Run this in Supabase SQL Editor

alter table public.alerts
  add column if not exists source_id uuid null
  references public.alert_sources(id) on delete set null;

create index if not exists alerts_source_id_idx
  on public.alerts(source_id);

notify pgrst, 'reload schema';
