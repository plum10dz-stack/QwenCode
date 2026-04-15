
import { compileAPIS } from "../../help";
import { Packet } from "../../utils/packet";
import { fnOpenSalesOrder, fnCloseSalesOrder, fnAdvanceSalesOrderStatus, fnShipSalesOrder } from "../../database/adapters/rpc-wrappers";
import { UserRole, isDbErr, ERPHelper, SalesOrderStatus } from "../../database/adapters/ErpHelper";

/**
 interface SalesOrders {
    id: UUID;
    so_number: string;
    customer_id: UUID | null;
    end_customer_id: UUID | null;
    status: 'draft' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'confirmed';
    locked_by_uid: UUID | null;
    locked_at: ISODateTimeString | null;
    delivery_date: ISODateString | null;
    notes: string | null;
    subtotal: NumericString;
    tax_pct: NumericString;
    tax_amount: NumericString;
    total: NumericString;
    shipped_at: ISODateTimeString | null;
    delivered_at: ISODateTimeString | null;
    created_at: ISODateTimeString;
    updated_at: ISODateTimeString;
}
 */


compileAPIS({
    '/sales-orders': {
        async GET(packet: Packet) {
            return packet.requestAndValidate('sales_orders', {
                employee: "admin",
                admin: ({ req }) => req.select('*'),
                customer: ({ req, session }) => req.select('*').eq('customer_id', session.cid)
            });
        },

        async POST(packet: Packet) {
            return packet.requestAndValidate('sales_orders', {
                employee: "admin",
                admin: ({ req, body }) => req.insert({ ...body }).select().single(),
                customer: ({ req, body, session }) => req.upsert({ ...body, customer_id: session.cid }).select().single()
            });
        }
    },
    '/sale-order/:id': {
        async GET(packet: Packet) {
            return packet.requestAndValidate('sales_orders', {
                employee: "admin",
                admin: ({ req, params }) => {
                    return req.select('*').eq('id', params.id).select().single();

                },
                customer: ({ req, session, params }) => {
                    return req.select('*').eq('id', params.id).eq('customer_id', session.cid).select().single();
                }
            });
        },
        async PATCH(packet: Packet) {
            return packet.requestAndValidate('sales_orders', {
                employee: "admin",
                admin: ({ req, params }) => {
                    return req.update(<SalesOrders>{ ...packet.body }).eq('id', params.id).select().single();
                },
                customer: ({ req, session, params }) => {
                    return req.update(<SalesOrders>{ ...packet.body, customer_id: session.cid }).eq('id', params.id).select().single();
                }
            });
        }
    },
    '/sale-order/:id/lines': {
        async GET(packet: Packet) {
            return packet.requestAndValidate('sales_order_lines', {
                employee: "admin",
                admin: ({ req, params }) => req.select('*').eq('order_id', params.id),
                customer: ({ req, session, params }) => req.select('*').eq('order_id', params.id).eq('customer_id', session.cid)
            });
        }
    },
    // open - close sale-order natively via RPC locks
    '/sale-order/:id/open': {
        async PATCH(packet: Packet) {
            const orderId = Number(packet.params.id);
            const uid = packet.session!.uid;

            // Only admins, employees, or the exact customer can open
            let role: UserRole = 'customer';
            if (packet.session?.role === 'admin') role = 'admin';
            if (packet.session?.role === 'employee') role = 'employee';

            const data = await fnOpenSalesOrder(packet.db, orderId, uid, role);

            return packet.validate({ data });
        }
    },
    '/sale-order/:id/close': {
        async PATCH(packet: Packet) {
            const orderId = Number(packet.params.id);
            const uid = packet.session!.uid;

            let role: UserRole = 'customer';
            if (packet.session?.role === 'admin') role = 'admin';
            if (packet.session?.role === 'employee') role = 'employee';

            const data = await fnCloseSalesOrder(packet.db, orderId, uid, role);
            return packet.validate({ data });
        }
    },
    // Advanced RPC Lifecycle Endpoints
    '/sale-order/:id/advance/:status': {
        async PATCH(packet: Packet) {
            if (packet.session?.role === 'customer') return packet.validate({ error: 'UNAUTHORIZED', status: 403 });
            const orderId = Number(packet.params.id);
            const status = packet.params.status as SalesOrderStatus;

            const data = await fnAdvanceSalesOrderStatus(packet.db, orderId, status);

            return packet.validate({ data });
        }
    },
    '/sale-order/:id/ship': {
        async PATCH(packet: Packet) {
            if (packet.session?.role === 'customer') return packet.validate({ error: 'UNAUTHORIZED', status: 403 });
            const orderId = Number(packet.params.id);
            const data = await fnShipSalesOrder(packet.db, orderId);

            return packet.validate({ data });
        }
    },
    '/sale-order/:id/deliver': {
        async PATCH(packet: Packet) {
            if (packet.session?.role === 'customer') return packet.validate({ error: 'UNAUTHORIZED', status: 403 });
            const orderId = Number(packet.params.id);
            const erp = new ERPHelper(packet.db);
            const result = await erp.deliverSalesOrder(orderId);
            if (ERPHelper.isErr(result)) return packet.validate({ error: <any>result, status: 400 });
            return packet.validate({ data: result, status: 200, cert: packet.session?.cert });
        }
    },
    '/sale-order/:id/cancel': {
        async PATCH(packet: Packet) {
            const orderId = Number(packet.params.id);
            const uid = packet.session!.uid;

            let role: UserRole = 'customer';
            if (packet.session?.role === 'admin') role = 'admin';
            if (packet.session?.role === 'employee') role = 'employee';

            const erp = new ERPHelper(packet.db);
            const result = await erp.cancelSalesOrder(orderId, uid, role);
            if (ERPHelper.isErr(result)) return packet.validate({ error: <any>result, status: 400 });
            return packet.validate({ data: result, status: 200, cert: packet.session?.cert });
        }
    }
});