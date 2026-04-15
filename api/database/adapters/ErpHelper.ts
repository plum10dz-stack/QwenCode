/**
 * database-help.ts — Class-based TypeScript wrappers for functions.sql
 *
 * Usage:
 *   import { ERPHelper } from './database-help';
 *   import { db } from './db';  // your SupabaseClient instance
 *
 *   const erp = new ERPHelper(db);
 *
 *   const kpis            = await erp.dashboardSummary();
 *   const report          = await erp.productReport(42);
 *   const lowStock        = await erp.lowStockList();
 *   const searchResults   = await erp.searchProducts('laptop', 10);
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// Shared result types
// =============================================================================

export type DbOk  = { ok: true };
export type DbErr = { error: string; current_status?: string; current?: number; requested?: number };

export type SalesOrderStatus    = 'draft' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
export type PurchaseOrderStatus = 'draft' | 'confirmed' | 'received' | 'cancelled';
export type UserRole            = 'admin' | 'employee' | 'customer' | 'anonymous';

// =============================================================================
// Shaped return types for each function
// =============================================================================

export interface DashboardSummary {
    total_products:       number;
    low_stock_count:      number;
    out_of_stock_count:   number;
    inventory_value:      number;
    open_sales_orders:    number;
    sales_today:          number;
    sales_this_month:     number;
    unpaid_so_balance:    number;
    open_purchase_orders: number;
    purchases_this_month: number;
    unpaid_po_balance:    number;
    active_customers:     number;
    active_suppliers:     number;
    generated_at:         number;
}

export interface MovementSummaryEntry {
    type:      string;
    count:     number;
    total_qty: number;
}
export interface TopCustomerEntry {
    customer_id:   number;
    customer_name: string;
    qty_sold:      number;
    revenue:       number;
}
export interface TopSupplierEntry {
    supplier_id:   number;
    supplier_name: string;
    qty_received:  number;
}
export interface ProductReport {
    product:          Record<string, unknown>;
    movement_summary: MovementSummaryEntry[];
    top_customers:    TopCustomerEntry[];
    top_suppliers:    TopSupplierEntry[];
    generated_at:     number;
}

export interface OrderEntry {
    id:        number;
    so_number?: string;
    po_number?: string;
    status:    string;
    total:     number;
    date:      number;
}
export interface PaymentEntry {
    id:       number;
    order_id: number | null;
    amount:   number;
    date:     number;
    notes:    string | null;
}
export interface CustomerStatement {
    customer:      Record<string, unknown>;
    orders:        OrderEntry[];
    payments:      PaymentEntry[];
    total_billed:  number;
    total_paid:    number;
    balance_due:   number;
    generated_at:  number;
}

export interface SupplierStatement {
    supplier:     Record<string, unknown>;
    orders:       OrderEntry[];
    payments:     PaymentEntry[];
    total_due:    number;
    total_paid:   number;
    balance_due:  number;
    generated_at: number;
}

export interface StockAdjustmentResult extends DbOk {
    product_id: number;
    before:     number;
    after:      number;
    delta:      number;
}

export interface InsertPaymentResult extends DbOk {
    id: number;
}

export interface LowStockRow {
    product_id:    number;
    name:          string;
    sku:           string;
    stock:         number;
    low_stock:     number;
    deficit:       number;
    stock_pct:     number | null;
    supplier_id:   number | null;
    supplier_name: string | null;
}

export interface ProductSearchRow {
    id:           number;
    name:         string;
    sku:          string;
    stock:        number;
    stock_status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
    sell_price:   number;
    active:       boolean;
    rank:         number;
}

export interface CustomerSearchRow {
    id:        number;
    full_name: string;
    phone:     string | null;
    email:     string | null;
    city:      string | null;
    is_active: boolean;
    rank:      number;
}

export interface LoginResult extends DbOk {
    user: {
        id:    number;
        name:  string;
        role:  UserRole;
        cid:   number | null;
        email: string | null;
    };
}

export interface CleanupResult extends DbOk {
    deleted: number;
}

export interface CancelResult extends DbOk {
    cancelled_by?: number;
}

export interface AuditRow {
    id:         number;
    operation:  string;
    payload:    unknown;
    created_at: number;
}

export interface ChangeRow {
    id:         number;
    table_name: string;
    operation:  string;
    row_id:     string;
    payload:    unknown;
    created_at: number;
}

export interface RebuildResult extends DbOk {
    products_updated: number;
    at: number;
}

export interface PartitionResult extends DbOk {
    year: number;
    from: number;
    to:   number;
}

// =============================================================================
// ERPHelper — main class
// =============================================================================

export class ERPHelper {
    /** Supabase / PostgREST client — set once at construction, shared by all methods. */
    public readonly db: SupabaseClient;

    constructor(db: SupabaseClient) {
        this.db = db;
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /** Call a Postgres function via RPC and return typed data, or throw on error. */
    private async rpc<T>(fn: string, params: Record<string, unknown> = {}): Promise<T> {
        const { data, error } = await this.db.rpc(fn, params);
        if (error) throw Object.assign(
            new Error(`ERPHelper.rpc(${fn}) failed: ${error.message}`),
            { fn, params, pgError: error }
        );
        return data as T;
    }

    /** Same as rpc() but returns DbErr instead of throwing on Postgres error. */
    private async rpcSafe<T extends object>(
        fn: string,
        params: Record<string, unknown> = {}
    ): Promise<T | DbErr> {
        const { data, error } = await this.db.rpc(fn, params);
        if (error) return { error: error.message };
        return data as T | DbErr;
    }

    /** Type-guard: is the result a DB error envelope? */
    static isErr(result: unknown): result is DbErr {
        return typeof result === 'object'
            && result !== null
            && 'error' in result
            && typeof (result as DbErr).error === 'string';
    }

    // =========================================================================
    // Section 1 — Dashboard / Reporting
    // =========================================================================

    /**
     * `fn_dashboard_summary()`
     *
     * Returns key KPIs for the main ERP dashboard in a single round-trip:
     * inventory value, open orders, today's/monthly sales, unpaid balances,
     * low/out-of-stock counts, active customer/supplier counts.
     */
    async dashboardSummary(): Promise<DashboardSummary> {
        return this.rpc<DashboardSummary>('fn_dashboard_summary');
    }

    /**
     * `fn_product_report(p_product_id)`
     *
     * Full stock card for one product:
     * - Product master data
     * - Movement summary per type (in/out/adjustment/…)
     * - Top 5 customers by revenue
     * - Top 5 suppliers by qty received
     */
    async productReport(productId: number): Promise<ProductReport | DbErr> {
        return this.rpcSafe<ProductReport>('fn_product_report', {
            p_product_id: productId,
        });
    }

    /**
     * `fn_customer_statement(p_customer_id)`
     *
     * Full A/R statement for a customer:
     * - All non-cancelled/draft SO totals
     * - All payments linked to this customer
     * - Total billed, total paid, running balance due
     */
    async customerStatement(customerId: number): Promise<CustomerStatement | DbErr> {
        return this.rpcSafe<CustomerStatement>('fn_customer_statement', {
            p_customer_id: customerId,
        });
    }

    /**
     * `fn_supplier_statement(p_supplier_id)`
     *
     * Full A/P statement for a supplier:
     * - All non-cancelled/draft PO totals
     * - All payments linked to this supplier
     * - Total due, total paid, running balance due
     */
    async supplierStatement(supplierId: number): Promise<SupplierStatement | DbErr> {
        return this.rpcSafe<SupplierStatement>('fn_supplier_statement', {
            p_supplier_id: supplierId,
        });
    }

    // =========================================================================
    // Section 1B — Payments (Versments)
    // =========================================================================

    /**
     * `fn_insert_s_payment(p_order_id, p_customer_id, p_amount, p_user_id, p_notes)`
     */
    async insertSalesPayment(
        orderId: number,
        customerId: number,
        amount: number,
        userId: number,
        notes: string
    ): Promise<InsertPaymentResult | DbErr> {
        return this.rpcSafe<InsertPaymentResult>('fn_insert_s_payment', {
            p_order_id:    orderId,
            p_customer_id: customerId,
            p_amount:      amount,
            p_user_id:     userId,
            p_notes:       notes,
        });
    }

    /**
     * `fn_delete_s_payment(p_payment_id)`
     */
    async deleteSalesPayment(paymentId: number): Promise<DbOk | DbErr> {
        return this.rpcSafe<DbOk>('fn_delete_s_payment', {
            p_payment_id: paymentId,
        });
    }

    /**
     * `fn_insert_p_payment(p_order_id, p_supplier_id, p_amount, p_user_id, p_notes)`
     */
    async insertPurchasePayment(
        orderId: number,
        supplierId: number,
        amount: number,
        userId: number,
        notes: string
    ): Promise<InsertPaymentResult | DbErr> {
        return this.rpcSafe<InsertPaymentResult>('fn_insert_p_payment', {
            p_order_id:    orderId,
            p_supplier_id: supplierId,
            p_amount:      amount,
            p_user_id:     userId,
            p_notes:       notes,
        });
    }

    /**
     * `fn_delete_p_payment(p_payment_id)`
     */
    async deletePurchasePayment(paymentId: number): Promise<DbOk | DbErr> {
        return this.rpcSafe<DbOk>('fn_delete_p_payment', {
            p_payment_id: paymentId,
        });
    }

    // =========================================================================
    // Section 2 — Stock Management
    // =========================================================================

    /**
     * `fn_stock_adjustment(p_product_id, p_qty, p_reason, p_ref)`
     *
     * One-call stock adjustment: reads current stock, validates qty, inserts
     * an 'adjustment' movement, updates products.stock atomically.
     *
     * @param qty  SIGNED — positive adds stock, negative removes stock.
     * @param reason  Human-readable reason (default: 'Manual adjustment').
     * @param ref  Optional reference string (e.g. document number).
     */
    async stockAdjustment(
        productId: number,
        qty: number,
        reason = 'Manual adjustment',
        ref?: string
    ): Promise<StockAdjustmentResult | DbErr> {
        return this.rpcSafe<StockAdjustmentResult>('fn_stock_adjustment', {
            p_product_id: productId,
            p_qty:        qty,
            p_reason:     reason,
            p_ref:        ref ?? null,
        });
    }

    /**
     * `fn_low_stock_list()`
     *
     * Returns all active, non-deleted products where `stock <= low_stock`,
     * ordered by criticality (lowest stock-to-threshold ratio first).
     *
     * Includes deficit (how many units to reorder), stock %, and supplier name.
     */
    async lowStockList(): Promise<LowStockRow[]> {
        return this.rpc<LowStockRow[]>('fn_low_stock_list');
    }

    // =========================================================================
    // Section 3 — Sales Order Lifecycle
    // =========================================================================

    /**
     * `fn_cancel_sales_order(p_order_id, p_user_id, p_user_role)`
     *
     * Cancels a sales order. Only admin / employee may cancel.
     * Terminal orders (shipped, delivered, already cancelled) are rejected.
     * Sets open = FALSE, clears lock, status = 'cancelled'.
     */
    async cancelSalesOrder(
        orderId: number,
        userId: number,
        userRole: UserRole
    ): Promise<CancelResult | DbErr> {
        return this.rpcSafe<CancelResult>('fn_cancel_sales_order', {
            p_order_id:  orderId,
            p_user_id:   userId,
            p_user_role: userRole,
        });
    }

    /**
     * `fn_deliver_sales_order(p_order_id)`
     *
     * Marks a 'shipped' order as 'delivered' and stamps `delivered_at`.
     * Fails if the order is not in 'shipped' state.
     */
    async deliverSalesOrder(orderId: number): Promise<DbOk | DbErr> {
        return this.rpcSafe<DbOk>('fn_deliver_sales_order', {
            p_order_id: orderId,
        });
    }

    // =========================================================================
    // Section 4 — Purchase Order Lifecycle
    // =========================================================================

    /**
     * `fn_cancel_purchase_order(p_order_id, p_user_id)`
     *
     * Cancels a purchase order that has not yet been received.
     * Terminal orders (received, already cancelled) are rejected.
     */
    async cancelPurchaseOrder(
        orderId: number,
        userId: number
    ): Promise<CancelResult | DbErr> {
        return this.rpcSafe<CancelResult>('fn_cancel_purchase_order', {
            p_order_id: orderId,
            p_user_id:  userId,
        });
    }

    // =========================================================================
    // Section 5 — Search
    // =========================================================================

    /**
     * `fn_search_products(p_query, p_limit)`
     *
     * Trigram + ILIKE search on product `name` and `sku`.
     * Results ordered by similarity score DESC.
     *
     * @param query  Search string (e.g. 'laptop hp').
     * @param limit  Max rows to return (default 20).
     */
    async searchProducts(query: string, limit = 20): Promise<ProductSearchRow[]> {
        return this.rpc<ProductSearchRow[]>('fn_search_products', {
            p_query: query,
            p_limit: limit,
        });
    }

    /**
     * `fn_search_customers(p_query, p_limit)`
     *
     * Trigram + ILIKE search on customer `full_name`, `phone`, `email`.
     * Results ordered by best similarity score DESC.
     *
     * @param query  Search string (e.g. 'sonatrach').
     * @param limit  Max rows to return (default 20).
     */
    async searchCustomers(query: string, limit = 20): Promise<CustomerSearchRow[]> {
        return this.rpc<CustomerSearchRow[]>('fn_search_customers', {
            p_query: query,
            p_limit: limit,
        });
    }

    // =========================================================================
    // Section 6 — Auth / Users
    // =========================================================================

    /**
     * `fn_login(p_username, p_pwd_hash)`
     *
     * Validates credentials and returns the user record on success.
     * Also stamps `last_sign_in_at`.
     *
     * ⚠️ The caller is responsible for inserting the session row after this call.
     *
     * @param username  Plain username (matched against users.name).
     * @param pwdHash   Hashed password (must match users.pwd exactly).
     */
    async login(username: string, pwdHash: string): Promise<LoginResult | DbErr> {
        return this.rpcSafe<LoginResult>('fn_login', {
            p_username: username,
            p_pwd_hash: pwdHash,
        });
    }

    /**
     * `fn_cleanup_expired_sessions()`
     *
     * Deletes all session rows where `expire < now_ms()`.
     * Call this from a scheduled job (e.g. every 15 minutes via pg_cron or an app cron).
     *
     * Returns `{ ok: true, deleted: N }`.
     */
    async cleanupExpiredSessions(): Promise<CleanupResult> {
        return this.rpc<CleanupResult>('fn_cleanup_expired_sessions');
    }

    // =========================================================================
    // Section 7 — Audit / History
    // =========================================================================

    /**
     * `fn_row_history(p_table, p_row_id)`
     *
     * Returns the full audit trail for a single row, ordered newest-first.
     * Useful for a "change history" drawer in the UI.
     *
     * @param table   Table name (e.g. 'products', 'sales_orders').
     * @param rowId   Row PK as a string (all audit PKs are stored as TEXT).
     */
    async rowHistory(table: string, rowId: string | number): Promise<AuditRow[]> {
        return this.rpc<AuditRow[]>('fn_row_history', {
            p_table:  table,
            p_row_id: String(rowId),
        });
    }

    /**
     * `fn_recent_changes(p_since_ms, p_limit)`
     *
     * Returns the most recent audit log entries since a given epoch-ms timestamp.
     * Useful for polling a change feed from the client.
     *
     * @param sinceMs  Only return entries with created_at > sinceMs (default 0 = all).
     * @param limit    Max rows to return (default 100).
     */
    async recentChanges(sinceMs = 0, limit = 100): Promise<ChangeRow[]> {
        return this.rpc<ChangeRow[]>('fn_recent_changes', {
            p_since_ms: sinceMs,
            p_limit:    limit,
        });
    }

    // =========================================================================
    // Section 8 — Maintenance
    // =========================================================================

    /**
     * `fn_rebuild_product_totals()`
     *
     * Recalculates `total_in`, `total_out`, `amount_in`, `amount_out` from scratch
     * for ALL products by scanning PO lines and SO lines.
     *
     * ⚠️ Heavy operation — acquires row locks on all product rows.
     * Use after bulk imports / data migrations only.
     */
    async rebuildProductTotals(): Promise<RebuildResult> {
        return this.rpc<RebuildResult>('fn_rebuild_product_totals');
    }

    /**
     * `fn_add_audit_log_partition(p_year)`
     *
     * Creates annual range partitions for `audit_log` and `delete_log`
     * for the specified year (e.g. 2028).
     *
     * Call this once per year in advance (e.g. in a January maintenance script).
     *
     * @param year  Four-digit year, e.g. 2028.
     */
    async addAuditLogPartition(year: number): Promise<PartitionResult> {
        return this.rpc<PartitionResult>('fn_add_audit_log_partition', {
            p_year: year,
        });
    }
}

// =============================================================================
// Re-export the type-guard for convenience
// =============================================================================
export const isDbErr = ERPHelper.isErr;
