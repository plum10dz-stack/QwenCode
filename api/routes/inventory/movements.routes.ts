
import { compileAPIS } from "../../help";
import { Packet } from "../../utils/packet";

compileAPIS({
    GET: {
        '/inventory/movements': {
            async GET(packet: Packet) {
                return packet.request('movements', {
                    employee: "admin",
                    admin: ({ req, body }) => packet.filter('movements', body, ['notes']),
                });
            }
        },
        '/inventory/movements/:id': {
            async GET(packet: Packet) {
                return packet.request('movements', {
                    employee: "admin",
                    admin: ({ req, params }) => req.select('*').eq('id', params.id).single(),
                });
            }
        },
        '/inventory/movements/product/:id': {
            async GET(packet: Packet) {
                return packet.request('movements', {
                    employee: "admin",
                    admin: ({ req, params }) => req.select('*').eq('product_id', params.id),
                });
            }
        },
        '/inventory/movements/product/:id/last': {
            async GET(packet: Packet) {
                return packet.request('movements', {
                    employee: "admin",
                    admin: ({ req, params }) => req.select('*').eq('product_id', params.id).order('created_at', { ascending: false }).limit(1).single(),
                });
            }
        }
    },
    POST: {
        '/inventory/movements': {
            async POST(packet: Packet) {
                return packet.request('movements', {
                    employee: "admin",
                    admin: ({ req, body }) => req.insert(body).select().single(),
                });
            }
        }
    },
    DELETE: {
        '/inventory/movements/:id': {
            async DELETE(packet: Packet) {
                return packet.request('movements', {
                    employee: "admin",
                    admin: ({ req, params }) => req.delete().eq('id', params.id).select().single(),
                });
            }
        }
    }
});