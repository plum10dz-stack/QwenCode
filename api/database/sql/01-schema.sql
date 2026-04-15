-- =============================================================================
-- SOS ERP — Complete Database Initialization Script  (v3)
-- =============================================================================
-- Enforced rules:
--  1. ALL dates stored as BIGINT (Unix ms epoch).  No TIMESTAMP columns.
--  2. ALL IDs are BIGINT GENERATED ALWAYS AS IDENTITY — never set by the app.
--     Sentinel row uses id = 0 (OVERRIDING SYSTEM VALUE).
--  3. id is IMMUTABLE after INSERT (trigger silently restores original value).
--  4. created_at is IMMUTABLE after INSERT — it is the creation timestamp.
--  5. updated_at is the OPTIMISTIC-LOCK VERSION TOKEN.
--     App layer: before UPDATE, verify updated_at == last-seen value via
--     fn_check_version(table, id, expected_updated_at). If FALSE → conflict.
--  6. Payments (s_payments, p_payments) are INSERT-ONLY (no UPDATE/DELETE).
--  7. assets are restricted to soft-delete only.
--  8. order_id and product_id on order lines are frozen after INSERT.
--     The snapshot product NAME column on order lines is user-editable.
--  9. Order lines can only be added/modified while parent order is open.
-- 10. Any INSERT/UPDATE/DELETE on business tables is mirrored to audit_log.
--     Exempt: sessions, audit_log, delete_log, assets, movements.
-- 11. Soft-delete on products; hard-deletes elsewhere logged to delete_log.
-- 12. stock >= 0 enforced by movements trigger.
-- 13. products.total_in / total_out / amount_in / amount_out track cumulative
--     qty and monetary value across PO lines and SO lines in real time.
-- 14. audit_log and delete_log are RANGE-partitioned by year (BIGINT epoch ms)
--     to prevent unbounded table growth.
-- 15. movements: 'adjustment' type uses SIGNED qty (positive adds, negative
--     removes). All other types use ABS(qty) and set direction from type.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- fuzzy name search indexes

-- =============================================================================
-- SECTION 1 — ENUM TYPES
-- =============================================================================
DO $$ BEGIN
    CREATE TYPE user_role_t AS ENUM ('admin', 'employee', 'customer', 'anonymous');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE sales_order_status_t AS ENUM (
        'draft', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE purchase_order_status_t AS ENUM (
        'draft', 'confirmed', 'received', 'cancelled'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE movement_type_t AS ENUM (
        'in', 'out', 'adjustment', 'return_in', 'return_out', 'transfer'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- SECTION 2 — UTILITY / HELPER FUNCTIONS
-- =============================================================================

-- now_ms() — current epoch in milliseconds
CREATE OR REPLACE FUNCTION now_ms()
RETURNS BIGINT LANGUAGE sql STABLE AS $$
    SELECT EXTRACT(EPOCH FROM clock_timestamp())::BIGINT * 1000;
$$;

-- raise_if_id_changed() — silently restores id if an UPDATE tries to change it
CREATE OR REPLACE FUNCTION raise_if_id_changed()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id THEN
        NEW.id := OLD.id;   -- silently restore
    END IF;
    RETURN NEW;
END;
$$;

-- raise_if_created_at_changed() — created_at is the immutable creation timestamp
CREATE OR REPLACE FUNCTION raise_if_created_at_changed()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        NEW.created_at := OLD.created_at;   -- silently restore
    END IF;
    RETURN NEW;
END;
$$;

-- fn_set_updated_at() — stamp updated_at on every UPDATE.
-- updated_at is the OPTIMISTIC-LOCK VERSION TOKEN (rule #5).
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now_ms();
    RETURN NEW;
END;
$$;

-- fn_check_version(table, id, expected_updated_at)
-- Returns TRUE if the row's current updated_at matches the value the caller
-- read. Call this BEFORE issuing an UPDATE to detect concurrent modification.
CREATE OR REPLACE FUNCTION fn_check_version(
    p_table TEXT,
    p_id    BIGINT,
    p_ver   BIGINT   -- the updated_at value seen by the caller
)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE
    v_cur BIGINT;
BEGIN
    EXECUTE format('SELECT updated_at FROM %I WHERE id = $1', p_table)
        INTO v_cur USING p_id;
    RETURN v_cur IS NOT DISTINCT FROM p_ver;
END;
$$;

-- fn_audit_log() — generic AFTER trigger; logs INSERT/UPDATE/DELETE to audit_log
CREATE OR REPLACE FUNCTION fn_audit_log()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_op      TEXT;
    v_row_id  TEXT;
    v_payload JSONB;
BEGIN
    v_op := TG_OP;
    IF TG_OP = 'DELETE' THEN
        v_row_id  := OLD.id::TEXT;
        v_payload := to_jsonb(OLD);
    ELSIF TG_OP = 'INSERT' THEN
        v_row_id  := NEW.id::TEXT;
        v_payload := to_jsonb(NEW);
    ELSE
        v_row_id  := NEW.id::TEXT;
        v_payload := jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW));
    END IF;

    INSERT INTO audit_log (table_name, operation, row_id, payload, created_at)
    VALUES (TG_TABLE_NAME, v_op, v_row_id, v_payload, now_ms());

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

-- fn_delete_log() — records every hard DELETE to delete_log
CREATE OR REPLACE FUNCTION fn_delete_log()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO delete_log (table_name, row_id, deleted_at)
    VALUES (TG_TABLE_NAME, OLD.id::TEXT, now_ms());
    RETURN OLD;
END;
$$;

-- fn_protect_sentinel_row() — BEFORE UPDATE OR DELETE guard for id = 0 rows
CREATE OR REPLACE FUNCTION fn_protect_sentinel_row()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.id = 0 THEN
        RAISE EXCEPTION
            'Sentinel row (id=0) on table "%" is protected and cannot be modified or deleted.',
            TG_TABLE_NAME
            USING ERRCODE = '23000';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

-- =============================================================================
-- SECTION 3 — INFRASTRUCTURE / LOG TABLES  (partitioned for growth control)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- audit_log — RANGE-partitioned by created_at (BIGINT epoch ms, annual slices)
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS seq_audit_log_id;

CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGINT  NOT NULL DEFAULT nextval('seq_audit_log_id'),
    table_name  TEXT    NOT NULL,
    operation   TEXT    NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
    row_id      TEXT    NOT NULL,
    payload     JSONB   NOT NULL DEFAULT '{}',
    created_at  BIGINT  NOT NULL DEFAULT now_ms(),
    PRIMARY KEY (id, created_at)          -- partition key must appear in PK
) PARTITION BY RANGE (created_at);

-- Annual partitions (epoch ms boundaries)
-- Values: 2023-01-01=1672531200000, 2024-01-01=1704067200000,
--         2025-01-01=1735689600000, 2026-01-01=1767225600000,
--         2027-01-01=1798761600000
CREATE TABLE IF NOT EXISTS audit_log_y2023
    PARTITION OF audit_log FOR VALUES FROM (1672531200000) TO (1704067200000);
CREATE TABLE IF NOT EXISTS audit_log_y2024
    PARTITION OF audit_log FOR VALUES FROM (1704067200000) TO (1735689600000);
CREATE TABLE IF NOT EXISTS audit_log_y2025
    PARTITION OF audit_log FOR VALUES FROM (1735689600000) TO (1767225600000);
CREATE TABLE IF NOT EXISTS audit_log_y2026
    PARTITION OF audit_log FOR VALUES FROM (1767225600000) TO (1798761600000);
CREATE TABLE IF NOT EXISTS audit_log_y2027
    PARTITION OF audit_log FOR VALUES FROM (1798761600000) TO (1830384000000);
CREATE TABLE IF NOT EXISTS audit_log_default
    PARTITION OF audit_log DEFAULT;       -- catch-all (old + future)

CREATE INDEX IF NOT EXISTS idx_audit_table_row
    ON audit_log (table_name, row_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at
    ON audit_log (created_at);

-- ---------------------------------------------------------------------------
-- delete_log — RANGE-partitioned by deleted_at (annual)
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS seq_delete_log_id;

CREATE TABLE IF NOT EXISTS delete_log (
    id          BIGINT  NOT NULL DEFAULT nextval('seq_delete_log_id'),
    table_name  TEXT    NOT NULL,
    row_id      TEXT    NOT NULL,
    deleted_by  BIGINT  NULL,             -- filled by app layer if known
    deleted_at  BIGINT  NOT NULL DEFAULT now_ms(),
    PRIMARY KEY (id, deleted_at)
) PARTITION BY RANGE (deleted_at);

CREATE TABLE IF NOT EXISTS delete_log_y2023
    PARTITION OF delete_log FOR VALUES FROM (1672531200000) TO (1704067200000);
CREATE TABLE IF NOT EXISTS delete_log_y2024
    PARTITION OF delete_log FOR VALUES FROM (1704067200000) TO (1735689600000);
CREATE TABLE IF NOT EXISTS delete_log_y2025
    PARTITION OF delete_log FOR VALUES FROM (1735689600000) TO (1767225600000);
CREATE TABLE IF NOT EXISTS delete_log_y2026
    PARTITION OF delete_log FOR VALUES FROM (1767225600000) TO (1798761600000);
CREATE TABLE IF NOT EXISTS delete_log_y2027
    PARTITION OF delete_log FOR VALUES FROM (1798761600000) TO (1830384000000);
CREATE TABLE IF NOT EXISTS delete_log_default
    PARTITION OF delete_log DEFAULT;

CREATE INDEX IF NOT EXISTS idx_deletelog_table_row
    ON delete_log (table_name, row_id);
CREATE INDEX IF NOT EXISTS idx_deletelog_deleted_at
    ON delete_log (deleted_at);

-- ---------------------------------------------------------------------------
-- events  (SSE / real-time notification table)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
    id          BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_name  TEXT    NOT NULL,
    action      TEXT    NOT NULL,
    row_id      TEXT    NOT NULL,
    event_time  BIGINT  NOT NULL DEFAULT now_ms()
);
CREATE INDEX IF NOT EXISTS idx_events_event_time ON events (event_time);

-- =============================================================================
-- SECTION 4 — USERS & AUTH
-- =============================================================================

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id                      BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name                    TEXT            NOT NULL UNIQUE,
    pwd                     TEXT            NOT NULL,
    -- cid links to customers.id for customer-role users; NULL for admin/employee
    cid                     BIGINT          NULL,
    role                    user_role_t     NOT NULL DEFAULT 'employee',
    email                   TEXT            UNIQUE,
    mobile                  TEXT,
    blocked                 BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at              BIGINT          NOT NULL DEFAULT now_ms(),
    updated_at              BIGINT          NOT NULL DEFAULT now_ms(),
    email_confirmed_at      BIGINT,
    confirmation_sent_at    BIGINT,
    last_sign_in_at         BIGINT,

    CONSTRAINT chk_users_name_length    CHECK (char_length(name) >= 2),
    CONSTRAINT chk_users_pwd_not_empty  CHECK (char_length(pwd) > 0)
);

