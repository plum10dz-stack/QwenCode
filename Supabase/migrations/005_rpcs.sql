-- ============================================================
-- StockOS — Utility RPCs needed by edge functions
-- Migration: 005_rpcs.sql
-- ============================================================

-- Simple UUID generator callable via supabase.rpc()
create or replace function public.generate_uuid()
returns uuid language sql as $$
  select gen_random_uuid();
$$;

-- ── Soft-delete log ──────────────────────────────────────────────────────────
-- Edge functions record deletions here so the sync delta can report them.
-- get_delta() currently returns empty deletes arrays; this table enables
-- true delete propagation once you implement that path.
create table if not exists public.delete_log (
  id          bigserial    primary key,
  table_name  text         not null,
  row_id      text         not null,
  deleted_by  text,
  deleted_at  timestamptz  not null default now()
);

-- Only service_role can write (edge functions use service_role)
alter table public.delete_log enable row level security;

create policy "admin_select_delete_log" on public.delete_log
  for select to authenticated
  using (public.get_my_role() = 'admin');

-- Append deletes to get_delta result
create or replace function public.get_delta(since timestamptz)
returns jsonb language plpgsql security definer as $$
declare
  result  jsonb := '{}'::jsonb;
  deletes jsonb;
begin

  -- Build updates for each table
  result := result || jsonb_build_object('categories', jsonb_build_object(
    'updates', coalesce((select jsonb_agg(row_to_json(r)) from public.categories r where r.updated_at > since), '[]'),
    'deletes', coalesce((select jsonb_agg(jsonb_build_object('id', row_id)) from public.delete_log where table_name='categories' and deleted_at > since), '[]'),
    'eventTime', now()));

  result := result || jsonb_build_object('suppliers', jsonb_build_object(
    'updates', coalesce((select jsonb_agg(row_to_json(r)) from public.suppliers r where r.updated_at > since), '[]'),
    'deletes', coalesce((select jsonb_agg(jsonb_build_object('id', row_id)) from public.delete_log where table_name='suppliers' and deleted_at > since), '[]'),
    'eventTime', now()));

  result := result || jsonb_build_object('clients', jsonb_build_object(
    'updates', coalesce((select jsonb_agg(row_to_json(r)) from public.clients r where r.updated_at > since), '[]'),
    'deletes', coalesce((select jsonb_agg(jsonb_build_object('id', row_id)) from public.delete_log where table_name='clients' and deleted_at > since), '[]'),
    'eventTime', now()));

  result := result || jsonb_build_object('endCustomers', jsonb_build_object(
    'updates', coalesce((select jsonb_agg(row_to_json(r)) from public.end_customers r where r.updated_at > since), '[]'),
    'deletes', coalesce((select jsonb_agg(jsonb_build_object('id', row_id)) from public.delete_log where table_name='end_customers' and deleted_at > since), '[]'),
    'eventTime', now()));

  result := result || jsonb_build_object('products', jsonb_build_object(
    'updates', coalesce((select jsonb_agg(row_to_json(r)) from public.products r where r.updated_at > since), '[]'),
    'deletes', coalesce((select jsonb_agg(jsonb_build_object('id', row_id)) from public.delete_log where table_name='products' and deleted_at > since), '[]'),
    'eventTime', now()));

  result := result || jsonb_build_object('movements', jsonb_build_object(
    'updates', coalesce((select jsonb_agg(row_to_json(r)) from public.movements r where r.created_at > since), '[]'),
    'deletes', '[]'::jsonb,
    'eventTime', now()));

  result := result || jsonb_build_object('purchaseOrders', jsonb_build_object(
    'updates', coalesce((select jsonb_agg(row_to_json(r)) from public.purchase_orders r where r.updated_at > since), '[]'),
    'deletes', coalesce((select jsonb_agg(jsonb_build_object('id', row_id)) from public.delete_log where table_name='purchase_orders' and deleted_at > since), '[]'),
    'eventTime', now()));

  result := result || jsonb_build_object('salesOrders', jsonb_build_object(
    'updates', coalesce((select jsonb_agg(row_to_json(r)) from public.sales_orders r where r.updated_at > since), '[]'),
    'deletes', coalesce((select jsonb_agg(jsonb_build_object('id', row_id)) from public.delete_log where table_name='sales_orders' and deleted_at > since), '[]'),
    'eventTime', now()));

  result := result || jsonb_build_object('sPayments', jsonb_build_object(
    'updates', coalesce((select jsonb_agg(row_to_json(r)) from public.s_payments r where r.date_created > since), '[]'),
    'deletes', coalesce((select jsonb_agg(jsonb_build_object('id', row_id)) from public.delete_log where table_name='s_payments' and deleted_at > since), '[]'),
    'eventTime', now()));

  result := result || jsonb_build_object('pPayments', jsonb_build_object(
    'updates', coalesce((select jsonb_agg(row_to_json(r)) from public.p_payments r where r.date_created > since), '[]'),
    'deletes', coalesce((select jsonb_agg(jsonb_build_object('id', row_id)) from public.delete_log where table_name='p_payments' and deleted_at > since), '[]'),
    'eventTime', now()));

  return jsonb_build_object('tables', result);
end;
$$;
