import { compileAPIS } from "../../help";
import { Packet, requestErrorResults, requestResults } from "../../utils/packet";

compileAPIS({
    GET: {
        async "/data/:table"(packet: Packet) {
            const table = packet.params.table;
            const since = packet.query?.since;
            
            let query = packet.db.from(table).select('*');
            
            // Filter by updated_at if since parameter is provided
            if (since) {
                const sinceTime = new Date(Number(since) || 0);
                query = query.gt('updated_at', sinceTime.toISOString());
            }
            
            // Apply ordering to ensure consistent results
            query = query.order('updated_at', { ascending: true });
            
            return packet.validate(await query as any as requestResults<any>)
        },
        async "/data/:table/:id"(packet: Packet) {
            const table = packet.params.table;
            const id = packet.params.id;
            return packet.validate(await packet.db.from(table).select('*').eq('id', id).maybeSingle() as any as requestResults<any>)
        },
        async "/data/:updated_at"(packet: Packet) {
            const { updated_at } = packet.params;
            return packet.validate(await packet.db.from('users').select('*').gt('updated_at', updated_at) as any as requestResults<any>)
        }
    },
    PUT: {
        async "/data/:table/:id"(packet: Packet) {
            const table = packet.params.table;
            const id = packet.params.id;
            return packet.validate(await packet.db.from(table).update(packet.body as never).eq('id', id) as any as requestResults<any>)
        }
    },
    DELETE: {
        async "/data/:table/:id"(packet: Packet) {
            const table = packet.params.table;
            const id = packet.params.id;
            return packet.validate(await packet.db.from(table).delete().eq('id', id) as any as requestResults<any>)
        }
    },
    PATCH: {
        async "/data/:table/:id"(packet: Packet) {
            const { table, id } = packet.params;
            return packet.validate(await packet.db.from(table).update(packet.body as never).eq('id', id) as any as requestResults<any>)
        },
        async "/data/:table/:column/:value"(packet: Packet) {
            const { table, column, value } = packet.params;
            return packet.validate(await packet.db.from(table).update(packet.body as never).eq(column, value) as any as requestResults<any>)
        },
        async "/data/:table/:column/:value/:column2/:value2"(packet: Packet) {
            const { table, column, value, column2, value2 } = packet.params;
            return packet.validate(await packet.db.from(table).update(packet.body as never).eq(column, value).eq(column2, value2) as any as requestResults<any>)
        }
    },


});