CREATE INDEX IF NOT EXISTS idx_users_name  ON users (name);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_cid   ON users (cid) WHERE cid IS NOT NULL;

CREATE OR REPLACE TRIGGER tg_users_freeze_id
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION raise_if_id_changed();

CREATE OR REPLACE TRIGGER tg_users_freeze_created_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION raise_if_created_at_changed();

CREATE OR REPLACE TRIGGER tg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE OR REPLACE TRIGGER tg_users_audit
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE OR REPLACE TRIGGER tg_users_delete_log
    AFTER DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_delete_log();

-- ---------------------------------------------------------------------------
-- sessions  (EXEMPT from audit_log)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    uid             BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cid             BIGINT      NULL,       -- copied from users.cid at login; may be NULL
    username        TEXT        NOT NULL,
    cert            TEXT        NOT NULL,
    pwd_suffix      TEXT        NOT NULL,
    handshake_time  BIGINT,
    "IP"            TEXT,
    expire          BIGINT,
    logged          BOOLEAN     NOT NULL DEFAULT FALSE,
    role            user_role_t NOT NULL DEFAULT 'anonymous',
    created_at      BIGINT      NOT NULL DEFAULT now_ms()
);

CREATE INDEX IF NOT EXISTS idx_sessions_uid    ON sessions (uid);
CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions (expire);

CREATE OR REPLACE TRIGGER tg_sessions_freeze_id
    BEFORE UPDATE ON sessions
    FOR EACH ROW EXECUTE FUNCTION raise_if_id_changed();

-- =============================================================================
-- SECTION 5 — MASTER DATA TABLES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    id          BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        TEXT    NOT NULL UNIQUE,
    abr         TEXT    NOT NULL,
    ref         TEXT    NOT NULL DEFAULT '',
    created_at  BIGINT  NOT NULL DEFAULT now_ms(),
    updated_at  BIGINT  NOT NULL DEFAULT now_ms(),

    CONSTRAINT chk_categories_name_nonempty CHECK (char_length(name) > 0),
    CONSTRAINT chk_categories_abr_nonempty  CHECK (char_length(abr) > 0)
);

CREATE INDEX IF NOT EXISTS idx_categories_name ON categories (name);

CREATE OR REPLACE TRIGGER tg_categories_freeze_id
    BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION raise_if_id_changed();
CREATE OR REPLACE TRIGGER tg_categories_freeze_created_at
    BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION raise_if_created_at_changed();
CREATE OR REPLACE TRIGGER tg_categories_updated_at
    BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE OR REPLACE TRIGGER tg_categories_audit
    AFTER INSERT OR UPDATE OR DELETE ON categories FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
CREATE OR REPLACE TRIGGER tg_categories_delete_log
    AFTER DELETE ON categories FOR EACH ROW EXECUTE FUNCTION fn_delete_log();

-- ---------------------------------------------------------------------------
-- suppliers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
    id          BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        TEXT    NOT NULL,
    contact     TEXT,
    phone       TEXT,
    email       TEXT,
    address     TEXT,
    notes       TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  BIGINT  NOT NULL DEFAULT now_ms(),
    updated_at  BIGINT  NOT NULL DEFAULT now_ms(),

    CONSTRAINT chk_suppliers_name_nonempty CHECK (char_length(name) > 0)
);

CREATE INDEX IF NOT EXISTS idx_suppliers_name      ON suppliers (name);
CREATE INDEX IF NOT EXISTS idx_suppliers_is_active ON suppliers (is_active);

CREATE OR REPLACE TRIGGER tg_suppliers_freeze_id
    BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION raise_if_id_changed();
CREATE OR REPLACE TRIGGER tg_suppliers_freeze_created_at
    BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION raise_if_created_at_changed();
CREATE OR REPLACE TRIGGER tg_suppliers_updated_at
    BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE OR REPLACE TRIGGER tg_suppliers_audit
    AFTER INSERT OR UPDATE OR DELETE ON suppliers FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
CREATE OR REPLACE TRIGGER tg_suppliers_delete_log
    AFTER DELETE ON suppliers FOR EACH ROW EXECUTE FUNCTION fn_delete_log();

-- ---------------------------------------------------------------------------
-- customers  (B2B clients)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
    id          BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name   TEXT    NOT NULL,
    phone       TEXT,
    email       TEXT,
    city        TEXT,
    tax_id      TEXT,
    address     TEXT,
    notes       TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  BIGINT  NOT NULL DEFAULT now_ms(),
    updated_at  BIGINT  NOT NULL DEFAULT now_ms(),

    CONSTRAINT chk_customers_full_name_nonempty CHECK (char_length(full_name) > 0)
);

CREATE INDEX IF NOT EXISTS idx_customers_is_active ON customers (is_active);
CREATE INDEX IF NOT EXISTS idx_customers_full_name ON customers USING gin (full_name gin_trgm_ops);

CREATE OR REPLACE TRIGGER tg_customers_freeze_id
    BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION raise_if_id_changed();
CREATE OR REPLACE TRIGGER tg_customers_freeze_created_at
    BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION raise_if_created_at_changed();
CREATE OR REPLACE TRIGGER tg_customers_updated_at
    BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE OR REPLACE TRIGGER tg_customers_audit
    AFTER INSERT OR UPDATE OR DELETE ON customers FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
CREATE OR REPLACE TRIGGER tg_customers_delete_log
    AFTER DELETE ON customers FOR EACH ROW EXECUTE FUNCTION fn_delete_log();

-- ---------------------------------------------------------------------------
-- end_customers  (B2C / final recipients)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS end_customers (
    id          BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name   TEXT    NOT NULL,
    phone       TEXT,
    email       TEXT,
    city        TEXT,
    tax_id      TEXT,
    address     TEXT,
    notes       TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  BIGINT  NOT NULL DEFAULT now_ms(),
    updated_at  BIGINT  NOT NULL DEFAULT now_ms(),

    CONSTRAINT chk_end_customers_full_name_nonempty CHECK (char_length(full_name) > 0)
);

CREATE INDEX IF NOT EXISTS idx_end_customers_is_active ON end_customers (is_active);
CREATE INDEX IF NOT EXISTS idx_end_customers_full_name
    ON end_customers USING gin (full_name gin_trgm_ops);

CREATE OR REPLACE TRIGGER tg_end_customers_freeze_id
    BEFORE UPDATE ON end_customers FOR EACH ROW EXECUTE FUNCTION raise_if_id_changed();
CREATE OR REPLACE TRIGGER tg_end_customers_freeze_created_at
    BEFORE UPDATE ON end_customers FOR EACH ROW EXECUTE FUNCTION raise_if_created_at_changed();
CREATE OR REPLACE TRIGGER tg_end_customers_updated_at
    BEFORE UPDATE ON end_customers FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE OR REPLACE TRIGGER tg_end_customers_audit
    AFTER INSERT OR UPDATE OR DELETE ON end_customers FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
CREATE OR REPLACE TRIGGER tg_end_customers_delete_log
    AFTER DELETE ON end_customers FOR EACH ROW EXECUTE FUNCTION fn_delete_log();

