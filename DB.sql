-- =============================================================
-- StockOS ERP — Full Normalized Database Schema for Supabase
-- File: DB.sql
-- Terminology: "client" → "customer" throughout
-- Architecture: Fully normalized — order lines in relational tables,
--               NOT in JSONB columns.
-- Run: Paste entire file into Supabase SQL Editor and execute.
-- =============================================================

-- ── Extensions ────────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- =============================================================
-- SECTION 1 — HELPER FUNCTIONS
-- =============================================================

-- Auto-update updated_at on every UPDATE
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Write every mutation to the audit log
create or replace function public.audit_log_mutation()
returns trigger language plpgsql as $$
begin
  insert into public.audit_log(table_name, operation, row_id, payload)
  values (
    TG_TABLE_NAME,
    TG_OP,
    coalesce(new.id::text, old.id::text),
    case TG_OP
      when 'DELETE' then row_to_json(old)
      else               row_to_json(new)
    end
  );
  return coalesce(new, old);
end;
$$;

-- UUID generator callable via supabase.rpc('generate_uuid')
create or replace function public.generate_uuid()
returns uuid language sql as $$
  select gen_random_uuid();
$$;

-- =============================================================
-- SECTION 2 — SYSTEM / INFRASTRUCTURE TABLES
-- =============================================================

-- ── Audit log ─────────────────────────────────────────────────────────────────
create table if not exists public.audit_log (
  id          bigserial    primary key,
  table_name  text         not null,
  operation   text         not null,   -- INSERT | UPDATE | DELETE
  row_id      text         not null,
  payload     jsonb,
  created_at  timestamptz  not null default now()
);
comment on table public.audit_log is
  'Immutable audit trail. Written by database triggers only.';

-- ── Delete log — propagates hard-deletes to connected clients ─────────────────
create table if not exists public.delete_log (
  id          bigserial    primary key,
  table_name  text         not null,
  row_id      text         not null,
  deleted_by  text,
  deleted_at  timestamptz  not null default now()
);
comment on table public.delete_log is
  'Records every hard-delete so the sync delta can propagate to clients.';

-- =============================================================
-- SECTION 3 — MASTER DATA TABLES
-- =============================================================

-- ── Categories ────────────────────────────────────────────────────────────────
create table if not exists public.categories (
  id          uuid         primary key default gen_random_uuid(),
  name        text         not null,
  abr         text         not null,            -- abbreviation e.g. "ELEC"
  ref         text         not null default '', -- reference code e.g. "CAT-001"
  created_at  timestamptz  not null default now(),
  updated_at  timestamptz  not null default now(),
  constraint  categories_name_unique unique (name)
);

-- ── Suppliers ─────────────────────────────────────────────────────────────────
create table if not exists public.suppliers (
  id          uuid         primary key default gen_random_uuid(),
  name        text         not null,
  contact     text,
  phone       text,
  email       text,
  address     text,
  notes       text,
  created_at  timestamptz  not null default now(),
  updated_at  timestamptz  not null default now()
);

-- ── Customers (formerly "clients") ───────────────────────────────────────────
create table if not exists public.customers (
  id          uuid         primary key default gen_random_uuid(),
  full_name   text         not null,
  phone       text,
  email       text,
  city        text,
  tax_id      text,
  address     text,
  notes       text,
  is_active   boolean      not null default true,
  created_at  timestamptz  not null default now(),
  updated_at  timestamptz  not null default now()
);
comment on table public.customers is
  'Direct customers who place sales orders. Renamed from "clients".';

-- ── End Customers — final beneficiaries ─────────────────────────────────────
create table if not exists public.end_customers (
  id          uuid         primary key default gen_random_uuid(),
  full_name   text         not null,
  phone       text,
  email       text,
  city        text,
  tax_id      text,
  address     text,
  notes       text,
  is_active   boolean      not null default true,
  created_at  timestamptz  not null default now(),
  updated_at  timestamptz  not null default now()
);
comment on table public.end_customers is
  'Final beneficiaries of sales orders (e.g. institutions served by the customer).';

-- ── Products ──────────────────────────────────────────────────────────────────
create table if not exists public.products (
  id            uuid          primary key default gen_random_uuid(),
  name          text          not null,
  sku           text          not null,
  category      text,                           -- denormalized from categories.name
  unit          text          not null default 'pcs',
  supplier_id   uuid          references public.suppliers(id) on delete set null,
  buy_price     numeric(18,2) not null default 0 check (buy_price  >= 0),
  sell_price    numeric(18,2) not null default 0 check (sell_price >= 0),
  stock         integer       not null default 0 check (stock      >= 0),
  low_stock     integer       not null default 5 check (low_stock  >= 0),
  location      text,
  description   text,
  active        boolean       not null default true,
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now(),
  constraint    products_sku_unique unique (sku)
);

