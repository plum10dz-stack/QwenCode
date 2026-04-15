-- =============================================================================
-- SOS ERP — Advanced SQL Functions  (functions.sql)
-- Run AFTER database-init.sql.
-- These are higher-level business functions not in the base schema.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. DASHBOARD / REPORTING FUNCTIONS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- fn_dashboard_summary()
-- Returns a single JSON object with key KPIs for the main dashboard.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_dashboard_summary()
RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_today_start BIGINT := (EXTRACT(EPOCH FROM date_trunc('day', NOW()))::BIGINT) * 1000;
    v_month_start BIGINT := (EXTRACT(EPOCH FROM date_trunc('month', NOW()))::BIGINT) * 1000;
BEGIN
    RETURN jsonb_build_object(
        -- Inventory
        'total_products',        (SELECT COUNT(*)      FROM products WHERE deleted = FALSE),
        'low_stock_count',       (SELECT COUNT(*)      FROM products WHERE deleted = FALSE AND active = TRUE AND stock <= low_stock AND stock > 0),
        'out_of_stock_count',    (SELECT COUNT(*)      FROM products WHERE deleted = FALSE AND active = TRUE AND stock = 0),
        'inventory_value',       (SELECT COALESCE(SUM(stock * buy_price), 0) FROM products WHERE deleted = FALSE),
        -- Sales
        'open_sales_orders',     (SELECT COUNT(*)      FROM sales_orders WHERE open = TRUE),
        'sales_today',           (SELECT COALESCE(SUM(total), 0) FROM sales_orders WHERE created_at >= v_today_start AND status NOT IN ('cancelled','draft')),
        'sales_this_month',      (SELECT COALESCE(SUM(total), 0) FROM sales_orders WHERE created_at >= v_month_start AND status NOT IN ('cancelled','draft')),
        'unpaid_so_balance',     (SELECT COALESCE(SUM(so.total - COALESCE(paid.amt, 0)), 0)
                                  FROM sales_orders so
                                  LEFT JOIN (SELECT order_id, SUM(amount) AS amt FROM s_payments GROUP BY order_id) paid ON paid.order_id = so.id
                                  WHERE so.status NOT IN ('cancelled','draft')),
        -- Purchases
        'open_purchase_orders',  (SELECT COUNT(*)      FROM purchase_orders WHERE open = TRUE),
        'purchases_this_month',  (SELECT COALESCE(SUM(total), 0) FROM purchase_orders WHERE created_at >= v_month_start AND status NOT IN ('cancelled','draft')),
        'unpaid_po_balance',     (SELECT COALESCE(SUM(po.total - COALESCE(paid.amt, 0)), 0)
                                  FROM purchase_orders po
                                  LEFT JOIN (SELECT order_id, SUM(amount) AS amt FROM p_payments GROUP BY order_id) paid ON paid.order_id = po.id
                                  WHERE po.status NOT IN ('cancelled','draft')),
        -- Customers / Suppliers
        'active_customers',      (SELECT COUNT(*) FROM customers WHERE is_active = TRUE),
        'active_suppliers',      (SELECT COUNT(*) FROM suppliers WHERE is_active = TRUE),
        'generated_at',          now_ms()
    );
END; $$;

-- -----------------------------------------------------------------------------
-- fn_product_report(p_product_id)
-- Full stock card for a single product: current stock, movements summary,
-- top customers by revenue, top suppliers by qty received.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_product_report(p_product_id BIGINT)
RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_prod   RECORD;
    v_mvmt   JSONB;
    v_top_cust JSONB;
    v_top_sup  JSONB;
