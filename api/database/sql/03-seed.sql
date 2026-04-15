-- =============================================================================
-- SOS ERP — Test Seed Data  (database-seed.sql  v4)
-- Run AFTER database-init.sql.
-- Uses BIGINT IDs (OVERRIDING SYSTEM VALUE) to allow explicit IDs in tests.
-- Schema v4 changes reflected here:
--   • p_price / s_price on order lines are auto-set by fn_pol_set_line_defaults /
--     fn_sol_set_line_defaults (BEFORE INSERT trigger) — NOT specified in INSERTs.
--   • name on order lines is auto-set by the same trigger if left blank.
--   • SO lines accept negative qty (credit / return lines).
-- Strategy for seeding closed orders:
--   1. Temporarily reopen all closed (non-cancelled) orders.
--   2. Insert all lines (triggers set name, p_price, s_price automatically).
--   3. Close orders → fires recalc triggers which stamp subtotal/tax/total.
-- =============================================================================
-- Record counts:
--   users            16
--   categories       12
--   suppliers        15
--   customers        25
--   end_customers    20
--   products         80  (+50 stock movements)
--   purchase_orders  20  (15 closed / 5 open)
--   purchase_order_lines  53
--   sales_orders     30  (25 closed / 5 open)
--   sales_order_lines     90
--   s_payments       40
--   p_payments       30
--   TOTAL           ~451 business rows (+50 movements = ~501)
-- =============================================================================

BEGIN;

-- =============================================================================
-- USERS  (16 rows, ids 1-16)
-- =============================================================================
INSERT INTO users (id, name, pwd, cid, role, email, mobile, blocked, created_at, updated_at)
OVERRIDING SYSTEM VALUE VALUES
  (1,  'admin',    'md5:adm1n', NULL, 'admin',    'admin@sos.local',   '+213550000001', FALSE,1700000000000,1700000000000),
  (2,  'karim_e',  'md5:kar1m', NULL, 'employee', 'karim@sos.local',   '+213550000002', FALSE,1700100000000,1700100000000),
  (3,  'sara_e',   'md5:sara',  NULL, 'employee', 'sara@sos.local',    '+213550000003', FALSE,1700200000000,1700200000000),
  (4,  'youcef_e', 'md5:youc',  NULL, 'employee', 'youcef@sos.local',  '+213550000004', FALSE,1700300000000,1700300000000),
  (5,  'nadia_e',  'md5:nadi',  NULL, 'employee', 'nadia@sos.local',   '+213550000005', FALSE,1700400000000,1700400000000),
  (6,  'riad_e',   'md5:riad',  NULL, 'employee', 'riad@sos.local',    '+213550000006', FALSE,1700500000000,1700500000000),
  (7,  'ali_c',    'md5:ali_c', 1,    'customer', 'ali@client.dz',     '+213660000001', FALSE,1700600000000,1700600000000),
  (8,  'fatima_c', 'md5:fat_c', 2,    'customer', 'fatima@client.dz',  '+213660000002', FALSE,1700700000000,1700700000000),
  (9,  'omar_c',   'md5:oma_c', 3,    'customer', 'omar@client.dz',    '+213660000003', FALSE,1700800000000,1700800000000),
  (10, 'hana_c',   'md5:han_c', 4,    'customer', 'hana@client.dz',    '+213660000004', FALSE,1700900000000,1700900000000),
  (11, 'malik_c',  'md5:mal_c', 5,    'customer', 'malik@client.dz',   '+213660000005', FALSE,1701000000000,1701000000000),
  (12, 'amel_c',   'md5:ame_c', 6,    'customer', 'amel@client.dz',    '+213660000006', FALSE,1701100000000,1701100000000),
  (13, 'bilal_c',  'md5:bil_c', 7,    'customer', 'bilal@client.dz',   '+213660000007', FALSE,1701200000000,1701200000000),
  (14, 'yasmine_c','md5:yas_c', 8,    'customer', 'yasmine@client.dz', '+213660000008', FALSE,1701300000000,1701300000000),
  (15, 'hamza_c',  'md5:ham_c', 9,    'customer', 'hamza@client.dz',   '+213660000009', FALSE,1701400000000,1701400000000),
  (16, 'lyna_c',   'md5:lyn_c', 10,   'customer', 'lyna@client.dz',    '+213660000010', FALSE,1701500000000,1701500000000)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- CATEGORIES  (12 rows, ids 1-12)
-- =============================================================================
INSERT INTO categories (id, name, abr, ref, created_at, updated_at)
OVERRIDING SYSTEM VALUE VALUES
  (1,  'Electronics',       'ELE','REF-ELE',1700000000000,1700000000000),
  (2,  'Office Supplies',   'OFS','REF-OFS',1700000000000,1700000000000),
  (3,  'Furniture',         'FRN','REF-FRN',1700000000000,1700000000000),
  (4,  'Networking',        'NET','REF-NET',1700000000000,1700000000000),
  (5,  'Software Licenses', 'SWL','REF-SWL',1700000000000,1700000000000),
  (6,  'Printing',          'PRT','REF-PRT',1700000000000,1700000000000),
  (7,  'Storage Media',     'STM','REF-STM',1700000000000,1700000000000),
  (8,  'Power & UPS',       'PWR','REF-PWR',1700000000000,1700000000000),
  (9,  'Cables & Adapters', 'CAB','REF-CAB',1700000000000,1700000000000),
  (10, 'Security',          'SEC','REF-SEC',1700000000000,1700000000000),
  (11, 'Consumables',       'CNS','REF-CNS',1700000000000,1700000000000),
  (12, 'Miscellaneous',     'MSC','REF-MSC',1700000000000,1700000000000)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- SUPPLIERS  (15 rows, ids 1-15)
-- =============================================================================
INSERT INTO suppliers (id, name, contact, phone, email, address, notes, is_active, created_at, updated_at)
OVERRIDING SYSTEM VALUE VALUES
  (1,  'TechVision DZ',   'Ahmed Bensalem',  '+213550111001','techvision@dz.com','12 Rue Didouche, Alger',          'Preferred IT supplier',        TRUE, 1700000000000,1700000000000),
  (2,  'GlobalNet SARL',  'Fares Laib',      '+213550111002','globalnet@dz.com', '5 Bd Amirouche, Oran',            'Networking equipment',         TRUE, 1700050000000,1700050000000),
  (3,  'OfficeMax Alger', 'Samira Kadi',     '+213550111003','offmax@dz.com',    '88 Rue Larbi Ben Mhidi, Alger',   'Office supplies',              TRUE, 1700100000000,1700100000000),
  (4,  'PowerPlus SPA',   'Djamel Rezki',    '+213550111004','powplus@dz.com',   '22 Zone Industrielle, Annaba',    'UPS & power solutions',        TRUE, 1700150000000,1700150000000),
  (5,  'PrintWorld',      'Linda Meziane',   '+213550111005','printworld@dz.com','14 Cité Mer-et-Soleil, Skikda',   'Printers & cartridges',        TRUE, 1700200000000,1700200000000),
  (6,  'MediaStore DZ',   'Kamel Hadj',      '+213550111006','media@dz.com',     '3 Rue de la Paix, Constantine',   'Storage media',                TRUE, 1700250000000,1700250000000),
  (7,  'SecureNet',       'Rania Bouali',    '+213550111007','securenet@dz.com', '77 Bd Krim Belkacem, Alger',      'CCTV & access control',        TRUE, 1700300000000,1700300000000),
  (8,  'FurniPro',        'Yacine Cheikh',   '+213550111008','furnipro@dz.com',  '9 Lotissement Beau Rivage',       'Office furniture',             TRUE, 1700350000000,1700350000000),
  (9,  'SoftDist',        'Meriem Hamdi',    '+213550111009','softdist@dz.com',  '60 Rue Hassiba Ben Bouali',       'Software & licenses',          TRUE, 1700400000000,1700400000000),
  (10, 'CableLine',       'Rafik Oussad',    '+213550111010','cableline@dz.com', '2 Zone Portuaire, Bejaia',        'Cables, connectors, adapters', TRUE, 1700450000000,1700450000000),
  (11, 'ConsumePlus',     'Sihem Guettaf',   '+213550111011','consplus@dz.com',  '11 Rue Arezki Berkani, Taizi',    'Toners, paper, labels',        TRUE, 1700500000000,1700500000000),
  (12, 'AlgerTech',       'Nassim Bouri',    '+213550111012','algertech@dz.com', '45 Bd Mohamed V, Alger',          'General tech hardware',        TRUE, 1700550000000,1700550000000),
  (13, 'OranSup',         'Wassila Fergani', '+213550111013','oransup@dz.com',   '30 Cité Boulanger, Oran',         'Local western reseller',       TRUE, 1700600000000,1700600000000),
  (14, 'ImportPro',       'Amine Beldj',     '+213550111014','importpro@dz.com', '1 Rue Ibn Rochd, Blida',          'Import & customs specialist',  TRUE, 1700650000000,1700650000000),
  (15, 'BackupServices',  'Cylia Hamdi',     '+213550111015','bkpserv@dz.com',   '3 Bd Indépendance, Sétif',        'Backup media & NAS',           FALSE,1700700000000,1700700000000)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- CUSTOMERS  (25 rows, ids 1-25)
