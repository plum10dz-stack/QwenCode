
import { NextFunction, Request, Response } from "express";
import { getPacket, Packet } from "../utils/packet";
import { decryptData } from "../utils/cryptography";

import { now } from "../help";

async function decrypte(packet: Packet): Promise<void> {
    if (packet.method === 'GET' || packet.method === 'OPTIONS' || packet.method === 'HEAD' || packet.method === 'TRACE' || packet.method === 'CONNECT' || packet.method === 'PATCH') {
        packet.data = packet.body;
        return;
    }
    let crypteable = false;
    try {
        const session = await packet.loadSession()
        if (!session) return packet.serviceWraper('SESSION_NOT_FOUND', {}, undefined, 401);
        if (session.expire && (Number(session.expire) < now(true))) {
            return packet.serviceWraper('SESSION_EXPIRED', {}, undefined, 511);
        }
        packet.setSession(session, false);
        const body = packet.body;
        crypteable = typeof body === 'object' && 'data' in body && 'iv' in body;
        if (crypteable) {
            const data = await decryptData(body, session.cert);
            packet.data = JSON.parse(data) as HandshakeData;
        } else {
            packet.data = body;
        }
    } catch (error) {
        if (crypteable) return packet.serviceWraper('CRYPTO', { 'error': error }, undefined, 400);
    }

}
export async function jsonDecrypter(req: Request, res: Response, next: NextFunction) {
    const packet = getPacket(req, res);
    await decrypte(packet);
    if (!packet.isClosed) next();
}