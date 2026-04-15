
import { compileAPIS } from "../../help";
import { Packet } from "../../utils/packet";

compileAPIS({
    '/payments/history/:page': {
        async GET(packet: Packet) {
            // Unified dashboard view for all payments (Sales Incomes vs Purchase Expenses)
            const page = parseInt(packet.params.page) || 1;
            const limit = 50; // Fetch enough to cover the paginated union

            // Fetch from both payment tables concurrently
            const [salesRes, purchRes] = await Promise.all([
                packet.db.schema('public').from('s_payments')
                    .select('*, sales_orders(so_number), customers(full_name)')
                    .order('date', { ascending: false })
                    .range(((page || 1) - 1) * 100, ((page || 1) * 100) - 1),

                packet.db.schema('public').from('p_payments')
                    .select('*, purchase_orders(po_number), suppliers(name)')
                    .order('date', { ascending: false })
                    .range(((page || 1) - 1) * 100, ((page || 1) * 100) - 1)
            ]);

            if (salesRes.error) return packet.validate({ error: 'DB_CONNECTION_ERROR_SALES', status: 500 });
            if (purchRes.error) return packet.validate({ error: 'DB_CONNECTION_ERROR_PURCHASES', status: 500 });

            // Normalize and tag the payment streams
            const unified = [
                ...(salesRes.data || []).map(p => ({ ...p, flow: 'IN', order_ref: p.sales_orders?.so_number, contact: p.customers?.full_name })),
                ...(purchRes.data || []).map(p => ({ ...p, flow: 'OUT', order_ref: p.purchase_orders?.po_number, contact: p.suppliers?.name }))
            ].sort((a, b) => b.date - a.date); // Sort purely by unified epoch timestamp

            // Memory pagination for the combined stream
            const offset = (page - 1) * limit;
            const paginated = unified.slice(offset, offset + limit);

            return packet.json(paginated, 200);
        }
    },
    '/payments/summary': {
        async GET(packet: Packet) {
            // High-level wrapper for dashboard widgets (Total IN vs Total OUT)
            const [salesRes, purchRes] = await Promise.all([
                packet.db.schema('public').from('s_payments').select('amount'),
                packet.db.schema('public').from('p_payments').select('amount')
            ]);

            const sumIn = (salesRes.data || []).reduce((acc, row) => acc + Number(row.amount), 0);
            const sumOut = (purchRes.data || []).reduce((acc, row) => acc + Number(row.amount), 0);

            return packet.json({
                total_in: sumIn,
                total_out: sumOut,
                net: sumIn - sumOut
            }, 200);
        }
    }
});
