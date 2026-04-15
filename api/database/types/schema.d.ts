// =============================================================================
// SOS ERP — TypeScript type definitions  (def.d.ts  v4)
// Auto-derived from database-init.sql v3.
// Rules:
//   • All IDs are `number` (BIGINT → JS safe integer up to 2^53).
//   • All timestamps are `number` (Unix epoch milliseconds, now_ms()).
//   • NUMERIC(18,4) columns are `number` (parsed by PostgREST as float).
//   • Nullable columns in SQL → `X | null` in TypeScript.
//   • Columns with DEFAULT and NOT NULL are optional on Insert types.
//   • Enum types map to union literal types.
// =============================================================================

// ---------------------------------------------------------------------------
// Shared scalars
// ---------------------------------------------------------------------------
/** Unix epoch milliseconds — all date/time columns in this schema */
type EpochMs = number;

/** NUMERIC(18,4) — PostgREST returns these as JS numbers */
type Numeric = number;

/** BIGINT identity PK / FK — safe integer ≤ Number.MAX_SAFE_INTEGER */
type BigIntId = number;

// ---------------------------------------------------------------------------
// Enum types
// ---------------------------------------------------------------------------
type AuditOperation = 'INSERT' | 'UPDATE' | 'DELETE';
type UserRole = 'admin' | 'employee' | 'customer' | 'anonymous';
type SalesOrderStatus = 'draft' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
type PurchaseOrderStatus = 'draft' | 'confirmed' | 'received' | 'cancelled';
type MovementType = 'in' | 'out' | 'adjustment' | 'return_in' | 'return_out' | 'transfer';

// =============================================================================
// TABLE INTERFACES
// =============================================================================

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------
interface Users {
    id: BigIntId;       // BIGINT GENERATED ALWAYS AS IDENTITY
    name: string;         // UNIQUE, length >= 2
    pwd: string;
    /** NULL for admin/employee; points to customers.id for customer-role users */
    cid: BigIntId | null;
    role: UserRole;
    email: string | null;  // UNIQUE
    mobile: string | null;
    blocked: boolean;
    created_at: EpochMs;        // IMMUTABLE after insert
    updated_at: EpochMs;        // OPTIMISTIC-LOCK VERSION TOKEN
    email_confirmed_at: EpochMs | null;
    confirmation_sent_at: EpochMs | null;
    last_sign_in_at: EpochMs | null;

}

// ---------------------------------------------------------------------------
// sessions  (EXEMPT from audit_log; id is UUID)
// ---------------------------------------------------------------------------
interface Sessions {
    id: string;         // UUID DEFAULT gen_random_uuid()
    uid: BigIntId;       // FK → users.id ON DELETE CASCADE
    cid: BigIntId | null;// copied from users.cid at login
    username: string;
    cert: string;
    pwd_suffix: string;
    handshake_time: EpochMs | null;
    IP: string | null;  // quoted column name in DB
    expire: EpochMs | null;
    logged: boolean;
    role: UserRole;
    created_at: EpochMs;
}

// ---------------------------------------------------------------------------
// categories
// ---------------------------------------------------------------------------
interface Categories {
    id: BigIntId;
    name: string;    // UNIQUE
    abr: string;
    ref: string;
    created_at: EpochMs;   // IMMUTABLE
    updated_at: EpochMs;   // OL token
}

// ---------------------------------------------------------------------------
// suppliers
// ---------------------------------------------------------------------------
interface Suppliers {
    id: BigIntId;
    name: string;
    contact: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
    is_active: boolean;
    created_at: EpochMs;
    updated_at: EpochMs;
}

// ---------------------------------------------------------------------------
// customers  (B2B)
// ---------------------------------------------------------------------------
interface Customers {
    id: BigIntId;
    full_name: string;
    phone: string | null;
    email: string | null;
    city: string | null;
    tax_id: string | null;
    address: string | null;
    notes: string | null;
    is_active: boolean;
    created_at: EpochMs;
    updated_at: EpochMs;
}

