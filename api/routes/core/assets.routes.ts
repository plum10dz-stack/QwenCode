import { compileAPIS } from "../../help";
import { Packet, requestResults } from "../../utils/packet";
//import Bun from "bun";
import multer from 'multer';

// 1. Configure where to save files temporarily
const upload = multer({ dest: './assets/' });
compileAPIS({
    '/assets/:id': {
        async GET(packet: Packet) {
            const result = await packet.request<'assets', Assets>('assets', {
                employee: "admin",
                admin: ({ req, params }) => req.select('*').eq('id', params.id).maybeSingle(),
                customer: ({ req, params }) => req.select('*').eq('id', params.id).eq('active', true).maybeSingle()
            });
            const { path } = result.data!;
            if (result.error) return packet.validate(result);
            if (!result.data) return packet.validate({ error: 'NOT_FOUND', status: 404 });
            const file = Bun.file(path);
            if (await file.exists()) return packet.send(file);
            else return packet.validate({ error: 'NOT_FOUND', status: 404 });

        }
    },
    '/assets/upload': {
        /**
         * POST: Upload file to ./assets (Admin/Employee only)
         */
        async POST(packet: Packet) {
            const session = await packet.loadSession();
            let g: requestResults<Assets>;
            if (session?.role !== 'admin' && session?.role !== 'employee') {
                g = { error: 'UNAUTHORIZED', status: 401 };
            }
            const file = await packet.saveFile();
            if (file.error) g = { error: file.error, status: file.code! };
            else g = { data: file.record!, status: 201 };
            return packet.validate(g);
        }
    },



});
