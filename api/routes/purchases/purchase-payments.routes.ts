import { compileAPIS } from "../../help";
import { Packet } from "../../utils/packet";
import { ERPHelper } from "../../database/adapters/ErpHelper";


compileAPIS({
    GET: {
        async '/ppayments'(packet: Packet) {
            return await packet.requestAndValidate('p_payments', {
                employee: "admin",
                admin: ({ req, body }) => packet.filter('p_payments', body, ['notes']),
            });
        },
        async '/ppayment/order/:id'(packet: Packet) {
            return await packet.requestAndValidate('p_payments', {
                employee: "admin",
                admin: ({ req, params }) => req.select('*').eq('order_id', params.id),
            });
        },
        async '/ppayment/supplier/:id'(packet: Packet) {
            return await packet.requestAndValidate('p_payments', {
                employee: "admin",
                admin: ({ req, params }) => req.select('*').eq('supplier_id', params.id),
            });
        },
        async '/ppayment/me'(packet: Packet) {
            return await packet.requestAndValidate('p_payments', {
                employee: "admin",
                admin: ({ req, session }) => req.select('*').eq('by_user_id', session.uid),
            });
        },
        async '/ppayment/:id'(packet: Packet) {
            return await packet.requestAndValidate('p_payments', {
                employee: "admin",
                admin: ({ req, params }) => {
                    return req.select('*').eq('id', params.id).select().single();
                },
            });
        },
    },
    POST: {
        async '/ppayment'(packet: Packet) {
            if (packet.session?.role !== 'admin') return packet.validate({ error: 'UNAUTHORIZED', status: 403 });

            const erp = new ERPHelper(packet.db);
            const body = packet.body as any; // Temporary type bypass

            const result = await erp.insertPurchasePayment(
                Number(body.order_id),
                Number(body.supplier_id),
                Number(body.amount),
                packet.session.uid,
                body.notes || ''
            );

            if (ERPHelper.isErr(result)) return packet.json(result, 400);
            return packet.json(result, 200, packet.session?.cert);
        }
    },
    DELETE: {
        async '/ppayment/:id'(packet: Packet) {
            if (packet.session?.role !== 'admin') return packet.validate({ error: 'UNAUTHORIZED', status: 403 });

            const erp = new ERPHelper(packet.db);
            const result = await erp.deletePurchasePayment(Number(packet.params.id));
            if (ERPHelper.isErr(result)) return packet.validate({ error: <any>result, status: 400 });

            return packet.validate({ data: result, status: 200, cert: packet.session?.cert });
        }
    },
})