// ---------------------------------------------------------------------------
// end_customers  (B2C / final recipients)
// ---------------------------------------------------------------------------
interface EndCustomers {
    id: BigIntId;
    full_name: string;
    phone: string | null;
    email: string | null;
    city: string | null;
    tax_id: string | null;
    address: string | null;
    notes: string | null;
    is_active: boolean;
    created_at: EpochMs;
    updated_at: EpochMs;
}

// ---------------------------------------------------------------------------
// products
// ---------------------------------------------------------------------------
interface Products {
    id: BigIntId;
    name: string;           // UNIQUE
    sku: string;           // UNIQUE
    category_id: BigIntId | null;  // FK → categories.id ON DELETE SET NULL
    unit: string;           // e.g. 'pcs', 'unit', 'lic', 'ream'
    supplier_id: BigIntId | null;  // FK → suppliers.id  ON DELETE SET NULL
    buy_price: Numeric;          // >= 0
    sell_price: Numeric;          // >= 0
    /** Current physical on-hand qty — managed exclusively by movements trigger */
    stock: Numeric;
    /** Cumulative qty received via PO lines (live, trigger-managed) */
    total_in: Numeric;
    /** Cumulative qty sold via SO lines (live, trigger-managed)  */
    total_out: Numeric;
    /** Cumulative purchase cost via PO lines (live, trigger-managed) */
    amount_in: Numeric;
    /** Cumulative sales revenue via SO lines (live, trigger-managed) */
    amount_out: Numeric;
    low_stock: Numeric;          // alert threshold
    location: string | null;
    description: string | null;
    active: boolean;
    deleted: boolean;
    created_at: EpochMs;          // IMMUTABLE
    updated_at: EpochMs;          // OPTIMISTIC-LOCK VERSION TOKEN
}

// ---------------------------------------------------------------------------
// movements  (INSERT-ONLY; exempt from audit_log)
// ---------------------------------------------------------------------------
interface Movements {
    id: BigIntId;
    product_id: BigIntId;       // FK → products.id ON DELETE RESTRICT
    type: MovementType;
    /**
     * qty sign rules:
     *   'in', 'return_in'              → pass positive (trigger uses ABS)
     *   'out', 'return_out','transfer' → pass positive (trigger negates, -ABS)
     *   'adjustment'                   → SIGNED by caller (+adds, -removes)
     */
    qty: Numeric;        // CHECK (qty <> 0)
    before: Numeric;        // stock before this movement
    after: Numeric;        // stock after  (>= 0)
    reason: string;
    ref: string | null;  // optional order-id reference
    created_at: EpochMs;
}

// ---------------------------------------------------------------------------
// assets  (INSERT-ONLY except soft-delete)
// ---------------------------------------------------------------------------
interface Assets {
    id: BigIntId;
    name: string;
    path: string;
    type: string;
    size: number;        // bytes, >= 0
    mime_type: string;
    created_by_user_id: BigIntId;     // FK → users.id ON DELETE RESTRICT
    owner: BigIntId;     // FK → users.id ON DELETE RESTRICT
    for: UserRole;
    deleted: boolean;
    created_at: EpochMs;
}

// ---------------------------------------------------------------------------
// purchase_orders
// ---------------------------------------------------------------------------
interface PurchaseOrders {
    id: BigIntId;
    po_number: string;                  // UNIQUE
    por: string | null;           // external PO reference
    supplier_id: BigIntId | null;         // FK → suppliers.id
    expected_date: EpochMs | null;
    status: PurchaseOrderStatus;
    notes: string | null;
    subtotal: Numeric;                 // stamped at close time
    total: Numeric;                 // = subtotal (no tax on POs)
    received_at: EpochMs | null;
    open: boolean;
    locked_by_uid: BigIntId | null;         // FK → users.id ON DELETE SET NULL
    locked_at: EpochMs | null;
    created_at: EpochMs;                 // IMMUTABLE
    updated_at: EpochMs;                 // OL token
}

