
import { compileAPIS, now } from "../../help";
import { Packet } from "../../utils/packet";
import { fnOpenPurchaseOrder, fnClosePurchaseOrder, fnAdvancePurchaseOrderStatus, fnReceivePurchaseOrder } from "../../database/adapters/rpc-wrappers";
import { isDbErr, ERPHelper, PurchaseOrderStatus } from "../../database/adapters/ErpHelper";

compileAPIS({
    '/purchase-orders': {
        async GET(packet: Packet) {
            return packet.requestAndValidate('purchase_orders', {
                employee: "admin",
                admin: ({ req }) => req.select('*'),
            });
        },
        async NEW(packet: Packet) {
            return packet.requestAndValidate('purchase_orders', {
                employee: "admin",
                admin: async ({ req, body, session }) => {
                    const { supplier_id, notes, po_number, expected_date, status, por } = body as PurchaseOrders;
                    // check if the supplier exists
                    const { data: supplierExists } = await packet.db.schema('public').from('suppliers').select('id').eq('id', supplier_id).single();

                    if (!supplierExists) return { error: 'SUPPLIER_NOT_FOUND' };
                    const po = <PurchaseOrders>{
                        id: undefined!,
                        supplier_id,
                        notes,
                        po_number,
                        expected_date,
                        status,
                        por,
                        subtotal: 0,
                        tax_pct: 0,
                        tax_amount: 0,
                        total: 0,
                        received_at: null,
                        created_at: now(true),
                        updated_at: now(true),
                        cid: session.cid,
                        uid: session.uid,
                        locked_at: null,
                        locked_by: null,
                        locked_by_uid: null,
                        open: false,
                    };
                    return req.insert(po).select().single();
                },
            });
        }
    },
    '/purchase-order/:id': {
        async GET(packet: Packet) {
            return packet.requestAndValidate('purchase_orders', {
                employee: "admin",
                admin: ({ req, params }) => {
                    return req.select('*').eq('id', params.id).select().single();
                }
            });
        },
        async PATCH(packet: Packet) {
            return packet.requestAndValidate('purchase_orders', {
                employee: "admin",
                admin: ({ req, params }) => {
                    return req.update(<PurchaseOrders>{ ...packet.body }).eq('id', params.id).select().single();
                }
            });
        },
    },
    // open - close purchase-order natively via RPC locks
    '/purchase-order/:id/open': {
        async PATCH(packet: Packet) {
            const orderId = Number(packet.params.id);
            const uid = packet.session!.uid;

            const data = await fnOpenPurchaseOrder(packet.db, orderId, uid);

            return packet.validate({ data });
        }
    },
    '/purchase-order/:id/close': {
        async PATCH(packet: Packet) {
            const orderId = Number(packet.params.id);

            const data = await fnClosePurchaseOrder(packet.db, orderId);

            return packet.validate({ data });
        }
    },
    // Advanced RPC Lifecycle Endpoints
    '/purchase-order/:id/advance/:status': {
        async PATCH(packet: Packet) {
            const orderId = Number(packet.params.id);
            const status = packet.params.status as PurchaseOrderStatus;

            const data = await fnAdvancePurchaseOrderStatus(packet.db, orderId, status);

            return packet.validate({ data });
        }
    },
    '/purchase-order/:id/receive': {
        async PATCH(packet: Packet) {
            const orderId = Number(packet.params.id);
            const data = await fnReceivePurchaseOrder(packet.db, orderId);

            return packet.validate({ data });
        }
    },
    '/purchase-order/:id/cancel': {
        async PATCH(packet: Packet) {
            const orderId = Number(packet.params.id);
            const uid = packet.session!.uid;

            const erp = new ERPHelper(packet.db);
            const result = await erp.cancelPurchaseOrder(orderId, uid);
            if (ERPHelper.isErr(result)) return packet.json(result, 400);
            return packet.json(result, 200, packet.session?.cert);
        }
    }
});