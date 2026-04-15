
import { compileAPIS } from "../../help";
import { Packet } from "../../utils/packet";

compileAPIS({
    '/end-customers': {
        async GET(packet: Packet) {
            return packet.requestAndValidate('end_customers', {
                employee: "admin",
                admin: ({ req }) => req.select('*'),
            });
        },
        async POST(packet: Packet) {
            return packet.requestAndValidate('end_customers', {
                employee: "admin",
                admin: ({ req, body }) => req.insert({ ...body }).select().single(),
            });
        }
    },
    '/end-customer/:id': {
        async GET(packet: Packet) {
            return packet.requestAndValidate('end_customers', {
                customer: 'admin',
                employee: "admin",
                admin: ({ req, params }) => {
                    return req.select('*').eq('id', params.id).select().single();
                },
            });

        },
        async PATCH(packet: Packet) {
            return packet.requestAndValidate('end_customers', {
                employee: "admin",
                admin: ({ req, params }) => {
                    return req.update(<EndCustomers>{ ...packet.body }).eq('id', params.id).select().single();
                }
            });
        }
    }
})