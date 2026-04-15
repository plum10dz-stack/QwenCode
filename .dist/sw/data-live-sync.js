"use strict";
/// <reference types="@types/serviceworker" />
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startLiveSync = startLiveSync;
exports.stopLiveSync = stopLiveSync;
exports.isLiveSyncRunning = isLiveSyncRunning;
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
const init_1 = require("./init");
const data_sync_server_to_db_1 = require("./data-sync-server-to-db");
// ── Backoff constants for stream reconnect ────────────────────────────────────
const BACKOFF_INITIAL_MS = 1000;
const BACKOFF_MAX_MS = 30000;
const BACKOFF_FACTOR = 2;
// ── Live-sync handle (null = not running) ─────────────────────────────────────
let _liveSync = null;
// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Start the live-sync loop (stream primary → polling fallback).
 * Idempotent — calling while already running is a no-op.
 */
function startLiveSync() {
    if (_liveSync)
        return;
    let running = true;
    let abortCtrl = null;
    (() => __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        let backoffMs = BACKOFF_INITIAL_MS;
        while (running) {
            try {
                // Stream is primary — disable polling while it's alive.
                init_1.DB.serverDB.stopPolling();
                const since = (yield init_1.DB.localDB.getLastTimeUpdate()).getTime();
                abortCtrl = new AbortController();
                console.info('[SW] Audit-log stream connecting since', new Date(since).toISOString());
                const reason = yield (0, data_sync_server_to_db_1.streamAuditLogSync)(init_1.DB.localDB, abortCtrl.signal, since, (table, count, cursor) => {
                    console.debug(`[SW] live: ${table} +${count} → ${new Date(cursor).toISOString()}`);
                });
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
                        (0, init_1.setAuth)(false);
                        return;
                    case 'network_error':
                        console.warn('[SW] Network error — falling back to polling:', (_a = reason.error) === null || _a === void 0 ? void 0 : _a.message);
                        break;
                }
            }
            catch (err) {
                if (!running)
                    return;
                if ((err === null || err === void 0 ? void 0 : err.name) === 'AbortError')
                    return;
                console.warn('[SW] Unexpected stream error, falling back to polling:', (_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : err);
            }
            finally {
                abortCtrl = null;
            }
            if (!running)
                return;
            // ── Activate polling fallback + exponential backoff ───────────────
            init_1.DB.serverDB.startPolling();
            const jitter = Math.random() * 500;
            const wait = Math.min(backoffMs + jitter, BACKOFF_MAX_MS);
            console.info(`[SW] Reconnecting in ${Math.round(wait)} ms…`);
            yield sleep(wait);
            backoffMs = Math.min(backoffMs * BACKOFF_FACTOR, BACKOFF_MAX_MS);
        }
        init_1.DB.serverDB.stopPolling();
    }))();
    _liveSync = {
        stop() {
            running = false;
            abortCtrl === null || abortCtrl === void 0 ? void 0 : abortCtrl.abort();
            init_1.DB.serverDB.stopStream();
            init_1.DB.serverDB.stopPolling();
        },
    };
}
/**
 * Stop the live-sync loop.  Idempotent.
 */
function stopLiveSync() {
    _liveSync === null || _liveSync === void 0 ? void 0 : _liveSync.stop();
    _liveSync = null;
}
/**
 * Returns true if the live-sync loop is currently running.
 */
function isLiveSyncRunning() {
    return _liveSync !== null;
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