BEGIN
    SELECT * INTO v_prod FROM products WHERE id = p_product_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'PRODUCT_NOT_FOUND');
    END IF;

    -- Movement summary per type
    SELECT jsonb_agg(jsonb_build_object(
        'type', type,
        'count', cnt,
        'total_qty', total_qty
    )) INTO v_mvmt
    FROM (
        SELECT type, COUNT(*) AS cnt, SUM(qty) AS total_qty
        FROM movements WHERE product_id = p_product_id
        GROUP BY type
    ) m;

    -- Top 5 customers by revenue (SO lines)
    SELECT jsonb_agg(jsonb_build_object(
        'customer_id', c.id,
        'customer_name', c.full_name,
        'qty_sold', sol_agg.qty_sold,
        'revenue', sol_agg.revenue
    )) INTO v_top_cust
    FROM (
        SELECT sol.order_id, SUM(sol.qty) AS qty_sold, SUM(sol.line_total) AS revenue,
               MAX(so.customer_id) AS customer_id
        FROM sales_order_lines sol
        JOIN sales_orders so ON so.id = sol.order_id
        WHERE sol.product_id = p_product_id AND so.status NOT IN ('cancelled')
        GROUP BY so.customer_id
        ORDER BY revenue DESC LIMIT 5
    ) sol_agg
    JOIN customers c ON c.id = sol_agg.customer_id;

    -- Top 5 suppliers by qty received (PO lines)
    SELECT jsonb_agg(jsonb_build_object(
        'supplier_id', s.id,
        'supplier_name', s.name,
        'qty_received', pol_agg.qty_received
    )) INTO v_top_sup
    FROM (
        SELECT MAX(po.supplier_id) AS supplier_id,
               SUM(pol.qty) AS qty_received
        FROM purchase_order_lines pol
        JOIN purchase_orders po ON po.id = pol.order_id
        WHERE pol.product_id = p_product_id
          AND po.status = 'received'
          AND pol.deleted = FALSE
        GROUP BY po.supplier_id
        ORDER BY qty_received DESC LIMIT 5
    ) pol_agg
    JOIN suppliers s ON s.id = pol_agg.supplier_id;

    RETURN jsonb_build_object(
        'product',          to_jsonb(v_prod),
        'movement_summary', COALESCE(v_mvmt, '[]'),
        'top_customers',    COALESCE(v_top_cust, '[]'),
        'top_suppliers',    COALESCE(v_top_sup, '[]'),
        'generated_at',     now_ms()
    );
END; $$;

-- -----------------------------------------------------------------------------
-- fn_customer_statement(p_customer_id)
-- Full A/R statement for a customer:
--   all closed SO totals, all payments, running balance.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_customer_statement(p_customer_id BIGINT)
RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_cust    RECORD;
    v_orders  JSONB;
    v_payments JSONB;
    v_total_billed  NUMERIC(18,4);
    v_total_paid    NUMERIC(18,4);
BEGIN
    SELECT * INTO v_cust FROM customers WHERE id = p_customer_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'CUSTOMER_NOT_FOUND');
    END IF;

    SELECT jsonb_agg(jsonb_build_object(
        'id',        so.id,
        'so_number', so.so_number,
        'status',    so.status,
        'total',     so.total,
        'date',      so.created_at
    ) ORDER BY so.created_at DESC) INTO v_orders
    FROM sales_orders so
    WHERE so.customer_id = p_customer_id
      AND so.status NOT IN ('cancelled', 'draft');

    SELECT jsonb_agg(jsonb_build_object(
        'id',       sp.id,
        'order_id', sp.order_id,
        'amount',   sp.amount,
        'date',     sp.date,
        'notes',    sp.notes
    ) ORDER BY sp.date DESC) INTO v_payments
    FROM s_payments sp WHERE sp.customer_id = p_customer_id;

    SELECT COALESCE(SUM(total), 0) INTO v_total_billed
    FROM sales_orders
    WHERE customer_id = p_customer_id AND status NOT IN ('cancelled','draft');

    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
    FROM s_payments WHERE customer_id = p_customer_id;

    RETURN jsonb_build_object(
        'customer',        to_jsonb(v_cust),
        'orders',          COALESCE(v_orders, '[]'),
        'payments',        COALESCE(v_payments, '[]'),
        'total_billed',    v_total_billed,
        'total_paid',      v_total_paid,
        'balance_due',     v_total_billed - v_total_paid,
        'generated_at',    now_ms()
    );
END; $$;