-- =============================================================================
INSERT INTO customers (id, full_name, phone, email, city, tax_id, address, is_active, created_at, updated_at)
OVERRIDING SYSTEM VALUE VALUES
  (1,  'Sonatrach DSI',       '+213550200001','dsi@sonatrach.dz',   'Alger',       'TAX-SN001','Tour A, Haï Yacef, Alger',          TRUE, 1700010000000,1700010000000),
  (2,  'Mobilis Entreprise',  '+213550200002','achats@mobilis.dz',  'Alger',       'TAX-MB002','Rue Kaddour Rahim, Hussein Dey',     TRUE, 1700020000000,1700020000000),
  (3,  'Cevital Group',       '+213550200003','it@cevital.com',     'Bejaia',      'TAX-CV003','Zone Industrielle Béjaïa',          TRUE, 1700030000000,1700030000000),
  (4,  'Air Algérie IT',      '+213550200004','it@airalgerie.dz',   'Alger',       'TAX-AA004','Aéroport Houari Boumediene',         TRUE, 1700040000000,1700040000000),
  (5,  'BNA Direction',       '+213550200005','dsi@bna.dz',         'Alger',       'TAX-BN005','8 Bd Colonel Amirouche, Alger',      TRUE, 1700050000000,1700050000000),
  (6,  'EPE Ishor',           '+213550200006','info@ishor.dz',      'Oran',        'TAX-IS006','Bd Miloud Brahimi, Oran',            TRUE, 1700060000000,1700060000000),
  (7,  'SEAAL Alger',         '+213550200007','dsi@seaal.dz',       'Alger',       'TAX-SE007','Route de l Université, Bir Mourad', TRUE, 1700070000000,1700070000000),
  (8,  'Groupe Hasnaoui',     '+213550200008','achat@hasnaoui.dz',  'Sidi Bel Abbès','TAX-HN008','Sidi Bel Abbès Centre',          TRUE, 1700080000000,1700080000000),
  (9,  'CRMA Direction',      '+213550200009','dsi@crma.dz',        'Alger',       'TAX-CR009','5 Rue Belouizdad, Alger',            TRUE, 1700090000000,1700090000000),
  (10, 'Hyundai Algérie',     '+213550200010','achats@hyundai.dz',  'Alger',       'TAX-HY010','Zone Activité Rouiba',               TRUE, 1700100000000,1700100000000),
  (11, 'Total Energies DZ',   '+213550200011','it@total.dz',        'Alger',       'TAX-TE011','Pins Maritimes, Alger',              TRUE, 1700110000000,1700110000000),
  (12, 'Saidal Pharma',       '+213550200012','dsi@saidal.dz',      'Alger',       'TAX-SD012','Route de Médéa, Dar El Beida',       TRUE, 1700120000000,1700120000000),
  (13, 'Ecole Nat Polytechn', '+213550200013','achat@enp.dz',       'Alger',       'TAX-EP013','10 Avenue Pasteur, El-Harrach',      TRUE, 1700130000000,1700130000000),
  (14, 'AXA Assurances DZ',   '+213550200014','it@axa.dz',          'Alger',       'TAX-AX014','Rue Mohamed Belouizdad, Alger',      TRUE, 1700140000000,1700140000000),
  (15, 'Ooredoo Algérie',     '+213550200015','it@ooredoo.dz',      'Alger',       'TAX-OR015','Face gendarmerie, Chéraga',          TRUE, 1700150000000,1700150000000),
  (16, 'Condor Electronics',  '+213550200016','achats@condor.dz',   'Bordj Bou',   'TAX-CO016','ZI Bordj Bou Arreridj',              TRUE, 1700160000000,1700160000000),
  (17, 'Algérie Télécom',     '+213550200017','dsi@algertel.dz',    'Alger',       'TAX-AT017','Place Port Saïd, Alger',             TRUE, 1700170000000,1700170000000),
  (18, 'BADR Bank DSI',       '+213550200018','it@badrdz.dz',       'Alger',       'TAX-BD018','Blvd Colonel Amirouche',             TRUE, 1700180000000,1700180000000),
  (19, 'SNVI Constantine',    '+213550200019','dsi@snvi.dz',         'Constantine', 'TAX-SV019','ZI El Khroub, Constantine',          TRUE, 1700190000000,1700190000000),
  (20, 'Biopharm DZ',         '+213550200020','achats@biopharm.dz', 'Alger',       'TAX-BP020','Dar El Beida Industrial Area',       TRUE, 1700200000000,1700200000000),
  (21, 'Naftal SPA',          '+213550200021','dsi@naftal.dz',       'Alger',       'TAX-NF021','Djenane El Malik, Hydra',            TRUE, 1700210000000,1700210000000),
  (22, 'Nexans Algérie',      '+213550200022','it@nexans.dz',        'Annaba',      'TAX-NX022','Zone Portuaire Annaba',              TRUE, 1700220000000,1700220000000),
  (23, 'Renault DZ',          '+213550200023','achats@renault.dz',  'Oran',        'TAX-RN023','Oued Tlélat, Oran',                  TRUE, 1700230000000,1700230000000),
  (24, 'El Mouhafadh EURL',   '+213550200024','contact@elmouh.dz',  'Tlemcen',     'TAX-EM024','Rue Ibn Khaldoun, Tlemcen',          TRUE, 1700240000000,1700240000000),
  (25, 'MedPlus Clinic',      '+213550200025','it@medplus.dz',       'Setif',       'TAX-MP025','Cité ZHUN Est, Sétif',               TRUE, 1700250000000,1700250000000)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- END_CUSTOMERS  (20 rows, ids 1-20)
-- =============================================================================
INSERT INTO end_customers (id, full_name, phone, email, city, is_active, created_at, updated_at)
OVERRIDING SYSTEM VALUE VALUES
  (1,  'Rachid Benali',    '+213770300001','rachid.benali@gmail.com',   'Alger',       TRUE, 1700010000000,1700010000000),
  (2,  'Salima Oukir',     '+213770300002','salima.oukir@yahoo.fr',     'Oran',        TRUE, 1700020000000,1700020000000),
  (3,  'Mourad Tizi',      '+213770300003','mourad.tizi@hotmail.com',   'Constantine', TRUE, 1700030000000,1700030000000),
  (4,  'Houda Serraj',     '+213770300004','houda.serraj@gmail.com',    'Annaba',      TRUE, 1700040000000,1700040000000),
  (5,  'Abdelaziz Fareh',  '+213770300005','afareh@gmail.com',          'Bejaia',      TRUE, 1700050000000,1700050000000),
  (6,  'Nassim Rouibah',   '+213770300006','nassim_r@gmail.com',        'Alger',       TRUE, 1700060000000,1700060000000),
  (7,  'Zineb Zaidi',      '+213770300007','zineb.zaidi@email.com',     'Blida',       TRUE, 1700070000000,1700070000000),
  (8,  'Tarek Benahmed',   '+213770300008','tarek.b@gmail.com',         'Setif',       TRUE, 1700080000000,1700080000000),
  (9,  'Imane Chaoui',     '+213770300009','imane.chaoui@web.dz',       'Tizi Ouzou',  TRUE, 1700090000000,1700090000000),
  (10, 'Lotfi Saidani',    '+213770300010','lotfi.saidani@gmail.com',   'Alger',       TRUE, 1700100000000,1700100000000),
  (11, 'Djouher Mansouri', '+213770300011','djouher.m@yahoo.fr',        'Tlemcen',     TRUE, 1700110000000,1700110000000),
  (12, 'Sofiane Azzoug',   '+213770300012','sazzoug@gmail.com',         'Alger',       TRUE, 1700120000000,1700120000000),
  (13, 'Amira Loucif',     '+213770300013','amira.loucif@gmail.com',    'Oran',        TRUE, 1700130000000,1700130000000),
  (14, 'Hichem Boudali',   '+213770300014','hichem.boudali@email.com',  'Constantine', TRUE, 1700140000000,1700140000000),
  (15, 'Lylia Berber',     '+213770300015','lylia.berber@hotmail.fr',   'Alger',       TRUE, 1700150000000,1700150000000),
  (16, 'Walid Hamoudi',    '+213770300016','walid.h@gmail.com',         'Biskra',      TRUE, 1700160000000,1700160000000),
  (17, 'Rima Hamidouche',  '+213770300017','rima.h@yahoo.fr',           'Alger',       TRUE, 1700170000000,1700170000000),
  (18, 'Samir Boulahrouf', '+213770300018','samir.b@gmail.com',         'Jijel',       TRUE, 1700180000000,1700180000000),
  (19, 'Meriem Chekifi',   '+213770300019','meriem.c@email.com',        'Alger',       TRUE, 1700190000000,1700190000000),
  (20, 'Abdelhak Benoud',  '+213770300020','abdelhak.b@gmail.com',      'Medea',       FALSE,1700200000000,1700200000000)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- PRODUCTS  (80 rows, ids 1-80)