-- ── Stock Movements — immutable append-only ledger ───────────────────────────
create table if not exists public.movements (
  id          uuid         primary key default gen_random_uuid(),
  product_id  uuid         not null references public.products(id) on delete cascade,
  type        text         not null check (type in ('in','out','adjustment')),
  qty         integer      not null check (qty > 0),
  before      integer      not null default 0,
  after       integer      not null default 0,
  reason      text         not null,
  ref         text,
  created_at  timestamptz  not null default now()
  -- no updated_at — movements are immutable
);
comment on table public.movements is
  'Append-only stock ledger. Users may INSERT but never UPDATE or DELETE.';

-- =============================================================
-- SECTION 4 — ORDER HEADER TABLES
-- (Lines are stored in normalized relational tables — see Section 5)
-- =============================================================

-- ── Purchase Orders ───────────────────────────────────────────────────────────
create table if not exists public.purchase_orders (
  id             uuid          primary key default gen_random_uuid(),
  po_number      text          not null,
  por            text,                          -- POR: the customer's reference number
  supplier_id    uuid          references public.suppliers(id) on delete restrict,
  expected_date  date,
  status         text          not null default 'draft'
                               check (status in ('draft','sent','confirmed','received','cancelled')),
  notes          text,
  -- Financials — auto-maintained by triggers on purchase_order_lines
  subtotal       numeric(18,2) not null default 0,
  total          numeric(18,2) not null default 0,
  received_at    timestamptz,
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now(),
  constraint     purchase_orders_po_number_unique unique (po_number)
);
comment on table public.purchase_orders is
  'Purchase order headers. Financial totals auto-maintained by line triggers.';

-- ── Sales Orders ──────────────────────────────────────────────────────────────
create table if not exists public.sales_orders (
  id                uuid          primary key default gen_random_uuid(),
  so_number         text          not null,
  customer_id       uuid          references public.customers(id)      on delete restrict,
  end_customer_id   uuid          references public.end_customers(id)  on delete set null,
  status            text          not null default 'draft'
                                  check (status in ('draft','confirmed','processing','shipped','delivered','cancelled')),
  delivery_date     date,
  notes             text,
  -- Financials — auto-maintained by triggers on sales_order_lines
  subtotal          numeric(18,2) not null default 0,
  tax_pct           numeric(5,2)  not null default 19,
  tax_amount        numeric(18,2) not null default 0,
  total             numeric(18,2) not null default 0,
  shipped_at        timestamptz,
  delivered_at      timestamptz,
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now(),
  constraint        sales_orders_so_number_unique unique (so_number)
);
comment on table public.sales_orders is
  'Sales order headers. Financial totals auto-maintained by line triggers.';

-- ── Sales Payments ────────────────────────────────────────────────────────────
create table if not exists public.s_payments (
  id            uuid          primary key default gen_random_uuid(),
  date_created  timestamptz   not null default now(),
  date          date          not null default current_date,
  amount        numeric(18,2) not null check (amount > 0),
  customer_id   uuid          references public.customers(id)    on delete restrict,
  order_id      uuid          references public.sales_orders(id) on delete restrict,
  notes         text
);
comment on table public.s_payments is
  'Payments received against sales orders.';

-- ── Purchase Payments ─────────────────────────────────────────────────────────
create table if not exists public.p_payments (
  id            uuid          primary key default gen_random_uuid(),
  date_created  timestamptz   not null default now(),
  date          date          not null default current_date,
  amount        numeric(18,2) not null check (amount > 0),
  supplier_id   uuid          references public.suppliers(id)        on delete restrict,
  order_id      uuid          references public.purchase_orders(id)  on delete restrict,
  notes         text
);
comment on table public.p_payments is
  'Payments made against purchase orders.';

-- =============================================================
-- SECTION 5 — NORMALIZED ORDER LINE TABLES
-- =============================================================

-- ── Purchase Order Lines ──────────────────────────────────────────────────────
create table if not exists public.purchase_order_lines (
  id            uuid          primary key default gen_random_uuid(),
  order_id      uuid          not null
                              references public.purchase_orders(id) on delete cascade,
  product_id    uuid          not null
                              references public.products(id)        on delete restrict,
  qty           numeric(12,3) not null check (qty > 0),
  unit_price    numeric(18,2) not null default 0 check (unit_price >= 0),
  -- Generated column: always equals qty * unit_price
  line_total    numeric(18,2) generated always as (qty * unit_price) stored,
  sort_order    integer       not null default 0,
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);
comment on table public.purchase_order_lines is
  'Normalized line items for purchase orders. Replaces the former JSONB lines column.';

create index if not exists idx_pol_order   on public.purchase_order_lines(order_id);
create index if not exists idx_pol_product on public.purchase_order_lines(product_id);

