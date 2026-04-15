-- ============================================================
-- StockOS — Placeholder for migration ordering
-- Migration: 004_helpers.sql
--
-- NOTE: get_delta() is fully defined in 005_rpcs.sql which
-- includes delete_log support. This stub is here only to keep
-- the migration sequence intact. 005 replaces it with
-- "create or replace function", so no conflict exists.
-- ============================================================

-- Stub (replaced by 005_rpcs.sql)
create or replace function public.get_delta(since timestamptz)
returns jsonb language sql as $$
  select '{}'::jsonb;
$$;
