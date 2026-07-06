-- ============================================================================
-- Sprint 122 — waste_schedule_items inspection queries
--
-- ✅ READ ONLY — SAFE TO RUN. No INSERT/UPDATE/DELETE/DDL below.
--    Paste the whole file (or each block separately) into the Supabase
--    SQL Editor. Nothing here modifies data or schema.
--
-- Purpose: confirm the live table shape and current contents before the
-- first real Komorów import (docs/sprint122_komorow_waste_seed_proposal.sql
-- and /admin/waste's "Import z JSON" both assume this schema — last
-- live-confirmed Sprint 106S: table exists, 0 rows).
-- ============================================================================

-- 1) Table columns as they exist live (should match
--    docs/supabase_waste_schedule_items.sql: locality, area_name,
--    street_group, waste_type, collection_date, source_name, source_url,
--    notes, id/created_at/updated_at)
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'waste_schedule_items'
order by ordinal_position;

-- 2) First 20 rows (soonest collection dates first) — expected: 0 rows
--    before the first import
select
  locality,
  area_name,
  street_group,
  waste_type,
  collection_date,
  source_name,
  source_url,
  notes,
  created_at
from public.waste_schedule_items
order by collection_date asc
limit 20;

-- 3) Row counts by locality/area — expected: empty before the first import;
--    after the Komorów import this shows exactly how many rows landed where
select
  locality,
  coalesce(area_name, '—') as area_name,
  count(*)                 as rows_total,
  min(collection_date)     as first_date,
  max(collection_date)     as last_date
from public.waste_schedule_items
group by locality, area_name
order by locality, area_name;

-- 4) Rows per waste type (sanity check after import — every type you
--    transcribed should appear, none you didn't)
select
  waste_type,
  count(*)             as rows_total,
  min(collection_date) as first_date,
  max(collection_date) as last_date
from public.waste_schedule_items
group by waste_type
order by waste_type;