-- stock=0 initially; loaded by the movement block below.
-- =============================================================================
INSERT INTO products
  (id, name, sku, category_id, unit, supplier_id,
   buy_price, sell_price, stock, total_in, total_out, amount_in, amount_out,
   low_stock, active, deleted, created_at, updated_at)
OVERRIDING SYSTEM VALUE VALUES
-- Electronics (20)
  (1, 'Laptop HP ProBook 450',     'SKU-ELE-001',1,'unit',1,  85000,110000,0,0,0,0,0,  3,TRUE,FALSE,1700000000000,1700000000000),
  (2, 'Laptop Dell Latitude 5420', 'SKU-ELE-002',1,'unit',1,  92000,120000,0,0,0,0,0,  2,TRUE,FALSE,1700000000000,1700000000000),
  (3, 'Laptop Lenovo ThinkPad E15','SKU-ELE-003',1,'unit',12, 80000,105000,0,0,0,0,0,  3,TRUE,FALSE,1700000000000,1700000000000),
  (4, 'Desktop PC Core i5',        'SKU-ELE-004',1,'unit',1,  45000, 58000,0,0,0,0,0,  5,TRUE,FALSE,1700000000000,1700000000000),
  (5, 'Desktop PC Core i7',        'SKU-ELE-005',1,'unit',1,  62000, 80000,0,0,0,0,0,  3,TRUE,FALSE,1700000000000,1700000000000),
  (6, 'Monitor 24" FHD IPS',       'SKU-ELE-006',1,'unit',12, 22000, 29000,0,0,0,0,0,  4,TRUE,FALSE,1700000000000,1700000000000),
  (7, 'Monitor 27" QHD',           'SKU-ELE-007',1,'unit',12, 32000, 42000,0,0,0,0,0,  3,TRUE,FALSE,1700000000000,1700000000000),
  (8, 'Keyboard + Mouse Combo',    'SKU-ELE-008',1,'set', 1,   1800,  2800,0,0,0,0,0, 10,TRUE,FALSE,1700000000000,1700000000000),
  (9, 'Webcam 1080p',              'SKU-ELE-009',1,'unit',12,  3500,  5200,0,0,0,0,0,  5,TRUE,FALSE,1700000000000,1700000000000),
  (10,'Headset USB Office',         'SKU-ELE-010',1,'unit',12,  2200,  3500,0,0,0,0,0,  5,TRUE,FALSE,1700000000000,1700000000000),
  (11,'Tablet Android 10"',         'SKU-ELE-011',1,'unit',12, 18000, 24000,0,0,0,0,0,  3,TRUE,FALSE,1700000000000,1700000000000),
  (12,'Barcode Scanner USB',        'SKU-ELE-012',1,'unit',1,   5500,  8000,0,0,0,0,0,  3,TRUE,FALSE,1700000000000,1700000000000),
  (13,'RAM DDR4 8GB',               'SKU-ELE-013',1,'unit',12,  4500,  6500,0,0,0,0,0, 10,TRUE,FALSE,1700000000000,1700000000000),
  (14,'RAM DDR4 16GB',              'SKU-ELE-014',1,'unit',12,  8000, 11500,0,0,0,0,0,  5,TRUE,FALSE,1700000000000,1700000000000),
  (15,'SSD 256GB SATA',             'SKU-ELE-015',1,'unit',12,  5500,  7800,0,0,0,0,0,  5,TRUE,FALSE,1700000000000,1700000000000),
  (16,'SSD 512GB NVMe',             'SKU-ELE-016',1,'unit',12,  9000, 13000,0,0,0,0,0,  5,TRUE,FALSE,1700000000000,1700000000000),
  (17,'HDD 1TB External',           'SKU-ELE-017',1,'unit',6,   7500, 10500,0,0,0,0,0,  5,TRUE,FALSE,1700000000000,1700000000000),
  (18,'USB Flash 64GB',             'SKU-ELE-018',1,'unit',6,    900,  1700,0,0,0,0,0, 20,TRUE,FALSE,1700000000000,1700000000000),
  (19,'Projector WXGA 3200L',       'SKU-ELE-019',1,'unit',1,  38000, 52000,0,0,0,0,0,  2,TRUE,FALSE,1700000000000,1700000000000),
  (20,'Smart TV 55" 4K',            'SKU-ELE-020',1,'unit',12, 55000, 72000,0,0,0,0,0,  2,TRUE,FALSE,1700000000000,1700000000000),
-- Networking (10)
  (21,'Switch 24-Port Managed',     'SKU-NET-001',4,'unit',2,  18000, 25000,0,0,0,0,0,  2,TRUE,FALSE,1700000000000,1700000000000),
  (22,'Router WiFi 6 AX1800',       'SKU-NET-002',4,'unit',2,   8500, 12000,0,0,0,0,0,  3,TRUE,FALSE,1700000000000,1700000000000),
  (23,'Access Point PoE',           'SKU-NET-003',4,'unit',2,   9500, 13500,0,0,0,0,0,  3,TRUE,FALSE,1700000000000,1700000000000),
  (24,'Firewall UTM SMB',           'SKU-NET-004',4,'unit',2,  32000, 45000,0,0,0,0,0,  2,TRUE,FALSE,1700000000000,1700000000000),
  (25,'NAS 2-Bay',                  'SKU-NET-005',4,'unit',15, 25000, 35000,0,0,0,0,0,  2,TRUE,FALSE,1700000000000,1700000000000),
  (26,'Patch Panel 24P Cat6',       'SKU-NET-006',4,'unit',2,   3200,  5000,0,0,0,0,0,  5,TRUE,FALSE,1700000000000,1700000000000),
  (27,'Rack Cabinet 12U',           'SKU-NET-007',4,'unit',2,  12000, 17000,0,0,0,0,0,  2,TRUE,FALSE,1700000000000,1700000000000),
  (28,'SFP Module 1G LC',           'SKU-NET-008',4,'unit',2,   1500,  2500,0,0,0,0,0,  5,TRUE,FALSE,1700000000000,1700000000000),
  (29,'IP Camera 4MP PoE',          'SKU-SEC-001',10,'unit',7,  8000, 12000,0,0,0,0,0,  4,TRUE,FALSE,1700000000000,1700000000000),
  (30,'NVR 8 Channel',              'SKU-SEC-002',10,'unit',7, 15000, 21000,0,0,0,0,0,  2,TRUE,FALSE,1700000000000,1700000000000),
-- Power (8)
  (31,'UPS 1KVA Line Int',          'SKU-PWR-001',8,'unit',4,  14000, 19000,0,0,0,0,0,  3,TRUE,FALSE,1700000000000,1700000000000),
  (32,'UPS 2KVA Online',            'SKU-PWR-002',8,'unit',4,  28000, 38000,0,0,0,0,0,  2,TRUE,FALSE,1700000000000,1700000000000),
  (33,'UPS 3KVA Online',            'SKU-PWR-003',8,'unit',4,  42000, 57000,0,0,0,0,0,  2,TRUE,FALSE,1700000000000,1700000000000),
  (34,'Surge Protector 8P',         'SKU-PWR-004',8,'unit',4,   1200,  2000,0,0,0,0,0, 10,TRUE,FALSE,1700000000000,1700000000000),
  (35,'Generator 5KVA Diesel',      'SKU-PWR-005',8,'unit',4,  95000,130000,0,0,0,0,0,  1,TRUE,FALSE,1700000000000,1700000000000),
  (36,'PDU Rack 8 Outlets',         'SKU-PWR-006',8,'unit',4,   4500,  7000,0,0,0,0,0,  3,TRUE,FALSE,1700000000000,1700000000000),
  (37,'Extension Cable 3m',         'SKU-PWR-007',8,'unit',4,    600,  1100,0,0,0,0,0, 20,TRUE,FALSE,1700000000000,1700000000000),
  (38,'UPS Battery 12V 7Ah',        'SKU-PWR-008',8,'unit',4,   1800,  2800,0,0,0,0,0, 10,TRUE,FALSE,1700000000000,1700000000000),
