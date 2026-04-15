/// <reference types="@types/serviceworker" />

import { ServerDB } from '../../utils/datasource'
import { LocalDB } from '../../utils/datasource'
import { getTableLastTimeUpdate, setTableLastTimeUpdate } from './sync-engine';

import { isServiceWorker } from '../../utils';
import { DbEvents, StockOS_CONFIG, TableName } from '../../workspace/config';


if (!isServiceWorker()) throw new Error("Not a service worker");

let initialized = false;
let _auth = false;
export let localDB: LocalDB<TableName, typeof StockOS_CONFIG> = null!;
export let serverDB: ServerDB = null!;

/** Toggle authentication state. Called from sw/index.ts via AUTH events. */
export function setAuth(value: boolean): void {
    _auth = value;
}

async function _boot() {
    initialized = true;
    localDB = await new LocalDB(StockOS_CONFIG).init();
    serverDB = await new ServerDB(StockOS_CONFIG.API_BASE).init();

    let _tickTimer = false;
    let _pollTimer: ReturnType<typeof setInterval> | undefined;

    serverDB.on({
        /**
         * Fired by ServerDB.applyDelta (SSE path) and ServerDB.sync (poll path).
         * Writes rows to IndexedDB and broadcasts ROWS_CHANGED to all tabs.
         * `payload.time` is used to advance lastTimeUpdate so the next sync
         * only fetches rows newer than this batch.
         */
        'updates': async (payload: { data: Record<string, any[]>; time: number }) => {
            try {
                await localDB.applyServerUpdates(payload.data, payload.time);
            } catch (err) {
                console.error('[SW] applyServerUpdates failed:', err);
            }
        },

        /**
         * Fired by ServerDB.connectStream on each SSE chunk with the server's
         * authoritative `updated_at` timestamp.  We persist this separately so
         * clock-skew between client and server doesn't cause rows to be missed
         * on the next `since` query.
         */
        'stream:tick': async ({ time }: { time: number }) => {
            try {
                await localDB.setLastTimeUpdate(time);
            } catch (err) {
                console.error('[SW] setLastTimeUpdate failed:', err);
            }
        },

        'startPolling': () => {
            if (_pollTimer) clearInterval(_pollTimer);
            _pollTimer = setInterval(() => _tick(), StockOS_CONFIG.POLL_INTERVAL);
            _tick(); // run immediately
        },

        'stopPolling': () => {
            if (_pollTimer) clearInterval(_pollTimer);
            _pollTimer = undefined;
        },
    });

    // Polling is the initial (safe) fallback.
    // sw/index.ts will call stopPolling() when SSE connects successfully.
    serverDB.startPolling();
}
let _tickTimer = false;
async function _tick() {
    if (!_auth) return;       // do nothing until authenticated
    if (_tickTimer) return;   // prevent overlapping ticks
    _tickTimer = true;
    try {
        const since = await localDB.getLastTimeUpdate();
        await serverDB.sync(since);
    } catch (err) {
        serverDB.emit(DbEvents.DB_UPDATE_ERROR, { error: (err as Error).message });
    } finally {
        _tickTimer = false;
    }
}

export const DB = {
    get localDB() { return localDB },
    get serverDB() { return serverDB },
    get Config() { return StockOS_CONFIG },
    get EVT() { return DbEvents },
}

export default async function initDB() {
    return initialized ? DB : (await _boot(), DB);
}