-- =============================================================================
-- SECTION 6 — INVENTORY
-- =============================================================================

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
    id          BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        TEXT            NOT NULL UNIQUE,                  -- unique product name
    sku         TEXT            NOT NULL UNIQUE,
    category_id BIGINT          REFERENCES categories(id) ON DELETE SET NULL,
    unit        TEXT            NOT NULL DEFAULT 'pcs',
    supplier_id BIGINT          REFERENCES suppliers(id) ON DELETE SET NULL,
    buy_price   NUMERIC(18,4)   NOT NULL DEFAULT 0 CHECK (buy_price  >= 0),
    sell_price  NUMERIC(18,4)   NOT NULL DEFAULT 0 CHECK (sell_price >= 0),
    -- Physical on-hand stock — managed exclusively by the movements trigger
    stock       NUMERIC(18,4)   NOT NULL DEFAULT 0,
    -- Cumulative tracking: updated live by PO-line / SO-line triggers
    total_in    NUMERIC(18,4)   NOT NULL DEFAULT 0 CHECK (total_in   >= 0),  -- qty ever purchased (via PO lines)
    total_out   NUMERIC(18,4)   NOT NULL DEFAULT 0 CHECK (total_out  >= 0),  -- qty ever sold (via SO lines)
    amount_in   NUMERIC(18,4)   NOT NULL DEFAULT 0 CHECK (amount_in  >= 0),  -- total purchase value
    amount_out  NUMERIC(18,4)   NOT NULL DEFAULT 0 CHECK (amount_out >= 0),  -- total sales revenue
    low_stock   NUMERIC(18,4)   NOT NULL DEFAULT 0 CHECK (low_stock  >= 0),
    location    TEXT,
    description TEXT,
    active      BOOLEAN         NOT NULL DEFAULT TRUE,
    deleted     BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at  BIGINT          NOT NULL DEFAULT now_ms(),
    updated_at  BIGINT          NOT NULL DEFAULT now_ms(),

    CONSTRAINT chk_products_name_nonempty CHECK (char_length(name) > 0),
    CONSTRAINT chk_products_sku_nonempty  CHECK (char_length(sku)  > 0)
);

