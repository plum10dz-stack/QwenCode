/// <reference types="@types/serviceworker" />

/**
 * data-live-sync.ts
 *
 * Audit-log stream loop with exponential-backoff reconnect and polling fallback.
 *
 * Usage:
 *   import { startLiveSync, stopLiveSync } from './data-live-sync';
 *
 *   startLiveSync();   // idempotent — starts the stream loop
 *   stopLiveSync();    // aborts stream + polling, clean teardown
 */

import { DB, setAuth } from './db-init';
//import { streamAuditLogSync } from './data-sync-server-to-db';
import { streamAuditLogSync } from './sync-engine';

// ── Backoff constants for stream reconnect ────────────────────────────────────
const BACKOFF_INITIAL_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
const BACKOFF_FACTOR = 2;

// ── Live-sync handle (null = not running) ─────────────────────────────────────
let _liveSync: { stop: () => void } | null = null;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start the live-sync loop (stream primary → polling fallback).
 * Idempotent — calling while already running is a no-op.
 */
export function startLiveSync(): void {
    if (_liveSync) return;

    let running = true;
    let abortCtrl: AbortController | null = null;

    (async () => {
        let backoffMs = BACKOFF_INITIAL_MS;

        while (running) {
            try {
                // Stream is primary — disable polling while it's alive.
                DB.serverDB.stopPolling();

                const since = (await DB.localDB.getLastTimeUpdate()).getTime();
                abortCtrl = new AbortController();
                console.info('[SW] Audit-log stream connecting since', new Date(since).toISOString());

                const reason = await streamAuditLogSync(
                    DB.localDB,
                    abortCtrl.signal,
                    since,
                    (table, count, cursor) => {
                        console.debug(`[SW] live: ${table} +${count} → ${new Date(cursor).toISOString()}`);
                    },
                );

                switch (reason.type) {
                    case 'clean':
                        console.info('[SW] Stream closed cleanly — reconnecting.');
                        backoffMs = BACKOFF_INITIAL_MS;
                        continue;

                    case 'idle_timeout':
                        console.warn('[SW] Stream idle — reconnecting.');
                        backoffMs = BACKOFF_INITIAL_MS;
                        continue;

                    case 'aborted':
                        console.info('[SW] Stream aborted (logout / stop).');
                        return;

                    case 'auth_error':
                        console.error(`[SW] Auth error (${reason.status}) — stopping live sync.`);
                        setAuth(false);
                        return;

                    case 'network_error':
                        console.warn('[SW] Network error — falling back to polling:', reason.error?.message);
                        break;
                }

            } catch (err: any) {
                if (!running) return;
                if (err?.name === 'AbortError') return;

                console.warn('[SW] Unexpected stream error, falling back to polling:', err?.message ?? err);
            } finally {
                abortCtrl = null;
            }

            if (!running) return;

            // ── Activate polling fallback + exponential backoff ───────────────
            DB.serverDB.startPolling();

            const jitter = Math.random() * 500;
            const wait = Math.min(backoffMs + jitter, BACKOFF_MAX_MS);
            console.info(`[SW] Reconnecting in ${Math.round(wait)} ms…`);
            await sleep(wait);

            backoffMs = Math.min(backoffMs * BACKOFF_FACTOR, BACKOFF_MAX_MS);
        }

        DB.serverDB.stopPolling();
    })();

    _liveSync = {
        stop() {
            running = false;
            abortCtrl?.abort();
            DB.serverDB.stopStream();
            DB.serverDB.stopPolling();
        },
    };
}

/**
 * Stop the live-sync loop.  Idempotent.
 */
export function stopLiveSync(): void {
    _liveSync?.stop();
    _liveSync = null;
}

/**
 * Returns true if the live-sync loop is currently running.
 */
export function isLiveSyncRunning(): boolean {
    return _liveSync !== null;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
