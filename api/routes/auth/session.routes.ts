import { compileAPIS } from "../../help";
import { Packet } from "../../utils/packet";

compileAPIS({
    '/session': {
        async OPTIONS(packet: Packet) {
            debugger;
        }, async OPTION(packet: Packet) {
            debugger;
        },
        async GET(packet: Packet) {
            const session = await packet.loadSession();
            if (!session) return packet.serviceWraper('SESSION_NOT_FOUND', {});
            await packet.json(session, 200, session?.cert);
        }
    }
});