-- Printing (8)
  (39,'Printer LaserJet Mono A4',   'SKU-PRT-001',6,'unit',5,  22000, 30000,0,0,0,0,0,  2,TRUE,FALSE,1700000000000,1700000000000),
  (40,'Printer Color Laser A4',     'SKU-PRT-002',6,'unit',5,  35000, 47000,0,0,0,0,0,  2,TRUE,FALSE,1700000000000,1700000000000),
  (41,'Printer Inkjet A3',          'SKU-PRT-003',6,'unit',5,  18000, 25000,0,0,0,0,0,  2,TRUE,FALSE,1700000000000,1700000000000),
  (42,'Multifunction Printer Laser','SKU-PRT-004',6,'unit',5,  42000, 55000,0,0,0,0,0,  2,TRUE,FALSE,1700000000000,1700000000000),
  (43,'Toner HP 85A',               'SKU-PRT-005',6,'unit',11,  3200,  5000,0,0,0,0,0, 10,TRUE,FALSE,1700000000000,1700000000000),
  (44,'Toner Canon CRG-052',        'SKU-PRT-006',6,'unit',11,  2800,  4500,0,0,0,0,0, 10,TRUE,FALSE,1700000000000,1700000000000),
  (45,'Paper A4 80g 500 sheets',    'SKU-PRT-007',6,'ream',11,   450,   700,0,0,0,0,0, 50,TRUE,FALSE,1700000000000,1700000000000),
  (46,'Label Sticker A4 Sheet',     'SKU-PRT-008',6,'pack',11,   350,   600,0,0,0,0,0, 20,TRUE,FALSE,1700000000000,1700000000000),
-- Cables (8)
  (47,'Cable Cat6 305m Roll',       'SKU-CAB-001',9,'roll',10,  8500, 12000,0,0,0,0,0,  5,TRUE,FALSE,1700000000000,1700000000000),
  (48,'Patch Cable Cat6 1m',        'SKU-CAB-002',9,'unit',10,   120,   200,0,0,0,0,0, 50,TRUE,FALSE,1700000000000,1700000000000),
  (49,'Patch Cable Cat6 3m',        'SKU-CAB-003',9,'unit',10,   180,   300,0,0,0,0,0, 50,TRUE,FALSE,1700000000000,1700000000000),
  (50,'HDMI Cable 2m',              'SKU-CAB-004',9,'unit',10,   350,   600,0,0,0,0,0, 20,TRUE,FALSE,1700000000000,1700000000000),
  (51,'USB-C to USB-A Cable 1m',    'SKU-CAB-005',9,'unit',10,   200,   380,0,0,0,0,0, 30,TRUE,FALSE,1700000000000,1700000000000),
  (52,'VGA Cable 3m',               'SKU-CAB-006',9,'unit',10,   250,   450,0,0,0,0,0, 15,TRUE,FALSE,1700000000000,1700000000000),
  (53,'DP to HDMI Adapter',         'SKU-CAB-007',9,'unit',10,   400,   700,0,0,0,0,0, 10,TRUE,FALSE,1700000000000,1700000000000),
  (54,'Fiber Patch LC-LC 5m',       'SKU-CAB-008',9,'unit',10,   650,  1100,0,0,0,0,0, 10,TRUE,FALSE,1700000000000,1700000000000),
-- Office Supplies (8)
  (55,'Office Chair Ergonomic',     'SKU-OFS-001',2,'unit',3,  12000, 17000,0,0,0,0,0,  3,TRUE,FALSE,1700000000000,1700000000000),
  (56,'Desk L-Shape 160cm',         'SKU-FRN-001',3,'unit',8,  25000, 34000,0,0,0,0,0,  2,TRUE,FALSE,1700000000000,1700000000000),
  (57,'Whiteboard 120x90',          'SKU-OFS-002',2,'unit',3,   3500,  5500,0,0,0,0,0,  3,TRUE,FALSE,1700000000000,1700000000000),
  (58,'Filing Cabinet 4-Drawer',    'SKU-FRN-002',3,'unit',8,  14000, 19000,0,0,0,0,0,  2,TRUE,FALSE,1700000000000,1700000000000),
  (59,'Stapler Heavy Duty',         'SKU-OFS-003',2,'unit',3,    650,  1100,0,0,0,0,0, 10,TRUE,FALSE,1700000000000,1700000000000),
  (60,'Whiteboard Marker Set 10',   'SKU-OFS-004',2,'set', 3,    400,   700,0,0,0,0,0, 20,TRUE,FALSE,1700000000000,1700000000000),
  (61,'Pen Ballpoint Box 50',       'SKU-OFS-005',2,'box', 3,    500,   850,0,0,0,0,0, 20,TRUE,FALSE,1700000000000,1700000000000),
  (62,'Notebook A4 80p',            'SKU-OFS-006',2,'unit',3,    180,   320,0,0,0,0,0, 50,TRUE,FALSE,1700000000000,1700000000000),
-- Software (6)
  (63,'MS Office 365 1Y 1U',        'SKU-SWL-001',5,'lic', 9,  12000, 16000,0,0,0,0,0,  5,TRUE,FALSE,1700000000000,1700000000000),
  (64,'Windows 11 Pro OEM',         'SKU-SWL-002',5,'lic', 9,   9000, 13000,0,0,0,0,0,  5,TRUE,FALSE,1700000000000,1700000000000),
  (65,'Antivirus Kaspersky 1Y',     'SKU-SWL-003',5,'lic', 9,   3500,  5500,0,0,0,0,0, 10,TRUE,FALSE,1700000000000,1700000000000),
  (66,'AutoCAD LT 1Y',              'SKU-SWL-004',5,'lic', 9,  45000, 60000,0,0,0,0,0,  2,TRUE,FALSE,1700000000000,1700000000000),
  (67,'Adobe Acrobat Pro 1Y',       'SKU-SWL-005',5,'lic', 9,  15000, 20000,0,0,0,0,0,  3,TRUE,FALSE,1700000000000,1700000000000),
  (68,'Backup Software Veeam',      'SKU-SWL-006',5,'lic', 9,  28000, 38000,0,0,0,0,0,  2,TRUE,FALSE,1700000000000,1700000000000),
-- Storage (4)
  (69,'HDD 4TB NAS Grade',          'SKU-STM-001',7,'unit',6,  14000, 19000,0,0,0,0,0,  5,TRUE,FALSE,1700000000000,1700000000000),
  (70,'HDD 8TB NAS Grade',          'SKU-STM-002',7,'unit',6,  22000, 30000,0,0,0,0,0,  4,TRUE,FALSE,1700000000000,1700000000000),
  (71,'Memory Card 128GB UHS-I',    'SKU-STM-003',7,'unit',6,   1500,  2500,0,0,0,0,0, 20,TRUE,FALSE,1700000000000,1700000000000),
  (72,'LTO Tape 6TB',               'SKU-STM-004',7,'unit',6,   4500,  7000,0,0,0,0,0, 10,TRUE,FALSE,1700000000000,1700000000000),