-- ── Sales Order Lines ─────────────────────────────────────────────────────────
create table if not exists public.sales_order_lines (
  id            uuid          primary key default gen_random_uuid(),
  order_id      uuid          not null
                              references public.sales_orders(id) on delete cascade,
  product_id    uuid          not null
                              references public.products(id)     on delete restrict,
  qty           numeric(12,3) not null check (qty > 0),
  unit_price    numeric(18,2) not null default 0 check (unit_price >= 0),
  -- Generated column: always equals qty * unit_price
  line_total    numeric(18,2) generated always as (qty * unit_price) stored,
  sort_order    integer       not null default 0,
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);
comment on table public.sales_order_lines is
  'Normalized line items for sales orders. Replaces the former JSONB lines column.';

create index if not exists idx_sol_order   on public.sales_order_lines(order_id);
create index if not exists idx_sol_product on public.sales_order_lines(product_id);

-- =============================================================
-- SECTION 6 — AUTOMATED FINANCIAL RECALCULATION TRIGGERS
-- =============================================================
-- Whenever a line is inserted, updated, or deleted the parent
-- order's subtotal / tax_amount / total are recalculated.

-- ── Recalculate purchase_orders totals ───────────────────────────────────────
create or replace function public.recalc_purchase_order_totals()
returns trigger language plpgsql as $$
declare
  v_order_id uuid;
  v_subtotal numeric(18,2);
begin
  -- Determine which order to recalculate
  v_order_id := coalesce(new.order_id, old.order_id);

  select coalesce(sum(line_total), 0)
  into   v_subtotal
  from   public.purchase_order_lines
  where  order_id = v_order_id;

  update public.purchase_orders
  set    subtotal   = v_subtotal,
         total      = v_subtotal,        -- purchase orders have no tax by default
         updated_at = now()
  where  id = v_order_id;

  return coalesce(new, old);
end;
$$;

create or replace trigger trg_pol_recalc_totals
  after insert or update of qty, unit_price or delete
  on public.purchase_order_lines
  for each row execute function public.recalc_purchase_order_totals();

-- ── Recalculate sales_orders totals ──────────────────────────────────────────
create or replace function public.recalc_sales_order_totals()
returns trigger language plpgsql as $$
declare
  v_order_id  uuid;
  v_subtotal  numeric(18,2);
  v_tax_pct   numeric(5,2);
  v_tax_amt   numeric(18,2);
begin
  v_order_id := coalesce(new.order_id, old.order_id);

  select coalesce(sum(sol.line_total), 0), so.tax_pct
  into   v_subtotal, v_tax_pct
  from   public.sales_order_lines sol
  join   public.sales_orders      so  on so.id = sol.order_id
  where  sol.order_id = v_order_id
  group  by so.tax_pct;

  -- Handle case where all lines were deleted (no rows from join)
  if v_subtotal is null then
    select 0, tax_pct into v_subtotal, v_tax_pct
    from   public.sales_orders where id = v_order_id;
  end if;

  v_tax_amt := round(v_subtotal * coalesce(v_tax_pct, 0) / 100, 2);

  update public.sales_orders
  set    subtotal   = v_subtotal,
         tax_amount = v_tax_amt,
         total      = v_subtotal + v_tax_amt,
         updated_at = now()
  where  id = v_order_id;

  return coalesce(new, old);
end;
$$;

create or replace trigger trg_sol_recalc_totals
  after insert or update of qty, unit_price or delete
  on public.sales_order_lines
  for each row execute function public.recalc_sales_order_totals();

-- Also recalculate when tax_pct changes on the header
create or replace function public.recalc_so_on_tax_change()
returns trigger language plpgsql as $$
declare
  v_tax_amt numeric(18,2);
begin
  if new.tax_pct is distinct from old.tax_pct then
    v_tax_amt := round(new.subtotal * new.tax_pct / 100, 2);
    new.tax_amount := v_tax_amt;
    new.total      := new.subtotal + v_tax_amt;
  end if;
  return new;
end;
$$;

create or replace trigger trg_so_tax_change
  before update of tax_pct
  on public.sales_orders
  for each row execute function public.recalc_so_on_tax_change();

-- =============================================================
-- SECTION 7 — AUTO-POPULATE UNIT_PRICE FROM PRODUCTS
-- =============================================================
-- If unit_price is 0 (or not provided) on INSERT, the trigger
-- fetches the default price from the products table automatically.

-- ── Purchase order lines: default to product.buy_price ───────────────────────
create or replace function public.pol_default_unit_price()
returns trigger language plpgsql as $$
begin
  if new.unit_price = 0 or new.unit_price is null then
    select buy_price
    into   new.unit_price
    from   public.products
    where  id = new.product_id;
    -- If product not found, keep 0 to avoid NULL
    new.unit_price := coalesce(new.unit_price, 0);
  end if;
  return new;
end;
$$;

create or replace trigger trg_pol_default_price
  before insert
  on public.purchase_order_lines
  for each row execute function public.pol_default_unit_price();

-- ── Sales order lines: default to product.sell_price ─────────────────────────
create or replace function public.sol_default_unit_price()
returns trigger language plpgsql as $$
begin
  if new.unit_price = 0 or new.unit_price is null then
    select sell_price
    into   new.unit_price
    from   public.products
    where  id = new.product_id;
    new.unit_price := coalesce(new.unit_price, 0);
  end if;
  return new;
