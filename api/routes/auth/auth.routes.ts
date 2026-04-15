
import { now } from "../../help";
import { Packet } from "../../utils/packet";
import { compileAPIS } from "../../help";


compileAPIS({
    "/auth": {
        async GET(packet: Packet) {
            if (packet.req.header('handshake')) {
                return await login(packet);
            }
            return await AutoConnect(packet);
        },
        async POST(packet: Packet) {
            if (packet.req.header('handshake'))
                return await approveLogin(packet);
        }
    }
})
async function AutoConnect(packet: Packet) {
    const session = await packet.loadSession();
    if (!session) return;
    if (session.logged) {
        if (Number(session.expire) < now(true)) {
            session.logged = false;
            await packet.saveSession();
            return packet.validate({ error: 'SESSION_EXPIRED', status: 401 });
        }
        return packet.validate({ error: 'CONNECTED', status: 200 });
    }
    return packet.validate({ error: 'NOT_CONNECTED', status: 401 });
}

async function login(packet: Packet) {
    const username = packet.req.header('username');
    if (!username) return packet.validate({ error: 'USERID', status: 404 });
    const pwd = { value: '' }, result = await packet.createSession(username!, pwd), session = result.data!;
    if (result.error) return packet.validate(result);
    packet.setSession(session, true);
    return await packet.validate({ data: <HandshakeData>{ handshakeTime: session.handshake_time, pwdSuffix: session.pwd_suffix, respTime: now(true) }, cert: pwd.value });
}
async function approveLogin(packet: Packet) {
    const session = await packet.loadSession();
    if (!session) return;
    const data = packet.data;
    if (typeof data === 'object') {
        if (data.handshakeTime != session.handshake_time) {
            return packet.validate({ error: 'INVALID_HANDSHAKE', status: 401 });
        }
        if (data.pwdSuffix != session.pwd_suffix) {
            return packet.validate({ error: 'INVALID_HANDSHAKE', status: 401 });
        }
        session.logged = true;
        if (await packet.saveSession()) {
            return packet.validate({ error: 'CONNECTED', status: 200 });
        } else {
            return packet.validate({ error: 'DB_CONNECTION_ERROR', status: 500 });
        }
    }
    return packet.validate({ error: 'INVALID_HANDSHAKE', status: 401 });
}
let LastUpdate: number = 0;
export function setUpdate() {
    LastUpdate = now(true);
}