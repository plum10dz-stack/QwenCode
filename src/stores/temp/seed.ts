import { now as _now, uuid } from "../../utils/helpers";
import { Category, Supplier, Customer, EndCustomer, Product, SalesOrder } from "./data.schemas";
function now() {
    return _now(false) as any;
}
export async function _seedData() {
    const n = now()
    const CATS: Partial<Category>[] = [
        { name: 'Electronics', abr: 'ELEC', ref: 'CAT-001' },
        { name: 'Office Supplies', abr: 'OFFC', ref: 'CAT-002' },
        { name: 'Peripherals', abr: 'PRPH', ref: 'CAT-003' },
        { name: 'Networking', abr: 'NET', ref: 'CAT-004' },
        { name: 'Storage', abr: 'STOR', ref: 'CAT-005' },
    ]


    const s0: Supplier = { id: uuid(), name: 'TechDist Algérie', contact: 'Karim Hadj', phone: '+213-21-234567', email: 'contact@techdist.dz', address: 'Alger', notes: '', created_at: n, updated_at: n }
    const s1: Supplier = { id: uuid(), name: 'Office Pro SARL', contact: 'Amira Benali', phone: '+213-31-345678', email: 'amira@officepro.dz', address: 'Oran', notes: '', created_at: n, updated_at: n }
    const s2: Supplier = { id: uuid(), name: 'NetSolutions DZ', contact: 'Riad Boukhalfa', phone: '+213-41-456789', email: 'riad@netsol.dz', address: 'Constantine', notes: '', created_at: n, updated_at: n }


    const c0: Customer = { id: uuid(), full_name: 'Entreprise Sarl Meziane', phone: '+213-550-111222', email: 'youcef@meziane.dz', city: 'Alger', tax_id: 'NIF-12345', address: 'Rue Didouche', notes: 'Long-term', is_active: true, created_at: n, updated_at: n }
    const c1: Customer = { id: uuid(), full_name: 'Nadia Touati & Associés', phone: '+213-661-333444', email: 'nadia@touati.dz', city: 'Oran', tax_id: 'NIF-67890', address: 'Bd Millénium', notes: '', is_active: true, created_at: n }
    const c2: Customer = { id: uuid(), full_name: 'Riad Systems EURL', phone: '+213-770-555666', email: 'riad@riadsys.dz', city: 'Constantine', tax_id: '', address: 'Zone Ind.', notes: '', is_active: true, created_at: n }


    const e0: EndCustomer = { id: uuid(), full_name: 'Direction EPSP Alger', phone: '+213-21-999000', email: 'epsp@epsp.dz', city: 'Alger', is_active: true, created_at: n }


    const prods: Partial<Product>[] = [
        { name: 'Laptop HP ProBook 450', sku: 'ELC-0001', category: 'Electronics', unit: 'pcs', supplier_id: s0.id, buy_price: 85000, sell_price: 98000, low_stock: 3, initial_stock: 12, location: 'A-01-1', description: '15.6" laptop', active: true },
        { name: 'Dell Monitor 24"', sku: 'ELC-0002', category: 'Electronics', unit: 'pcs', supplier_id: s0.id, buy_price: 42000, sell_price: 52000, low_stock: 4, initial_stock: 8, location: 'A-01-2', description: 'Full HD IPS', active: true },
        { name: 'Wireless Keyboard', sku: 'PER-0001', category: 'Peripherals', unit: 'pcs', supplier_id: s0.id, buy_price: 3500, sell_price: 4500, low_stock: 10, initial_stock: 3, location: 'B-02-1', description: 'Logitech MK270', active: true },
        { name: 'Cat6 Ethernet Cable', sku: 'NET-0001', category: 'Networking', unit: 'pcs', supplier_id: s2.id, buy_price: 800, sell_price: 1200, low_stock: 20, initial_stock: 45, location: 'C-03-1', description: 'Shielded', active: true },
        { name: 'SSD 1TB Samsung 870', sku: 'STO-0001', category: 'Storage', unit: 'pcs', supplier_id: s0.id, buy_price: 22000, sell_price: 28000, low_stock: 5, initial_stock: 14, location: 'A-02-1', description: 'SATA III', active: true },
    ]

    const laptop = prods[0];

    const so: SalesOrder = {
        id: uuid(),
        so_number: 'SO-0001',
        customer_id: c0.id,
        end_customer_id: e0.id,
        status: 'confirmed',
        delivery_date: n.split('T')[0],
        notes: 'Seed order',
        lines: [{ _id: uuid(), product_id: laptop.id!, qty: 1, unit_price: laptop.sell_price, line_total: laptop.sell_price, confirmed: true }],
        subtotal: laptop.sell_price!,
        tax_pct: 19,
        tax_amount: Math.round(laptop.sell_price! * 0.19),
        total: Math.round(laptop.sell_price! * 1.19),
        created_at: n
    }
    return {
        cats: CATS,
        suppliers: [s0, s1, s2],
        customers: [c0, c1, c2],
        endCustomers: [e0],
        products: prods,
        salesOrders: [so]
    }
}