CREATE INDEX IF NOT EXISTS idx_products_sku         ON products (sku);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products (category_id);
CREATE INDEX IF NOT EXISTS idx_products_supplier_id ON products (supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_active       ON products (active) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_products_name_trgm   ON products USING gin (name gin_trgm_ops);

CREATE OR REPLACE TRIGGER tg_products_freeze_id
    BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION raise_if_id_changed();
CREATE OR REPLACE TRIGGER tg_products_freeze_created_at
    BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION raise_if_created_at_changed();
CREATE OR REPLACE TRIGGER tg_products_updated_at
    BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE OR REPLACE TRIGGER tg_products_audit
    AFTER INSERT OR UPDATE OR DELETE ON products FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
CREATE OR REPLACE TRIGGER tg_products_delete_log
    AFTER DELETE ON products FOR EACH ROW EXECUTE FUNCTION fn_delete_log();

-- ---------------------------------------------------------------------------
-- movements  (inventory ledger — INSERT-ONLY, EXEMPT from audit_log)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS movements (
    id          BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id  BIGINT          NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    type        movement_type_t NOT NULL,
    -- qty sign rules:
    --   'in', 'return_in'             → always positive  (trigger uses ABS)
    --   'out', 'return_out','transfer' → effectively negative (trigger uses -ABS)
    --   'adjustment'                   → SIGNED by caller (+5 adds, -5 removes)
    qty         NUMERIC(18,4)   NOT NULL CHECK (qty <> 0),
    before      NUMERIC(18,4)   NOT NULL,
    after       NUMERIC(18,4)   NOT NULL,
    reason      TEXT            NOT NULL DEFAULT '',
    ref         TEXT,           -- optional reference (order id, etc.)
    created_at  BIGINT          NOT NULL DEFAULT now_ms(),

    CONSTRAINT chk_movements_after_nonnegative CHECK (after >= 0)
);

CREATE INDEX IF NOT EXISTS idx_movements_product_id  ON movements (product_id);
CREATE INDEX IF NOT EXISTS idx_movements_type        ON movements (type);
CREATE INDEX IF NOT EXISTS idx_movements_created_at  ON movements (created_at);
CREATE INDEX IF NOT EXISTS idx_movements_ref         ON movements (ref) WHERE ref IS NOT NULL;

-- Freeze ID
CREATE OR REPLACE TRIGGER tg_movements_freeze_id
    BEFORE UPDATE ON movements FOR EACH ROW EXECUTE FUNCTION raise_if_id_changed();

-- movements are INSERT-ONLY
CREATE OR REPLACE FUNCTION fn_movements_no_modify()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Movements are immutable. Create a corrective movement instead.';
END;
$$;

CREATE OR REPLACE TRIGGER tg_movements_no_update
    BEFORE UPDATE ON movements FOR EACH ROW EXECUTE FUNCTION fn_movements_no_modify();
CREATE OR REPLACE TRIGGER tg_movements_no_delete
    BEFORE DELETE ON movements FOR EACH ROW EXECUTE FUNCTION fn_movements_no_modify();

-- BEFORE INSERT: validate and atomically update products.stock
CREATE OR REPLACE FUNCTION fn_movements_update_stock()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_current_stock NUMERIC(18,4);
    v_direction     NUMERIC(18,4);
BEGIN
    -- Lock the product row for this transaction
    SELECT stock INTO v_current_stock FROM products WHERE id = NEW.product_id FOR UPDATE;

    -- Determine signed direction:
    --   adjustment uses the SIGNED qty passed by the caller (positive = add, negative = remove)
    --   all other types use ABS and set direction from the type name
    v_direction := CASE
        WHEN NEW.type = 'adjustment'              THEN NEW.qty       -- signed by caller
        WHEN NEW.type IN ('in', 'return_in')      THEN  ABS(NEW.qty)
        WHEN NEW.type IN ('out','return_out','transfer') THEN -ABS(NEW.qty)
        ELSE NEW.qty
    END;

    -- Validate: before must match current stock (race-condition guard)
    IF NEW.before IS DISTINCT FROM v_current_stock THEN
        RAISE EXCEPTION 'Stock race condition on product %: expected before=%, actual=%',
            NEW.product_id, v_current_stock, NEW.before;
    END IF;

    -- Validate: after must equal before + direction
    IF NEW.after IS DISTINCT FROM (NEW.before + v_direction) THEN
        RAISE EXCEPTION 'Inconsistent movement on product %: before=%, qty=%, direction=%, after=% but expected %',
            NEW.product_id, NEW.before, NEW.qty, v_direction, NEW.after, (NEW.before + v_direction);
    END IF;

    -- Prevent negative stock
    IF NEW.after < 0 THEN
        RAISE EXCEPTION 'Stock cannot go negative for product %. Current: %, Requested removal: %',
            NEW.product_id, v_current_stock, ABS(v_direction);
    END IF;

    -- Apply to product
    UPDATE products SET stock = NEW.after, updated_at = now_ms() WHERE id = NEW.product_id;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER tg_movements_update_stock
    BEFORE INSERT ON movements
    FOR EACH ROW EXECUTE FUNCTION fn_movements_update_stock();

-- =============================================================================
-- SECTION 7 — ASSETS  (INSERT-ONLY except soft-delete)
-- =============================================================================
CREATE TABLE IF NOT EXISTS assets (
    id                  BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name                TEXT        NOT NULL,
    path                TEXT        NOT NULL,
    type                TEXT        NOT NULL,
    size                BIGINT      NOT NULL DEFAULT 0 CHECK (size >= 0),
    mime_type           TEXT        NOT NULL,
    created_by_user_id  BIGINT      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    owner               BIGINT      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    "for"               user_role_t NOT NULL DEFAULT 'admin',
    deleted             BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at          BIGINT      NOT NULL DEFAULT now_ms(),

    CONSTRAINT chk_assets_name_nonempty CHECK (char_length(name) > 0),
    CONSTRAINT chk_assets_path_nonempty CHECK (char_length(path) > 0)
);

CREATE INDEX IF NOT EXISTS idx_assets_owner              ON assets (owner);
CREATE INDEX IF NOT EXISTS idx_assets_created_by_user_id ON assets (created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_assets_deleted            ON assets (deleted);

CREATE OR REPLACE TRIGGER tg_assets_freeze_id
    BEFORE UPDATE ON assets FOR EACH ROW EXECUTE FUNCTION raise_if_id_changed();

-- Only toggling 'deleted' flag is allowed; everything else is blocked
CREATE OR REPLACE FUNCTION fn_assets_no_modify()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.deleted IS DISTINCT FROM OLD.deleted
           AND NEW.id   = OLD.id
           AND NEW.path = OLD.path
           AND NEW.name = OLD.name THEN
            RETURN NEW;     -- soft-delete is the only permitted change
        END IF;
        RAISE EXCEPTION 'Assets are immutable except for the deleted flag.';
    END IF;
    RAISE EXCEPTION 'Assets cannot be hard-deleted. Use the deleted flag.';
END;
$$;

CREATE OR REPLACE TRIGGER tg_assets_no_modify
    BEFORE UPDATE OR DELETE ON assets
    FOR EACH ROW EXECUTE FUNCTION fn_assets_no_modify();

-- =============================================================================
-- SECTION 8 — PURCHASE ORDERS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- purchase_orders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchase_orders (
    id              BIGINT                  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    po_number       TEXT                    NOT NULL UNIQUE,
    por             TEXT,                   -- external reference
    supplier_id     BIGINT                  REFERENCES suppliers(id) ON DELETE RESTRICT,
    expected_date   BIGINT,
    status          purchase_order_status_t NOT NULL DEFAULT 'draft',
    notes           TEXT,
    subtotal        NUMERIC(18,4)           NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    total           NUMERIC(18,4)           NOT NULL DEFAULT 0 CHECK (total    >= 0),
    received_at     BIGINT,
    open            BOOLEAN                 NOT NULL DEFAULT TRUE,
    locked_by_uid   BIGINT                  REFERENCES users(id) ON DELETE SET NULL,
    locked_at       BIGINT,
    created_at      BIGINT                  NOT NULL DEFAULT now_ms(),
    updated_at      BIGINT                  NOT NULL DEFAULT now_ms(),

    CONSTRAINT chk_po_number_nonempty CHECK (char_length(po_number) > 0),
    CONSTRAINT chk_po_received_state  CHECK (NOT (received_at IS NOT NULL AND open = TRUE))
);

CREATE INDEX IF NOT EXISTS idx_po_supplier_id ON purchase_orders (supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_status      ON purchase_orders (status);
CREATE INDEX IF NOT EXISTS idx_po_open        ON purchase_orders (open);

CREATE OR REPLACE TRIGGER tg_po_freeze_id
    BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION raise_if_id_changed();
CREATE OR REPLACE TRIGGER tg_po_freeze_created_at
    BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION raise_if_created_at_changed();
CREATE OR REPLACE TRIGGER tg_po_updated_at
    BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- fn_po_recalc_on_close — stamp final totals when open flips TRUE → FALSE
CREATE OR REPLACE FUNCTION fn_po_recalc_on_close()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_subtotal NUMERIC(18,4); BEGIN
    IF OLD.open = FALSE OR NEW.open = TRUE THEN RETURN NEW; END IF;

    SELECT COALESCE(SUM(line_total), 0) INTO v_subtotal
    FROM purchase_order_lines WHERE order_id = NEW.id AND deleted = FALSE;

    UPDATE purchase_orders
    SET subtotal = v_subtotal, total = v_subtotal, updated_at = now_ms()
    WHERE id = NEW.id;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER tg_po_recalc_on_close
    AFTER UPDATE OF open ON purchase_orders
    FOR EACH ROW EXECUTE FUNCTION fn_po_recalc_on_close();

CREATE OR REPLACE TRIGGER tg_po_audit
    AFTER INSERT OR UPDATE OR DELETE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
CREATE OR REPLACE TRIGGER tg_po_delete_log
    AFTER DELETE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION fn_delete_log();

-- ---------------------------------------------------------------------------
-- purchase_order_lines
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchase_order_lines (
    id          BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id    BIGINT          NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
    product_id  BIGINT          NOT NULL REFERENCES products(id)        ON DELETE RESTRICT,
    -- Snapshot of products.name at line creation; user may update this freely.
    name        TEXT            NOT NULL DEFAULT '',
    qty         NUMERIC(18,4)   NOT NULL CHECK (qty > 0),
    unit_price  NUMERIC(18,4)   NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    line_total  NUMERIC(18,4)   GENERATED ALWAYS AS (qty * unit_price) STORED,
    -- Price snapshots copied from product at line creation — FROZEN after creation.
    p_price     NUMERIC(18,4)   NOT NULL DEFAULT 0,   -- products.buy_price  at creation time
    s_price     NUMERIC(18,4)   NOT NULL DEFAULT 0,   -- products.sell_price at creation time
    sort_order  INTEGER         NOT NULL DEFAULT 0,
    deleted     BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at  BIGINT          NOT NULL DEFAULT now_ms(),
    updated_at  BIGINT          NOT NULL DEFAULT now_ms()
);

CREATE INDEX IF NOT EXISTS idx_pol_order_id   ON purchase_order_lines (order_id);
CREATE INDEX IF NOT EXISTS idx_pol_product_id ON purchase_order_lines (product_id);

-- Freeze id
CREATE OR REPLACE TRIGGER tg_pol_freeze_id
    BEFORE UPDATE ON purchase_order_lines FOR EACH ROW EXECUTE FUNCTION raise_if_id_changed();
-- Freeze created_at
CREATE OR REPLACE TRIGGER tg_pol_freeze_created_at
    BEFORE UPDATE ON purchase_order_lines FOR EACH ROW EXECUTE FUNCTION raise_if_created_at_changed();

-- Freeze product_id after insert
CREATE OR REPLACE FUNCTION fn_pol_freeze_product_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.product_id IS DISTINCT FROM OLD.product_id THEN
        RAISE EXCEPTION 'product_id on purchase_order_lines is immutable after creation.';
    END IF;
    RETURN NEW;
END; $$;
CREATE OR REPLACE TRIGGER tg_pol_freeze_product_id
    BEFORE UPDATE ON purchase_order_lines FOR EACH ROW EXECUTE FUNCTION fn_pol_freeze_product_id();

-- Freeze order_id after insert
CREATE OR REPLACE FUNCTION fn_pol_freeze_order_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.order_id IS DISTINCT FROM OLD.order_id THEN
        RAISE EXCEPTION 'order_id on purchase_order_lines is immutable after creation.';
    END IF;
    RETURN NEW;
END; $$;
CREATE OR REPLACE TRIGGER tg_pol_freeze_order_id
    BEFORE UPDATE ON purchase_order_lines FOR EACH ROW EXECUTE FUNCTION fn_pol_freeze_order_id();

-- Deny add/modify lines when parent order is closed
CREATE OR REPLACE FUNCTION fn_pol_check_order_open()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_open BOOLEAN; BEGIN
    SELECT open INTO v_open FROM purchase_orders WHERE id = COALESCE(NEW.order_id, OLD.order_id);
    IF NOT FOUND OR NOT v_open THEN
        RAISE EXCEPTION 'Cannot modify purchase_order_lines: parent order is closed.';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END; $$;

CREATE OR REPLACE TRIGGER tg_pol_check_order_open_insert
    BEFORE INSERT ON purchase_order_lines FOR EACH ROW EXECUTE FUNCTION fn_pol_check_order_open();
CREATE OR REPLACE TRIGGER tg_pol_check_order_open_update
    BEFORE UPDATE ON purchase_order_lines FOR EACH ROW EXECUTE FUNCTION fn_pol_check_order_open();
CREATE OR REPLACE TRIGGER tg_pol_check_order_open_delete
    BEFORE DELETE ON purchase_order_lines FOR EACH ROW EXECUTE FUNCTION fn_pol_check_order_open();

-- BEFORE INSERT: auto-populate name (if not provided) and always snapshot prices from product.
CREATE OR REPLACE FUNCTION fn_pol_set_line_defaults()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_prod RECORD; BEGIN
    SELECT name, buy_price, sell_price INTO v_prod
    FROM products WHERE id = NEW.product_id;
    -- name: fill only if caller left it blank; user may supply a custom description
    IF NEW.name IS NULL OR NEW.name = '' THEN
        NEW.name := v_prod.name;
    END IF;
    -- prices: ALWAYS snapshot from product — caller cannot pre-set these
    NEW.p_price := v_prod.buy_price;
    NEW.s_price := v_prod.sell_price;
    RETURN NEW;
END; $$;
CREATE OR REPLACE TRIGGER tg_pol_set_line_defaults
    BEFORE INSERT ON purchase_order_lines FOR EACH ROW EXECUTE FUNCTION fn_pol_set_line_defaults();

-- Freeze p_price and s_price after creation
CREATE OR REPLACE FUNCTION fn_pol_freeze_prices()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.p_price IS DISTINCT FROM OLD.p_price THEN
        RAISE EXCEPTION 'p_price on purchase_order_lines is immutable after creation.';
    END IF;
    IF NEW.s_price IS DISTINCT FROM OLD.s_price THEN
        RAISE EXCEPTION 's_price on purchase_order_lines is immutable after creation.';
    END IF;
    RETURN NEW;
END; $$;
CREATE OR REPLACE TRIGGER tg_pol_freeze_prices
    BEFORE UPDATE ON purchase_order_lines FOR EACH ROW EXECUTE FUNCTION fn_pol_freeze_prices();

-- Auto updated_at
CREATE OR REPLACE TRIGGER tg_pol_updated_at
    BEFORE UPDATE ON purchase_order_lines FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- fn_pol_update_product_tracking()
-- Fires AFTER INSERT / UPDATE / DELETE on purchase_order_lines.
-- Updates products.total_in and products.amount_in (running cumulative totals).
-- Handles soft-delete (deleted flag) correctly:
--   - Line created (not deleted)  → add qty / amount
--   - Line qty/price changed      → delta adjust
--   - Soft-delete FALSE→TRUE      → subtract (line cancelled)
--   - Soft-delete TRUE→FALSE      → add back (line restored)
--   - Hard DELETE                 → subtract if line was active
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_pol_update_product_tracking()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_qty_delta    NUMERIC(18,4) := 0;
    v_amount_delta NUMERIC(18,4) := 0;
    v_product_id   BIGINT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NOT NEW.deleted THEN
            v_qty_delta    := NEW.qty;
            v_amount_delta := NEW.qty * NEW.unit_price;
        END IF;
        v_product_id := NEW.product_id;

    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.deleted AND NOT NEW.deleted THEN
            -- Line restored: add full current amounts
            v_qty_delta    := NEW.qty;
            v_amount_delta := NEW.qty * NEW.unit_price;
        ELSIF NOT OLD.deleted AND NEW.deleted THEN
            -- Line soft-deleted: subtract
            v_qty_delta    := -OLD.qty;
            v_amount_delta := -(OLD.qty * OLD.unit_price);
        ELSIF NOT NEW.deleted THEN
            -- Active line modified: delta only
            v_qty_delta    := NEW.qty        - OLD.qty;
            v_amount_delta := (NEW.qty * NEW.unit_price) - (OLD.qty * OLD.unit_price);
        END IF;
        v_product_id := NEW.product_id;     -- product_id is frozen, safe

    ELSIF TG_OP = 'DELETE' THEN
        IF NOT OLD.deleted THEN             -- subtract only if was active
            v_qty_delta    := -OLD.qty;
            v_amount_delta := -(OLD.qty * OLD.unit_price);
        END IF;
        v_product_id := OLD.product_id;
    END IF;

    IF v_qty_delta <> 0 OR v_amount_delta <> 0 THEN
        UPDATE products
        SET total_in  = GREATEST(0, total_in  + v_qty_delta),
            amount_in = GREATEST(0, amount_in + v_amount_delta),
            updated_at = now_ms()
        WHERE id = v_product_id;
    END IF;

    RETURN NULL;
END; $$;

CREATE OR REPLACE TRIGGER tg_pol_update_tracking
    AFTER INSERT OR UPDATE OR DELETE ON purchase_order_lines
    FOR EACH ROW EXECUTE FUNCTION fn_pol_update_product_tracking();

-- NOTE: PO totals (subtotal/total) are stamped at close time ONLY.
-- See fn_po_recalc_on_close() on purchase_orders.

CREATE OR REPLACE TRIGGER tg_pol_audit
    AFTER INSERT OR UPDATE OR DELETE ON purchase_order_lines FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
CREATE OR REPLACE TRIGGER tg_pol_delete_log
    AFTER DELETE ON purchase_order_lines FOR EACH ROW EXECUTE FUNCTION fn_delete_log();

-- =============================================================================
-- SECTION 9 — SALES ORDERS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- sales_orders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales_orders (
    id              BIGINT                  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    so_number       TEXT                    NOT NULL UNIQUE,
    customer_id     BIGINT                  REFERENCES customers(id)     ON DELETE RESTRICT,
    end_customer_id BIGINT                  REFERENCES end_customers(id) ON DELETE RESTRICT,
    delivery_date   BIGINT,
    notes           TEXT,
    subtotal        NUMERIC(18,4)           NOT NULL DEFAULT 0 CHECK (subtotal    >= 0),
    tax_pct         NUMERIC(7,4)            NOT NULL DEFAULT 0 CHECK (tax_pct     >= 0),
    tax_amount      NUMERIC(18,4)           NOT NULL DEFAULT 0 CHECK (tax_amount  >= 0),
    total           NUMERIC(18,4)           NOT NULL DEFAULT 0 CHECK (total       >= 0),
    shipped_at      BIGINT,
    delivered_at    BIGINT,
    status          sales_order_status_t    NOT NULL DEFAULT 'draft',
    open            BOOLEAN                 NOT NULL DEFAULT TRUE,
    locked_by_uid   BIGINT                  REFERENCES users(id) ON DELETE SET NULL,
    locked_at       BIGINT,
    created_at      BIGINT                  NOT NULL DEFAULT now_ms(),
    updated_at      BIGINT                  NOT NULL DEFAULT now_ms(),

    CONSTRAINT chk_so_number_nonempty    CHECK (char_length(so_number) > 0),
    CONSTRAINT chk_so_delivery_after_ship CHECK (delivered_at IS NULL OR shipped_at IS NOT NULL),
    CONSTRAINT chk_so_cancelled_closed    CHECK (NOT (status = 'cancelled' AND open = TRUE))
);

CREATE INDEX IF NOT EXISTS idx_so_customer_id     ON sales_orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_so_end_customer_id ON sales_orders (end_customer_id);
CREATE INDEX IF NOT EXISTS idx_so_status          ON sales_orders (status);
CREATE INDEX IF NOT EXISTS idx_so_open            ON sales_orders (open);
CREATE INDEX IF NOT EXISTS idx_so_locked_by_uid   ON sales_orders (locked_by_uid);

CREATE OR REPLACE TRIGGER tg_so_freeze_id
    BEFORE UPDATE ON sales_orders FOR EACH ROW EXECUTE FUNCTION raise_if_id_changed();
CREATE OR REPLACE TRIGGER tg_so_freeze_created_at
    BEFORE UPDATE ON sales_orders FOR EACH ROW EXECUTE FUNCTION raise_if_created_at_changed();
CREATE OR REPLACE TRIGGER tg_so_updated_at
    BEFORE UPDATE ON sales_orders FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- fn_so_recalc_on_close — stamp final totals when open flips TRUE → FALSE
CREATE OR REPLACE FUNCTION fn_so_recalc_on_close()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_subtotal   NUMERIC(18,4);
    v_tax_amount NUMERIC(18,4);
BEGIN
    IF OLD.open = FALSE OR NEW.open = TRUE THEN RETURN NEW; END IF;

    SELECT COALESCE(SUM(qty * unit_price), 0) INTO v_subtotal
    FROM sales_order_lines WHERE order_id = NEW.id;

    v_tax_amount := ROUND(v_subtotal * NEW.tax_pct / 100, 4);

    UPDATE sales_orders
    SET subtotal   = v_subtotal,
        tax_amount = v_tax_amount,
        total      = v_subtotal + v_tax_amount,
        updated_at = now_ms()
    WHERE id = NEW.id;

    RETURN NEW;
END; $$;

CREATE OR REPLACE TRIGGER tg_so_recalc_on_close
    AFTER UPDATE OF open ON sales_orders
    FOR EACH ROW EXECUTE FUNCTION fn_so_recalc_on_close();

CREATE OR REPLACE TRIGGER tg_so_audit
    AFTER INSERT OR UPDATE OR DELETE ON sales_orders FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
CREATE OR REPLACE TRIGGER tg_so_delete_log
    AFTER DELETE ON sales_orders FOR EACH ROW EXECUTE FUNCTION fn_delete_log();

-- ---------------------------------------------------------------------------
-- sales_order_lines
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales_order_lines (
    id          BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id    BIGINT          NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
    product_id  BIGINT          NOT NULL REFERENCES products(id)     ON DELETE RESTRICT,
    -- Snapshot of products.name at line creation; user may update this freely.
    name        TEXT            NOT NULL DEFAULT '',
    -- qty: no lower bound — negative values represent credit/return lines on an SO.
    qty         NUMERIC(18,4)   NOT NULL CHECK (qty <> 0),
    unit_price  NUMERIC(18,4)   NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    line_total  NUMERIC(18,4)   GENERATED ALWAYS AS (qty * unit_price) STORED,
    -- Price snapshots copied from product at line creation — FROZEN after creation.
    p_price     NUMERIC(18,4)   NOT NULL DEFAULT 0,   -- products.buy_price  at creation time
    s_price     NUMERIC(18,4)   NOT NULL DEFAULT 0,   -- products.sell_price at creation time
    sort_order  INTEGER         NOT NULL DEFAULT 0,
    created_at  BIGINT          NOT NULL DEFAULT now_ms(),
    updated_at  BIGINT          NOT NULL DEFAULT now_ms()
);

CREATE INDEX IF NOT EXISTS idx_sol_order_id   ON sales_order_lines (order_id);
CREATE INDEX IF NOT EXISTS idx_sol_product_id ON sales_order_lines (product_id);

-- Freeze id
CREATE OR REPLACE TRIGGER tg_sol_freeze_id
    BEFORE UPDATE ON sales_order_lines FOR EACH ROW EXECUTE FUNCTION raise_if_id_changed();
-- Freeze created_at
CREATE OR REPLACE TRIGGER tg_sol_freeze_created_at
    BEFORE UPDATE ON sales_order_lines FOR EACH ROW EXECUTE FUNCTION raise_if_created_at_changed();

-- Freeze product_id
CREATE OR REPLACE FUNCTION fn_sol_freeze_product_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.product_id IS DISTINCT FROM OLD.product_id THEN
        RAISE EXCEPTION 'product_id on sales_order_lines is immutable after creation.';
    END IF;
    RETURN NEW;
END; $$;
CREATE OR REPLACE TRIGGER tg_sol_freeze_product_id
    BEFORE UPDATE ON sales_order_lines FOR EACH ROW EXECUTE FUNCTION fn_sol_freeze_product_id();

-- Freeze order_id
CREATE OR REPLACE FUNCTION fn_sol_freeze_order_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.order_id IS DISTINCT FROM OLD.order_id THEN
        RAISE EXCEPTION 'order_id on sales_order_lines is immutable after creation.';
    END IF;
    RETURN NEW;
END; $$;
CREATE OR REPLACE TRIGGER tg_sol_freeze_order_id
    BEFORE UPDATE ON sales_order_lines FOR EACH ROW EXECUTE FUNCTION fn_sol_freeze_order_id();

-- Deny add/modify lines when parent order is closed
CREATE OR REPLACE FUNCTION fn_sol_check_order_open()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_open BOOLEAN; BEGIN
    SELECT open INTO v_open FROM sales_orders WHERE id = COALESCE(NEW.order_id, OLD.order_id);
    IF NOT FOUND OR NOT v_open THEN
        RAISE EXCEPTION 'Cannot modify sales_order_lines: parent order is closed.';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END; $$;

CREATE OR REPLACE TRIGGER tg_sol_check_order_open_insert
    BEFORE INSERT ON sales_order_lines FOR EACH ROW EXECUTE FUNCTION fn_sol_check_order_open();
CREATE OR REPLACE TRIGGER tg_sol_check_order_open_update
    BEFORE UPDATE ON sales_order_lines FOR EACH ROW EXECUTE FUNCTION fn_sol_check_order_open();
CREATE OR REPLACE TRIGGER tg_sol_check_order_open_delete
    BEFORE DELETE ON sales_order_lines FOR EACH ROW EXECUTE FUNCTION fn_sol_check_order_open();

-- BEFORE INSERT: auto-populate name (if not provided) and always snapshot prices from product.
CREATE OR REPLACE FUNCTION fn_sol_set_line_defaults()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_prod RECORD; BEGIN
    SELECT name, buy_price, sell_price INTO v_prod
    FROM products WHERE id = NEW.product_id;
    -- name: fill only if caller left it blank
    IF NEW.name IS NULL OR NEW.name = '' THEN
        NEW.name := v_prod.name;
    END IF;
    -- prices: ALWAYS snapshot from product — caller cannot pre-set these
    NEW.p_price := v_prod.buy_price;
    NEW.s_price := v_prod.sell_price;
    RETURN NEW;
END; $$;
CREATE OR REPLACE TRIGGER tg_sol_set_line_defaults
    BEFORE INSERT ON sales_order_lines FOR EACH ROW EXECUTE FUNCTION fn_sol_set_line_defaults();

-- Freeze p_price and s_price after creation
CREATE OR REPLACE FUNCTION fn_sol_freeze_prices()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.p_price IS DISTINCT FROM OLD.p_price THEN
        RAISE EXCEPTION 'p_price on sales_order_lines is immutable after creation.';
    END IF;
    IF NEW.s_price IS DISTINCT FROM OLD.s_price THEN
        RAISE EXCEPTION 's_price on sales_order_lines is immutable after creation.';
    END IF;
    RETURN NEW;
END; $$;
CREATE OR REPLACE TRIGGER tg_sol_freeze_prices
    BEFORE UPDATE ON sales_order_lines FOR EACH ROW EXECUTE FUNCTION fn_sol_freeze_prices();

-- Auto updated_at
CREATE OR REPLACE TRIGGER tg_sol_updated_at
    BEFORE UPDATE ON sales_order_lines FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- fn_sol_update_product_tracking()
-- Fires AFTER INSERT / UPDATE / DELETE on sales_order_lines.
-- Updates products.total_out and products.amount_out.
-- sales_order_lines has no soft-delete; only hard DELETE and value changes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_sol_update_product_tracking()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_qty_delta    NUMERIC(18,4) := 0;
    v_amount_delta NUMERIC(18,4) := 0;
    v_product_id   BIGINT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_qty_delta    := NEW.qty;
        v_amount_delta := NEW.qty * NEW.unit_price;
        v_product_id   := NEW.product_id;

    ELSIF TG_OP = 'UPDATE' THEN
        -- product_id is frozen so OLD.product_id == NEW.product_id
        v_qty_delta    := NEW.qty        - OLD.qty;
        v_amount_delta := (NEW.qty * NEW.unit_price) - (OLD.qty * OLD.unit_price);
        v_product_id   := NEW.product_id;

    ELSIF TG_OP = 'DELETE' THEN
        v_qty_delta    := -OLD.qty;
        v_amount_delta := -(OLD.qty * OLD.unit_price);
        v_product_id   := OLD.product_id;
    END IF;

    IF v_qty_delta <> 0 OR v_amount_delta <> 0 THEN
        UPDATE products
        SET total_out  = GREATEST(0, total_out  + v_qty_delta),
            amount_out = GREATEST(0, amount_out + v_amount_delta),
            updated_at = now_ms()
        WHERE id = v_product_id;
    END IF;

    RETURN NULL;
END; $$;

CREATE OR REPLACE TRIGGER tg_sol_update_tracking
    AFTER INSERT OR UPDATE OR DELETE ON sales_order_lines
    FOR EACH ROW EXECUTE FUNCTION fn_sol_update_product_tracking();

-- NOTE: SO totals are stamped at close time ONLY. See fn_so_recalc_on_close().

CREATE OR REPLACE TRIGGER tg_sol_audit
    AFTER INSERT OR UPDATE OR DELETE ON sales_order_lines FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
CREATE OR REPLACE TRIGGER tg_sol_delete_log
    AFTER DELETE ON sales_order_lines FOR EACH ROW EXECUTE FUNCTION fn_delete_log();

-- =============================================================================
-- SECTION 10 — PAYMENTS  (INSERT-ONLY)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- s_payments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS s_payments (
    id           BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    by_user_id   BIGINT          NOT NULL REFERENCES users(id)        ON DELETE RESTRICT,
    customer_id  BIGINT          REFERENCES customers(id)             ON DELETE RESTRICT,
    order_id     BIGINT          REFERENCES sales_orders(id)          ON DELETE RESTRICT,
    amount       NUMERIC(18,4)   NOT NULL CHECK (amount > 0),
    notes        TEXT,
    date         BIGINT          NOT NULL DEFAULT now_ms(),
    date_created BIGINT          NOT NULL DEFAULT now_ms(),

    CONSTRAINT chk_sp_has_customer_or_order CHECK (customer_id IS NOT NULL OR order_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_sp_by_user_id  ON s_payments (by_user_id);
CREATE INDEX IF NOT EXISTS idx_sp_customer_id ON s_payments (customer_id);
CREATE INDEX IF NOT EXISTS idx_sp_order_id    ON s_payments (order_id);
CREATE INDEX IF NOT EXISTS idx_sp_date        ON s_payments (date);

CREATE OR REPLACE TRIGGER tg_sp_freeze_id
    BEFORE UPDATE ON s_payments FOR EACH ROW EXECUTE FUNCTION raise_if_id_changed();

CREATE OR REPLACE FUNCTION fn_payments_no_modify()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Payments are immutable. Issue a corrective payment instead.';
END; $$;
CREATE OR REPLACE TRIGGER tg_sp_no_update
    BEFORE UPDATE ON s_payments FOR EACH ROW EXECUTE FUNCTION fn_payments_no_modify();
CREATE OR REPLACE TRIGGER tg_sp_no_delete
    BEFORE DELETE ON s_payments FOR EACH ROW EXECUTE FUNCTION fn_payments_no_modify();
CREATE OR REPLACE TRIGGER tg_sp_audit
    AFTER INSERT ON s_payments FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

-- ---------------------------------------------------------------------------
-- p_payments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS p_payments (
    id           BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    by_user_id   BIGINT          NOT NULL REFERENCES users(id)         ON DELETE RESTRICT,
    supplier_id  BIGINT          REFERENCES suppliers(id)              ON DELETE RESTRICT,
    order_id     BIGINT          REFERENCES purchase_orders(id)        ON DELETE RESTRICT,
    amount       NUMERIC(18,4)   NOT NULL CHECK (amount > 0),
    notes        TEXT,
    date         BIGINT          NOT NULL DEFAULT now_ms(),
    date_created BIGINT          NOT NULL DEFAULT now_ms(),

    CONSTRAINT chk_pp_has_supplier_or_order CHECK (supplier_id IS NOT NULL OR order_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_pp_by_user_id  ON p_payments (by_user_id);
CREATE INDEX IF NOT EXISTS idx_pp_supplier_id ON p_payments (supplier_id);
CREATE INDEX IF NOT EXISTS idx_pp_order_id    ON p_payments (order_id);
CREATE INDEX IF NOT EXISTS idx_pp_date        ON p_payments (date);

CREATE OR REPLACE TRIGGER tg_pp_freeze_id
    BEFORE UPDATE ON p_payments FOR EACH ROW EXECUTE FUNCTION raise_if_id_changed();
CREATE OR REPLACE TRIGGER tg_pp_no_update
    BEFORE UPDATE ON p_payments FOR EACH ROW EXECUTE FUNCTION fn_payments_no_modify();
CREATE OR REPLACE TRIGGER tg_pp_no_delete
    BEFORE DELETE ON p_payments FOR EACH ROW EXECUTE FUNCTION fn_payments_no_modify();
CREATE OR REPLACE TRIGGER tg_pp_audit
    AFTER INSERT ON p_payments FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

-- =============================================================================
-- SECTION 11 — STORED PROCEDURES / BUSINESS FUNCTIONS
-- =============================================================================

-- fn_open_sales_order(p_order_id, p_user_id, p_user_role)
CREATE OR REPLACE FUNCTION fn_open_sales_order(
    p_order_id  BIGINT,
    p_user_id   BIGINT,
    p_user_role user_role_t
)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
    v_locked_by_uid BIGINT;
    v_locked_at     BIGINT;
    v_lock_window   BIGINT := 15 * 60 * 1000;
    v_now           BIGINT := now_ms();
BEGIN
    SELECT locked_by_uid, locked_at INTO v_locked_by_uid, v_locked_at
    FROM sales_orders WHERE id = p_order_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('error','ORDER_NOT_FOUND'); END IF;

    IF p_user_role IN ('admin','employee') THEN
        UPDATE sales_orders
        SET locked_by_uid = p_user_id, locked_at = v_now, open = TRUE, updated_at = v_now
        WHERE id = p_order_id;
        RETURN jsonb_build_object('ok', TRUE);
    END IF;

    IF v_locked_by_uid IS NOT NULL AND v_locked_by_uid <> p_user_id
       AND (v_now - v_locked_at) < v_lock_window THEN
        RETURN jsonb_build_object('error','ORDER_LOCKED_BY_ANOTHER_USER');
    END IF;

    UPDATE sales_orders
    SET locked_by_uid = p_user_id, locked_at = v_now, open = TRUE, updated_at = v_now
    WHERE id = p_order_id;
    RETURN jsonb_build_object('ok', TRUE);
END; $$;

-- fn_close_sales_order(p_order_id, p_user_id, p_user_role)
CREATE OR REPLACE FUNCTION fn_close_sales_order(
    p_order_id  BIGINT,
    p_user_id   BIGINT,
    p_user_role user_role_t
)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
    v_locked_by_uid BIGINT;
    v_now           BIGINT := now_ms();
BEGIN
    SELECT locked_by_uid INTO v_locked_by_uid FROM sales_orders WHERE id = p_order_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('error','ORDER_NOT_FOUND'); END IF;

    IF p_user_role NOT IN ('admin','employee') AND v_locked_by_uid IS DISTINCT FROM p_user_id THEN
        RETURN jsonb_build_object('error','UNAUTHORIZED');
    END IF;

    UPDATE sales_orders
    SET open = FALSE, locked_by_uid = NULL, locked_at = NULL, updated_at = v_now
    WHERE id = p_order_id;
    RETURN jsonb_build_object('ok', TRUE);
END; $$;

-- fn_open_purchase_order(p_order_id, p_user_id)
CREATE OR REPLACE FUNCTION fn_open_purchase_order(p_order_id BIGINT, p_user_id BIGINT)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v_now BIGINT := now_ms(); BEGIN
    UPDATE purchase_orders
    SET open = TRUE, locked_by_uid = p_user_id, locked_at = v_now, updated_at = v_now
    WHERE id = p_order_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('error','ORDER_NOT_FOUND'); END IF;
    RETURN jsonb_build_object('ok', TRUE);
END; $$;

-- fn_close_purchase_order(p_order_id)
CREATE OR REPLACE FUNCTION fn_close_purchase_order(p_order_id BIGINT)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v_now BIGINT := now_ms(); BEGIN
    UPDATE purchase_orders
    SET open = FALSE, locked_by_uid = NULL, locked_at = NULL, updated_at = v_now
    WHERE id = p_order_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('error','ORDER_NOT_FOUND'); END IF;
    RETURN jsonb_build_object('ok', TRUE);
END; $$;

-- fn_receive_purchase_order(p_order_id)
-- Marks PO as received and inserts a stock-in movement for each non-deleted line.
CREATE OR REPLACE FUNCTION fn_receive_purchase_order(p_order_id BIGINT)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
    v_line    RECORD;
    v_now     BIGINT := now_ms();
    v_cur_stock NUMERIC(18,4);
BEGIN
    -- Must be closed (open = FALSE) before receiving
    IF EXISTS (SELECT 1 FROM purchase_orders WHERE id = p_order_id AND open = TRUE) THEN
        RETURN jsonb_build_object('error','ORDER_MUST_BE_CLOSED_BEFORE_RECEIVING');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM purchase_orders WHERE id = p_order_id) THEN
        RETURN jsonb_build_object('error','ORDER_NOT_FOUND');
    END IF;

    FOR v_line IN
        SELECT product_id, qty FROM purchase_order_lines
        WHERE order_id = p_order_id AND deleted = FALSE
    LOOP
        SELECT stock INTO v_cur_stock FROM products WHERE id = v_line.product_id;
        INSERT INTO movements (product_id, type, qty, before, after, reason, ref, created_at)
        VALUES (v_line.product_id, 'in', v_line.qty,
                v_cur_stock, v_cur_stock + v_line.qty,
                'Purchase order received', p_order_id::TEXT, v_now);
    END LOOP;

    UPDATE purchase_orders
    SET status = 'received', received_at = v_now, updated_at = v_now
    WHERE id = p_order_id;

    RETURN jsonb_build_object('ok', TRUE);
END; $$;

-- fn_ship_sales_order(p_order_id)
-- Marks SO as shipped and inserts a stock-out movement for each line.
CREATE OR REPLACE FUNCTION fn_ship_sales_order(p_order_id BIGINT)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
    v_line      RECORD;
    v_now       BIGINT := now_ms();
    v_cur_stock NUMERIC(18,4);
BEGIN
    IF EXISTS (SELECT 1 FROM sales_orders WHERE id = p_order_id AND open = TRUE) THEN
        RETURN jsonb_build_object('error','ORDER_MUST_BE_CLOSED_BEFORE_SHIPPING');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM sales_orders WHERE id = p_order_id) THEN
        RETURN jsonb_build_object('error','ORDER_NOT_FOUND');
    END IF;

    FOR v_line IN
        SELECT product_id, qty FROM sales_order_lines WHERE order_id = p_order_id
    LOOP
        SELECT stock INTO v_cur_stock FROM products WHERE id = v_line.product_id;
        INSERT INTO movements (product_id, type, qty, before, after, reason, ref, created_at)
        VALUES (v_line.product_id, 'out', v_line.qty,
                v_cur_stock, v_cur_stock - v_line.qty,
                'Sales order shipped', p_order_id::TEXT, v_now);
    END LOOP;

    UPDATE sales_orders
    SET status = 'shipped', shipped_at = v_now, updated_at = v_now
    WHERE id = p_order_id;

    RETURN jsonb_build_object('ok', TRUE);
END; $$;

-- fn_advance_sales_order_status(p_order_id, p_new_status)
CREATE OR REPLACE FUNCTION fn_advance_sales_order_status(
    p_order_id   BIGINT,
    p_new_status sales_order_status_t
)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
    v_current sales_order_status_t;
    v_allowed sales_order_status_t[];
    v_now     BIGINT := now_ms();
BEGIN
    SELECT status INTO v_current FROM sales_orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('error','ORDER_NOT_FOUND'); END IF;

    v_allowed := CASE v_current
        WHEN 'draft'      THEN ARRAY['confirmed','cancelled']::sales_order_status_t[]
        WHEN 'confirmed'  THEN ARRAY['processing','cancelled']::sales_order_status_t[]
        WHEN 'processing' THEN ARRAY['shipped','cancelled']::sales_order_status_t[]
        WHEN 'shipped'    THEN ARRAY['delivered']::sales_order_status_t[]
        WHEN 'delivered'  THEN ARRAY[]::sales_order_status_t[]
        WHEN 'cancelled'  THEN ARRAY[]::sales_order_status_t[]
        ELSE                   ARRAY[]::sales_order_status_t[]
    END;

    IF NOT (p_new_status = ANY(v_allowed)) THEN
        RETURN jsonb_build_object('error','INVALID_STATUS_TRANSITION','from',v_current,'to',p_new_status);
    END IF;

    UPDATE sales_orders SET status = p_new_status, updated_at = v_now WHERE id = p_order_id;
    RETURN jsonb_build_object('ok', TRUE, 'status', p_new_status);
END; $$;

-- fn_advance_purchase_order_status(p_order_id, p_new_status)
CREATE OR REPLACE FUNCTION fn_advance_purchase_order_status(
    p_order_id   BIGINT,
    p_new_status purchase_order_status_t
)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
    v_current purchase_order_status_t;
    v_allowed purchase_order_status_t[];
    v_now     BIGINT := now_ms();
BEGIN
    SELECT status INTO v_current FROM purchase_orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('error','ORDER_NOT_FOUND'); END IF;

    v_allowed := CASE v_current
        WHEN 'draft'     THEN ARRAY['confirmed','cancelled']::purchase_order_status_t[]
        WHEN 'confirmed' THEN ARRAY['received','cancelled']::purchase_order_status_t[]
        WHEN 'received'  THEN ARRAY[]::purchase_order_status_t[]
        WHEN 'cancelled' THEN ARRAY[]::purchase_order_status_t[]
        ELSE                  ARRAY[]::purchase_order_status_t[]
    END;

    IF NOT (p_new_status = ANY(v_allowed)) THEN
        RETURN jsonb_build_object('error','INVALID_STATUS_TRANSITION','from',v_current,'to',p_new_status);
    END IF;

    UPDATE purchase_orders SET status = p_new_status, updated_at = v_now WHERE id = p_order_id;
    RETURN jsonb_build_object('ok', TRUE, 'status', p_new_status);
END; $$;

-- =============================================================================
-- SECTION 12 — VIEWS
-- =============================================================================

CREATE OR REPLACE VIEW v_products_stock AS
SELECT
    p.id,
    p.name,
    p.sku,
    c.name           AS category_name,
    p.unit,
    p.stock,
    p.total_in,
    p.total_out,
    p.amount_in,
    p.amount_out,
    p.amount_in - p.amount_out        AS gross_margin,
    p.low_stock,
    CASE
        WHEN p.stock <= 0          THEN 'OUT_OF_STOCK'
        WHEN p.stock <= p.low_stock THEN 'LOW_STOCK'
        ELSE 'IN_STOCK'
    END              AS stock_status,
    p.buy_price,
    p.sell_price,
    p.active,
    p.updated_at
FROM products p
LEFT JOIN categories c ON c.id = p.category_id
WHERE p.deleted = FALSE;

CREATE OR REPLACE VIEW v_sales_orders_full AS
SELECT
    so.id,
    so.so_number,
    c.full_name     AS customer_name,
    ec.full_name    AS end_customer_name,
    so.status,
    so.open,
    so.subtotal,
    so.tax_pct,
    so.tax_amount,
    so.total,
    so.delivery_date,
    so.shipped_at,
    so.delivered_at,
    so.created_at,
    so.updated_at
FROM sales_orders so
LEFT JOIN customers     c  ON c.id  = so.customer_id
LEFT JOIN end_customers ec ON ec.id = so.end_customer_id;

CREATE OR REPLACE VIEW v_purchase_orders_full AS
SELECT
    po.id,
    po.po_number,
    po.por,
    s.name       AS supplier_name,
    po.status,
    po.open,
    po.subtotal,
    po.total,
    po.expected_date,
    po.received_at,
    po.created_at,
    po.updated_at
FROM purchase_orders po
LEFT JOIN suppliers s ON s.id = po.supplier_id;

CREATE OR REPLACE VIEW v_sales_order_balance AS
SELECT
    so.id           AS order_id,
    so.so_number,
    so.total        AS order_total,
    COALESCE(SUM(sp.amount), 0)             AS total_paid,
    so.total - COALESCE(SUM(sp.amount), 0)  AS balance_due
FROM sales_orders so
LEFT JOIN s_payments sp ON sp.order_id = so.id
GROUP BY so.id, so.so_number, so.total;

CREATE OR REPLACE VIEW v_purchase_order_balance AS
SELECT
    po.id           AS order_id,
    po.po_number,
    po.total        AS order_total,
    COALESCE(SUM(pp.amount), 0)             AS total_paid,
    po.total - COALESCE(SUM(pp.amount), 0)  AS balance_due
FROM purchase_orders po
LEFT JOIN p_payments pp ON pp.order_id = po.id
GROUP BY po.id, po.po_number, po.total;

-- =============================================================================
-- SECTION 13 — ROW LEVEL SECURITY POLICIES  (Supabase / PostgREST stubs)
-- =============================================================================
-- Enable per-table with:  ALTER TABLE <tbl> ENABLE ROW LEVEL SECURITY;
-- Example:
-- CREATE POLICY so_customer_view ON sales_orders FOR SELECT
--     USING (customer_id = current_setting('app.current_cid', TRUE)::BIGINT);

-- =============================================================================
-- SECTION 14 — SEED / BOOTSTRAP
-- =============================================================================
-- Default admin user (password MUST be hashed before insert):
-- INSERT INTO users (name, pwd, role)
-- VALUES ('admin', '<bcrypt-hash>', 'admin');

-- =============================================================================
-- SECTION 15 — SUGGESTED MISSING FEATURES
-- =============================================================================
/*
  1. DISCOUNTS      — discount_pct / discount_amount on order headers and/or lines.
  2. MULTI-TAX      — Multiple tax rates. Separate tax_rates table linked to products.
  3. CURRENCY       — currency_code + exchange_rate on orders.
  4. SHIPPING       — cost, carrier, tracking_number on sales_orders.
  5. RETURNS/RMA    — return_orders / credit_note table.
  6. WAREHOUSES     — Multiple locations; stock per (product × warehouse).
  7. BATCH/LOT      — expiry dates, serial numbers in movements.
  8. INVOICES       — Separate invoice table (one invoice → many orders).
  9. CREDIT LIMIT   — customers.credit_limit; block SO when exceeded.
 10. AUDIT USER     — current_setting('app.current_user_id') stored in audit_log.
 11. SOFT-DELETE    — deleted/deleted_at on all tables (not just products).
 12. REAL-TIME      — pg_notify call in fn_audit_log for SSE fan-out.
 13. USER AVATAR    — avatar_asset_id FK on users → assets.
 14. TAGS/LABELS    — Many-to-many tags on products and orders.
 15. PRICE LISTS    — Per-customer negotiated prices table.
*/

-- =============================================================================
-- SECTION 16 — SENTINEL ROWS  (id = 0, protected, immutable)
-- =============================================================================
-- Each business table gets one "null object" row with id = 0.
-- Protected by fn_protect_sentinel_row(); any UPDATE or DELETE raises SQLSTATE 23000.
-- Insertion follows FK dependency order.
-- OVERRIDING SYSTEM VALUE bypasses the GENERATED ALWAYS AS IDENTITY constraint.
-- =============================================================================

-- 1. users
INSERT INTO users (id, name, pwd, cid, role, blocked, created_at, updated_at)
OVERRIDING SYSTEM VALUE
VALUES (0, '<system>', '<no-auth>', NULL, 'anonymous', TRUE, 0, 0)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE TRIGGER tg_users_protect_sentinel
    BEFORE UPDATE OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_protect_sentinel_row();

-- 2. categories
INSERT INTO categories (id, name, abr, ref, created_at, updated_at)
OVERRIDING SYSTEM VALUE
VALUES (0, '<uncategorized>', 'UNC', '', 0, 0)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE TRIGGER tg_categories_protect_sentinel
    BEFORE UPDATE OR DELETE ON categories
    FOR EACH ROW EXECUTE FUNCTION fn_protect_sentinel_row();

-- 3. suppliers
INSERT INTO suppliers (id, name, is_active, created_at, updated_at)
OVERRIDING SYSTEM VALUE
VALUES (0, '<direct>', FALSE, 0, 0)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE TRIGGER tg_suppliers_protect_sentinel
    BEFORE UPDATE OR DELETE ON suppliers
    FOR EACH ROW EXECUTE FUNCTION fn_protect_sentinel_row();

-- 4. customers
INSERT INTO customers (id, full_name, is_active, created_at, updated_at)
OVERRIDING SYSTEM VALUE
VALUES (0, '<anonymous>', FALSE, 0, 0)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE TRIGGER tg_customers_protect_sentinel
    BEFORE UPDATE OR DELETE ON customers
    FOR EACH ROW EXECUTE FUNCTION fn_protect_sentinel_row();

-- 5. end_customers
INSERT INTO end_customers (id, full_name, is_active, created_at, updated_at)
OVERRIDING SYSTEM VALUE
VALUES (0, '<anonymous>', FALSE, 0, 0)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE TRIGGER tg_end_customers_protect_sentinel
    BEFORE UPDATE OR DELETE ON end_customers
    FOR EACH ROW EXECUTE FUNCTION fn_protect_sentinel_row();

-- 6. products  (category_id=0, supplier_id=0 → already exist above)
INSERT INTO products (id, name, sku, category_id, unit, supplier_id,
                      buy_price, sell_price, stock, total_in, total_out,
                      amount_in, amount_out, low_stock, active, deleted,
                      created_at, updated_at)
OVERRIDING SYSTEM VALUE
VALUES (0, '<diverse>', 'DIVERSE-000', 0, 'pcs', 0,
        0, 0, 0, 0, 0, 0, 0, 0, FALSE, FALSE, 0, 0)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE TRIGGER tg_products_protect_sentinel
    BEFORE UPDATE OR DELETE ON products
    FOR EACH ROW EXECUTE FUNCTION fn_protect_sentinel_row();

-- 7. assets
INSERT INTO assets (id, name, path, type, size, mime_type,
                    created_by_user_id, owner, "for", deleted, created_at)
OVERRIDING SYSTEM VALUE
VALUES (0, '<system>', '/dev/null', 'file', 0, 'application/octet-stream',
        0, 0, 'anonymous', FALSE, 0)
ON CONFLICT (id) DO NOTHING;
-- (assets already protected by fn_assets_no_modify)

-- 8. purchase_orders  (open=FALSE so no lines can be attached)
INSERT INTO purchase_orders (id, po_number, supplier_id, status, subtotal, total,
                              open, created_at, updated_at)
OVERRIDING SYSTEM VALUE
VALUES (0, 'PO-000000', 0, 'cancelled', 0, 0, FALSE, 0, 0)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE TRIGGER tg_po_protect_sentinel
    BEFORE UPDATE OR DELETE ON purchase_orders
    FOR EACH ROW EXECUTE FUNCTION fn_protect_sentinel_row();

-- 9. sales_orders
INSERT INTO sales_orders (id, so_number, customer_id, end_customer_id,
                           status, subtotal, tax_pct, tax_amount, total,
                           open, created_at, updated_at)
OVERRIDING SYSTEM VALUE
VALUES (0, 'SO-000000', 0, 0, 'cancelled', 0, 0, 0, 0, FALSE, 0, 0)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE TRIGGER tg_so_protect_sentinel
    BEFORE UPDATE OR DELETE ON sales_orders
    FOR EACH ROW EXECUTE FUNCTION fn_protect_sentinel_row();

-- 10. s_payments  (amount must be > 0 per constraint)
INSERT INTO s_payments (id, by_user_id, customer_id, order_id, amount, notes, date, date_created)
OVERRIDING SYSTEM VALUE
VALUES (0, 0, 0, 0, 0.0001, '<system sentinel>', 0, 0)
ON CONFLICT (id) DO NOTHING;
-- (already protected by fn_payments_no_modify — INSERT-ONLY)

-- 11. p_payments
INSERT INTO p_payments (id, by_user_id, supplier_id, order_id, amount, notes, date, date_created)
OVERRIDING SYSTEM VALUE
VALUES (0, 0, 0, 0, 0.0001, '<system sentinel>', 0, 0)
ON CONFLICT (id) DO NOTHING;
-- (already protected by fn_payments_no_modify)

-- NOTE: sessions, audit_log, delete_log, events, movements have no sentinel rows:
-- sessions  → ephemeral/runtime, no meaningful null object
-- audit_log / delete_log → infrastructure tables with BIGSERIAL-style seq PKs,
--             not GENERATED ALWAYS AS IDENTITY; sentinel not needed
-- movements → INSERT-ONLY with stock validation; no sentinel possible
-- purchase_order_lines / sales_order_lines → sub-entities; parent sentinel
--             order is closed (open=FALSE) so no lines can be attached

COMMIT;