-- Consumables / Misc (8)
  (73,'Thermal Paste 4g',           'SKU-CNS-001',11,'unit',11,  200,   400,0,0,0,0,0, 20,TRUE,FALSE,1700000000000,1700000000000),
  (74,'Cable Ties 100pk',           'SKU-CNS-002',11,'pack',11,  150,   280,0,0,0,0,0, 30,TRUE,FALSE,1700000000000,1700000000000),
  (75,'Compressed Air Can 400ml',   'SKU-CNS-003',11,'unit',11,  300,   550,0,0,0,0,0, 20,TRUE,FALSE,1700000000000,1700000000000),
  (76,'Cleaning Wipes 100pk',       'SKU-CNS-004',11,'pack',11,  180,   350,0,0,0,0,0, 20,TRUE,FALSE,1700000000000,1700000000000),
  (77,'Anti-static Bag 30x40cm',    'SKU-CNS-005',11,'pack',11,  300,   550,0,0,0,0,0, 15,TRUE,FALSE,1700000000000,1700000000000),
  (78,'Velcro Cable Organizer',     'SKU-CNS-006',11,'pack',11,  250,   450,0,0,0,0,0, 20,TRUE,FALSE,1700000000000,1700000000000),
  (79,'Label Printer Dymo',         'SKU-MSC-001',12,'unit',3,  7500, 11000,0,0,0,0,0,  3,TRUE,FALSE,1700000000000,1700000000000),
  (80,'Dymo Label Roll 450 pcs',    'SKU-MSC-002',12,'roll',3,   650,  1100,0,0,0,0,0, 15,TRUE,FALSE,1700000000000,1700000000000)
ON CONFLICT (id) DO NOTHING;

-- Reset sequences to the correct next values
SELECT setval(pg_get_serial_sequence('users','id'),        (SELECT MAX(id) FROM users));
SELECT setval(pg_get_serial_sequence('categories','id'),   (SELECT MAX(id) FROM categories));
SELECT setval(pg_get_serial_sequence('suppliers','id'),    (SELECT MAX(id) FROM suppliers));
SELECT setval(pg_get_serial_sequence('customers','id'),    (SELECT MAX(id) FROM customers));
SELECT setval(pg_get_serial_sequence('end_customers','id'),(SELECT MAX(id) FROM end_customers));
SELECT setval(pg_get_serial_sequence('products','id'),     (SELECT MAX(id) FROM products));

-- =============================================================================
-- MOVEMENTS — Initial stock loading (50 products)
-- =============================================================================
DO $$
DECLARE
  v_now  BIGINT := 1700010000000;
  v_pid  BIGINT;
  v_qty  NUMERIC(18,4);
  v_cur  NUMERIC(18,4);
  v_items BIGINT[][] := ARRAY[
    ARRAY[1,20],ARRAY[2,15],ARRAY[3,18],ARRAY[4,30],ARRAY[5,20],
    ARRAY[6,40],ARRAY[7,25],ARRAY[8,80],ARRAY[9,50],ARRAY[10,45],
    ARRAY[11,22],ARRAY[12,30],ARRAY[13,100],ARRAY[14,60],ARRAY[15,75],
    ARRAY[16,50],ARRAY[17,40],ARRAY[18,200],ARRAY[19,8],ARRAY[20,10],
    ARRAY[21,12],ARRAY[22,25],ARRAY[23,20],ARRAY[24,8],ARRAY[25,6],
    ARRAY[26,30],ARRAY[27,10],ARRAY[28,50],ARRAY[29,35],ARRAY[30,10],
    ARRAY[31,15],ARRAY[32,8],ARRAY[33,5],ARRAY[34,100],ARRAY[39,10],
    ARRAY[40,6],ARRAY[43,200],ARRAY[44,200],ARRAY[45,500],ARRAY[47,20],
    ARRAY[48,500],ARRAY[49,400],ARRAY[50,150],ARRAY[55,25],ARRAY[63,30],
    ARRAY[64,40],ARRAY[65,50],ARRAY[69,20],ARRAY[73,150],ARRAY[74,120]
  ];
  v_item BIGINT[];
BEGIN
  FOREACH v_item SLICE 1 IN ARRAY v_items LOOP
    v_pid := v_item[1];
    v_qty := v_item[2];
    SELECT stock INTO v_cur FROM products WHERE id = v_pid;
    INSERT INTO movements (product_id, type, qty, before, after, reason, ref, created_at)
    VALUES (v_pid, 'in', v_qty, v_cur, v_cur + v_qty, 'Initial stock load', 'SEED', v_now);
    v_now := v_now + 1000;
  END LOOP;
END;
$$;

-- =============================================================================
-- PURCHASE ORDERS  (20 rows: ids 1-20)
-- =============================================================================
INSERT INTO purchase_orders
  (id, po_number, por, supplier_id, expected_date, status, notes,
   subtotal, total, open, created_at, updated_at)
OVERRIDING SYSTEM VALUE VALUES
  (1, 'PO-2024-001','EXT-2024-001',1,1704067200000,'received','Laptops & desktops Q1',     0,0,FALSE,1701000000000,1701000000000),
  (2, 'PO-2024-002','EXT-2024-002',2,1704067200000,'received','Network equipment batch',    0,0,FALSE,1701100000000,1701100000000),
  (3, 'PO-2024-003','EXT-2024-003',4,1704153600000,'received','UPS units',                 0,0,FALSE,1701200000000,1701200000000),
  (4, 'PO-2024-004','EXT-2024-004',5,1704240000000,'received','Printers + toners',          0,0,FALSE,1701300000000,1701300000000),
  (5, 'PO-2024-005','EXT-2024-005',9,1704326400000,'received','Software licenses Q1',       0,0,FALSE,1701400000000,1701400000000),
  (6, 'PO-2024-006','EXT-2024-006',10,1706745600000,'received','Cables & connectors',       0,0,FALSE,1703000000000,1703000000000),
  (7, 'PO-2024-007','EXT-2024-007',7,1706832000000,'received','CCTV cameras Q1',            0,0,FALSE,1703100000000,1703100000000),
  (8, 'PO-2024-008','EXT-2024-008',6,1706918400000,'received','Storage media batch',        0,0,FALSE,1703200000000,1703200000000),
  (9, 'PO-2024-009','EXT-2024-009',8,1707004800000,'confirmed','Furniture Q2',              0,0,FALSE,1703300000000,1703300000000),
  (10,'PO-2024-010','EXT-2024-010',11,1707091200000,'received','Consumables Q2',            0,0,FALSE,1703400000000,1703400000000),
  (11,'PO-2024-011','EXT-2024-011',1,1709452800000,'received','Monitors Q2',                0,0,FALSE,1706000000000,1706000000000),
  (12,'PO-2024-012','EXT-2024-012',2,1709539200000,'confirmed','WiFi upgrade project',      0,0,FALSE,1706100000000,1706100000000),
  (13,'PO-2024-013','EXT-2024-013',12,1709625600000,'received','RAM & SSDs',                0,0,FALSE,1706200000000,1706200000000),
  (14,'PO-2024-014','EXT-2024-014',4,1709712000000,'cancelled','UPS replacement (cancelled)',0,0,FALSE,1706300000000,1706300000000),
  (15,'PO-2024-015','EXT-2024-015',5,1709798400000,'received','Printer consumables Q3',     0,0,FALSE,1706400000000,1706400000000),
  -- 5 open orders
  (16,'PO-2024-016',NULL,1,1714521600000,'draft',     'Laptops for new branch',  0,0,TRUE, 1712000000000,1712000000000),
  (17,'PO-2024-017',NULL,2,1714608000000,'draft',     'Switch firewall upgrade',  0,0,TRUE, 1712100000000,1712100000000),
  (18,'PO-2024-018',NULL,9,1714694400000,'confirmed', 'Annual SW licenses',       0,0,TRUE, 1712200000000,1712200000000),
  (19,'PO-2024-019',NULL,11,1714780800000,'draft',    'Consumables stock refill', 0,0,TRUE, 1712300000000,1712300000000),
  (20,'PO-2024-020',NULL,4,1714867200000,'draft',     'UPS for server room',      0,0,TRUE, 1712400000000,1712400000000)
ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('purchase_orders','id'),(SELECT MAX(id) FROM purchase_orders));

-- Temporarily reopen all closed (non-cancelled) purchase orders so the line-guard trigger passes.
-- (Sentinel id=0 and cancelled orders are excluded — cancelled cannot be open=TRUE)
UPDATE purchase_orders SET open = TRUE WHERE id > 0 AND open = FALSE AND status <> 'cancelled';

-- =============================================================================
-- PURCHASE ORDER LINES
-- Columns specified: id, order_id, product_id, qty, unit_price, sort_order,
--                    created_at, updated_at
-- Auto-set by tg_pol_set_line_defaults BEFORE INSERT:
--   name    ← products.name  (if left blank)
--   p_price ← products.buy_price  (always overwritten)
--   s_price ← products.sell_price (always overwritten)
-- =============================================================================
INSERT INTO purchase_order_lines
  (id, order_id, product_id, qty, unit_price, sort_order, created_at, updated_at)