end;
$$;

create or replace trigger trg_sol_default_price
  before insert
  on public.sales_order_lines
  for each row execute function public.sol_default_unit_price();

-- =============================================================
-- SECTION 8 — TRIGGERS: updated_at
-- =============================================================

do $$ declare t text; begin
  foreach t in array array[
    'categories', 'suppliers', 'customers', 'end_customers', 'products',
    'purchase_orders', 'sales_orders',
    'purchase_order_lines', 'sales_order_lines'
  ] loop
    execute format(
      'create or replace trigger trg_%s_updated_at
       before update on public.%s
       for each row execute function public.set_updated_at()',
      t, t);
  end loop;
end $$;

-- =============================================================
-- SECTION 9 — TRIGGERS: audit log
-- =============================================================

do $$ declare t text; begin
  foreach t in array array[
    'categories', 'suppliers', 'customers', 'end_customers', 'products',
    'movements', 'purchase_orders', 'sales_orders', 's_payments', 'p_payments',
    'purchase_order_lines', 'sales_order_lines'
  ] loop
    execute format(
      'create or replace trigger trg_%s_audit
       after insert or update or delete on public.%s
       for each row execute function public.audit_log_mutation()',
      t, t);
  end loop;
end $$;

-- =============================================================
-- SECTION 10 — INDEXES
-- =============================================================

-- Products
create index if not exists idx_products_category  on public.products(category);
create index if not exists idx_products_supplier  on public.products(supplier_id);
create index if not exists idx_products_active    on public.products(active) where active = true;
create index if not exists idx_products_low_stock on public.products(stock) where stock > 0;

-- Movements
create index if not exists idx_movements_product  on public.movements(product_id);
create index if not exists idx_movements_type     on public.movements(type);
create index if not exists idx_movements_created  on public.movements(created_at desc);

-- Purchase orders
create index if not exists idx_po_supplier        on public.purchase_orders(supplier_id);
create index if not exists idx_po_status          on public.purchase_orders(status);
create index if not exists idx_po_updated         on public.purchase_orders(updated_at desc);

-- Sales orders
create index if not exists idx_so_customer        on public.sales_orders(customer_id);
create index if not exists idx_so_end_customer    on public.sales_orders(end_customer_id);
create index if not exists idx_so_status          on public.sales_orders(status);
create index if not exists idx_so_updated         on public.sales_orders(updated_at desc);
create index if not exists idx_so_delivery        on public.sales_orders(delivery_date);

-- Payments
create index if not exists idx_sp_order           on public.s_payments(order_id);
create index if not exists idx_sp_customer        on public.s_payments(customer_id);
create index if not exists idx_sp_date            on public.s_payments(date desc);
create index if not exists idx_pp_order           on public.p_payments(order_id);
create index if not exists idx_pp_supplier        on public.p_payments(supplier_id);
create index if not exists idx_pp_date            on public.p_payments(date desc);

-- System tables
create index if not exists idx_audit_log_table    on public.audit_log(table_name, created_at desc);
create index if not exists idx_delete_log_table   on public.delete_log(table_name, deleted_at desc);

-- =============================================================
-- SECTION 11 — REALTIME PUBLICATION
-- =============================================================

alter publication supabase_realtime add table public.categories;
alter publication supabase_realtime add table public.suppliers;
alter publication supabase_realtime add table public.customers;
alter publication supabase_realtime add table public.end_customers;
alter publication supabase_realtime add table public.products;
alter publication supabase_realtime add table public.movements;
alter publication supabase_realtime add table public.purchase_orders;
alter publication supabase_realtime add table public.purchase_order_lines;
alter publication supabase_realtime add table public.sales_orders;
alter publication supabase_realtime add table public.sales_order_lines;
alter publication supabase_realtime add table public.s_payments;
alter publication supabase_realtime add table public.p_payments;

-- =============================================================
-- SECTION 13 — DELTA SYNC RPC
-- =============================================================
-- Called by the edge function  fn:"sync"
-- Returns all changes since a timestamp across all tables.
-- Line tables are included so clients can resync order lines.

create or replace function public.get_delta(since timestamptz)
returns jsonb language plpgsql as $$
declare
  result jsonb := '{}'::jsonb;
