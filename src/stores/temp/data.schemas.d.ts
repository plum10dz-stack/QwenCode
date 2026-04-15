import { DataRowType, Row } from "../../utils/data"

export interface BaseRecord extends DataRowType {
    id: string
    created_at?: string
}

export interface Product extends BaseRecord {
    sku: string
    name: string
    category: string
    unit: string
    supplier_id: string
    buy_price: number
    sell_price: number
    stock: number
    low_stock: number
    location?: string
    description?: string
    active?: boolean
    initial_stock?: number // Used during creation
}

export interface Category extends BaseRecord {
    name: string
    abr: string
    ref: string
}

export interface Supplier extends BaseRecord {
    name: string
    contact: string
    phone: string
    email: string
    address: string
    notes: string
}

export interface Customer extends BaseRecord {
    full_name: string
    phone: string
    email: string
    city: string
    tax_id: string
    address: string
    notes: string
    is_active: boolean
}

export interface EndCustomer extends BaseRecord {
    full_name: string
    phone: string
    email: string
    city: string
    is_active: boolean
}

export interface Movement extends BaseRecord {
    product_id: string
    type: 'in' | 'out' | 'adjust'
    qty: number
    before: number
    after: number
    reason: string
    ref: string
}

export interface OrderLine {
    _id: string
    product_id: string
    qty: number
    price?: number // for PO
    unit_price?: number // for SO
    line_total?: number
    confirmed?: boolean
}

export interface PurchaseOrder extends BaseRecord {
    po_number: string
    supplier_id: string
    status: 'draft' | 'sent' | 'confirmed' | 'received' | 'cancelled'
    lines: OrderLine[]
    received_at?: string
}

export interface SalesOrder extends BaseRecord {
    so_number: string
    customer_id: string
    end_customer_id?: string
    status: 'draft' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled'
    delivery_date?: string
    lines: OrderLine[]
    subtotal: number
    tax_pct: number
    tax_amount: number
    total: number
    notes?: string
    shipped_at?: string
    delivered_at?: string
}

export interface Payment extends BaseRecord {
    order_id: string
    amount: number
    date_created: string
    method?: string
    reference?: string
}

export interface AuditLog {
    id: string; // bigint (int8)
    table_name: string; // text
    operation: string; // text
    row_id: string; // text
    payload: Record<string, unknown>; // jsonb
    created_at: string; // bigint (int8)
}