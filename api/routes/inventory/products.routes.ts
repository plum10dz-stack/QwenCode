
import { compileAPIS } from "../../help";
import { Packet, requestErrorResults } from "../../utils/packet";

compileAPIS({
    // ---------------------------------------------------------
    // PRODUCTS API
    // ---------------------------------------------------------
    '/products': {
        /**
         * GET: List products
         * Logic: Admin/Employee see all non-deleted, Customers see only active non-deleted
         */
        async GET(packet: Packet) {
            const since = packet.query.since || 0;
            return packet.requestAndValidate('products', {
                employee: "admin",
                admin: ({ req }) => req.select('*').eq('deleted', false).gt('updated_at', Number(since)),
                customer: ({ req }) => req.select('*').eq('active', true).eq('deleted', false).gt('updated_at', Number(since))
            });


        },

        /**
         * POST: Create product (Admin/Employee only)
         */
        async POST(packet: Packet) {
            const { name, price } = packet.body;
            if (!name || !price) return packet.validate({ error: 'MISSING_FIELDS', status: 400 });
            return packet.requestAndValidate('products', {
                employee: "admin",
                admin: ({ req, body }) => req.insert({ ...body }).select().single()
            });
        }
    },

    '/product/:id': {
        /**
         * GET: Single product detail
         */
        async GET(packet: Packet) {
            return packet.requestAndValidate('products', {
                employee: "admin",
                admin: ({ req, params }) => req.select('*').eq('id', params.id).maybeSingle(),
                customer: ({ req, params }) => req.select('*').eq('id', params.id).eq('active', true).maybeSingle()
            });

        },

        /**
         * PATCH: Update product (Admin/Employee only)
         */
        async PATCH(packet: Packet) {
            const { name, price } = packet.body;
            let reqReslt =
                (!name || !price) ? { error: 'MISSING_FIELDS', status: 400 } as requestErrorResults :
                    await packet.request('products', {
                        employee: "admin",
                        admin: ({ req, params, body }) => {
                            return req.update(<Products>{ ...body }).eq('id', params.id).select().maybeSingle();
                        }
                    });
            return packet.validate(reqReslt);
        },

        /**
         * DELETE: Remove product (Admin/Employee only)
         */
        async DELETE(packet: Packet) {
            return packet.requestAndValidate('products', {
                employee: "admin",
                admin: ({ req, params }) => {
                    return req.delete().eq('id', params.id).select().maybeSingle();
                }
            });
        }
    },
    '/product/:id/images': {
        async GET(packet: Packet) {
            return packet.requestAndValidate('assets', {
                employee: "admin",
                admin: ({ req, params }) => req.select('*').eq('product_id', params.id),
                customer: ({ req, params }) => req.select('*').eq('product_id', params.id).eq('active', true)
            });
        },
        async POST(packet: Packet) {
            return packet.requestAndValidate('assets', {
                employee: "admin",
                admin: ({ req, body }) => req.insert({ ...body }).select().single()
            });
        }
    },
    '/product/:id/images/:imageId': {
        async DELETE(packet: Packet) {
            return packet.requestAndValidate('assets', {
                employee: "admin",
                admin: ({ req, params }) => req.delete().eq('id', params.imageId).select().maybeSingle()
            });
        }
    }
});