// ---------------------------------------------------------------------------
// purchase_order_lines
// ---------------------------------------------------------------------------
interface PurchaseOrderLines {
    id: BigIntId;
    order_id: BigIntId;   // FK → purchase_orders.id; FROZEN after insert
    product_id: BigIntId;   // FK → products.id;        FROZEN after insert
    /** Snapshot of products.name at creation; user-editable afterwards */
    name: string;
    qty: Numeric;    // > 0
    unit_price: Numeric;    // >= 0
    line_total: Numeric;    // GENERATED ALWAYS AS (qty * unit_price) STORED
    /** products.buy_price  at line creation — FROZEN after insert */
    p_price: Numeric;
    /** products.sell_price at line creation — FROZEN after insert */
    s_price: Numeric;
    sort_order: number;
    deleted: boolean;
    created_at: EpochMs;    // IMMUTABLE
    updated_at: EpochMs;    // OL token
}

// ---------------------------------------------------------------------------
// sales_orders
// ---------------------------------------------------------------------------
interface SalesOrders {
    id: BigIntId;
    so_number: string;               // UNIQUE
    customer_id: BigIntId | null;      // FK → customers.id
    end_customer_id: BigIntId | null;      // FK → end_customers.id
    delivery_date: EpochMs | null;
    notes: string | null;
    subtotal: Numeric;              // stamped at close time
    tax_pct: Numeric;              // e.g. 19.0000 (percent)
    tax_amount: Numeric;              // stamped at close time
    total: Numeric;              // subtotal + tax_amount
    shipped_at: EpochMs | null;
    delivered_at: EpochMs | null;
    status: SalesOrderStatus;
    open: boolean;
    locked_by_uid: BigIntId | null;      // FK → users.id ON DELETE SET NULL
    locked_at: EpochMs | null;
    created_at: EpochMs;              // IMMUTABLE
    updated_at: EpochMs;              // OL token
}

// ---------------------------------------------------------------------------
// sales_order_lines
// ---------------------------------------------------------------------------
interface SalesOrderLines {
    id: BigIntId;
    order_id: BigIntId;   // FK → sales_orders.id; FROZEN after insert
    product_id: BigIntId;   // FK → products.id;     FROZEN after insert
    /** Snapshot of products.name at creation; user-editable afterwards */
    name: string;
    /**
     * qty can be NEGATIVE for credit / return lines on an SO.
     * Constraint: qty <> 0.
     */
    qty: Numeric;
    unit_price: Numeric;    // >= 0
    line_total: Numeric;    // GENERATED ALWAYS AS (qty * unit_price) STORED
    /** products.buy_price  at line creation — FROZEN after insert */
    p_price: Numeric;
    /** products.sell_price at line creation — FROZEN after insert */
    s_price: Numeric;
    sort_order: number;
    created_at: EpochMs;    // IMMUTABLE
    updated_at: EpochMs;    // OL token
}

// ---------------------------------------------------------------------------
// s_payments  (INSERT-ONLY — no UPDATE, no DELETE)
// ---------------------------------------------------------------------------
interface SPayments {
    id: BigIntId;
    by_user_id: BigIntId;       // FK → users.id ON DELETE RESTRICT
    customer_id: BigIntId | null;// FK → customers.id; at least one of customer_id/order_id required
    order_id: BigIntId | null;// FK → sales_orders.id
    amount: Numeric;        // > 0
    notes: string | null;
    date: EpochMs;        // payment date (user-supplied or now_ms())
    date_created: EpochMs;        // system creation timestamp
}

// ---------------------------------------------------------------------------
// p_payments  (INSERT-ONLY — no UPDATE, no DELETE)
// ---------------------------------------------------------------------------
interface PPayments {
    id: BigIntId;
    by_user_id: BigIntId;       // FK → users.id ON DELETE RESTRICT
    supplier_id: BigIntId | null;// FK → suppliers.id; at least one of supplier_id/order_id required
    order_id: BigIntId | null;// FK → purchase_orders.id
    amount: Numeric;        // > 0
    notes: string | null;
    date: EpochMs;
    date_created: EpochMs;
}

// ---------------------------------------------------------------------------
// events  (SSE / real-time notification table)
// ---------------------------------------------------------------------------
interface Events {
    id: BigIntId;
    table_name: string;
    action: string;
    row_id: string;
    event_time: EpochMs;
}

// audit_log


interface AuditLogRow {
    id: BigIntId;              // bigint -> JS number (exact only up to 2^53-1)
    table_name: string;
    operation: AuditOperation;
    row_id: string;
    payload: Record<string, unknown>; // jsonb
    created_at: EpochMs;     // bigint (epoch ms)
}

