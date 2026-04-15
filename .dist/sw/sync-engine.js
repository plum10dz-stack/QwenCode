"use strict";
/// <reference path="../stores/temp/data.schemas.d.ts" />
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initialFullTableSync = initialFullTableSync;
exports.hasInitialSyncRun = hasInitialSyncRun;
exports.streamAuditLogSync = streamAuditLogSync;
exports.getTableLastTimeUpdate = getTableLastTimeUpdate;
exports.setTableLastTimeUpdate = setTableLastTimeUpdate;
exports.fetchTableFromServer = fetchTableFromServer;
exports.applyTableToDB = applyTableToDB;
/**
 * data-sync-server-to-db.ts
 *
 * Initial full-table sync from server to local IndexedDB.
 *
 * Purpose:
 *   - On first run (or when lastTimeUpdate is epoch), fetch ALL tables
 *     one-by-one from the server using erpCall (which handles concurrency,
 *     auto-login on 401, and service feedback loops).
 *   - For tables with `locally === true`, rows are written into LocalDB.
 *   - For tables with `locally === false`, rows are NOT written to IndexedDB
 *     but their lastTimeUpdate watermark is still tracked so that subsequent
 *     delta syncs know where to resume from.
 *   - Maintains a `lastTimeUpdate` record per table in the `cache` store
 *     so each table can independently track its sync cursor.
 *
 * Usage:
 *   import { initialFullTableSync } from './data-sync-server-to-db';
 *   await initialFullTableSync(localDB);
 *
 * Runs on the main thread (NOT inside the Service Worker).
 */
const config_1 = require("../workspace/config");
const utils_1 = require("../utils");
// ── lastTimeUpdate per-table tracking ────────────────────────────────────────
const CACHE_KEY_PREFIX = 'lastTimeUpdate_';
/**
 * Get the last sync time for a specific table.
 * Falls back to epoch (0) if never synced.
 */
function getTableLastTimeUpdate(localDB, tableName) {
    return __awaiter(this, void 0, void 0, function* () {
        const iso = yield localDB.keyValue(CACHE_KEY_PREFIX + tableName);
        return iso ? new Date(iso).getTime() : 0;
    });
}
/**
 * Set the last sync time for a specific table.
 */
function setTableLastTimeUpdate(localDB, tableName, time) {
    return __awaiter(this, void 0, void 0, function* () {
        const date = time instanceof Date ? time : new Date(time);
        yield localDB.keyValue(CACHE_KEY_PREFIX + tableName, date.toISOString());
    });
}
// ── Server fetch via erpCall ─────────────────────────────────────────────────
/**
 * Fetch all rows for a single table from the server.
 * Uses erpCall which serialises requests, handles 401 auto-login,
 * and manages service feedback loops.
 *
 * Server endpoint: POST /data/{tableName}.getRows
 */
function fetchTableFromServer(tableName, since) {
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield utils_1.net.erpQueue.erpCall({
            route: `/data/${tableName}?since=` + Number(isFinite(since || 0) ? since || 0 : 0),
            method: 'GET',
            encrypt: true,
            title: (erpCall, e) => `Syncing table ${tableName}`,
            message: (erpCall, e) => `Syncing table ${tableName}`,
            actions: (erpCall, e) => [
                {
                    label: 'Cancel',
                    action: (erpCall, e) => {
                        e.queue.cancel(erpCall);
                    },
                },
            ],
        });
        return response;
    });
}
// ── Apply rows to LocalDB ────────────────────────────────────────────────────
/**
 * Apply fetched rows into LocalDB for tables that are marked `locally === true`.
 * For `locally === false` tables, we only update the per-table lastTimeUpdate
 * cursor so future delta syncs can resume correctly.
 */
