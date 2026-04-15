
import { compileAPIS } from "../../help";
import { Packet } from "../../utils/packet";

compileAPIS({
    '/customers': {
        /**
         * GET: List customers (Admin/Employee only)
         */
        async GET(packet: Packet) {
            return packet.requestAndValidate('customers', {
                employee: "admin",
                admin: ({ req }) => {
                    return req.select('*', { count: 'exact' });
                }
            });

        },

        /**
         * POST: Register a new customer (Admin/Employee only)
         */
        async POST(packet: Packet) {
            const body = packet.body as Customers;

            // Fixed validation: using 'full_name' instead of a missing 'password' field
            if (!body.full_name || !body.phone) return packet.validate({ error: 'MISSING_FIELDS', status: 400 });

            return packet.requestAndValidate('customers', {
                employee: "admin",
                admin: ({ req, body }) => req.insert({ ...body }).select().single()
            });
        }
    },

    '/customer/:id': {
        /**
         * GET: View profile
         * Logic: Admin sees anyone, Customer sees only themselves
         */
        async GET(packet: Packet) {
            return packet.requestAndValidate('customers', {
                employee: "admin",
                admin: ({ req, params }) => {
                    return req.select('*').eq('id', params.id).maybeSingle();
                },
                customer: ({ req, session }) => {
                    return req.select('*').eq('id', session.cid).maybeSingle();
                }
            });

        },

        /**
         * PATCH: Update profile
         * Logic: Admin updates anyone, Customer updates only themselves
         */
        async PATCH(packet: Packet) {
            return packet.requestAndValidate<"customers", Customers | void | undefined>('customers', {
                employee: "admin",
                admin: ({ req, params, body }) => {
                    if (body.full_name && body.phone)
                        return req.update(<Customers>{ ...body }).eq('id', params.id).select().maybeSingle();
                    else return { error: 'MISSING_FIELDS', errorCode: 400 };
                },
                customer: ({ req, session, params, body }) => {
                    if (!body.full_name || !body.phone) return { error: 'MISSING_FIELDS', errorCode: 400 };
                    return req.update(<Customers>{ ...body }).eq('id', params.id).eq('id', session.cid).select().maybeSingle();
                }
            });
        },

        /**
         * DELETE: Remove customer (Admin/Employee only)
         */
        async DELETE(packet: Packet) {
            return packet.requestAndValidate('customers', {
                employee: "admin",
                admin: ({ req, params }) => {
                    return req.delete().eq('id', params.id);
                }
            });
        }
    }
});