OVERRIDING SYSTEM VALUE VALUES
  -- PO 1
  (1, 1, 1,  5,85000,1,1701000000001,1701000000001),
  (2, 1, 2,  4,92000,2,1701000000002,1701000000002),
  (3, 1, 4, 10,45000,3,1701000000003,1701000000003),
  (4, 1, 8, 20, 1800,4,1701000000004,1701000000004),
  -- PO 2
  (5, 2,21,  4,18000,1,1701100000001,1701100000001),
  (6, 2,22,  6, 8500,2,1701100000002,1701100000002),
  (7, 2,26, 10, 3200,3,1701100000003,1701100000003),
  -- PO 3
  (8, 3,31,  5,14000,1,1701200000001,1701200000001),
  (9, 3,32,  3,28000,2,1701200000002,1701200000002),
  (10,3,34, 20, 1200,3,1701200000003,1701200000003),
  -- PO 4
  (11,4,39,  3,22000,1,1701300000001,1701300000001),
  (12,4,43, 50, 3200,2,1701300000002,1701300000002),
  (13,4,44, 50, 2800,3,1701300000003,1701300000003),
  (14,4,45,100,  450,4,1701300000004,1701300000004),
  -- PO 5
  (15,5,63, 10,12000,1,1701400000001,1701400000001),
  (16,5,64, 15, 9000,2,1701400000002,1701400000002),
  (17,5,65, 20, 3500,3,1701400000003,1701400000003),
  -- PO 6
  (18,6,47,  5, 8500,1,1703000000001,1703000000001),
  (19,6,48,200,  120,2,1703000000002,1703000000002),
  (20,6,50,  50,  350,3,1703000000003,1703000000003),
  -- PO 7
  (21,7,29, 10, 8000,1,1703100000001,1703100000001),
  (22,7,30,  4,15000,2,1703100000002,1703100000002),
  -- PO 8
  (23,8,69,  8,14000,1,1703200000001,1703200000001),
  (24,8,70,  4,22000,2,1703200000002,1703200000002),
  (25,8,71, 40, 1500,3,1703200000003,1703200000003),
  -- PO 9
  (26,9,55, 10,12000,1,1703300000001,1703300000001),
  (27,9,56,  5,25000,2,1703300000002,1703300000002),
  -- PO 10
  (28,10,73, 50,  200,1,1703400000001,1703400000001),
  (29,10,74, 80,  150,2,1703400000002,1703400000002),
  (30,10,75, 30,  300,3,1703400000003,1703400000003),
  -- PO 11
  (31,11, 6, 15,22000,1,1706000000001,1706000000001),
  (32,11, 7, 10,32000,2,1706000000002,1706000000002),
  -- PO 12
  (33,12,22, 10, 8500,1,1706100000001,1706100000001),
  (34,12,23,  8, 9500,2,1706100000002,1706100000002),
  (35,12,24,  2,32000,3,1706100000003,1706100000003),
  -- PO 13
  (36,13,13, 30, 4500,1,1706200000001,1706200000001),
  (37,13,15, 20, 5500,2,1706200000002,1706200000002),
  (38,13,16, 15, 9000,3,1706200000003,1706200000003),
  -- PO 15
  (39,15,43,100, 3200,1,1706400000001,1706400000001),
  (40,15,44, 80, 2800,2,1706400000002,1706400000002),
  (41,15,45,200,  450,3,1706400000003,1706400000003),
  -- OPEN orders (16-20)
  (42,16, 1, 10,85000,1,1712000000001,1712000000001),
  (43,16, 3,  8,80000,2,1712000000002,1712000000002),
  (44,17,21,  4,18000,1,1712100000001,1712100000001),
  (45,17,24,  2,32000,2,1712100000002,1712100000002),
  (46,18,63, 25,12000,1,1712200000001,1712200000001),
  (47,18,65, 30, 3500,2,1712200000002,1712200000002),
  (48,19,73,100,  200,1,1712300000001,1712300000001),
  (49,19,74,100,  150,2,1712300000002,1712300000002),
  (50,20,31,  6,14000,1,1712400000001,1712400000001),
  (51,20,32,  2,28000,2,1712400000002,1712400000002)
ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('purchase_order_lines','id'),(SELECT MAX(id) FROM purchase_order_lines));

-- Close orders 1-15; the tg_po_recalc_on_close AFTER trigger stamps totals automatically.
-- Orders 16-20 remain open (open=TRUE) as intended.
UPDATE purchase_orders SET open = FALSE WHERE id BETWEEN 1 AND 15;

-- =============================================================================
-- SALES ORDERS  (30 rows: ids 1-30)
-- =============================================================================
INSERT INTO sales_orders
  (id, so_number, customer_id, end_customer_id, delivery_date,
   status, subtotal, tax_pct, tax_amount, total, open, created_at, updated_at)
OVERRIDING SYSTEM VALUE VALUES
  (1, 'SO-2024-001',1, 1,1704153600000,'delivered', 0,19,0,0,FALSE,1701050000000,1701050000000),
  (2, 'SO-2024-002',2, 2,1704240000000,'shipped',   0,19,0,0,FALSE,1701150000000,1701150000000),
  (3, 'SO-2024-003',3, 3,1704326400000,'delivered', 0,19,0,0,FALSE,1701250000000,1701250000000),
  (4, 'SO-2024-004',4, NULL,1704412800000,'confirmed',0,19,0,0,FALSE,1701350000000,1701350000000),
  (5, 'SO-2024-005',5, 5,1704499200000,'delivered', 0,19,0,0,FALSE,1701450000000,1701450000000),
  (6, 'SO-2024-006',6, NULL,1706745600000,'delivered',0,19,0,0,FALSE,1703010000000,1703010000000),
  (7, 'SO-2024-007',7, 7,1706832000000,'shipped',   0,19,0,0,FALSE,1703110000000,1703110000000),
  (8, 'SO-2024-008',8, 8,1706918400000,'delivered', 0,19,0,0,FALSE,1703210000000,1703210000000),
  (9, 'SO-2024-009',9, NULL,1707004800000,'delivered',0,19,0,0,FALSE,1703310000000,1703310000000),
  (10,'SO-2024-010',10,10,1707091200000,'cancelled', 0,19,0,0,FALSE,1703410000000,1703410000000),
  (11,'SO-2024-011',11,NULL,1709452800000,'delivered',0,19,0,0,FALSE,1706010000000,1706010000000),
  (12,'SO-2024-012',12,12,1709539200000,'delivered', 0,19,0,0,FALSE,1706110000000,1706110000000),
  (13,'SO-2024-013',13,NULL,1709625600000,'shipped',  0,19,0,0,FALSE,1706210000000,1706210000000),
  (14,'SO-2024-014',14,14,1709712000000,'processing',0,19,0,0,FALSE,1706310000000,1706310000000),
  (15,'SO-2024-015',15,NULL,1709798400000,'delivered',0,19,0,0,FALSE,1706410000000,1706410000000),
  (16,'SO-2024-016',16,1, 1711958400000,'delivered', 0,19,0,0,FALSE,1709000000000,1709000000000),
  (17,'SO-2024-017',17,NULL,1712044800000,'delivered',0,19,0,0,FALSE,1709100000000,1709100000000),
  (18,'SO-2024-018',18,12,1712131200000,'delivered', 0,19,0,0,FALSE,1709200000000,1709200000000),
  (19,'SO-2024-019',19,NULL,1712217600000,'confirmed',0,19,0,0,FALSE,1709300000000,1709300000000),
  (20,'SO-2024-020',20,14,1712304000000,'delivered', 0,19,0,0,FALSE,1709400000000,1709400000000),
  (21,'SO-2024-021',21,NULL,1714521600000,'delivered',0,19,0,0,FALSE,1711800000000,1711800000000),
  (22,'SO-2024-022',22,1, 1714608000000,'shipped',   0,19,0,0,FALSE,1711900000000,1711900000000),
  (23,'SO-2024-023',23,NULL,1714694400000,'confirmed',0,19,0,0,FALSE,1712000000000,1712000000000),
  (24,'SO-2024-024',24,2, 1714780800000,'processing',0,19,0,0,FALSE,1712050000000,1712050000000),
  (25,'SO-2024-025',25,NULL,1714867200000,'delivered',0,19,0,0,FALSE,1712100000000,1712100000000),
  -- 5 open
  (26,'SO-2024-026',1, NULL,1717459200000,'draft',    0,19,0,0,TRUE, 1714000000000,1714000000000),
  (27,'SO-2024-027',3, 3,   1717545600000,'draft',    0,19,0,0,TRUE, 1714100000000,1714100000000),
  (28,'SO-2024-028',5, NULL,1717632000000,'confirmed',0,19,0,0,TRUE, 1714200000000,1714200000000),
  (29,'SO-2024-029',16,10,  1717718400000,'draft',    0,19,0,0,TRUE, 1714300000000,1714300000000),
  (30,'SO-2024-030',21,NULL,1717804800000,'draft',    0,19,0,0,TRUE, 1714400000000,1714400000000)
ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('sales_orders','id'),(SELECT MAX(id) FROM sales_orders));