function applyTableToDB(localDB, tableName, rows, serverTime) {
    return __awaiter(this, void 0, void 0, function* () {
        const schema = config_1.StockOS_CONFIG.TABLES[tableName];
        if (!schema) {
            console.warn(`[data-sync] Unknown table "${tableName}", skipping.`);
            return;
        }
        // Mark the per-table lastTimeUpdate regardless of `locally` flag.
        // This ensures delta syncs for locally=false tables have a valid cursor.
        yield setTableLastTimeUpdate(localDB, tableName, serverTime);
        // Skip writing to IndexedDB for transient/remote-only tables.
        if (schema.locally !== true) {
            console.log(`[data-sync] Table "${tableName}" is locally:false — cursor updated, no IDB write.`);
            return;
        }
        if (!rows || rows.length === 0) {
            console.log(`[data-sync] Table "${tableName}" — no rows to sync.`);
            return;
        }
        // Apply rows via LocalDB's applyServerUpdates (handles upsert, delete, syncStatus).
        yield localDB.applyServerUpdates({ [tableName]: rows }, serverTime);
        console.log(`[data-sync] Table "${tableName}" — synced ${rows.length} rows.`);
    });
}
// ── Main sync orchestrator ───────────────────────────────────────────────────
/**
 * Perform a full table-by-table initial sync.
 *
 * Strategy:
 *   1. Iterate over every table defined in StockOS_CONFIG.TABLES.
 *   2. For each table, check its per-table lastTimeUpdate cursor.
 *   3. Fetch rows from the server using erpCall (serialised, auto-auth).
 *   4. Apply rows to LocalDB (or just update cursor for locally=false tables).
 *
 * Tables are fetched sequentially (one-by-one) to avoid overwhelming the
 * server and to keep erpCall's internal queue orderly.
 *
 * @param localDB - An initialised LocalDB instance.
 */
function initialFullTableSync(localDB) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const tablesToSync = config_1.TABLE_NAMES.filter((t) => config_1.StockOS_CONFIG.TABLES[t].locally === true);
        console.log(`[data-sync] Starting initial full-table sync for ${tablesToSync.length} tables...`);
        let totalRows = 0;
        const globalStartTime = Date.now();
        for (const tableName of tablesToSync) {
            const since = yield getTableLastTimeUpdate(localDB, tableName);
            const isFullSync = since === 0;
            console.log(`[data-sync] Fetching table "${tableName}" (since: ${since === 0 ? 'epoch (full sync)' : new Date(since).toISOString()})...`);
            try {
                const response = yield fetchTableFromServer(tableName, since);
                const rows = (_a = response === null || response === void 0 ? void 0 : response.data) !== null && _a !== void 0 ? _a : [];
                const serverTime = (_b = response === null || response === void 0 ? void 0 : response.time) !== null && _b !== void 0 ? _b : Date.now();
                // Use the maximum of any server-provided time or local now to be safe.
                const watermark = Math.max(serverTime, Date.now());
                yield applyTableToDB(localDB, tableName, rows, watermark);
                totalRows += rows.length;
                if (isFullSync) {
                    console.log(`[data-sync] ✅ "${tableName}" — initial full sync complete (${rows.length} rows).`);
                }
                else {
                    console.log(`[data-sync] ✅ "${tableName}" — delta sync complete (${rows.length} new/updated rows).`);
                }
            }
            catch (err) {
                console.error(`[data-sync] ❌ Failed to sync table "${tableName}":`, err.message || err);
                // Continue syncing remaining tables — do not abort the whole process.
            }
        }
        // Update the global lastTimeUpdate as well (for backward compatibility
        // with the existing SW live-sync that uses getLastTimeUpdate()).
        yield localDB.setLastTimeUpdate(new Date(globalStartTime));
        console.log(`[data-sync] 🎉 Initial full-table sync complete. Total rows synced: ${totalRows} across ${tablesToSync.length} tables.`);
    });
}
// ── Convenience: check whether initial sync has already run ──────────────────
/**
 * Returns true if at least one `locally === true` table has a non-epoch
 * lastTimeUpdate cursor — indicating an initial sync has occurred before.
 */
