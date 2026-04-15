-- ============================================================
-- StockOS — Performance Indexes + Realtime Publication
-- Migration: 003_indexes_realtime.sql
-- ============================================================

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists idx_products_category    on public.products(category);
create index if not exists idx_products_supplier    on public.products(supplier_id);
create index if not exists idx_products_active      on public.products(active) where active = true;
create index if not exists idx_movements_product    on public.movements(product_id);
create index if not exists idx_movements_created    on public.movements(created_at desc);
create index if not exists idx_purchase_orders_sup  on public.purchase_orders(supplier_id);
create index if not exists idx_purchase_orders_stat on public.purchase_orders(status);
create index if not exists idx_purchase_orders_upd  on public.purchase_orders(updated_at desc);
create index if not exists idx_sales_orders_client  on public.sales_orders(client_id);
create index if not exists idx_sales_orders_ec      on public.sales_orders(end_customer_id);
create index if not exists idx_sales_orders_status  on public.sales_orders(status);
create index if not exists idx_sales_orders_upd     on public.sales_orders(updated_at desc);
create index if not exists idx_s_payments_order     on public.s_payments(order_id);
create index if not exists idx_s_payments_client    on public.s_payments(client_id);
create index if not exists idx_p_payments_order     on public.p_payments(order_id);
create index if not exists idx_p_payments_supplier  on public.p_payments(supplier_id);
create index if not exists idx_audit_log_table      on public.audit_log(table_name, created_at desc);

-- ── Realtime publication ─────────────────────────────────────────────────────
-- Add all tables so the JS client can subscribe to changes
alter publication supabase_realtime add table public.categories;
alter publication supabase_realtime add table public.suppliers;
alter publication supabase_realtime add table public.clients;
alter publication supabase_realtime add table public.end_customers;
alter publication supabase_realtime add table public.products;
alter publication supabase_realtime add table public.movements;
alter publication supabase_realtime add table public.purchase_orders;
alter publication supabase_realtime add table public.sales_orders;
alter publication supabase_realtime add table public.s_payments;
alter publication supabase_realtime add table public.p_payments;