-- Temporarily reopen all closed (non-cancelled) sales orders so the line-guard trigger passes.
UPDATE sales_orders SET open = TRUE WHERE id > 0 AND open = FALSE AND status <> 'cancelled';

-- =============================================================================
-- SALES ORDER LINES
-- Columns specified: id, order_id, product_id, qty, unit_price, sort_order,
--                    created_at, updated_at
-- Auto-set by tg_sol_set_line_defaults BEFORE INSERT:
--   name    ← products.name  (if left blank)
--   p_price ← products.buy_price  (always overwritten)
--   s_price ← products.sell_price (always overwritten)
-- qty can be NEGATIVE on SO lines to represent credit / return lines.
-- =============================================================================
INSERT INTO sales_order_lines
  (id, order_id, product_id, qty, unit_price, sort_order, created_at, updated_at)
OVERRIDING SYSTEM VALUE VALUES
  -- SO 1
  (1,  1, 1, 2,110000,1,1701050000001,1701050000001),
  (2,  1, 8, 5,  2800,2,1701050000002,1701050000002),
  (3,  1, 6, 1, 29000,3,1701050000003,1701050000003),
  -- SO 2
  (4,  2,22, 3, 12000,1,1701150000001,1701150000001),
  (5,  2,48,20,   200,2,1701150000002,1701150000002),
  -- SO 3
  (6,  3, 4, 5, 58000,1,1701250000001,1701250000001),
  (7,  3, 8,10,  2800,2,1701250000002,1701250000002),
  (8,  3, 9, 5,  5200,3,1701250000003,1701250000003),
  -- SO 4
  (9,  4,31, 2, 19000,1,1701350000001,1701350000001),
  (10, 4,34,10,  2000,2,1701350000002,1701350000002),
  -- SO 5
  (11, 5,63, 5, 16000,1,1701450000001,1701450000001),
  (12, 5,65,10,  5500,2,1701450000002,1701450000002),
  -- SO 6
  (13, 6,21, 2, 25000,1,1703010000001,1703010000001),
  (14, 6,23, 3, 13500,2,1703010000002,1703010000002),
  -- SO 7
  (15, 7,43,20,  5000,1,1703110000001,1703110000001),
  (16, 7,44,20,  4500,2,1703110000002,1703110000002),
  (17, 7,45,50,   700,3,1703110000003,1703110000003),
  -- SO 8
  (18, 8, 2, 3,120000,1,1703210000001,1703210000001),
  (19, 8,64, 3, 13000,2,1703210000002,1703210000002),
  -- SO 9
  (20, 9,29, 5, 12000,1,1703310000001,1703310000001),
  (21, 9,30, 1, 21000,2,1703310000002,1703310000002),
  -- SO 10 (cancelled — no lines)
  -- SO 11
  (22,11,55, 4, 17000,1,1706010000001,1706010000001),
  (23,11,56, 2, 34000,2,1706010000002,1706010000002),
  -- SO 12
  (24,12, 5, 4, 80000,1,1706110000001,1706110000001),
  (25,12, 6, 4, 29000,2,1706110000002,1706110000002),
  (26,12, 8, 8,  2800,3,1706110000003,1706110000003),
  -- SO 13
  (27,13,19, 1, 52000,1,1706210000001,1706210000001),
  (28,13, 6, 2, 29000,2,1706210000002,1706210000002),
  -- SO 14
  (29,14,66, 2, 60000,1,1706310000001,1706310000001),
  (30,14,67, 3, 20000,2,1706310000002,1706310000002),
  -- SO 15
  (31,15,22, 5, 12000,1,1706410000001,1706410000001),
  (32,15,48,30,   200,2,1706410000002,1706410000002),
  -- SO 16
  (33,16,20, 2, 72000,1,1709000000001,1709000000001),
  (34,16,19, 1, 52000,2,1709000000002,1709000000002),
  -- SO 17
  (35,17, 4, 8, 58000,1,1709100000001,1709100000001),
  (36,17,13,16,  6500,2,1709100000002,1709100000002),
  (37,17,64, 8, 13000,3,1709100000003,1709100000003),
  -- SO 18
  (38,18,24, 1, 45000,1,1709200000001,1709200000001),
  (39,18,23, 2, 13500,2,1709200000002,1709200000002),
  -- SO 19
  (40,19,68, 1, 38000,1,1709300000001,1709300000001),
  (41,19,65, 5,  5500,2,1709300000002,1709300000002),
  -- SO 20
  (42,20, 1, 3,110000,1,1709400000001,1709400000001),
  (43,20, 6, 3, 29000,2,1709400000002,1709400000002),
  -- SO 21
  (44,21,43,30,  5000,1,1711800000001,1711800000001),
  (45,21,45,100,  700,2,1711800000002,1711800000002),
  -- SO 22
  (46,22, 3, 5,105000,1,1711900000001,1711900000001),
  (47,22, 8,10,  2800,2,1711900000002,1711900000002),
  -- SO 23
  (48,23,21, 3, 25000,1,1712000000001,1712000000001),
  (49,23,27, 2, 17000,2,1712000000002,1712000000002),
  -- SO 24
  (50,24,39, 2, 30000,1,1712050000001,1712050000001),
  (51,24,43,10,  5000,2,1712050000002,1712050000002),
  -- SO 25
  (52,25,15,10,  7800,1,1712100000001,1712100000001),
  (53,25,18,30,  1700,2,1712100000002,1712100000002),
  -- OPEN SO (26-30)
  (54,26, 1, 3,110000,1,1714000000001,1714000000001),
  (55,26, 7, 3, 42000,2,1714000000002,1714000000002),
  (56,27, 4, 5, 58000,1,1714100000001,1714100000001),
  (57,27,63, 5, 16000,2,1714100000002,1714100000002),
  (58,28,22, 4, 12000,1,1714200000001,1714200000001),
  (59,28,48,50,   200,2,1714200000002,1714200000002),
  (60,29,19, 2, 52000,1,1714300000001,1714300000001),
  (61,29,20, 1, 72000,2,1714300000002,1714300000002),
  (62,30,65,20,  5500,1,1714400000001,1714400000001),
  (63,30,68, 1, 38000,2,1714400000002,1714400000002),
  -- Credit / Return lines (negative qty) — exercises CHECK (qty <> 0) with qty < 0
  -- SO 27: Cevital returns 2 units of Desktop PC Core i5 (product 4)
  (64,27, 4,-2, 58000,3,1714100000003,1714100000003),
  -- SO 28: BNA returns 1 Router WiFi 6 (product 22)
  (65,28,22,-1, 12000,3,1714200000003,1714200000003),
  -- SO 30: Naftal returns 5 Antivirus licenses (product 65)
  (66,30,65,-5,  5500,3,1714400000003,1714400000003)
ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('sales_order_lines','id'),(SELECT MAX(id) FROM sales_order_lines));

-- Close orders 1-25; tg_so_recalc_on_close stamps totals automatically.
-- Orders 26-30 remain open as intended.
-- NOTE: recalc for open orders (26-30) counts the negative-qty credit lines too,
-- so the running subtotal is net (positive lines - credit lines).
UPDATE sales_orders SET open = FALSE WHERE id BETWEEN 1 AND 25 AND status <> 'cancelled';