begin

  result := result || jsonb_build_object('categories', jsonb_build_object(
    'updates',   coalesce((select jsonb_agg(row_to_json(r)) from public.categories r             where r.updated_at   > since), '[]'),
    'deletes',   coalesce((select jsonb_agg(jsonb_build_object('id',row_id)) from public.delete_log where table_name='categories'           and deleted_at > since), '[]'),
    'eventTime', now()));

  result := result || jsonb_build_object('suppliers', jsonb_build_object(
    'updates',   coalesce((select jsonb_agg(row_to_json(r)) from public.suppliers r              where r.updated_at   > since), '[]'),
    'deletes',   coalesce((select jsonb_agg(jsonb_build_object('id',row_id)) from public.delete_log where table_name='suppliers'            and deleted_at > since), '[]'),
    'eventTime', now()));

  result := result || jsonb_build_object('customers', jsonb_build_object(
    'updates',   coalesce((select jsonb_agg(row_to_json(r)) from public.customers r              where r.updated_at   > since), '[]'),
    'deletes',   coalesce((select jsonb_agg(jsonb_build_object('id',row_id)) from public.delete_log where table_name='customers'            and deleted_at > since), '[]'),
    'eventTime', now()));

  result := result || jsonb_build_object('endCustomers', jsonb_build_object(
    'updates',   coalesce((select jsonb_agg(row_to_json(r)) from public.end_customers r          where r.updated_at   > since), '[]'),
    'deletes',   coalesce((select jsonb_agg(jsonb_build_object('id',row_id)) from public.delete_log where table_name='end_customers'        and deleted_at > since), '[]'),
    'eventTime', now()));

  result := result || jsonb_build_object('products', jsonb_build_object(
    'updates',   coalesce((select jsonb_agg(row_to_json(r)) from public.products r               where r.updated_at   > since), '[]'),
    'deletes',   coalesce((select jsonb_agg(jsonb_build_object('id',row_id)) from public.delete_log where table_name='products'             and deleted_at > since), '[]'),
    'eventTime', now()));

  result := result || jsonb_build_object('movements', jsonb_build_object(
    'updates',   coalesce((select jsonb_agg(row_to_json(r)) from public.movements r              where r.created_at   > since), '[]'),
    'deletes',   '[]'::jsonb,
    'eventTime', now()));

  result := result || jsonb_build_object('purchaseOrders', jsonb_build_object(
    'updates',   coalesce((select jsonb_agg(row_to_json(r)) from public.purchase_orders r        where r.updated_at   > since), '[]'),
    'deletes',   coalesce((select jsonb_agg(jsonb_build_object('id',row_id)) from public.delete_log where table_name='purchase_orders'      and deleted_at > since), '[]'),
    'eventTime', now()));

  result := result || jsonb_build_object('purchaseOrderLines', jsonb_build_object(
    'updates',   coalesce((select jsonb_agg(row_to_json(r)) from public.purchase_order_lines r   where r.updated_at   > since), '[]'),
    'deletes',   coalesce((select jsonb_agg(jsonb_build_object('id',row_id)) from public.delete_log where table_name='purchase_order_lines' and deleted_at > since), '[]'),
    'eventTime', now()));

  result := result || jsonb_build_object('salesOrders', jsonb_build_object(
    'updates',   coalesce((select jsonb_agg(row_to_json(r)) from public.sales_orders r           where r.updated_at   > since), '[]'),
    'deletes',   coalesce((select jsonb_agg(jsonb_build_object('id',row_id)) from public.delete_log where table_name='sales_orders'         and deleted_at > since), '[]'),
    'eventTime', now()));

  result := result || jsonb_build_object('salesOrderLines', jsonb_build_object(
    'updates',   coalesce((select jsonb_agg(row_to_json(r)) from public.sales_order_lines r      where r.updated_at   > since), '[]'),
    'deletes',   coalesce((select jsonb_agg(jsonb_build_object('id',row_id)) from public.delete_log where table_name='sales_order_lines'    and deleted_at > since), '[]'),
    'eventTime', now()));

  result := result || jsonb_build_object('sPayments', jsonb_build_object(
    'updates',   coalesce((select jsonb_agg(row_to_json(r)) from public.s_payments r             where r.date_created > since), '[]'),
    'deletes',   coalesce((select jsonb_agg(jsonb_build_object('id',row_id)) from public.delete_log where table_name='s_payments'           and deleted_at > since), '[]'),
    'eventTime', now()));

  result := result || jsonb_build_object('pPayments', jsonb_build_object(
    'updates',   coalesce((select jsonb_agg(row_to_json(r)) from public.p_payments r             where r.date_created > since), '[]'),
    'deletes',   coalesce((select jsonb_agg(jsonb_build_object('id',row_id)) from public.delete_log where table_name='p_payments'           and deleted_at > since), '[]'),
    'eventTime', now()));

  return jsonb_build_object('tables', result);
end;
$$;

-- =============================================================
-- SECTION 14 — BUSINESS RULE VIEWS
-- =============================================================

-- ── Customer financial situation (powers the Client Situation report) ─────────
create or replace view public.v_customer_situation as
select
  so.id                                              as order_id,
  so.so_number,
  so.customer_id,
  c.full_name                                        as customer_name,
  c.tax_id                                           as customer_tax_id,
  so.end_customer_id,
  ec.full_name                                       as end_customer_name,
  so.status                                          as order_status,
  so.delivery_date,
  so.created_at                                      as order_date,
  count(sol.id)                                      as line_count,
  so.subtotal,
  so.tax_pct,
  so.tax_amount,
  so.total,
  coalesce(sp.paid, 0)                               as total_paid,
  so.total - coalesce(sp.paid, 0)                   as remaining,
  case
    when coalesce(sp.paid, 0) <= 0        then 'unpaid'
    when coalesce(sp.paid, 0) >= so.total then 'paid'
    else                                       'partial'
  end                                                as payment_status
