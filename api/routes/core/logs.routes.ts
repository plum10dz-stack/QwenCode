
import { compileAPIS } from "../../help";
import { Packet } from "../../utils/packet";
import { ERPHelper } from "../../database/adapters/ErpHelper";

compileAPIS({
    '/logs/audit/:page': {
        async GET(packet: Packet) {
            return packet.requestAndValidate('audit_log', {
                admin: ({ req, params }) => req.select('*').order('created_at', { ascending: false }).range(((params.page || 1) - 1) * 100, ((params.page || 1) * 100) - 1)
            });
        }
    },
    '/logs/delete/:page': {
        async GET(packet: Packet) {
            return packet.requestAndValidate('delete_log', {
                admin: ({ req, params }) => req.select('*').order('deleted_at', { ascending: false }).range(((params.page || 1) - 1) * 100, ((params.page || 1) * 100) - 1)
            });
        }
    },
    '/logs/events/:page': {
        async GET(packet: Packet) {
            // Using RPC function for fetching recent changes as per the rule
            const erp = new ERPHelper(packet.db);
            const page = parseInt(packet.params.page) || 1;
            const limit = 100;
            const events = await erp.recentChanges((page - 1) * limit, limit);
            return packet.json(events, 200);
        }
    }
});