// delete_log
interface DeleteLogRow {
    id: number;              // bigint
    table_name: string;
    row_id: string;
    deleted_by: BigIntId | null; // bigint null
    deleted_at: EpochMs;     // bigint epoch ms
}

// =============================================================================
// VIEW INTERFACES  (read-only — select only)
// =============================================================================

interface VProductsStock {
    id: BigIntId;
    name: string;
    sku: string;
    category_name: string | null;
    unit: string;
    stock: Numeric;
    total_in: Numeric;
    total_out: Numeric;
    amount_in: Numeric;
    amount_out: Numeric;
    gross_margin: Numeric;         // amount_in - amount_out
    low_stock: Numeric;
    stock_status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
    buy_price: Numeric;
    sell_price: Numeric;
    active: boolean;
    updated_at: EpochMs;
}

interface VSalesOrdersFull {
    id: BigIntId;
    so_number: string;
    customer_name: string | null;
    end_customer_name: string | null;
    status: SalesOrderStatus;
    open: boolean;
    subtotal: Numeric;
    tax_pct: Numeric;
    tax_amount: Numeric;
    total: Numeric;
    delivery_date: EpochMs | null;
    shipped_at: EpochMs | null;
    delivered_at: EpochMs | null;
    created_at: EpochMs;
    updated_at: EpochMs;
}

interface VPurchaseOrdersFull {
    id: BigIntId;
    po_number: string;
    por: string | null;
    supplier_name: string | null;
    status: PurchaseOrderStatus;
    open: boolean;
    subtotal: Numeric;
    total: Numeric;
    expected_date: EpochMs | null;
    received_at: EpochMs | null;
    created_at: EpochMs;
    updated_at: EpochMs;
}

interface VSalesOrderBalance {
    order_id: BigIntId;
    so_number: string;
    order_total: Numeric;
    total_paid: Numeric;
    balance_due: Numeric;
}

interface VPurchaseOrderBalance {
    order_id: BigIntId;
    po_number: string;
    order_total: Numeric;
    total_paid: Numeric;
    balance_due: Numeric;
}

// =============================================================================
// DATABASE FUNCTION RETURN TYPES
// =============================================================================

/** Standard JSON envelope returned by all stored procedures */
interface DbFnResult {
    ok?: true;
    error?: string;
    from?: string;
    to?: string;
    status?: string;
}

interface CheckVersionResult {
    fn_check_version: boolean;
}

// =============================================================================
// DATABASE TABLES MAP  (for generic request helpers)
// =============================================================================

interface DatabaseTables {
    // Core data tables
    users: Users;
    sessions: Sessions;
    categories: Categories;
    suppliers: Suppliers;
    customers: Customers;
    end_customers: EndCustomers;
    products: Products;
    movements: Movements;
    assets: Assets;
    purchase_orders: PurchaseOrders;
    purchase_order_lines: PurchaseOrderLines;
    sales_orders: SalesOrders;
    sales_order_lines: SalesOrderLines;
    s_payments: SPayments;
    p_payments: PPayments;
    events: Events;
    audit_log: AuditLogRow;
    delete_log: DeleteLogRow;
    // Views (read-only)
    v_products_stock: VProductsStock;
    v_sales_orders_full: VSalesOrdersFull;
    v_purchase_orders_full: VPurchaseOrdersFull;
    v_sales_order_balance: VSalesOrderBalance;
    v_purchase_order_balance: VPurchaseOrderBalance;
}

// =============================================================================
// SUPABASE / PostgREST GENERIC DATABASE TYPE
// =============================================================================

interface Database {
    public: {
        Tables: {
            [K in keyof DatabaseTables]: {
                Row: DatabaseTables[K];
                Insert: Partial<DatabaseTables[K]>;
                Update: Partial<DatabaseTables[K]>;
            };
        };
    };
}

// =============================================================================
// MISC HELPERS
// =============================================================================

interface HandshakeData {
    handshakeTime: EpochMs;
    respTime: EpochMs;
    pwdSuffix: string;
}


interface UserRow { id: BigIntId; }
interface SessionRow { id: string; cert: string; }