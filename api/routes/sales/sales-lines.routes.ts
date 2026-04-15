
import { compileAPIS } from "../../help";
import { Packet } from "../../utils/packet";


compileAPIS({
    '/sale-order-lines/:id': {
        async GET(packet: Packet) {
            return packet.requestAndValidate('sales_order_lines', {
                employee: "admin",
                admin: ({ req, params }) => req.select('*').eq('order_id', params.id),
                customer: ({ req, session, params }) => req.select('*').eq('order_id', params.id).eq('customer_id', session.cid)
            });
        }
    },
    '/sale-order-line/:id': {
        async GET(packet: Packet) {
            return packet.requestAndValidate('sales_order_lines', {
                employee: "admin",
                admin: ({ req, params }) => req.select('*').eq('id', params.id).maybeSingle(),
                customer: ({ req, session, params }) => req.select('*').eq('id', params.id).eq('customer_id', session.cid).maybeSingle()
            });
        },
        async PATCH(packet: Packet) {
            return packet.requestAndValidate('sales_order_lines', {
                employee: "admin",
                admin: ({ req, body, params }) => req.update({ ...body }).eq('id', params.id).select().single(),
                customer: ({ req, body, session, params }) => req.update({ ...body, customer_id: session.cid }).eq('id', params.id).select().single()
            });
        },
        async DELETE(packet: Packet) {
            return packet.requestAndValidate('sales_order_lines', {
                employee: "admin",
                admin: ({ req, params }) => req.delete().eq('id', params.id).select().maybeSingle(),
                customer: ({ req, session, params }) => req.delete().eq('id', params.id).eq('customer_id', session.cid).select().maybeSingle()
            });
        }
    }
})