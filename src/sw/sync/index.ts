/// <reference types="@types/serviceworker" />

/**
 * data-sync.ts
 *
 * Central orchestration for all data-sync lifecycle:
 *   - Boot: load env, init DBs, register channel handlers
 *   - Auth CONNECTED  → initial sync → delta catch-up → flush queue → start live sync
 *   - Auth DISCONNECTED → stop live sync
 *   - Network online → flush queue + restart live sync
 *
 * Imported by `src/sw/index.ts` which only handles the SW lifecycle boilerplate.
 */

export * from './db-init';
export * from './sync-engine';
export * from './sync-live';

import { main } from '../services';
import initDB, { DB, setAuth } from './db-init';
import { initialFullTableSync, hasInitialSyncRun } from './sync-engine';
import { startLiveSync, stopLiveSync, isLiveSyncRunning } from './sync-live';
import { channels as ch, isServiceWorker, on, loadEnv, AsyncEnv } from '../../utils';
import { login } from '../../utils/networking/authenticator';


if (!isServiceWorker()) throw new Error('Not a service worker');
declare const self: ServiceWorkerGlobalScope;

// ── SW entry point ────────────────────────────────────────────────────────────

export default async function init() {
    console.info('[SW] Booting…', await AsyncEnv());

    await loadEnv();
    await initDB();


    // Register channel-command handlers (read/write/flush etc.)
    main(DB.localDB, DB.serverDB);

    // ── AUTH events ───────────────────────────────────────────────────────────
    on('AUTH', 'CONNECTED', async (e: any) => {
        console.info('[SW] AUTH.CONNECTED', e);
        setAuth(true);
        await _onAuthConnected();
    });

    on('AUTH', 'DISCONNECTED', (e: any) => {
        console.info('[SW] AUTH.DISCONNECTED', e);
        setAuth(false);
        stopLiveSync();
    });

    // ── Network events ────────────────────────────────────────────────────────
    self.addEventListener('online' as any, async () => {
        console.info('[SW] Network online — flushing queue');
        await DB.localDB.flushQueue(DB.serverDB).catch(err =>
            console.warn('[SW] Queue flush on online failed:', err),
        );
        if (!isLiveSyncRunning()) startLiveSync();
    });

    // ── Channel ───────────────────────────────────────────────────────────────
    ch.swChannel.listenFor('PING', async () => {
        await ensureInitialized();
        return true;
    });
    await login();
}

// ── Auth-connected sequence ───────────────────────────────────────────────────

async function _onAuthConnected(): Promise<void> {
    // 1. Initial full-table sync (first run only)
    try {
        const alreadySynced = await hasInitialSyncRun(DB.localDB);
        if (!alreadySynced) {
            console.info('[SW] No prior sync detected — running initial full-table sync…');
            await initialFullTableSync(DB.localDB);
        }
    } catch (err) {
        console.error('[SW] Initial full-table sync failed:', err);
    }

    // 2. Delta catch-up: fetch anything missed while the SW was inactive
    try {
        //const since = await DB.localDB.getLastTimeUpdate();
        //await DB.serverDB.sync(since);
    } catch (err) {
        console.warn('[SW] Boot sync failed:', err);
    }

    // 3. Flush offline queue
    await DB.localDB.flushQueue(DB.serverDB).catch(err =>
        console.warn('[SW] Queue flush on auth failed:', err),
    );

    // 4. Start live sync (stream → polling fallback)
    startLiveSync();
}

// ── Export for index.ts ───────────────────────────────────────────────────────

let _initialized = false;

async function ensureInitialized() {
    if (_initialized) return;
    _initialized = true;
    init();
    ch.swChannel.wait('CLOSE');
    return clients.claim();
}

export { ensureInitialized };
