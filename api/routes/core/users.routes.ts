import { compileAPIS } from "../../help";
import { Packet } from "../../utils/packet";

// this router for admins only for creating accounts    
compileAPIS({
    '/users': {
        async GET(packet: Packet) {
            return await packet.requestAndValidate('users', {
                admin: ({ req }) => req.select('*'),
            });
        },
        async POST(packet: Packet) {
            return await packet.requestAndValidate('users', {
                admin: ({ req, body }) => req.insert({ ...body }).select().single(),
            });
        }
    },

    '/user/:id': {
        async GET(packet: Packet) {
            return await packet.requestAndValidate('users', {
                admin: ({ req, params }) => {
                    return req.select('*').eq('id', params.id).select().maybeSingle();
                }
            });

        },
        async PATCH(packet: Packet) {
            return await packet.requestAndValidate('users', {
                admin: ({ req, params, body }) => {
                    if (body.id && body.id !== params.id)
                        return { error: 'UPDATE_ORDER_FAILED', code: 400 };
                    return req.update(<Users>{ ...body }).eq('id', params.id).select().single();
                }
            });
        }
    },
    '/user/me': {
        async GET(packet: Packet) {
            return await packet.requestAndValidate('users', {
                employee: "customer",
                admin: "customer",
                customer: ({ req, session }) => {
                    return req.select('*').eq('id', session.uid).select().maybeSingle();
                }
            });
        }
    },
    POST: {
        async '/user/change-password'(packet: Packet) {
            return await packet.requestAndValidate('users', {
                admin: ({ req, body }) => req.update({ password: body.password }).eq('id', body.id).select().single(),
                customer: ({ req, body, session }) => req.update({ password: body.password }).eq('id', session.cid).select().single()
            });
        },
        async '/user/change-role'(packet: Packet) {
            return await packet.requestAndValidate('users', {
                admin: ({ req, body }) => req.update({ role: body.role }).eq('id', body.id).select().single(),
            });
        },
        async '/user/change-username'(packet: Packet) {
            return await packet.requestAndValidate('users', {
                admin: ({ req, body }) => req.update({ username: body.username }).eq('id', body.id).select().single(),
                customer: ({ req, body, session }) => req.update({ username: body.username }).eq('id', session.cid).select().single()
            });
        },

        async '/user/change-email'(packet: Packet) {
            return await packet.requestAndValidate('users', {
                admin: ({ req, body }) => req.update({ email: body.email }).eq('id', body.id).select().single(),
                customer: ({ req, body, session }) => req.update({ email: body.email }).eq('id', session.cid).select().single()
            });
        },
        async "/user/change-avatar"(packet: Packet) {
            return await packet.requestAndValidate('users', {
                admin: ({ req, body }) => req.insert(<Users>{
                    ...body,
                    role: 'customer',
                    active: true,
                    id: undefined,
                }).select().single(),
            });
        }
    }
});

