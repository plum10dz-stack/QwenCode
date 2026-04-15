
import { compileAPIS } from "../../help";
import { Packet } from "../../utils/packet";


compileAPIS({
    '/purchase-order-lines/:id': {
        async GET(packet: Packet) {
            return packet.requestAndValidate('purchase_order_lines', {
                employee: "admin",
                admin: ({ req, params }) => req.select('*').eq('order_id', params.id),

            });
        }
    },
    '/purchase-order-line/:id': {
        async GET(packet: Packet) {
            return packet.requestAndValidate('purchase_order_lines', {
                employee: "admin",
                admin: ({ req, params }) => req.select('*').eq('id', params.id).maybeSingle(),
            });
        },
        async PATCH(packet: Packet) {
            return packet.requestAndValidate('purchase_order_lines', {
                employee: "admin",
                admin: ({ req, body, params }) => req.update({ ...body }).eq('id', params.id).select().single(),

            });
        },
        async DELETE(packet: Packet) {
            return packet.requestAndValidate('purchase_order_lines', {
                employee: "admin",
                admin: ({ req, params }) => req.delete().eq('id', params.id).select().maybeSingle(),

            });
        }
    }
})