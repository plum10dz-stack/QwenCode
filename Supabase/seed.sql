-- ============================================================
-- StockOS — Local development seed data
-- Run automatically by: supabase db reset
-- ============================================================

-- ── Create a demo admin user ─────────────────────────────────────────────────
-- In production, create users via Supabase Dashboard or Auth Admin API.
-- This seed is for local dev only.
insert into auth.users (
  id, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, role, aud
) values (
  gen_random_uuid(),
  'admin@stockos.local',
  crypt('admin1234', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"],"role":"admin"}'::jsonb,
  '{"full_name":"StockOS Admin"}'::jsonb,
  now(), now(), 'authenticated', 'authenticated'
) on conflict do nothing;

-- ── Categories ────────────────────────────────────────────────────────────────
insert into public.categories (id, name, abr, ref) values
  (gen_random_uuid(), 'Electronics',     'ELEC', 'CAT-001'),
  (gen_random_uuid(), 'Office Supplies', 'OFFC', 'CAT-002'),
  (gen_random_uuid(), 'Peripherals',     'PRPH', 'CAT-003'),
  (gen_random_uuid(), 'Networking',      'NET',  'CAT-004'),
  (gen_random_uuid(), 'Storage',         'STOR', 'CAT-005')
on conflict (name) do nothing;

-- ── Suppliers ─────────────────────────────────────────────────────────────────
insert into public.suppliers (id, name, contact, phone, email, address) values
  (gen_random_uuid(), 'TechDist Algérie',  'Karim Hadj',     '+213-21-234567', 'contact@techdist.dz', 'Alger Centre'),
  (gen_random_uuid(), 'Office Pro SARL',   'Amira Benali',   '+213-31-345678', 'amira@officepro.dz',  'Oran'),
  (gen_random_uuid(), 'NetSolutions DZ',   'Riad Boukhalfa', '+213-41-456789', 'riad@netsol.dz',      'Constantine');

-- ── Clients ───────────────────────────────────────────────────────────────────
insert into public.clients (id, full_name, phone, email, city, tax_id, is_active) values
  (gen_random_uuid(), 'Entreprise Sarl Meziane', '+213-550-111222', 'youcef@meziane.dz', 'Alger',       'NIF-12345', true),
  (gen_random_uuid(), 'Nadia Touati & Associés', '+213-661-333444', 'nadia@touati.dz',   'Oran',        'NIF-67890', true),
  (gen_random_uuid(), 'Riad Systems EURL',       '+213-770-555666', 'riad@riadsys.dz',   'Constantine', '',          true);

-- ── Products ──────────────────────────────────────────────────────────────────
insert into public.products (id, name, sku, category, unit, buy_price, sell_price, stock, low_stock, location, active)
select
  gen_random_uuid(), name, sku, category, unit, buy_price, sell_price, stock, low_stock, location, true
from (values
  ('Laptop HP ProBook 450', 'ELC-0001', 'Electronics',    'pcs', 85000, 98000,  12, 3,  'A-01-1'),
  ('Dell Monitor 24"',      'ELC-0002', 'Electronics',    'pcs', 42000, 52000,  8,  4,  'A-01-2'),
  ('Wireless Keyboard',     'PER-0001', 'Peripherals',    'pcs', 3500,  4500,   3,  10, 'B-02-1'),
  ('Cat6 Ethernet Cable',   'NET-0001', 'Networking',     'pcs', 800,   1200,   45, 20, 'C-03-1'),
  ('SSD 1TB Samsung 870',   'STO-0001', 'Storage',        'pcs', 22000, 28000,  14, 5,  'A-02-1')
) as v(name, sku, category, unit, buy_price, sell_price, stock, low_stock, location)
on conflict (sku) do nothing;
