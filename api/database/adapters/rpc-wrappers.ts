/**
 * database-fn.ts — TypeScript wrappers for every PostgreSQL stored procedure
 * in the SOS ERP schema.
 *
 * Each function calls the DB via `supabase.rpc()` and returns a typed result.
 * Import `db` from your PostgREST/Supabase client initialisation:
 *
 *   import { db } from './db';          // your SupabaseClient
 *   import { fnCheckVersion } from './database-fn';
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DbOk   = { ok: true };
export type DbErr  = { error: string; from?: string; to?: string; status?: string };
export type DbFn<T = DbOk> = Promise<T | DbErr>;

export type PurchaseOrderStatus = 'draft' | 'confirmed' | 'received' | 'cancelled';
export type SalesOrderStatus    = 'draft' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
export type MovementType        = 'in' | 'out' | 'adjustment' | 'return_in' | 'return_out' | 'transfer';
export type UserRole            = 'admin' | 'employee' | 'customer' | 'anonymous';

// ---------------------------------------------------------------------------
// Helper — unwrap the Supabase RPC response into a plain value or throw
// ---------------------------------------------------------------------------
async function rpc<T>(
    db: SupabaseClient,
    fn: string,
    params: Record<string, unknown> = {}
): Promise<T> {
    const { data, error } = await db.rpc(fn, params);
    if (error) throw new Error(`DB fn ${fn} failed: ${error.message}`);
    return data as T;
}

// =============================================================================
// SECTION 1 — VERSION / OPTIMISTIC-LOCK HELPERS
// =============================================================================

/**
 * fn_check_version(table, id, expected_updated_at)
 *
 * Returns TRUE if the row's current `updated_at` matches `expectedVersion`.
 * Call this BEFORE issuing any UPDATE to detect concurrent edits.
 *
 * @example
 *   if (!await fnCheckVersion(db, 'products', 42, product.updated_at)) {
 *     return res.status(409).json({ error: 'VERSION_CONFLICT' });
 *   }
 */
export async function fnCheckVersion(
    db: SupabaseClient,
    table: string,
    id: number,
    expectedVersion: number
): Promise<boolean> {
    return rpc<boolean>(db, 'fn_check_version', {
        p_table: table,
        p_id:    id,
        p_ver:   expectedVersion,
    });
}

// =============================================================================
// SECTION 2 — SALES ORDERS
// =============================================================================

/**
 * fn_open_sales_order(order_id, user_id, user_role)
 *
 * Opens a sales order and acquires a 15-minute optimistic lock.
 *   • admin / employee → always succeeds.
 *   • customer → blocked if another user holds a fresh lock.
 */
export async function fnOpenSalesOrder(
    db: SupabaseClient,
    orderId: number,
    userId: number,
    userRole: UserRole
): DbFn {
    return rpc(db, 'fn_open_sales_order', {
        p_order_id:   orderId,
        p_user_id:    userId,
        p_user_role:  userRole,
    });
}

/**
 * fn_close_sales_order(order_id, user_id, user_role)
 *
 * Closes a sales order (open = FALSE) and releases the lock.
 * Closing triggers fn_so_recalc_on_close which stamps final subtotal/tax/total.
 */
export async function fnCloseSalesOrder(
    db: SupabaseClient,
    orderId: number,
    userId: number,
    userRole: UserRole
): DbFn {
    return rpc(db, 'fn_close_sales_order', {
        p_order_id:  orderId,
        p_user_id:   userId,
        p_user_role: userRole,
    });
}

/**
 * fn_advance_sales_order_status(order_id, new_status)
 *
 * Enforces the allowed state machine:
 *   draft → confirmed | cancelled
 *   confirmed → processing | cancelled
 *   processing → shipped | cancelled
 *   shipped → delivered
 *   delivered / cancelled → (terminal)
 */
export async function fnAdvanceSalesOrderStatus(
    db: SupabaseClient,
    orderId: number,
    newStatus: SalesOrderStatus
): DbFn<DbOk & { status: SalesOrderStatus }> {
    return rpc(db, 'fn_advance_sales_order_status', {
        p_order_id:   orderId,
        p_new_status: newStatus,
    });
}

/**
 * fn_ship_sales_order(order_id)
 *
 * Sets status = 'shipped', stamps shipped_at, and inserts an 'out' movement
 * for every SO line, reducing stock for each product.
 * Order MUST be closed (open = FALSE) before calling this.
 */
export async function fnShipSalesOrder(
    db: SupabaseClient,
    orderId: number
): DbFn {
    return rpc(db, 'fn_ship_sales_order', { p_order_id: orderId });
}

// =============================================================================
// SECTION 3 — PURCHASE ORDERS
// =============================================================================

/**
 * fn_open_purchase_order(order_id, user_id)
 *
 * Opens a purchase order for editing and records the user who opened it.
 */