-- -----------------------------------------------------------------------------
-- fn_supplier_statement(p_supplier_id)
-- Full A/P statement for a supplier: PO totals, payments, running balance.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_supplier_statement(p_supplier_id BIGINT)
RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_sup      RECORD;
    v_orders   JSONB;
    v_payments JSONB;
    v_total_due  NUMERIC(18,4);
    v_total_paid NUMERIC(18,4);
BEGIN
    SELECT * INTO v_sup FROM suppliers WHERE id = p_supplier_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'SUPPLIER_NOT_FOUND');
    END IF;

    SELECT jsonb_agg(jsonb_build_object(
        'id',        po.id,
        'po_number', po.po_number,
        'status',    po.status,
        'total',     po.total,
        'date',      po.created_at
    ) ORDER BY po.created_at DESC) INTO v_orders
    FROM purchase_orders po
    WHERE po.supplier_id = p_supplier_id
      AND po.status NOT IN ('cancelled','draft');

    SELECT jsonb_agg(jsonb_build_object(
        'id',       pp.id,
        'order_id', pp.order_id,
        'amount',   pp.amount,
        'date',     pp.date,
        'notes',    pp.notes
    ) ORDER BY pp.date DESC) INTO v_payments
    FROM p_payments pp WHERE pp.supplier_id = p_supplier_id;

    SELECT COALESCE(SUM(total), 0) INTO v_total_due
    FROM purchase_orders
    WHERE supplier_id = p_supplier_id AND status NOT IN ('cancelled','draft');

    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
    FROM p_payments WHERE supplier_id = p_supplier_id;

    RETURN jsonb_build_object(
        'supplier',      to_jsonb(v_sup),
        'orders',        COALESCE(v_orders, '[]'),
        'payments',      COALESCE(v_payments, '[]'),
        'total_due',     v_total_due,
        'total_paid',    v_total_paid,
        'balance_due',   v_total_due - v_total_paid,
        'generated_at',  now_ms()
    );
END; $$;

-- =============================================================================
-- 2. STOCK MANAGEMENT
-- =============================================================================

-- -----------------------------------------------------------------------------
-- fn_stock_adjustment(p_product_id, p_qty, p_reason, p_ref)
-- One-call helper: reads current stock, builds before/after, inserts movement.
-- p_qty is SIGNED (positive = add, negative = remove).
-- Returns the new stock level or an error.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_stock_adjustment(
    p_product_id BIGINT,
    p_qty        NUMERIC,
    p_reason     TEXT    DEFAULT 'Manual adjustment',
    p_ref        TEXT    DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
    v_current NUMERIC(18,4);
    v_after   NUMERIC(18,4);
BEGIN
    IF p_qty = 0 THEN
        RETURN jsonb_build_object('error', 'QTY_CANNOT_BE_ZERO');
    END IF;

    SELECT stock INTO v_current FROM products WHERE id = p_product_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'PRODUCT_NOT_FOUND');
    END IF;

    v_after := v_current + p_qty;
    IF v_after < 0 THEN
        RETURN jsonb_build_object(
            'error',   'INSUFFICIENT_STOCK',
            'current', v_current,
            'requested', p_qty
        );
    END IF;

    INSERT INTO movements (product_id, type, qty, before, after, reason, ref)
    VALUES (p_product_id, 'adjustment', p_qty, v_current, v_after, p_reason, p_ref);

    RETURN jsonb_build_object(
        'ok',          TRUE,
        'product_id',  p_product_id,
        'before',      v_current,
        'after',       v_after,
        'delta',       p_qty
    );
END; $$;