function hasInitialSyncRun(localDB) {
    return __awaiter(this, void 0, void 0, function* () {
        const locallyTables = config_1.TABLE_NAMES.filter((t) => { var _a; return ((_a = config_1.StockOS_CONFIG.TABLES[t]) === null || _a === void 0 ? void 0 : _a.locally) === true && t !== '_queue'; });
        for (const tableName of locallyTables) {
            const since = (0, utils_1.parseNumber)(yield getTableLastTimeUpdate(localDB, tableName), true);
            if (since > 0)
                return true;
        }
        return false;
    });
}
/** Maximum ms to wait between data chunks before declaring the stream idle. */
const IDLE_TIMEOUT_MS = 60000; // 60 s — covers brief server pauses
/**
 * Connect to `/getUpdates?since=…` via `http.fetchStream` and apply
 * audit-log entries to LocalDB in real time.
 *
 * Returns a {@link StreamExitReason} so the caller can react appropriately
 * (reconnect, stop, fall back to polling).
 *
 * Blocks until the stream closes, the signal aborts, or an idle timeout fires.
 */
function streamAuditLogSync(localDB, signal, since, onTick) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, e_1, _b, _c;
        const startCursor = since !== null && since !== void 0 ? since : (yield localDB.getLastTimeUpdate()).getTime();
        console.info(`[audit-stream] Connecting to /getUpdates?since=${startCursor}`);
        let stream;
        try {
            stream = utils_1.net.http.fetchStream({
                route: `/getUpdates?since=${startCursor}`,
                method: 'GET',
                headers: {},
                signal,
            });
        }
        catch (err) {
            // Connection failed immediately (DNS, refused, etc.)
            if ((err === null || err === void 0 ? void 0 : err.name) === 'AbortError')
                return { type: 'aborted' };
            return classifyError(err);
        }
        let lastActivity = Date.now();
        try {
            try {
                for (var _d = true, stream_1 = __asyncValues(stream), stream_1_1; stream_1_1 = yield stream_1.next(), _a = stream_1_1.done, !_a; _d = true) {
                    _c = stream_1_1.value;
                    _d = false;
                    const { chunk } = _c;
                    lastActivity = Date.now();
                    const entries = parseChunk(chunk);
                    if (!entries.length) {
                        // Check idle timeout even on empty chunks.
                        if (Date.now() - lastActivity > IDLE_TIMEOUT_MS) {
                            console.warn('[audit-stream] Idle timeout (empty chunk) — reconnecting.');
                            return { type: 'idle_timeout' };
                        }
                        continue;
                    }
                    const { byTable, maxCursor } = groupByTable(entries, startCursor);
                    yield applyBatches(localDB, byTable, maxCursor, onTick);
                    yield localDB.setLastTimeUpdate(new Date(maxCursor));
                    lastActivity = Date.now(); // reset after successful work
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (!_d && !_a && (_b = stream_1.return)) yield _b.call(stream_1);
                }
                finally { if (e_1) throw e_1.error; }
            }
            // Stream ended cleanly (server closed the connection).
            return { type: 'clean' };
        }
        catch (err) {
            if ((err === null || err === void 0 ? void 0 : err.name) === 'AbortError')
                return { type: 'aborted' };
            // While iterating the server may have returned an error status.
            if ((err === null || err === void 0 ? void 0 : err.status) === 401 || (err === null || err === void 0 ? void 0 : err.status) === 403) {
                return { type: 'auth_error', status: err.status };
            }
            return classifyError(err);
        }
    });
}
/**
 * Classify a caught error into a {@link StreamExitReason}.
 */
