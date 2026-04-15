-- ============================================================
-- StockOS — Row Level Security
-- Migration: 002_rls.sql
-- Strategy:
--   1. Enable RLS on EVERY table
--   2. No policy  = DENY ALL (Postgres default)
--   3. Grant access only through named policies
--   4. Two roles:  'app_user'  — authenticated staff
--                  'app_admin' — full access
--   5. audit_log and sync_cursors have their own rules
--   6. Edge functions run as service_role (bypasses RLS)
-- ============================================================

-- ── Custom claims helper ──────────────────────────────────────────────────────
-- Edge functions set app_metadata.role to 'admin' | 'user'
create or replace function public.get_my_role()
returns text language sql stable security definer as $$
  select coalesce(
    auth.jwt() -> 'app_metadata' ->> 'role',
    'none'
  );
$$;

-- ── Enable RLS on all tables ──────────────────────────────────────────────────
alter table public.audit_log       enable row level security;
alter table public.sync_cursors    enable row level security;
alter table public.categories      enable row level security;
alter table public.suppliers       enable row level security;
alter table public.clients         enable row level security;
alter table public.end_customers   enable row level security;
alter table public.products        enable row level security;
alter table public.movements       enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.sales_orders    enable row level security;
alter table public.s_payments      enable row level security;
alter table public.p_payments      enable row level security;

-- ── DENY ALL by default: no policies means no access ─────────────────────────
-- (Postgres denies when no matching policy exists — this is the default)
-- We add PERMISSIVE policies for the roles we want to allow.

-- ── Macro: create standard CRUD policies for a table ─────────────────────────
-- Admin: full access
-- User:  SELECT + INSERT + UPDATE (no DELETE on most tables)
create or replace function public._create_table_policies(
  tbl text,
  allow_user_delete boolean default false
) returns void language plpgsql as $$
begin
  -- Admin: all operations
  execute format(
    'create policy "admin_all_%s" on public.%s
     for all to authenticated
     using      (public.get_my_role() = ''admin'')
     with check (public.get_my_role() = ''admin'')',
    tbl, tbl
  );

  -- User: select
  execute format(
    'create policy "user_select_%s" on public.%s
     for select to authenticated
     using (public.get_my_role() in (''admin'',''user''))',
    tbl, tbl
  );

  -- User: insert
  execute format(
    'create policy "user_insert_%s" on public.%s
     for insert to authenticated
     with check (public.get_my_role() in (''admin'',''user''))',
    tbl, tbl
  );

  -- User: update
  execute format(
    'create policy "user_update_%s" on public.%s
     for update to authenticated
     using      (public.get_my_role() in (''admin'',''user''))
     with check (public.get_my_role() in (''admin'',''user''))',
    tbl, tbl
  );

  -- User: delete (only when explicitly allowed)
  if allow_user_delete then
    execute format(
      'create policy "user_delete_%s" on public.%s
       for delete to authenticated
       using (public.get_my_role() in (''admin'',''user''))',
      tbl, tbl
    );
  end if;
end;
$$;

-- ── Apply policies to all data tables ────────────────────────────────────────

-- Reference / config tables — users can insert/update, cannot delete
select public._create_table_policies('categories',      false);
select public._create_table_policies('suppliers',       false);
select public._create_table_policies('clients',         false);
select public._create_table_policies('end_customers',   false);
select public._create_table_policies('products',        false);

-- Operational tables — users can create/update, admin can delete
select public._create_table_policies('purchase_orders', false);
select public._create_table_policies('sales_orders',    false);
select public._create_table_policies('s_payments',      true);   -- payments: user can delete own errors
select public._create_table_policies('p_payments',      true);

-- Movements are append-only for users; only admin can delete
create policy "admin_all_movements" on public.movements
  for all to authenticated
  using      (public.get_my_role() = 'admin')
  with check (public.get_my_role() = 'admin');

create policy "user_select_movements" on public.movements
  for select to authenticated
  using (public.get_my_role() in ('admin','user'));

create policy "user_insert_movements" on public.movements
  for insert to authenticated
  with check (public.get_my_role() in ('admin','user'));
-- NO user update/delete on movements — they are immutable records

-- ── audit_log: read-only for admin, invisible to users ───────────────────────
create policy "admin_select_audit_log" on public.audit_log
  for select to authenticated
  using (public.get_my_role() = 'admin');
-- no insert/update/delete policy: only triggers (security definer) can write

-- ── sync_cursors: each user manages only their own cursor ────────────────────
create policy "own_cursor" on public.sync_cursors
  for all to authenticated
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());