-- -----------------------------------------------------------------------------
-- fn_low_stock_list()
-- Returns all active, non-deleted products where stock <= low_stock.
-- Ordered by (stock / NULLIF(low_stock,0)) ASC so most critical first.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_low_stock_list()
RETURNS TABLE (
    product_id   BIGINT,
    name         TEXT,
    sku          TEXT,
    stock        NUMERIC,
    low_stock    NUMERIC,
    deficit      NUMERIC,
    stock_pct    NUMERIC,
    supplier_id  BIGINT,
    supplier_name TEXT
) LANGUAGE sql STABLE AS $$
    SELECT
        p.id                                AS product_id,
        p.name,
        p.sku,
        p.stock,
        p.low_stock,
        p.low_stock - p.stock               AS deficit,
        ROUND(p.stock / NULLIF(p.low_stock, 0) * 100, 2) AS stock_pct,
        p.supplier_id,
        s.name                              AS supplier_name
    FROM products p
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.deleted = FALSE
      AND p.active  = TRUE
      AND p.stock  <= p.low_stock
    ORDER BY (p.stock / NULLIF(p.low_stock, 0)) ASC NULLS FIRST;
$$;

-- =============================================================================
-- 3. SALES ORDER LIFECYCLE HELPERS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- fn_cancel_sales_order(p_order_id, p_user_id, p_user_role)
-- Cancels an order. Only admin/employee can; customer cannot cancel.
-- Closes the order (open = FALSE) then sets status = 'cancelled'.
-- An already-shipped / delivered order cannot be cancelled.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_cancel_sales_order(
    p_order_id  BIGINT,
    p_user_id   BIGINT,
    p_user_role user_role_t
)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
    v_status sales_order_status_t;
    v_now    BIGINT := now_ms();
BEGIN
    IF p_user_role NOT IN ('admin', 'employee') THEN
        RETURN jsonb_build_object('error', 'UNAUTHORIZED');
    END IF;

    SELECT status INTO v_status FROM sales_orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'ORDER_NOT_FOUND'); END IF;

    IF v_status IN ('shipped', 'delivered', 'cancelled') THEN
        RETURN jsonb_build_object(
            'error', 'CANNOT_CANCEL',
            'current_status', v_status
        );
    END IF;

    UPDATE sales_orders
    SET status = 'cancelled', open = FALSE,
        locked_by_uid = NULL, locked_at = NULL,
        updated_at = v_now
    WHERE id = p_order_id;

    RETURN jsonb_build_object('ok', TRUE, 'cancelled_by', p_user_id);
END; $$;

-- -----------------------------------------------------------------------------
-- fn_deliver_sales_order(p_order_id)
-- Marks a shipped order as delivered and stamps delivered_at.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_deliver_sales_order(p_order_id BIGINT)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
    v_status sales_order_status_t;
    v_now    BIGINT := now_ms();
BEGIN
    SELECT status INTO v_status FROM sales_orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'ORDER_NOT_FOUND'); END IF;
    IF v_status <> 'shipped' THEN
        RETURN jsonb_build_object('error', 'ORDER_NOT_SHIPPED', 'current_status', v_status);
    END IF;

    UPDATE sales_orders
    SET status = 'delivered', delivered_at = v_now, updated_at = v_now
    WHERE id = p_order_id;

    RETURN jsonb_build_object('ok', TRUE);
END; $$;

-- =============================================================================
-- 4. PURCHASE ORDER LIFECYCLE HELPERS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- fn_cancel_purchase_order(p_order_id, p_user_id)
-- Cancels a PO that has not yet been received.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_cancel_purchase_order(
    p_order_id BIGINT,
    p_user_id  BIGINT
)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
    v_status purchase_order_status_t;
    v_now    BIGINT := now_ms();
BEGIN
    SELECT status INTO v_status FROM purchase_orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'ORDER_NOT_FOUND'); END IF;
    IF v_status IN ('received', 'cancelled') THEN
        RETURN jsonb_build_object('error', 'CANNOT_CANCEL', 'current_status', v_status);
    END IF;

    UPDATE purchase_orders
    SET status = 'cancelled', open = FALSE,
        locked_by_uid = NULL, locked_at = NULL,
        updated_at = v_now
    WHERE id = p_order_id;

    RETURN jsonb_build_object('ok', TRUE, 'cancelled_by', p_user_id);
END; $$;