export async function fnOpenPurchaseOrder(
    db: SupabaseClient,
    orderId: number,
    userId: number
): DbFn {
    return rpc(db, 'fn_open_purchase_order', {
        p_order_id: orderId,
        p_user_id:  userId,
    });
}

/**
 * fn_close_purchase_order(order_id)
 *
 * Closes a purchase order (open = FALSE), releases the lock.
 * Closing triggers fn_po_recalc_on_close which stamps final subtotal/total.
 */
export async function fnClosePurchaseOrder(
    db: SupabaseClient,
    orderId: number
): DbFn {
    return rpc(db, 'fn_close_purchase_order', { p_order_id: orderId });
}

/**
 * fn_advance_purchase_order_status(order_id, new_status)
 *
 * Enforces the allowed state machine:
 *   draft → confirmed | cancelled
 *   confirmed → received | cancelled
 *   received / cancelled → (terminal)
 */
export async function fnAdvancePurchaseOrderStatus(
    db: SupabaseClient,
    orderId: number,
    newStatus: PurchaseOrderStatus
): DbFn<DbOk & { status: PurchaseOrderStatus }> {
    return rpc(db, 'fn_advance_purchase_order_status', {
        p_order_id:   orderId,
        p_new_status: newStatus,
    });
}

/**
 * fn_receive_purchase_order(order_id)
 *
 * Marks PO as 'received', stamps received_at, and inserts an 'in' movement
 * for each non-deleted PO line — increasing stock for each product.
 * Order MUST be closed (open = FALSE) before calling this.
 */
export async function fnReceivePurchaseOrder(
    db: SupabaseClient,
    orderId: number
): DbFn {
    return rpc(db, 'fn_receive_purchase_order', { p_order_id: orderId });
}

// =============================================================================
// SECTION 4 — INVENTORY / MOVEMENTS
// =============================================================================

/**
 * Convenience: create a manual stock adjustment movement.
 *
 * Uses a direct INSERT (not an RPC) because movements are INSERT-ONLY
 * and the BEFORE INSERT trigger `fn_movements_update_stock` handles all
 * validation (race-condition check, before/after consistency, negative-stock guard).
 *
 * @param qty  SIGNED: positive adds stock, negative removes stock.
 * @param before  Current value of products.stock (must match DB value exactly).
 * @param after   before + qty (caller must compute; trigger validates).
 */
export async function insertMovement(
    db: SupabaseClient,
    params: {
        product_id: number;
        type:       MovementType;
        qty:        number;
        before:     number;
        after:      number;
        reason:     string;
        ref?:       string;
    }
): Promise<{ id: number } | DbErr> {
    const { data, error } = await db
        .from('movements')
        .insert(params)
        .select('id')
        .single();

    if (error) return { error: error.message };
    return data as { id: number };
}

// =============================================================================
// SECTION 5 — UTILITY FUNCTIONS
// =============================================================================

/**
 * fn_check_version — batch helper.
 * Check the version of multiple rows at once.
 * Returns a map keyed by id; value is true (match) or false (conflict).
 *
 * Uses fnCheckVersion internally for each row.
 */
export async function fnCheckVersionBatch(
    db: SupabaseClient,
    table: string,
    rows: Array<{ id: number; updated_at: number }>
): Promise<Map<number, boolean>> {
    const results = await Promise.all(
        rows.map(r => fnCheckVersion(db, table, r.id, r.updated_at)
            .then(ok => ({ id: r.id, ok }))
        )
    );
    return new Map(results.map(r => [r.id, r.ok]));
}

/**
 * Optimistic-lock guard — throws a structured error if the version check fails.
 * Use this as a one-liner before any UPDATE call.
 *
 * @example
 *   await assertVersion(db, 'products', id, body.updated_at);
 *   await db.from('products').update({ sell_price: 9999 }).eq('id', id);
 */
export async function assertVersion(
    db: SupabaseClient,
    table: string,
    id: number,
    expectedVersion: number
): Promise<void> {
    const ok = await fnCheckVersion(db, table, id, expectedVersion);
    if (!ok) {
        throw Object.assign(
            new Error(`VERSION_CONFLICT: ${table}#${id} was modified since you last read it.`),
            { code: 'VERSION_CONFLICT', statusCode: 409 }
        );
    }
}

/**
 * isDbErr — type-guard to distinguish error results from success objects.
 *
 * @example
 *   const result = await fnOpenSalesOrder(db, orderId, userId, role);
 *   if (isDbErr(result)) return res.status(409).json(result);
 *   // result is DbOk here
 */
export function isDbErr(result: unknown): result is DbErr {
    return typeof result === 'object'
        && result !== null
        && 'error' in result
        && typeof (result as DbErr).error === 'string';
}