from       public.sales_orders       so
left join  public.customers          c   on c.id  = so.customer_id
left join  public.end_customers      ec  on ec.id = so.end_customer_id
left join  public.sales_order_lines  sol on sol.order_id = so.id
left join (
  select order_id, sum(amount) as paid
  from   public.s_payments
  group  by order_id
) sp on sp.order_id = so.id
group by so.id, c.full_name, c.tax_id, ec.full_name, sp.paid;

comment on view public.v_customer_situation is
  'Order + payment status per customer. Line count from normalized table.';

-- ── Low-stock products (powers Alerts page) ────────────────────────────────────
create or replace view public.v_low_stock as
select
  p.id, p.name, p.sku, p.category,
  p.stock, p.low_stock, p.location,
  s.name as supplier_name
from   public.products  p
left join public.suppliers s on s.id = p.supplier_id
where  p.active = true
  and  p.stock  <= p.low_stock
order  by p.stock asc, p.name;

-- ── Stock value by category (powers Dashboard / Analytics) ────────────────────
create or replace view public.v_stock_value as
select
  p.category,
  count(*)                               as product_count,
  sum(p.stock)                           as total_units,
  sum(p.stock * p.buy_price)             as buy_value,
  sum(p.stock * p.sell_price)            as sell_value,
  sum(p.stock * p.sell_price)
    - sum(p.stock * p.buy_price)         as potential_margin
from   public.products p
where  p.active = true
group  by p.category
order  by buy_value desc;

-- ── Supplier purchase summary ─────────────────────────────────────────────────
create or replace view public.v_supplier_summary as
select
  s.id                                                   as supplier_id,
  s.name                                                 as supplier_name,
  count(distinct po.id)                                  as total_orders,
  sum(case when po.status not in ('received','cancelled')
           then 1 else 0 end)                            as open_orders,
  coalesce(sum(pp.amount), 0)                            as total_paid
from       public.suppliers       s
left join  public.purchase_orders po on po.supplier_id = s.id
left join  public.p_payments      pp on pp.supplier_id = s.id
group  by  s.id, s.name;

-- ── Order lines detail view (purchase) ────────────────────────────────────────
create or replace view public.v_purchase_order_lines_detail as
select
  pol.id,
  pol.order_id,
  po.po_number,
  pol.product_id,
  p.name        as product_name,
  p.sku,
  p.unit,
  pol.qty,
  pol.unit_price,
  pol.line_total,
  pol.sort_order,
  pol.created_at
from      public.purchase_order_lines pol
join      public.purchase_orders      po  on po.id = pol.order_id
join      public.products             p   on p.id  = pol.product_id
order by  pol.order_id, pol.sort_order, pol.created_at;

-- ── Order lines detail view (sales) ──────────────────────────────────────────
create or replace view public.v_sales_order_lines_detail as
select
  sol.id,
  sol.order_id,
  so.so_number,
  sol.product_id,
  p.name        as product_name,
  p.sku,
  p.unit,
  sol.qty,
  sol.unit_price,
  sol.line_total,
  sol.sort_order,
  sol.created_at
from      public.sales_order_lines sol
join      public.sales_orders      so  on so.id = sol.order_id
join      public.products          p   on p.id  = sol.product_id
order by  sol.order_id, sol.sort_order, sol.created_at;

-- =============================================================
-- SECTION 15 — SEED DATA  (Demo / Development only)
-- Remove this section before deploying to production.
-- Uses a DO block with explicit IDs and normalized INSERT statements.
-- =============================================================

do $$
declare
  -- Categories
  cat_elec  uuid := gen_random_uuid();
  cat_prph  uuid := gen_random_uuid();
  cat_net   uuid := gen_random_uuid();
  cat_stor  uuid := gen_random_uuid();
  cat_offc  uuid := gen_random_uuid();
  -- Suppliers
  sup_tech  uuid := gen_random_uuid();
  sup_off   uuid := gen_random_uuid();
  sup_net   uuid := gen_random_uuid();
  -- Customers
  cus_mez   uuid := gen_random_uuid();
  cus_tou   uuid := gen_random_uuid();
  cus_ria   uuid := gen_random_uuid();
  -- End customers
  ec_epsp   uuid := gen_random_uuid();
  -- Products
  prod_lap  uuid := gen_random_uuid();
  prod_mon  uuid := gen_random_uuid();
  prod_kbd  uuid := gen_random_uuid();
  prod_cab  uuid := gen_random_uuid();
  prod_ssd  uuid := gen_random_uuid();
  -- Orders
  po1_id    uuid := gen_random_uuid();
  so1_id    uuid := gen_random_uuid();