-- =============================================================================
-- 5. SEARCH FUNCTIONS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- fn_search_products(p_query, p_limit)
-- Full-text + trigram search on product name and SKU.
-- Returns top matches with stock status.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_search_products(
    p_query TEXT,
    p_limit INT DEFAULT 20
)
RETURNS TABLE (
    id           BIGINT,
    name         TEXT,
    sku          TEXT,
    stock        NUMERIC,
    stock_status TEXT,
    sell_price   NUMERIC,
    active       BOOLEAN,
    rank         REAL
) LANGUAGE sql STABLE AS $$
    SELECT
        p.id,
        p.name,
        p.sku,
        p.stock,
        CASE
            WHEN p.stock <= 0          THEN 'OUT_OF_STOCK'
            WHEN p.stock <= p.low_stock THEN 'LOW_STOCK'
            ELSE 'IN_STOCK'
        END                              AS stock_status,
        p.sell_price,
        p.active,
        similarity(p.name, p_query)      AS rank
    FROM products p
    WHERE p.deleted = FALSE
      AND (
          p.name ILIKE '%' || p_query || '%'
          OR p.sku  ILIKE '%' || p_query || '%'
          OR p.name % p_query                      -- trigram match
      )
    ORDER BY rank DESC, p.name
    LIMIT p_limit;
$$;

-- -----------------------------------------------------------------------------
-- fn_search_customers(p_query, p_limit)
-- Trigram search on full_name, phone, email, city.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_search_customers(
    p_query TEXT,
    p_limit INT DEFAULT 20
)
RETURNS TABLE (
    id        BIGINT,
    full_name TEXT,
    phone     TEXT,
    email     TEXT,
    city      TEXT,
    is_active BOOLEAN,
    rank      REAL
) LANGUAGE sql STABLE AS $$
    SELECT
        c.id, c.full_name, c.phone, c.email, c.city, c.is_active,
        GREATEST(
            similarity(c.full_name, p_query),
            similarity(COALESCE(c.phone,''), p_query),
            similarity(COALESCE(c.email,''), p_query)
        ) AS rank
    FROM customers c
    WHERE
        c.full_name ILIKE '%' || p_query || '%'
        OR c.phone  ILIKE '%' || p_query || '%'
        OR c.email  ILIKE '%' || p_query || '%'
        OR c.full_name % p_query
    ORDER BY rank DESC, c.full_name
    LIMIT p_limit;
$$;

-- =============================================================================
-- 6. USER & AUTH HELPERS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- fn_login(p_username, p_pwd_hash) → session token or error
-- Validates credentials and returns a new session row JSON.
-- The caller must INSERT the session themselves (this just validates).
-- Returns the user row on success so the caller can build the session.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_login(
    p_username TEXT,
    p_pwd_hash TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_user RECORD; BEGIN
    SELECT id, name, role, cid, email, blocked
    INTO v_user
    FROM users
    WHERE name = p_username AND pwd = p_pwd_hash;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'INVALID_CREDENTIALS');
    END IF;
    IF v_user.blocked THEN
        RETURN jsonb_build_object('error', 'ACCOUNT_BLOCKED');
    END IF;

    UPDATE users SET last_sign_in_at = now_ms() WHERE id = v_user.id;

    RETURN jsonb_build_object(
        'ok',   TRUE,
        'user', jsonb_build_object(
            'id',    v_user.id,
            'name',  v_user.name,
            'role',  v_user.role,
            'cid',   v_user.cid,
            'email', v_user.email
        )
    );
END; $$;

-- -----------------------------------------------------------------------------
-- fn_cleanup_expired_sessions()
-- Removes all sessions past their expire timestamp.
-- Call this from a scheduled job (pg_cron or external cron).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_cleanup_expired_sessions()
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v_deleted INT; BEGIN
    DELETE FROM sessions WHERE expire IS NOT NULL AND expire < now_ms();
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN jsonb_build_object('ok', TRUE, 'deleted', v_deleted);
END; $$;

-- =============================================================================
-- 7. AUDIT / HISTORY
-- =============================================================================

