import { addProperties, buildEventProperty } from "../utils/networking";
import { isServiceWorker } from '../utils';
import { swChannel as sw } from "../utils/channels";
import { DBConfig, DbEvents, StockOS_CONFIG, TableName } from "../workspace/config";
import { Row } from "../utils/data";

declare type LocalDB<N extends string = TableName, T extends DBConfig<N> = DBConfig<N> & typeof StockOS_CONFIG> = import("../utils/datasource").LocalDB<N, T>;
declare type ServerDB = import("../utils/datasource").ServerDB;

export function main(localDB: LocalDB, serverDB: ServerDB) {
    if (!isServiceWorker()) throw new Error("Not a service worker");
    initProperties(localDB, serverDB);
    initEventsAPI(localDB, serverDB);
}

function initProperties(localDB: LocalDB, serverDB: ServerDB) {
    buildEventProperty({ broadcast: true, type: 'boolean', ns: 'AUTH', name: 'CONNECTED' });
    buildEventProperty({ broadcast: true, type: 'boolean', ns: 'NET', name: 'OFFLINE', value: false });
    addProperties({
        userid: {
            type: 'property',
            signature: { returns: 'string' },
            value: { value: 'anonymous' }
        },
        getTable: {
            type: 'method',
            signature: { args: ['string', 'number'], returns: 'any[]' },
            value: async (tableName: string, lastTimeUpdate?: number) => {
                return await localDB.getAll(tableName, lastTimeUpdate).catch(v => ({ error: v }));
            }
        },
        getUpdates: {
            type: 'method',
            signature: { args: ['number'], returns: 'any[]' },
            value: async (lastTimeUpdate: number) => {

            }
        },
        createRow: {
            type: 'method',
            signature: { args: ['string', 'any'], returns: 'any' },
            value: async (tableName: string, row: any) => {

            }
        },
        updateRow: {
            type: 'method',
            signature: { args: ['string', 'any'], returns: 'any' },
            value: async (tableName: string, row: any) => {

            }
        },
        deleteRow: {
            type: 'method',
            signature: { args: ['string', 'any'], returns: 'any' },
            value: async (tableName: string, id: string) => {

            }
        },

    });

}
function initEventsAPI(localDB: LocalDB, serverDB: ServerDB) {

    function _reply(reqId: string, payload: any) {
        sw.broadcast(`${DbEvents.CMD_RESULT}:${reqId}`, payload)
    }

    sw.listenFor(DbEvents.SW_INIT, async ({ lastTimeUpdate }) => {
        // Seed watermark so the first poll is a delta, not a full reload.
        if (lastTimeUpdate && localDB) {
            await localDB.setLastTimeUpdate(lastTimeUpdate);
        }
        // Queue flush only — polling/SSE lifecycle is owned by sw/index.ts.
        if (localDB && serverDB) {
            await localDB.flushQueue(serverDB);
        }
    })

    // ── Auth ──────────────────────────────────────────────────────────────────

    sw.listenFor(DbEvents.AUTH_SET, async () => {
        // Queue flush only — SSE/polling lifecycle is owned by sw/index.ts.
        // The AUTH.CONNECTED event fired by the properties system handles
        // the full startLiveSync() + catch-up sync sequence.
        if (localDB && serverDB) {
            await localDB.flushQueue(serverDB);
        }
    })

    sw.listenFor(DbEvents.AUTH_CLEAR, () => {
        // Polling/SSE teardown is handled by on('AUTH','DISCONNECTED') in index.ts.
    })

    // ── Ping ──────────────────────────────────────────────────────────────────

    sw.listenFor(DbEvents.PING, () => sw.broadcast(DbEvents.PONG, { ready: !!localDB }))

    // ── Queue flush ───────────────────────────────────────────────────────────

    sw.listenFor(DbEvents.CMD_FLUSH_QUEUE, async () => {
        if (localDB && serverDB) {
            await localDB.flushQueue(serverDB)
        }
    })

    // ── Read commands ─────────────────────────────────────────────────────────

    sw.listenFor(DbEvents.CMD_GET_ALL, async ({ tableName, reqId }) => {
        try { _reply(reqId, { rows: await localDB.getAll(tableName) }) }
        catch (e) { _reply(reqId, { error: (e as Error).message }) }
    })

    sw.listenFor(DbEvents.CMD_GET, async ({ tableName, id, reqId }) => {
        try { _reply(reqId, { row: (await localDB.get(tableName, id)) ?? null }) }
        catch (e) { _reply(reqId, { error: (e as Error).message }) }
    })

    sw.listenFor(DbEvents.CMD_GET_BY_INDEX, async ({ tableName, indexName, value, reqId }) => {
        try { _reply(reqId, { rows: await localDB.getByIndex(tableName, indexName, value) }) }
        catch (e) { _reply(reqId, { error: (e as Error).message }) }
    })

    // ── Write commands ────────────────────────────────────────────────────────

    sw.listenFor(DbEvents.CMD_CREATE, async ({ tableName, data, reqId }) => {
        if (!localDB) return _reply(reqId, { error: 'LocalDB not ready' })
        try {
            if (serverDB) {
                try {
                    const serverRow = await serverDB.create(tableName, data)
                    const row = await localDB.insert(tableName, <any>{ ...serverRow, syncStatus: 'synced' })
                    return _reply(reqId, { row })
                } catch (serverErr) {
                    console.warn('[SW] server create failed, queueing offline:', (serverErr as Error).message)
                }
            }
            const row = await localDB.insert(tableName, data)
            await localDB.enqueue('insert', tableName, row)
            _reply(reqId, { row })
        } catch (e) { _reply(reqId, { error: (e as Error).message }) }
    })

    sw.listenFor(DbEvents.CMD_UPDATE, async ({ tableName, id, changes, reqId }) => {
        if (!localDB) return _reply(reqId, { error: 'LocalDB not ready' })
        try {
            if (serverDB) {
                try {
                    const serverRow = await serverDB.update(tableName, id, changes)
                    const row = await localDB.update(tableName, id, { ...serverRow, syncStatus: 'synced' })
                    return _reply(reqId, { row })
                } catch (serverErr) {
                    console.warn('[SW] server update failed, queueing offline:', (serverErr as Error).message)
                }
            }
            const row = await localDB.update(tableName, id, changes)
            await localDB.enqueue('update', tableName, row)
            _reply(reqId, { row })
        } catch (e) { _reply(reqId, { error: (e as Error).message }) }
    })

    sw.listenFor(DbEvents.CMD_DELETE, async ({ tableName, id, reqId }) => {
        if (!localDB) return _reply(reqId, { error: 'LocalDB not ready' })
        try {
            if (serverDB) {
                try {
                    await serverDB.delete(tableName, id)
                    await localDB.delete(tableName, id)
                    return _reply(reqId, { ok: true })
                } catch (serverErr) {
                    console.warn('[SW] server delete failed, queueing offline:', (serverErr as Error).message)
                }
            }
            await localDB.delete(tableName, id)
            const existing = (await localDB.get(tableName, id)) ?? <Row><any>{ id }
            await localDB.enqueue('delete', tableName, existing)
            _reply(reqId, { ok: true })
        } catch (e: any) { _reply(reqId, { error: (e as Error).message }) }
    });


}
export default main;