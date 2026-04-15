import { compileAPIS } from "../../help";
import { Packet, requestErrorResults } from "../../utils/packet";
import { ERPHelper } from "../../database/adapters/ErpHelper";
import { RequestResult } from "@supabase/supabase-js";


compileAPIS({
    GET: {
        async '/spayments'(packet: Packet) {
            return await packet.requestAndValidate('s_payments', {
                employee: "admin",
                admin: ({ req, body }) => packet.filter('s_payments', body, ['notes']),
                customer: ({ req, session, body }) => packet.filter('s_payments', body, ['notes']).eq('customer_id', session.cid!),
            });
        },
        // payments of order
        async '/spayment/order/:id'(packet: Packet) {
            return await packet.requestAndValidate('s_payments', {
                employee: "admin",
                admin: ({ req, params }) => req.select('*').eq('order_id', params.id),
                customer: ({ req, session, params }) => req.select('*').eq('order_id', params.id).eq('customer_id', session.cid),
            });
        },

        // payments of customer
        async '/spayment/customer/:id'(packet: Packet) {
            return await packet.requestAndValidate('s_payments', {
                employee: "admin",
                admin: ({ req, params }) => req.select('*').eq('customer_id', params.id),
                customer: ({ req, session, params }) => req.select('*').eq('customer_id', session.cid),
            });
        },
        // payments of me
        async '/spayment/me'(packet: Packet) {
            return await packet.requestAndValidate('s_payments', {
                employee: "admin",
                admin: ({ req, session }) => req.select('*').eq('by_user_id', session.uid),
                customer: ({ req, session }) => req.select('*').eq('customer_id', session.cid),
            });
        },

        async '/spayment/:id'(packet: Packet) {
            return await packet.requestAndValidate('s_payments', {
                employee: "admin",
                admin: ({ req, params }) => {
                    return req.select('*').eq('id', params.id).select().single();
                },
                customer: ({ req, params, session }) => {
                    return req.select('*').eq('id', params.id).eq('customer_id', session.cid).select().single();
                }
            });

        }
    },

    DELETE: {
        async '/spayment/:id'(packet: Packet) {
            // Require admin role implicitly (packet.request did this via role guard)
            if (packet.session?.role !== 'admin') return { error: 'UNAUTHORIZED', status: 403 };

            const erp = new ERPHelper(packet.db);
            const result = await erp.deleteSalesPayment(Number(packet.params.id));
            if (ERPHelper.isErr(result)) return { error: result, status: 400 };

            return packet.validate({ data: result, status: 200, cert: packet.session?.cert });
        }
    },

    POST: {
        async '/spayment'(packet: Packet) {

            if (packet.session?.role !== 'admin') return packet.validate({ error: 'UNAUTHORIZED', status: 403 } as requestErrorResults);

            const erp = new ERPHelper(packet.db);
            const body = packet.body as any; // Temporary type bypass for extraction

            const result = await erp.insertSalesPayment(
                Number(body.order_id),
                Number(body.customer_id),
                Number(body.amount),
                packet.session.uid,
                body.notes || ''
            );
            return packet.validate(ERPHelper.isErr(result) ? { error: result as any, status: 400 } : { data: result, status: 200, cert: packet.session?.cert });

        }
    },

})