-- -----------------------------------------------------------------------------
-- fn_row_history(p_table, p_row_id)
-- Returns the full audit trail for a specific row, newest-first.
-- Useful for a "change history" view in the UI.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_row_history(
    p_table  TEXT,
    p_row_id TEXT
)
RETURNS TABLE (
    id         BIGINT,
    operation  TEXT,
    payload    JSONB,
    created_at BIGINT
) LANGUAGE sql STABLE AS $$
    SELECT id, operation, payload, created_at
    FROM audit_log
    WHERE table_name = p_table AND row_id = p_row_id
    ORDER BY created_at DESC;
$$;

-- -----------------------------------------------------------------------------
-- fn_recent_changes(p_since_ms, p_limit)
-- Returns the most recent audit entries since a given epoch-ms timestamp.
-- Useful for polling change feeds.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_recent_changes(
    p_since_ms BIGINT DEFAULT 0,
    p_limit    INT    DEFAULT 100
)
RETURNS TABLE (
    id         BIGINT,
    table_name TEXT,
    operation  TEXT,
    row_id     TEXT,
    payload    JSONB,
    created_at BIGINT
) LANGUAGE sql STABLE AS $$
    SELECT id, table_name, operation, row_id, payload, created_at
    FROM audit_log
    WHERE created_at > p_since_ms
    ORDER BY created_at DESC
    LIMIT p_limit;
$$;

-- =============================================================================
-- 8. MAINTENANCE
-- =============================================================================

-- -----------------------------------------------------------------------------
-- fn_rebuild_product_totals()
-- Recalculates total_in, total_out, amount_in, amount_out from scratch
-- for ALL products.  Use after a bulk data import or migration.
-- WARNING: acquires row locks on all product rows.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_rebuild_product_totals()
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
    v_count INT := 0;
BEGIN
    -- total_in / amount_in from active (non-deleted) PO lines on received orders
    UPDATE products p
    SET total_in  = COALESCE(pol_agg.qty,    0),
        amount_in = COALESCE(pol_agg.amount,  0),
        updated_at = now_ms()
    FROM (
        SELECT pol.product_id,
               SUM(pol.qty)                      AS qty,
               SUM(pol.qty * pol.unit_price)      AS amount
        FROM purchase_order_lines pol
        WHERE pol.deleted = FALSE
        GROUP BY pol.product_id
    ) pol_agg
    WHERE pol_agg.product_id = p.id;

    -- total_out / amount_out from all SO lines
    UPDATE products p
    SET total_out  = COALESCE(sol_agg.qty,    0),
        amount_out = COALESCE(sol_agg.amount,  0),
        updated_at = now_ms()
    FROM (
        SELECT sol.product_id,
               SUM(sol.qty)                      AS qty,
               SUM(sol.qty * sol.unit_price)      AS amount
        FROM sales_order_lines sol
        GROUP BY sol.product_id
    ) sol_agg
    WHERE sol_agg.product_id = p.id;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN jsonb_build_object('ok', TRUE, 'products_updated', v_count, 'at', now_ms());
END; $$;

-- -----------------------------------------------------------------------------
-- fn_add_audit_log_partition(p_year)
-- Adds a new annual partition to audit_log and delete_log for future years.
-- Example: SELECT fn_add_audit_log_partition(2028);
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_add_audit_log_partition(p_year INT)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
    v_start BIGINT;
    v_end   BIGINT;
    v_tbl   TEXT;
BEGIN
    v_start := EXTRACT(EPOCH FROM make_date(p_year,    1, 1)::TIMESTAMPTZ)::BIGINT * 1000;
    v_end   := EXTRACT(EPOCH FROM make_date(p_year + 1,1, 1)::TIMESTAMPTZ)::BIGINT * 1000;

    v_tbl := 'audit_log_y' || p_year;
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_log FOR VALUES FROM (%L) TO (%L)',
        v_tbl, v_start, v_end
    );

    v_tbl := 'delete_log_y' || p_year;
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF delete_log FOR VALUES FROM (%L) TO (%L)',
        v_tbl, v_start, v_end
    );

    RETURN jsonb_build_object(
        'ok', TRUE,
        'year', p_year,
        'from', v_start,
        'to',   v_end
    );