-- =============================================================================
-- S_PAYMENTS  (40 rows: ids 1-40)
-- =============================================================================
INSERT INTO s_payments (id, by_user_id, customer_id, order_id, amount, notes, date, date_created)
OVERRIDING SYSTEM VALUE VALUES
  (1, 2,1, 1,  100000,'Acompte SO-001',           1701060000000,1701060000000),
  (2, 2,1, 1,  150000,'Solde SO-001',              1701600000000,1701600000000),
  (3, 3,2, 2,   40000,'Acompte SO-002',            1701160000000,1701160000000),
  (4, 3,2, 2,   40000,'Solde SO-002',              1701700000000,1701700000000),
  (5, 2,3, 3,  200000,'Paiement SO-003',           1701260000000,1701260000000),
  (6, 4,4, 4,   50000,'Acompte SO-004',            1701360000000,1701360000000),
  (7, 2,5, 5,  130000,'Paiement SO-005',           1701460000000,1701460000000),
  (8, 3,6, 6,   80000,'Acompte SO-006',            1703020000000,1703020000000),
  (9, 3,6, 6,   50000,'Solde SO-006',              1703500000000,1703500000000),
  (10,2,7, 7,  260000,'Paiement SO-007',           1703120000000,1703120000000),
  (11,4,8, 8,  200000,'Acompte SO-008',            1703220000000,1703220000000),
  (12,4,8, 8,  200000,'Solde SO-008',              1703800000000,1703800000000),
  (13,2,9, 9,   82000,'Paiement SO-009',           1703320000000,1703320000000),
  (14,3,11,11,  136000,'Paiement SO-011',          1706020000000,1706020000000),
  (15,2,12,12,  250000,'Acompte SO-012',           1706120000000,1706120000000),
  (16,2,12,12,  250000,'Solde SO-012',             1706700000000,1706700000000),
  (17,4,13,13,   99000,'Paiement SO-013',          1706220000000,1706220000000),
  (18,3,14,14,  180000,'Acompte SO-014',           1706320000000,1706320000000),
  (19,2,15,15,   89000,'Paiement SO-015',          1706420000000,1706420000000),
  (20,2,16,16,  240000,'Paiement SO-016',          1709010000000,1709010000000),
  (21,4,17,17,  400000,'Acompte SO-017',           1709110000000,1709110000000),
  (22,4,17,17,  200000,'Solde SO-017',             1709700000000,1709700000000),
  (23,3,18,18,   90000,'Paiement SO-018',          1709210000000,1709210000000),
  (24,2,19,19,   65000,'Paiement SO-019',          1709310000000,1709310000000),
  (25,2,20,20,  400000,'Acompte SO-020',           1709410000000,1709410000000),
  (26,4,20,20,  100000,'Solde SO-020',             1710000000000,1710000000000),
  (27,2,21,21,  228000,'Paiement SO-021',          1711810000000,1711810000000),
  (28,3,22,22,  310000,'Paiement SO-022',          1711910000000,1711910000000),
  (29,4,23,23,  100000,'Acompte SO-023',           1712010000000,1712010000000),
  (30,2,24,24,  100000,'Acompte SO-024',           1712060000000,1712060000000),
  (31,3,25,25,  100000,'Paiement SO-025',          1712110000000,1712110000000),
  -- Customer advances (no specific order)
  (32,2,1, NULL,500000,'Avance Sonatrach Q4',      1710100000000,1710100000000),
  (33,3,3, NULL,300000,'Avance Cevital',            1710200000000,1710200000000),
  (34,4,5, NULL,200000,'Provision BNA Q3',          1710300000000,1710300000000),
  (35,2,16,NULL,150000,'Avance Condor Electronics', 1711000000000,1711000000000),
  (36,3,17,NULL,250000,'Avance Algérie Télécom',   1711100000000,1711100000000),
  (37,4,21,NULL,180000,'Provision Naftal annuelle', 1712500000000,1712500000000),
  -- Open SO advances
  (38,2,1, 26, 150000,'Acompte SO-026 ouvert',     1714010000000,1714010000000),
  (39,3,3, 27, 100000,'Acompte SO-027 ouvert',     1714110000000,1714110000000),
  (40,4,5, 28,  80000,'Acompte SO-028 ouvert',     1714210000000,1714210000000)
ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('s_payments','id'),(SELECT MAX(id) FROM s_payments));

-- =============================================================================
-- P_PAYMENTS  (30 rows: ids 1-30)
-- =============================================================================
INSERT INTO p_payments (id, by_user_id, supplier_id, order_id, amount, notes, date, date_created)
OVERRIDING SYSTEM VALUE VALUES
  (1, 1,1, 1,  400000,'Acompte PO-001',          1701010000000,1701010000000),
  (2, 1,1, 1,  500000,'Solde PO-001',             1701500000000,1701500000000),
  (3, 1,2, 2,  155000,'Paiement PO-002',          1701110000000,1701110000000),
  (4, 1,4, 3,  178000,'Paiement PO-003',          1701210000000,1701210000000),
  (5, 1,5, 4,  320000,'Paiement PO-004',          1701310000000,1701310000000),
  (6, 1,9, 5,  295000,'Paiement PO-005',          1701410000000,1701410000000),
  (7, 1,10,6,   66000,'Paiement PO-006',          1703010000000,1703010000000),
  (8, 1,7, 7,  140000,'Paiement PO-007',          1703110000000,1703110000000),
  (9, 1,6, 8,  232000,'Paiement PO-008',          1703210000000,1703210000000),
  (10,1,11,10,  34000,'Paiement PO-010',          1703410000000,1703410000000),
  (11,1,1, 11, 490000,'Paiement PO-011',          1706010000000,1706010000000),
  (12,1,12,13, 400000,'Paiement PO-013',          1706210000000,1706210000000),
  (13,1,5, 15, 491000,'Paiement PO-015',          1706410000000,1706410000000),
  -- Supplier advances (no specific order)
  (14,1,1, NULL,200000,'Avance TechVision Q2',    1706000000000,1706000000000),
  (15,1,2, NULL,100000,'Acompte GlobalNet Q2',    1706100000000,1706100000000),
  (16,1,9, NULL, 80000,'Avance SoftDist licences',1708000000000,1708000000000),
  (17,1,4, NULL,150000,'Avance PowerPlus Q3',     1709000000000,1709000000000),
  (18,1,11,NULL, 50000,'Avance ConsumePlus',      1710000000000,1710000000000),
  -- Open PO advances
  (19,1,1, 16, 400000,'Acompte PO-016 ouvert',   1712010000000,1712010000000),
  (20,1,2, 17, 136000,'Acompte PO-017 ouvert',   1712110000000,1712110000000),
  (21,1,9, 18, 150000,'Acompte PO-018 ouvert',   1712210000000,1712210000000),
  (22,1,11,19,  15000,'Acompte PO-019 ouvert',   1712310000000,1712310000000),
  (23,1,4, 20, 100000,'Acompte PO-020 ouvert',   1712410000000,1712410000000),
  -- Extra advances
  (24,1,12,NULL,300000,'Provision AlgerTech Q4', 1711000000000,1711000000000),
  (25,1,7, NULL, 90000,'Provision SecureNet',     1711500000000,1711500000000),
  (26,1,8, NULL,200000,'Avance FurniPro project', 1712500000000,1712500000000),
  (27,1,10,NULL, 45000,'Avance CableLine Q4',    1713000000000,1713000000000),
  (28,1,6, NULL, 60000,'Avance MediaStore Q4',   1713500000000,1713500000000),
  (29,1,5, NULL, 80000,'Avance PrintWorld Q4',   1713600000000,1713600000000),
  (30,1,2, NULL,120000,'GlobalNet annuelle Q4',  1714000000000,1714000000000)
ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('p_payments','id'),(SELECT MAX(id) FROM p_payments));

COMMIT;

-- =============================================================================
-- SEED SUMMARY  (v4)
-- users                16  (ids 1-16)
-- categories           12  (ids 1-12)
-- suppliers            15  (ids 1-15)
-- customers            25  (ids 1-25)
-- end_customers        20  (ids 1-20)
-- products             80  (ids 1-80)
-- movements            50  (initial stock load, auto-generated ids)
-- purchase_orders      20  (ids 1-20, 15 closed / 5 open)
-- purchase_order_lines 51  (ids 1-51)
-- sales_orders         30  (ids 1-30, 24 closed / 1 cancelled / 5 open)
-- sales_order_lines    66  (ids 1-66; 3 are negative-qty credit lines: 64,65,66)
-- s_payments           40  (ids 1-40)
-- p_payments           30  (ids 1-30)
-- ─────────────────────────────────
-- TOTAL  ~455 business rows + 50 movements = ~505 rows
--
-- Trigger-auto-set columns (do NOT specify in application INSERTs):
--   order_lines.name    ← products.name      (fillable if blank)
--   order_lines.p_price ← products.buy_price  (always overwritten)
--   order_lines.p_price ← products.sell_price (always overwritten)
-- products.total_in/out/amount_in/out updated live by tracking triggers.
-- updated_at is the OPTIMISTIC-LOCK VERSION TOKEN (use fn_check_version()).
-- =============================================================================
