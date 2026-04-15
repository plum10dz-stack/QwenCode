import { compileAPIS } from "../../help";
import { Packet } from "../../utils/packet";
// this router for admins and employees
compileAPIS({
    '/suppliers': {
        async GET(packet: Packet) {
            return await packet.requestAndValidate('suppliers', {
                employee: "admin",
                admin: ({ req }) => req.select('*'),
            });
        },
        async POST(packet: Packet) {
            return await packet.requestAndValidate('suppliers', {
                employee: "admin",
                admin: ({ req, body }) => req.insert({ ...body }).select().single(),
            });
        }
    },
    '/supplier/:id': {
        async GET(packet: Packet) {
            return await packet.requestAndValidate('suppliers', {
                employee: "admin",
                admin: ({ req, params }) => {
                    return req.select('*').eq('id', params.id).select().single();

                },

            });

        },
        async PATCH(packet: Packet) {
            return await packet.requestAndValidate('suppliers', {
                employee: "admin",
                admin: ({ req, params }) => {
                    return req.update(<Suppliers>{ ...packet.body }).eq('id', params.id).select().single();
                },

            });
        }
    }
})