function classifyError(err) {
    var _a;
    // Auth errors — stop the stream loop; the app should handle logout.
    if ((err === null || err === void 0 ? void 0 : err.status) === 401 || (err === null || err === void 0 ? void 0 : err.status) === 403) {
        return { type: 'auth_error', status: err.status };
    }
    // Network-level errors (DNS, refused, offline) — retry with backoff.
    if ((err === null || err === void 0 ? void 0 : err.name) === 'TypeError' || (err === null || err === void 0 ? void 0 : err.name) === 'NetworkError' || ((_a = err === null || err === void 0 ? void 0 : err.message) === null || _a === void 0 ? void 0 : _a.includes('NetworkError'))) {
        return { type: 'network_error', error: err };
    }
    // Unknown — treat as network error (safest default).
    return { type: 'network_error', error: err instanceof Error ? err : new Error(String(err)) };
}
// ── Inner helpers (block-extracted from streamAuditLogSync) ───────────────────
/**
 * Parse a raw stream chunk into an array of AuditLogEntry.
 * Handles arrays, JSON strings, and objects with `.data` or `.rows`.
 */
function parseChunk(chunk) {
    var _a, _b;
    try {
        if (Array.isArray(chunk))
            return chunk;
        if (typeof chunk === 'string') {
            const parsed = JSON.parse(chunk);
            if (Array.isArray(parsed))
                return parsed;
            return (_b = (_a = parsed === null || parsed === void 0 ? void 0 : parsed.data) !== null && _a !== void 0 ? _a : parsed === null || parsed === void 0 ? void 0 : parsed.rows) !== null && _b !== void 0 ? _b : [];
        }
        if ((chunk === null || chunk === void 0 ? void 0 : chunk.data) && Array.isArray(chunk.data))
            return chunk.data;
        if ((chunk === null || chunk === void 0 ? void 0 : chunk.rows) && Array.isArray(chunk.rows))
            return chunk.rows;
    }
    catch ( /* skip */_c) { /* skip */ }
    return [];
}
/**
 * Group audit entries by table_name and track the highest cursor seen.
 */
function groupByTable(entries, startCursor) {
    const byTable = new Map();
    let maxCursor = startCursor;
    for (const entry of entries) {
        if (!entry.table_name || !entry.row_id)
            continue;
        if (!byTable.has(entry.table_name)) {
            byTable.set(entry.table_name, []);
        }
        byTable.get(entry.table_name).push(entry);
        if (entry.created_at > maxCursor) {
            maxCursor = entry.created_at;
        }
    }
    return { byTable, maxCursor };
}
/**
 * Transform AuditLogEntry → Row and apply to LocalDB per table.
 */
function applyBatches(localDB, byTable, maxCursor, onTick) {
    return __awaiter(this, void 0, void 0, function* () {
        for (const entry of Array.from(byTable.entries())) {
            const [tableName, tableEntries] = entry;
            const schema = config_1.StockOS_CONFIG.TABLES[tableName];
            // Update per-table cursor regardless of `locally`.
            yield setTableLastTimeUpdate(localDB, tableName, maxCursor);
            if (!schema || schema.locally !== true) {
                console.debug(`[audit-stream] Table "${tableName}" is locally:false — cursor only.`);
                onTick === null || onTick === void 0 ? void 0 : onTick(tableName, 0, maxCursor);
                continue;
            }
            const rows = auditEntriesToRows(tableEntries);
            if (rows.length) {
                yield localDB.applyServerUpdates({ [tableName]: rows }, maxCursor);
            }
            console.debug(`[audit-stream] "${tableName}" — applied ${rows.length} ops (cursor: ${maxCursor})`);
            onTick === null || onTick === void 0 ? void 0 : onTick(tableName, rows.length, maxCursor);
        }
    });
}
/**
 * Transform an array of AuditLogEntry into Row[] for LocalDB.
 */
function auditEntriesToRows(entries) {
    return entries.map((e) => {
        const payload = e.payload;
        if (e.operation === 'DELETE') {
            return {
                id: e.row_id,
                deleted: true,
                updated_at: e.created_at,
            };
        }
        return Object.assign(Object.assign({ id: e.row_id }, payload), { updated_at: e.created_at, deleted: false, syncStatus: SYNC_STATUS.SYNCED });
    });
}
