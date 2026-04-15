"use strict";
/**
 * stores/db.ts — Pinia adapter over the Memory data layer.
 *
 * This store does NOT hold its own state.
 * All reactive arrays come directly from Memory.table(name).rows.
 * When Memory updates (init, server push, Table.save/delete),
 * Pinia state updates automatically — no extra wiring needed.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useDbStore = void 0;
const pinia_1 = require("pinia");
const vue_1 = require("vue");
const helpers_1 = require("../utils/helpers");
const config_1 = require("../workspace/config");
const seed_1 = require("./temp/seed");
const Orchestrator_1 = __importDefault(require("../workspace/Orchestrator"));
function now() {
    return (0, helpers_1.now)(false);
}
function getTable(name) {
    return Orchestrator_1.default.gc.getTable(name);
}
const T = (name) => getTable(name);
exports.useDbStore = (0, pinia_1.defineStore)('db', () => {
    // ── Reactive table references (the state) ────────────────────────────────────
    // We cast the generic 'rows' from Memory to specific typed arrays
    const products = T('products');
    const categories = T('categories');
    const suppliers = T('suppliers');
    const customers = T('customers');
    const endCustomers = T('end_customers');
    const movements = T('movements');
    const purchaseOrders = T('purchase_orders');
    const salesOrders = T('sales_orders');
    const pPayments = T('p_payments');
    const sPayments = T('s_payments');
    // ── Getters ──────────────────────────────────────────────────────────────────
    const getProduct = (id) => products.find(p => p.id === id);
    const getSupplier = (id) => suppliers.find(s => s.id === id);
    const getCustomer = (id) => customers.find(c => c.id === id);
    const getEndCustomer = (id) => endCustomers.find(c => c.id === id);
    const getCategoryById = (id) => categories.find(c => c.id === id);
    const getCategoryByName = (name) => categories.find(c => c.name === name);
    const lowStockItems = (0, vue_1.computed)(() => products.filter(p => p.stock <= p.low_stock));
    const pendingPOs = (0, vue_1.computed)(() => purchaseOrders.filter(p => ['draft', 'sent', 'confirmed'].includes(p.status)).length);
    const activeSOs = (0, vue_1.computed)(() => salesOrders.filter(o => ['confirmed', 'processing', 'shipped'].includes(o.status)).length);
    const totalStockValue = (0, vue_1.computed)(() => products.reduce((a, p) => a + p.stock * p.buy_price, 0));
    const totalSellValue = (0, vue_1.computed)(() => products.reduce((a, p) => a + p.stock * p.sell_price, 0));
    const totalRevenue = (0, vue_1.computed)(() => salesOrders.filter(o => ['shipped', 'delivered'].includes(o.status)).reduce((a, o) => a + (o.total || 0), 0));
    const soPaymentTotal = (soId) => sPayments.filter(p => p.order_id === soId).reduce((a, p) => a + (p.amount || 0), 0);
    const poPaymentTotal = (poId) => pPayments.filter(p => p.order_id === poId).reduce((a, p) => a + (p.amount || 0), 0);
    // ── Products ──────────────────────────────────────────────────────────────────
    function saveProduct(data_1) {
        return __awaiter(this, arguments, void 0, function* (data, editId = null) {
            if (!data.sku)
                data.sku = (0, helpers_1.skuSeq)(data.category || 'PRD');
            const table = T('products');
            const n = now();
            if (editId) {
                const existing = getProduct(editId);
                if (existing) {
                    return table.save(existing.cloneFrom(Object.assign(Object.assign({}, data), { updated_at: n })));
                }
            }
            // Create new
            const rec = Object.assign({ id: data.id || (0, helpers_1.uuid)(), name: data.name || '', sku: data.sku || '', category: data.category || '', unit: data.unit || 'pcs', supplier_id: data.supplier_id || '', buy_price: data.buy_price || 0, sell_price: data.sell_price || 0, stock: data.initial_stock || 0, low_stock: data.low_stock || 0, created_at: n, updated_at: n }, data);
            const saved = yield T('products').new(rec, true);
            if (saved.stock > 0) {
                yield recordMovement({ product_id: saved.id, type: 'in', qty: saved.stock, before: 0, after: saved.stock, reason: 'Initial stock', ref: '' });
            }
            return saved;
        });
    }
    function deleteProduct(id) {
        return __awaiter(this, void 0, void 0, function* () { yield T('products').delete(id); });
    }
    // ── Categories ────────────────────────────────────────────────────────────────
    function saveCategory(data_1) {
        return __awaiter(this, arguments, void 0, function* (data, editId = null) {
            const table = T('categories');
            if (editId) {
                const existing = getCategoryById(editId);
                if (existing)
                    return table.save(existing.cloneFrom(data));
                return;
            }
            if (categories.find(c => c.name === data.name))
                return;
            const f = table.new({
                id: (0, helpers_1.uuid)(),
                name: data.name || '',
                abr: data.abr || (data.name ? data.name.substring(0, 4).toUpperCase() : ''),
                ref: data.ref || ''
            }, true);
        });
    }
    function deleteCategory(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const cat = getCategoryById(id);
            const table = T('categories');
            if (!cat)
                return;
            yield table.delete(id);
            for (const p of products.filter(p => p.category === cat.name)) {
                yield table.save(p.cloneFrom({ category: '' }));
            }
        });
    }
    // ── Suppliers ─────────────────────────────────────────────────────────────────
    function saveSupplier(data_1) {
        return __awaiter(this, arguments, void 0, function* (data, editId = null) {
            const table = T('suppliers');
            if (editId) {
                const ex = getSupplier(editId);
                if (ex)
                    return table.save(ex.cloneFrom(Object.assign(Object.assign({}, data), { updated_at: now() })));
            }
            return table.save(Object.assign(Object.assign({ id: (0, helpers_1.uuid)() }, data), { created_at: now() }));
        });
    }
    function deleteSupplier(id) {
        return __awaiter(this, void 0, void 0, function* () {
            if (purchaseOrders.some(p => p.supplier_id === id))
                throw new Error('Supplier has existing purchase orders and cannot be deleted.');
            yield T('suppliers').delete(id);
        });
    }
    // ── Customers ───────────────────────────────────────────────────────────────────
    function saveCustomer(data_1) {
        return __awaiter(this, arguments, void 0, function* (data, editId = null) {
            const table = T('customers');
            if (editId) {
                const ex = getCustomer(editId);
                if (ex)
                    return table.save(ex.cloneFrom(Object.assign(Object.assign({}, data), { updated_at: now() })));
            }
            return table.save(Object.assign(Object.assign({ id: (0, helpers_1.uuid)() }, data), { created_at: now() }));
        });
    }
    function deleteCustomer(id) {
        return __awaiter(this, void 0, void 0, function* () {
            if (salesOrders.some(o => o.customer_id === id))
                throw new Error('Customer has existing sales orders and cannot be deleted.');
            yield T('customers').delete(id);
        });
    }
    // ── End Customers ─────────────────────────────────────────────────────────────
    function saveEndCustomer(data_1) {
        return __awaiter(this, arguments, void 0, function* (data, editId = null) {
            const table = T('end_customers');
            if (editId) {
                const ex = table.getById(editId);
                getEndCustomer(editId);
                if (ex)
                    return table.save(ex.cloneFrom(Object.assign(Object.assign({}, data), { updated_at: now() })));
            }
            return table.save(Object.assign(Object.assign({ id: (0, helpers_1.uuid)() }, data), { created_at: now() }));
        });
    }
    function deleteEndCustomer(id) {
        return __awaiter(this, void 0, void 0, function* () {
            if (salesOrders.some(o => o.end_customer_id === id))
                throw new Error('End customer is linked to existing orders.');
            yield T('end_customers').delete(id);
        });
    }
    function recordMovement(_a) {
        return __awaiter(this, arguments, void 0, function* ({ product_id, type, qty, before, after, reason, ref }) {
            const table = T('movements');
            return yield table.new({ id: (0, helpers_1.uuid)(), product_id, type, qty, before, after, reason, ref, created_at: now() }, true);
        });
    }
    function adjustStock(_a) {
        return __awaiter(this, arguments, void 0, function* ({ product_id, type, qty, reason, ref }) {
            const p = getProduct(product_id);
            if (!p)
                return;
            const before = p.stock;
            const after = type === 'in' ? before + qty : type === 'out' ? Math.max(0, before - qty) : qty;
            const table = T('products');
            yield table.save(p.cloneFrom({ stock: after, updated_at: now() }));
            yield recordMovement({ product_id, type, qty, before, after, reason, ref });
        });
    }
    // ── Purchase Orders ───────────────────────────────────────────────────────────
    function upsertPO(data) {
        return __awaiter(this, void 0, void 0, function* () {
            return T('purchase_orders').save(Object.assign(Object.assign({}, data), { updated_at: now() }));
        });
    }
    function receivePO(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const po = purchaseOrders.find(p => p.id === id);
            if (!po)
                return;
            for (const line of (po.lines || [])) {
                if (!line.product_id || !line.qty)
                    continue;
                const p = getProduct(line.product_id);
                if (!p)
                    continue;
                const before = p.stock;
                yield T('products').save(p.cloneFrom({ stock: before + line.qty, buy_price: line.price || p.buy_price, updated_at: now() }));
                yield recordMovement({ product_id: p.id, type: 'in', qty: line.qty, before, after: before + line.qty, reason: 'Purchase', ref: po.po_number });
            }
            yield T('purchase_orders').save(po.cloneFrom({ status: 'received', received_at: now() }));
        });
    }
    function deletePO(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const po = purchaseOrders.find(p => p.id === id);
            if (!po)
                return;
            if ((po.lines || []).length > 0)
                throw new Error('Remove all lines before deleting this purchase order.');
            if (pPayments.some(p => p.order_id === id))
                throw new Error('Confirm deletion of all payments first.');
            yield T('purchase_orders').delete(id);
        });
    }
    // ── Sales Orders ──────────────────────────────────────────────────────────────
    function upsertSO(data) {
        return __awaiter(this, void 0, void 0, function* () {
            return T('sales_orders').save(Object.assign(Object.assign({}, data), { updated_at: now() }));
        });
    }
    function fulfillSO(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const so = salesOrders.find(o => o.id === id);
            if (!so)
                return;
            for (const line of (so.lines || [])) {
                if (!line.product_id || !line.qty)
                    continue;
                const p = getProduct(line.product_id);
                if (!p)
                    continue;
                const before = p.stock;
                const after = Math.max(0, before - line.qty);
                yield T('products').save(p.cloneFrom({ stock: after, updated_at: now() }));
                yield recordMovement({ product_id: p.id, type: 'out', qty: line.qty, before, after, reason: 'Sale', ref: so.so_number });
            }
            yield T('sales_orders').save(so.cloneFrom({ status: 'shipped', shipped_at: now() }));
        });
    }
    function deliverSO(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const so = salesOrders.find(o => o.id === id);
            if (!so)
                return;
            yield T('sales_orders').save(so.cloneFrom({ status: 'delivered', delivered_at: now() }));
        });
    }
    function deleteSO(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const so = salesOrders.find(o => o.id === id);
            if (!so)
                return;
            if ((so.lines || []).length > 0)
                throw new Error('Remove all lines before deleting this sales order.');
            if (sPayments.some(p => p.order_id === id))
                throw new Error('Confirm deletion of all payments first.');
            yield T('sales_orders').delete(id);
        });
    }
    // ── Payments ──────────────────────────────────────────────────────────────────
    function saveSPayment(data_1) {
        return __awaiter(this, arguments, void 0, function* (data, editId = null) {
            if (editId) {
                const ex = sPayments.find(p => p.id === editId);
                if (ex)
                    return T('sPayments').save(ex.cloneFrom(Object.assign({}, data)));
            }
            return T('sPayments').save(Object.assign({ id: (0, helpers_1.uuid)(), date_created: now() }, data));
        });
    }
    function deleteSPayment(id) {
        return __awaiter(this, void 0, void 0, function* () { yield T('sPayments').delete(id); });
    }
    function savePPayment(data_1) {
        return __awaiter(this, arguments, void 0, function* (data, editId = null) {
            if (editId) {
                const ex = pPayments.find(p => p.id === editId);
                if (ex)
                    return T('pPayments').save(ex.cloneFrom(Object.assign({}, data)));
            }
            return T('pPayments').save(Object.assign({ id: (0, helpers_1.uuid)(), date_created: now() }, data));
        });
    }
    function deletePPayment(id) {
        return __awaiter(this, void 0, void 0, function* () { yield T('pPayments').delete(id); });
    }
    // ── Export ────────────────────────────────────────────────────────────────────
    function exportJSON() {
        const state = {};
        const tableNames = config_1.TABLE_NAMES;
        for (const name of tableNames) {
            state[name] = getTable(name);
        }
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'stockos.json';
        a.click();
    }
    function exportCSV(tableName) {
        const rows = getTable(tableName);
        if (!rows.length)
            return;
        const h = Object.keys(rows[0]);
        const csv = [h.join(','), ...rows.map((r) => h.map(k => { var _a; return `"${String((_a = r[k]) !== null && _a !== void 0 ? _a : '').replace(/"/g, '""')}"`; }).join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${tableName}.csv`;
        a.click();
    }
    // ── Seed (clears IndexedDB + refills) ─────────────────────────────────────────
    function seed() {
        return __awaiter(this, void 0, void 0, function* () {
            // const { getLocalStore } = await import('../data/api.js')
            // await getLocalStore().clearAll()
            const tableNames = config_1.TABLE_NAMES;
            for (const name of tableNames) {
                getTable(name).hydrate([]);
            }
            const x = yield (0, seed_1._seedData)();
            x.cats.forEach(c => saveCategory(c));
            x.suppliers.forEach(s => saveSupplier(s));
            x.customers.forEach(c => saveCustomer(c));
            x.endCustomers.forEach(e => saveEndCustomer(e));
            x.products.forEach(p => saveProduct(p));
            x.salesOrders[0].lines[0].product_id = x.products[0].id;
            x.salesOrders.forEach(so => upsertSO(so));
        });
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
    };
});
