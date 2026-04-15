/**
 * stores/db.ts — Pinia adapter over the Memory data layer.
 *
 * This store does NOT hold its own state.
 * All reactive arrays come directly from Memory.table(name).rows.
 * When Memory updates (init, server push, Table.save/delete),
 * Pinia state updates automatically — no extra wiring needed.
 */

import { defineStore } from 'pinia'
import { computed, type Ref } from 'vue'
import { uuid, now as _now, skuSeq } from '../utils/helpers'

import { TABLE_NAMES } from '../workspace/config'
import { Memory } from '../utils/datasource'
import { Product, Category, Supplier, Customer, EndCustomer, Movement, PurchaseOrder, SalesOrder, Payment, OrderLine } from './temp/data.schemas'
import { _seedData } from './temp/seed'
import { DataRowType, Row, Table } from '../utils/data'
import { ObjectGarbage } from '../utils/ObjectGarbage'
import orchestrator from '../workspace/Orchestrator'

function now() {
  return _now(false) as any;
}

function getTable(name: string) {
  return orchestrator.gc.getTable(name);
}

const T = <T extends DataRowType>(name: string): Table<T> => getTable(name) as Table<T>

export const useDbStore = defineStore('db', () => {

  // ── Reactive table references (the state) ────────────────────────────────────
  // We cast the generic 'rows' from Memory to specific typed arrays
  const products = T<Product>('products')
  const categories = T<Category>('categories')
  const suppliers = T<Supplier>('suppliers')
  const customers = T<Customer>('customers')
  const endCustomers = T<EndCustomer>('end_customers')
  const movements = T<Movement>('movements')
  const purchaseOrders = T<PurchaseOrder>('purchase_orders')
  const salesOrders = T<SalesOrder>('sales_orders')
  const pPayments = T<Payment>('p_payments')
  const sPayments = T<Payment>('s_payments')

  // ── Getters ──────────────────────────────────────────────────────────────────
  const getProduct = (id: string) => products.find(p => p.id === id)
  const getSupplier = (id: string) => suppliers.find(s => s.id === id)
  const getCustomer = (id: string) => customers.find(c => c.id === id)
  const getEndCustomer = (id: string) => endCustomers.find(c => c.id === id)
  const getCategoryById = (id: string) => categories.find(c => c.id === id)
  const getCategoryByName = (name: string) => categories.find(c => c.name === name)

  const lowStockItems = computed(() => products.filter(p => p.stock <= p.low_stock))
  const pendingPOs = computed(() => purchaseOrders.filter(p => ['draft', 'sent', 'confirmed'].includes(p.status)).length)
  const activeSOs = computed(() => salesOrders.filter(o => ['confirmed', 'processing', 'shipped'].includes(o.status)).length)
  const totalStockValue = computed(() => products.reduce((a, p) => a + p.stock * p.buy_price, 0))
  const totalSellValue = computed(() => products.reduce((a, p) => a + p.stock * p.sell_price, 0))
  const totalRevenue = computed(() => salesOrders.filter(o => ['shipped', 'delivered'].includes(o.status)).reduce((a, o) => a + (o.total || 0), 0))

  const soPaymentTotal = (soId: string) => sPayments.filter(p => p.order_id === soId).reduce((a, p) => a + (p.amount || 0), 0)
  const poPaymentTotal = (poId: string) => pPayments.filter(p => p.order_id === poId).reduce((a, p) => a + (p.amount || 0), 0)

  // ── Products ──────────────────────────────────────────────────────────────────
  async function saveProduct(data: Partial<Product>, editId: string | null = null) {
    if (!data.sku) data.sku = skuSeq(data.category || 'PRD');
    const table = T<Product>('products');
    const n = now()
    if (editId) {
      const existing = getProduct(editId)!
      if (existing) {
        return table.save(existing.cloneFrom({ ...data, updated_at: n as any }))
      }
    }

    // Create new
    const rec = <Product>{
      id: data.id || uuid(),
      name: data.name || '',
      sku: data.sku || '',
      category: data.category || '',
      unit: data.unit || 'pcs',
      supplier_id: data.supplier_id || '',
      buy_price: data.buy_price || 0,
      sell_price: data.sell_price || 0,
      stock: data.initial_stock || 0,
      low_stock: data.low_stock || 0,
      created_at: n as any,
      updated_at: n as any,
      ...data
    };
    const saved = await T<Product>('products').new(rec, true);
    if (saved.stock > 0) {
      await recordMovement({ product_id: saved.id, type: 'in', qty: saved.stock, before: 0, after: saved.stock, reason: 'Initial stock', ref: '' })
    }
    return saved
  }

  async function deleteProduct(id: string) { await T<Product>('products').delete(id) }

  // ── Categories ────────────────────────────────────────────────────────────────
  async function saveCategory(data: Partial<Category>, editId: string | null = null) {
    const table = T<Category>('categories');
    if (editId) {
      const existing = getCategoryById(editId);
      if (existing) return table.save(existing.cloneFrom(data))
      return
    }
    if (categories.find(c => c.name === data.name)) return
    const f = table.new(<Category>{
      id: uuid(),
      name: data.name || '',
      abr: data.abr || (data.name ? data.name.substring(0, 4).toUpperCase() : ''),
      ref: data.ref || ''
    }, true);
  }

  async function deleteCategory(id: string) {
    const cat = getCategoryById(id);
    const table = T<Category>('categories');
    if (!cat) return
    await table.delete(id)
    for (const p of products.filter(p => p.category === cat.name)) {
      await table.save(p.cloneFrom({ category: '' }))
    }
  }

  // ── Suppliers ─────────────────────────────────────────────────────────────────
  async function saveSupplier(data: Partial<Supplier>, editId: string | null = null) {
    const table = T<Supplier>('suppliers');
    if (editId) {
      const ex = getSupplier(editId)
      if (ex) return table.save(ex.cloneFrom({ ...data, updated_at: now() }))
    }
    return table.save({ id: uuid(), ...data, created_at: now() } as any)
  }

  async function deleteSupplier(id: string) {
    if (purchaseOrders.some(p => p.supplier_id === id)) throw new Error('Supplier has existing purchase orders and cannot be deleted.')
    await T<Supplier>('suppliers').delete(id)
  }

  // ── Customers ───────────────────────────────────────────────────────────────────
  async function saveCustomer(data: Partial<Customer>, editId: string | null = null) {
    const table = T<Customer>('customers');
    if (editId) {
      const ex = getCustomer(editId)
      if (ex) return table.save(ex.cloneFrom({ ...data, updated_at: now() }))
    }
    return table.save({ id: uuid(), ...data, created_at: now() } as any)
  }

  async function deleteCustomer(id: string) {
    if (salesOrders.some(o => o.customer_id === id)) throw new Error('Customer has existing sales orders and cannot be deleted.')
    await T<Customer>('customers').delete(id)
  }

  // ── End Customers ─────────────────────────────────────────────────────────────
  async function saveEndCustomer(data: Partial<EndCustomer>, editId: string | null = null) {
    const table = T<EndCustomer>('end_customers');
    if (editId) {
      const ex = table.getById(editId); getEndCustomer(editId)
      if (ex) return table.save(ex.cloneFrom({ ...data, updated_at: now() }))
    }
    return table.save({ id: uuid(), ...data, created_at: now() } as any)
  }

  async function deleteEndCustomer(id: string) {
    if (salesOrders.some(o => o.end_customer_id === id)) throw new Error('End customer is linked to existing orders.')
    await T<EndCustomer>('end_customers').delete(id)
  }

  // ── Movements ─────────────────────────────────────────────────────────────────
  interface MovementPayload {
    product_id: string;
    type: 'in' | 'out' | 'adjust';
    qty: number;
    before: number;
    after: number;
    reason: string;
    ref: string;
  }

  async function recordMovement({ product_id, type, qty, before, after, reason, ref }: MovementPayload) {
    const table = T<Movement>('movements');
    return await table.new(<Movement>{ id: uuid(), product_id, type, qty, before, after, reason, ref, created_at: now() }, true);
  }

  async function adjustStock({ product_id, type, qty, reason, ref }: Omit<MovementPayload, 'before' | 'after'>) {
    const p = getProduct(product_id)
    if (!p) return
    const before = p.stock
    const after = type === 'in' ? before + qty : type === 'out' ? Math.max(0, before - qty) : qty
    const table = T<Product>('products');
    await table.save(p.cloneFrom({ stock: after, updated_at: now() } as any))
    await recordMovement({ product_id, type, qty, before, after, reason, ref })
  }

  // ── Purchase Orders ───────────────────────────────────────────────────────────
  async function upsertPO(data: Partial<PurchaseOrder>) {
    return T<PurchaseOrder>('purchase_orders').save({ ...data, updated_at: now() } as PurchaseOrder)
  }

  async function receivePO(id: string) {
    const po = purchaseOrders.find(p => p.id === id)
    if (!po) return
    for (const line of (po.lines || [])) {
      if (!line.product_id || !line.qty) continue
      const p = getProduct(line.product_id)
      if (!p) continue
      const before = p.stock
      await T<Product>('products').save(p.cloneFrom({ stock: before + line.qty, buy_price: line.price || p.buy_price, updated_at: now() }))
      await recordMovement({ product_id: p.id, type: 'in', qty: line.qty, before, after: before + line.qty, reason: 'Purchase', ref: po.po_number })
    }
    await T<PurchaseOrder>('purchase_orders').save(po.cloneFrom({ status: 'received', received_at: now() }))
  }

  async function deletePO(id: string) {
    const po = purchaseOrders.find(p => p.id === id)
    if (!po) return
    if ((po.lines || []).length > 0) throw new Error('Remove all lines before deleting this purchase order.')
    if (pPayments.some(p => p.order_id === id)) throw new Error('Confirm deletion of all payments first.')
    await T<PurchaseOrder>('purchase_orders').delete(id)
  }

  // ── Sales Orders ──────────────────────────────────────────────────────────────
  async function upsertSO(data: Partial<SalesOrder>) {
    return T<SalesOrder>('sales_orders').save({ ...data, updated_at: now() } as SalesOrder)
  }

  async function fulfillSO(id: string) {
    const so = salesOrders.find(o => o.id === id)
    if (!so) return
    for (const line of (so.lines || [])) {
      if (!line.product_id || !line.qty) continue
      const p = getProduct(line.product_id)
      if (!p) continue
      const before = p.stock
      const after = Math.max(0, before - line.qty)
      await T<Product>('products').save(p.cloneFrom({ stock: after, updated_at: now() }))
      await recordMovement({ product_id: p.id, type: 'out', qty: line.qty, before, after, reason: 'Sale', ref: so.so_number })
    }
    await T<SalesOrder>('sales_orders').save(so.cloneFrom({ status: 'shipped', shipped_at: now() }))
  }

  async function deliverSO(id: string) {
    const so = salesOrders.find(o => o.id === id)
    if (!so) return
    await T<SalesOrder>('sales_orders').save(so.cloneFrom({ status: 'delivered', delivered_at: now() }))
  }

  async function deleteSO(id: string) {
    const so = salesOrders.find(o => o.id === id)
    if (!so) return
    if ((so.lines || []).length > 0) throw new Error('Remove all lines before deleting this sales order.')
    if (sPayments.some(p => p.order_id === id)) throw new Error('Confirm deletion of all payments first.')
    await T<SalesOrder>('sales_orders').delete(id)
  }

  // ── Payments ──────────────────────────────────────────────────────────────────
  async function saveSPayment(data: Partial<Payment>, editId: string | null = null) {
    if (editId) {
      const ex = sPayments.find(p => p.id === editId)
      if (ex) return T<Payment>('sPayments').save(ex.cloneFrom({ ...data }))
    }
    return T<Payment>('sPayments').save({ id: uuid(), date_created: now(), ...data } as any)
  }

  async function deleteSPayment(id: string) { await T<Payment>('sPayments').delete(id) }

  async function savePPayment(data: Partial<Payment>, editId: string | null = null) {
    if (editId) {
      const ex = pPayments.find(p => p.id === editId)
      if (ex) return T<Payment>('pPayments').save(ex.cloneFrom({ ...data }))
    }
    return T<Payment>('pPayments').save({ id: uuid(), date_created: now(), ...data } as any)
  }

  async function deletePPayment(id: string) { await T<Payment>('pPayments').delete(id) }

  // ── Export ────────────────────────────────────────────────────────────────────
  function exportJSON() {
    const state: Record<string, unknown> = {}
    const tableNames = TABLE_NAMES;

    for (const name of tableNames) {
      state[name] = getTable(name)
    }
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'stockos.json'
    a.click()
  }

  function exportCSV(tableName: string) {
    const rows = getTable(tableName);
    if (!rows.length) return
    const h = Object.keys(rows[0])
    const csv = [h.join(','), ...rows.map((r: any) => h.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${tableName}.csv`
    a.click()
  }

  // ── Seed (clears IndexedDB + refills) ─────────────────────────────────────────
  async function seed() {
    // const { getLocalStore } = await import('../data/api.js')
    // await getLocalStore().clearAll()


    const tableNames = TABLE_NAMES;
    for (const name of tableNames) {
      (getTable(name) as Table<any>).hydrate([]);
    }
    const x = await _seedData()!;
    x.cats.forEach(c => saveCategory(c))
    x.suppliers.forEach(s => saveSupplier(s))
    x.customers.forEach(c => saveCustomer(c))
    x.endCustomers.forEach(e => saveEndCustomer(e))
    x.products.forEach(p => saveProduct(p));
    x.salesOrders[0].lines[0].product_id = x.products[0].id as any;
    x.salesOrders.forEach(so => upsertSO(so))
  }


  // ── Return everything the Pinia store exposes ─────────────────────────────────
  return {
    // State (reactive arrays from Memory)
    products, categories, suppliers, customers, endCustomers,
    movements, purchaseOrders, salesOrders, pPayments, sPayments,
    // Getters
    getProduct, getSupplier, getCustomer, getEndCustomer, getCategoryById, getCategoryByName,
    lowStockItems, pendingPOs, activeSOs, totalStockValue, totalSellValue, totalRevenue,
    soPaymentTotal, poPaymentTotal,
    // Actions
    saveProduct, deleteProduct,
    saveCategory, deleteCategory,
    saveSupplier, deleteSupplier,
    saveCustomer, deleteCustomer,
    saveEndCustomer, deleteEndCustomer,
    recordMovement, adjustStock,
    upsertPO, receivePO, deletePO,
    upsertSO, fulfillSO, deliverSO, deleteSO,
    saveSPayment, deleteSPayment,
    savePPayment, deletePPayment,
    exportJSON, exportCSV,
    seed,
  }
})