begin

  -- ── Categories ────────────────────────────────────────────────────────────
  insert into public.categories (id, name, abr, ref) values
    (cat_elec, 'Electronics',     'ELEC', 'CAT-001'),
    (cat_prph, 'Peripherals',     'PRPH', 'CAT-002'),
    (cat_net,  'Networking',      'NET',  'CAT-003'),
    (cat_stor, 'Storage',         'STOR', 'CAT-004'),
    (cat_offc, 'Office Supplies', 'OFFC', 'CAT-005')
  on conflict (name) do nothing;

  -- ── Suppliers ─────────────────────────────────────────────────────────────
  insert into public.suppliers (id, name, contact, phone, email, address) values
    (sup_tech, 'TechDist Algérie',  'Karim Hadj',     '+213-21-234567', 'contact@techdist.dz', 'Alger Centre'),
    (sup_off,  'Office Pro SARL',   'Amira Benali',   '+213-31-345678', 'amira@officepro.dz',  'Oran'),
    (sup_net,  'NetSolutions DZ',   'Riad Boukhalfa', '+213-41-456789', 'riad@netsol.dz',      'Constantine');

  -- ── Customers ─────────────────────────────────────────────────────────────
  insert into public.customers (id, full_name, phone, email, city, tax_id, is_active) values
    (cus_mez, 'Entreprise Sarl Meziane', '+213-550-111222', 'youcef@meziane.dz', 'Alger',       'NIF-12345', true),
    (cus_tou, 'Nadia Touati & Associés', '+213-661-333444', 'nadia@touati.dz',   'Oran',        'NIF-67890', true),
    (cus_ria, 'Riad Systems EURL',       '+213-770-555666', 'riad@riadsys.dz',   'Constantine', '',          true);

  -- ── End Customers ─────────────────────────────────────────────────────────
  insert into public.end_customers (id, full_name, phone, email, city, is_active) values
    (ec_epsp, 'Direction EPSP Alger', '+213-21-999000', 'epsp@epsp.dz', 'Alger', true);

  -- ── Products ──────────────────────────────────────────────────────────────
  insert into public.products
    (id, name, sku, category, unit, supplier_id, buy_price, sell_price, stock, low_stock, location, description, active)
  values
    (prod_lap, 'Laptop HP ProBook 450', 'ELC-0001', 'Electronics', 'pcs', sup_tech, 85000, 98000, 12,  3, 'A-01-1', '15.6" business laptop',  true),
    (prod_mon, 'Dell Monitor 24"',      'ELC-0002', 'Electronics', 'pcs', sup_tech, 42000, 52000,  8,  4, 'A-01-2', 'Full HD IPS panel',       true),
    (prod_kbd, 'Wireless Keyboard',     'PER-0001', 'Peripherals', 'pcs', sup_tech,  3500,  4500,  3, 10, 'B-02-1', 'Logitech MK270',          true),
    (prod_cab, 'Cat6 Ethernet Cable',   'NET-0001', 'Networking',  'pcs', sup_net,    800,  1200, 45, 20, 'C-03-1', 'Shielded patch cable',    true),
    (prod_ssd, 'SSD 1TB Samsung 870',   'STO-0001', 'Storage',     'pcs', sup_tech, 22000, 28000, 14,  5, 'A-02-1', 'SATA III 2.5"',           true);

  -- ── Initial stock movements ────────────────────────────────────────────────
  insert into public.movements (product_id, type, qty, before, after, reason, ref) values
    (prod_lap, 'in', 12,  0, 12, 'Initial stock', 'SEED'),
    (prod_mon, 'in',  8,  0,  8, 'Initial stock', 'SEED'),
    (prod_kbd, 'in',  3,  0,  3, 'Initial stock', 'SEED'),
    (prod_cab, 'in', 45,  0, 45, 'Initial stock', 'SEED'),
    (prod_ssd, 'in', 14,  0, 14, 'Initial stock', 'SEED');

  -- ── Demo purchase order header ─────────────────────────────────────────────
  -- (totals will be auto-calculated by triggers after lines are inserted)
  insert into public.purchase_orders
    (id, po_number, por, supplier_id, expected_date, status, notes)
  values (
    po1_id, 'PO-0001', 'CLIENT-REF-001', sup_tech,
    current_date + interval '14 days', 'confirmed',
    'Demo purchase order — restocking keyboards and monitors'
  );

  -- ── Purchase order lines ──────────────────────────────────────────────────
  -- unit_price = 0 → trigger auto-fills from products.buy_price
  -- line_total  is a generated column (qty * unit_price)
  -- totals on the header are updated automatically by trigger
  insert into public.purchase_order_lines
    (order_id, product_id, qty, unit_price, sort_order)
  values
    (po1_id, prod_kbd, 20,     0, 1),  -- price auto-filled: 3500 → total 70 000
    (po1_id, prod_mon,  5,     0, 2),  -- price auto-filled: 42000 → total 210 000
    (po1_id, prod_ssd, 10, 21500, 3);  -- explicit price override → total 215 000

  -- ── Demo sales order header ────────────────────────────────────────────────
  insert into public.sales_orders
    (id, so_number, customer_id, end_customer_id, status, delivery_date, tax_pct, notes)
  values (
    so1_id, 'SO-0001', cus_mez, ec_epsp,
    'confirmed', current_date + interval '21 days', 19,
    'Demo sales order — laptop and monitor bundle'
  );

  -- ── Sales order lines ─────────────────────────────────────────────────────
  -- unit_price = 0 → trigger auto-fills from products.sell_price
  -- subtotal / tax_amount / total on the header are updated automatically
  insert into public.sales_order_lines
    (order_id, product_id, qty, unit_price, sort_order)
  values
    (so1_id, prod_lap, 2,      0, 1),  -- price auto-filled: 98000 → total 196 000
    (so1_id, prod_mon, 2,      0, 2),  -- price auto-filled: 52000 → total 104 000
    (so1_id, prod_kbd, 5, 4200, 3);    -- explicit discounted price → total  21 000

  -- ── Demo sales payment ─────────────────────────────────────────────────────
  insert into public.s_payments (amount, customer_id, order_id, notes)
  values (100000, cus_mez, so1_id, 'Initial deposit — 30% advance');