END; $$;

-- -----------------------------------------------------------------------------
-- fn_insert_s_payment(p_order_id, p_customer_id, p_amount, p_user_id, p_notes)
-- Inserts a sales payment natively via RPC.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_insert_s_payment(
    p_order_id    BIGINT,
    p_customer_id BIGINT,
    p_amount      NUMERIC,
    p_user_id     BIGINT,
    p_notes       TEXT
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v_id BIGINT; BEGIN
    INSERT INTO s_payments (order_id, customer_id, amount, by_user_id, notes, date)
    VALUES (p_order_id, p_customer_id, p_amount, p_user_id, p_notes, now_ms())
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('ok', TRUE, 'id', v_id);
END; $$;

-- -----------------------------------------------------------------------------
-- fn_delete_s_payment(p_payment_id)
-- Deletes a sales payment natively via RPC.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_delete_s_payment(
    p_payment_id BIGINT
) RETURNS JSONB LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM s_payments WHERE id = p_payment_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'PAYMENT_NOT_FOUND'); END IF;
    RETURN jsonb_build_object('ok', TRUE);
END; $$;

-- -----------------------------------------------------------------------------
-- fn_insert_p_payment(p_order_id, p_supplier_id, p_amount, p_user_id, p_notes)
-- Inserts a purchase payment natively via RPC.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_insert_p_payment(
    p_order_id    BIGINT,
    p_supplier_id BIGINT,
    p_amount      NUMERIC,
    p_user_id     BIGINT,
    p_notes       TEXT
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v_id BIGINT; BEGIN
    INSERT INTO p_payments (order_id, supplier_id, amount, by_user_id, notes, date)
    VALUES (p_order_id, p_supplier_id, p_amount, p_user_id, p_notes, now_ms())
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('ok', TRUE, 'id', v_id);
END; $$;

-- -----------------------------------------------------------------------------
-- fn_delete_p_payment(p_payment_id)
-- Deletes a purchase payment natively via RPC.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_delete_p_payment(
    p_payment_id BIGINT
) RETURNS JSONB LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM p_payments WHERE id = p_payment_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'PAYMENT_NOT_FOUND'); END IF;
    RETURN jsonb_build_object('ok', TRUE);
END; $$;

COMMIT;


-- =============================================================================
-- FUNCTION QUICK REFERENCE
-- =============================================================================
-- Dashboard / Reporting:
--   fn_dashboard_summary()                        → JSONB KPIs
--   fn_product_report(product_id)                 → JSONB stock card
--   fn_customer_statement(customer_id)            → JSONB A/R statement
--   fn_supplier_statement(supplier_id)            → JSONB A/P statement
--
-- Stock:
--   fn_stock_adjustment(product_id, qty, reason, ref) → JSONB
--   fn_low_stock_list()                           → TABLE
--
-- Sales Orders:
--   fn_cancel_sales_order(id, user_id, role)      → JSONB
--   fn_deliver_sales_order(id)                    → JSONB
--   (from base schema) fn_open_sales_order / fn_close_sales_order
--   (from base schema) fn_advance_sales_order_status
--   (from base schema) fn_ship_sales_order
--
-- Purchase Orders:
--   fn_cancel_purchase_order(id, user_id)         → JSONB
--   (from base schema) fn_open_purchase_order / fn_close_purchase_order
--   (from base schema) fn_advance_purchase_order_status
--   (from base schema) fn_receive_purchase_order
--
-- Search:
--   fn_search_products(query, limit)              → TABLE
--   fn_search_customers(query, limit)             → TABLE
--
-- Auth / Users:
--   fn_login(username, pwd_hash)                  → JSONB user data
--   fn_cleanup_expired_sessions()                 → JSONB
--
-- Audit / History:
--   fn_row_history(table, row_id)                 → TABLE
--   fn_recent_changes(since_ms, limit)            → TABLE
--
-- Maintenance:
--   fn_rebuild_product_totals()                   → JSONB
--   fn_add_audit_log_partition(year)              → JSONB
-- =============================================================================
