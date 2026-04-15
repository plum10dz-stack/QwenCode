
import { compileAPIS } from "../../help";
import { Packet } from "../../utils/packet";
import multer from 'multer';

// 1. Configure where to save files temporarily
const upload = multer({ dest: './assets/' });
compileAPIS({
    '/categories': {
        async GET(packet: Packet) {
            return packet.requestAndValidate('categories', {
                employee: "admin",
                customer: "admin",
                admin: ({ req }) => req.select('*'),
            });
        },
        async POST(packet: Packet) {
            return packet.requestAndValidate('categories', {
                employee: "admin",
                admin: ({ req, body }) => req.insert({ ...body }).select().single(),
            });
        }
    },
    '/category/:id': {
        async GET(packet: Packet) {
            return packet.requestAndValidate('categories', {
                employee: "admin",
                customer: "admin",
                admin: ({ req, params }) => {
                    return req.select('*').eq('id', params.id).select().single();
                },
            });
        },
        async PATCH(packet: Packet) {
            return packet.requestAndValidate('categories', {
                employee: "admin",
                admin: ({ req, params }) => {
                    return req.update(<Categories>{ ...packet.body }).eq('id', params.id).select().single();
                }
            });
        }
    }
})