end $$;

-- =============================================================
-- END OF FILE
-- =============================================================
--
-- HOW TO APPLY
-- ─────────────────────────────────────────────────────────────
-- Option A — Supabase SQL Editor (recommended for first run):
--   1. Open your project → SQL Editor
--   2. Paste this entire file and click Run
--
-- Option B — Supabase CLI:
--   supabase db push --project-ref <your-project-ref>
--
-- Remove Section 15 (SEED DATA) before deploying to production.
--
-- ─────────────────────────────────────────────────────────────
-- TABLE SUMMARY
-- ─────────────────────────────────────────────────────────────
--
-- SYSTEM
--   audit_log             Immutable audit trail (trigger-written)
--   delete_log            Hard-delete records for sync propagation
--
-- MASTER DATA
--   categories            Product categories with ABR + ref codes
--   suppliers             Supplier directory
--   customers             Direct customers who place orders  ← renamed from "clients"
--   end_customers         Final beneficiaries of orders
--
-- INVENTORY
--   products              Product catalogue: buy/sell price, stock, SKU
--   movements             Append-only stock ledger (immutable)
--
-- ORDER HEADERS
--   purchase_orders       Orders to suppliers; totals auto-maintained by triggers
--   sales_orders          Orders from customers; totals auto-maintained by triggers
--
-- ORDER LINES  ← normalized relational tables replacing JSONB
--   purchase_order_lines  Lines for purchase orders; line_total GENERATED ALWAYS
--   sales_order_lines     Lines for sales orders;    line_total GENERATED ALWAYS
--
-- PAYMENTS
--   s_payments            Payments received against sales orders
--   p_payments            Payments made against purchase orders
--
-- ─────────────────────────────────────────────────────────────
-- VIEW SUMMARY
-- ─────────────────────────────────────────────────────────────
--   v_customer_situation          Order + payment status per customer
--   v_low_stock                   Products at/below low-stock threshold
--   v_stock_value                 Stock value grouped by category
--   v_supplier_summary            Purchase totals per supplier
--   v_purchase_order_lines_detail Full line detail with product info (PO)
--   v_sales_order_lines_detail    Full line detail with product info (SO)
--
-- ─────────────────────────────────────────────────────────────
-- KEY DESIGN DECISIONS
-- ─────────────────────────────────────────────────────────────
--
-- 1. NORMALIZED LINES
--    purchase_order_lines and sales_order_lines replace the old
--    JSONB "lines" columns.  Each row is a proper relational record
--    with FK constraints, CHECK constraints, and a computed column.
--
-- 2. GENERATED COLUMN
--    line_total = qty * unit_price  (GENERATED ALWAYS AS ... STORED)
--    The database always owns this value — no application arithmetic.
--
-- 3. AUTOMATIC TOTALS
--    Triggers fire on every INSERT / UPDATE / DELETE on the line
--    tables and recalculate subtotal / tax_amount / total on the
--    parent order header in the same transaction.
--    The application never needs to send financial totals.
--
-- 4. PRICE DEFAULTS
--    If unit_price = 0 on INSERT, a BEFORE trigger fetches
--    buy_price (PO lines) or sell_price (SO lines) from products.
--    Explicit prices override the default.
--
-- 5. TAX RECALCULATION
--    A separate BEFORE UPDATE trigger on sales_orders recalculates
--    tax_amount and total whenever tax_pct is changed on the header.
--
-- 6. CUSTOMER TERMINOLOGY
--    "client" has been renamed to "customer" throughout:
--      customers table (was clients)
--      customer_id FK column (was client_id)
--      s_payments.customer_id (was client_id)
--
-- =============================================================
