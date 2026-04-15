import { compileAPIS, Packet } from "../../help";


compileAPIS({
    POST: {
        async "/batch"(packet: Packet) {
            const { operations } = packet.body;

            const results = [];
            for (const op of operations) {
                let result;
                if (op.action === "upsert") {
                    result = await packet.db.from(op.table).upsert(op.data);
                } else if (op.action === "delete") {
                    result = await packet.db.from(op.table).delete().eq("id", op.id);
                }
                results.push({ table: op.table, action: op.action, error: result?.error });
            }

            return packet.validate({ data: results, status: 200 });
        }
    }
});