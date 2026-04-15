-- ============================================================
-- StockOS — Database Schema
-- Migration: 001_schema.sql
-- Run with: supabase db push
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ── Helper: auto-set updated_at on every UPDATE ─────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Helper: record every mutation in the audit log ──────────────────────────
create or replace function public.audit_log_mutation()
returns trigger language plpgsql security definer as $$
begin
  insert into public.audit_log(table_name, operation, row_id, changed_by, payload)
  values (
    TG_TABLE_NAME,
    TG_OP,
    coalesce(new.id::text, old.id::text),
    auth.uid()::text,
    case TG_OP
      when 'DELETE' then row_to_json(old)
      else row_to_json(new)
    end
  );
  return coalesce(new, old);
end;
$$;

-- ── Audit log (written by trigger, never directly by users) ─────────────────
create table if not exists public.audit_log (
  id          bigserial primary key,
  table_name  text        not null,
  operation   text        not null,  -- INSERT | UPDATE | DELETE
  row_id      text        not null,
  changed_by  text,                  -- auth.uid() at time of change
  payload     jsonb,
  created_at  timestamptz not null default now()
);
comment on table public.audit_log is
  'Immutable audit trail. Written by database triggers only.';

-- ── Sync cursor: tracks the last event time per client session ───────────────
create table if not exists public.sync_cursors (
  user_id     uuid        primary key references auth.users(id) on delete cascade,
  last_sync   timestamptz not null default '1970-01-01T00:00:00Z',
  updated_at  timestamptz not null default now()
);

-- ── categories ───────────────────────────────────────────────────────────────
create table if not exists public.categories (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  abr        text        not null,
  ref        text        not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_unique unique (name)
);

-- ── suppliers ────────────────────────────────────────────────────────────────
create table if not exists public.suppliers (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  contact    text,
  phone      text,
  email      text,
  address    text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── clients ──────────────────────────────────────────────────────────────────
create table if not exists public.clients (
  id         uuid        primary key default gen_random_uuid(),
  full_name  text        not null,
  phone      text,
  email      text,
  city       text,
  tax_id     text,
  address    text,
  notes      text,
  is_active  boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── end_customers ─────────────────────────────────────────────────────────────
create table if not exists public.end_customers (
  id         uuid        primary key default gen_random_uuid(),
  full_name  text        not null,
  phone      text,
  email      text,
  city       text,
  tax_id     text,
  address    text,
  notes      text,
  is_active  boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── products ─────────────────────────────────────────────────────────────────
create table if not exists public.products (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null,
  sku           text        not null,
  category      text,
  unit          text        not null default 'pcs',
  supplier_id   uuid        references public.suppliers(id) on delete set null,
  buy_price     numeric(18,2) not null default 0 check (buy_price  >= 0),
  sell_price    numeric(18,2) not null default 0 check (sell_price >= 0),
  stock         integer       not null default 0  check (stock     >= 0),
  low_stock     integer       not null default 5  check (low_stock >= 0),
  location      text,
  description   text,
  active        boolean       not null default true,
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now(),
  constraint products_sku_unique unique (sku)
);

-- ── movements ────────────────────────────────────────────────────────────────
create table if not exists public.movements (
  id          uuid        primary key default gen_random_uuid(),
  product_id  uuid        not null references public.products(id)  on delete cascade,
  type        text        not null check (type in ('in','out','adjustment')),
  qty         integer     not null check (qty > 0),
  before      integer     not null default 0,
  after       integer     not null default 0,
  reason      text        not null,
  ref         text,
  created_at  timestamptz not null default now()
  -- movements are immutable: no updated_at
);

-- ── purchase_orders ──────────────────────────────────────────────────────────
create table if not exists public.purchase_orders (
  id            uuid        primary key default gen_random_uuid(),
  po_number     text        not null,
  por           text,
  supplier_id   uuid        references public.suppliers(id) on delete restrict,
  expected_date date,
  status        text        not null default 'draft'
                            check (status in ('draft','sent','confirmed','received','cancelled')),
  notes         text,
  lines         jsonb       not null default '[]'::jsonb,
  received_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint purchase_orders_po_number_unique unique (po_number)
);

-- ── sales_orders ─────────────────────────────────────────────────────────────
create table if not exists public.sales_orders (
  id               uuid        primary key default gen_random_uuid(),
  so_number        text        not null,
  client_id        uuid        references public.clients(id)       on delete restrict,
  end_customer_id  uuid        references public.end_customers(id) on delete set null,
  status           text        not null default 'draft'
                               check (status in ('draft','confirmed','processing','shipped','delivered','cancelled')),
  delivery_date    date,
  notes            text,
  lines            jsonb       not null default '[]'::jsonb,
  subtotal         numeric(18,2) not null default 0,
  tax_pct          numeric(5,2)  not null default 19,
  tax_amount       numeric(18,2) not null default 0,
  total            numeric(18,2) not null default 0,
  shipped_at       timestamptz,
  delivered_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint sales_orders_so_number_unique unique (so_number)
);

-- ── s_payments (sales payments) ──────────────────────────────────────────────
create table if not exists public.s_payments (
  id           uuid        primary key default gen_random_uuid(),
  date_created timestamptz not null default now(),
  date         date        not null default current_date,
  amount       numeric(18,2) not null check (amount > 0),
  client_id    uuid        references public.clients(id)      on delete restrict,
  order_id     uuid        references public.sales_orders(id) on delete restrict,
  notes        text
);

-- ── p_payments (purchase payments) ───────────────────────────────────────────
create table if not exists public.p_payments (
  id           uuid        primary key default gen_random_uuid(),
  date_created timestamptz not null default now(),
  date         date        not null default current_date,
  amount       numeric(18,2) not null check (amount > 0),
  supplier_id  uuid        references public.suppliers(id)       on delete restrict,
  order_id     uuid        references public.purchase_orders(id) on delete restrict,
  notes        text
);

-- ── updated_at triggers ───────────────────────────────────────────────────────
do $$ declare t text; begin
  foreach t in array array[
    'categories','suppliers','clients','end_customers',
    'products','purchase_orders','sales_orders','sync_cursors'
  ] loop
    execute format(
      'create trigger trg_%s_updated_at before update on public.%s
       for each row execute function public.set_updated_at()',
      t, t
    );
  end loop;
end $$;

-- ── audit triggers ────────────────────────────────────────────────────────────
do $$ declare t text; begin
  foreach t in array array[
    'categories','suppliers','clients','end_customers','products',
    'movements','purchase_orders','sales_orders','s_payments','p_payments'
  ] loop
    execute format(
      'create trigger trg_%s_audit after insert or update or delete on public.%s
       for each row execute function public.audit_log_mutation()',
      t, t
    );
  end loop;
end $$;
