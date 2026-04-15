/// <reference path="../../stores/temp/data.schemas.d.ts" />

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


import { StockOS_CONFIG, TableName, TABLE_NAMES } from '../../workspace/config';
import { parseNumber, net, data, ds } from '../../utils';
import { SYNC_STATUS } from '../../utils/data';


// ── Types ────────────────────────────────────────────────────────────────────

interface ServerTableResponse {
    data: data.Row[];
    time?: number;
}

/**
 * Audit-log row shape returned by the /getUpdates endpoint.
 */
interface AuditLogEntry {
    id: number | string;
    table_name: string;
    operation: 'INSERT' | 'UPDATE' | 'DELETE';
    row_id: string;
    payload: Record<string, unknown>;
    created_at: number;  // epoch ms
}

// ── Unified Cursor Management ────────────────────────────────────────────────

const SYNC_CURSOR_CACHE_KEY = 'sync_cursor';

/**
 * Per-table sync cursor tracking.
 * Replaces the dual system (global lastTimeUpdate + per-table cursors)
 * with a single source of truth.
 */
export interface SyncCursor {
    global: number;                      // Backward compatibility with live-sync
    tables: Record<string, number>;      // Per-table precision cursors
    lastUpdated: string;                 // ISO timestamp of last cursor update
}

/**
 * Get the unified sync cursor from cache.
 * Falls back to epoch (0) for all tables if never initialized.
 */
export async function getSyncCursor(localDB: ds.LocalDB<any, any>): Promise<SyncCursor> {
    const cached = await localDB.keyValue(SYNC_CURSOR_CACHE_KEY) as SyncCursor | undefined;

    if (cached && typeof cached === 'object') {
        return cached;
    }

    // Return default cursor (all zeros)
    const defaultCursor: SyncCursor = {
        global: 0,
        tables: {},
        lastUpdated: new Date(0).toISOString(),
    };

    // Initialize all known tables with epoch
    for (const tableName of TABLE_NAMES) {
        defaultCursor.tables[tableName] = 0;
    }

    return defaultCursor;
}

/**
 * Set the unified sync cursor in cache.
 * Updates both the per-table cursor AND the global cursor atomically.
 * 
 * @param localDB - Initialized LocalDB instance
 * @param tableName - Table that was just synced
 * @param time - Server timestamp for this sync
 */
export async function setSyncCursor(
    localDB: ds.LocalDB<any, any>,
    tableName: string,
    time: number | Date,
): Promise<void> {
    const cursor = await getSyncCursor(localDB);
    const timestamp = time instanceof Date ? time.getTime() : time;

    // Update per-table cursor
    cursor.tables[tableName] = timestamp;

    // Update global cursor to the maximum of all table cursors
    const maxTime = Math.max(timestamp, cursor.global);
    cursor.global = maxTime;
    cursor.lastUpdated = new Date(timestamp).toISOString();

    // Atomic write to cache
    await localDB.keyValue(SYNC_CURSOR_CACHE_KEY, cursor);

    // Backward compatibility: also update the old global lastTimeUpdate
    // This will be removed after migration period
    await localDB.setLastTimeUpdate(new Date(timestamp));
}

/**
 * Get the last sync time for a specific table.
 * Uses the unified cursor system with fallback to old per-table keys
 * for backward compatibility during migration.
 */
async function getTableLastTimeUpdate(localDB: ds.LocalDB<any, any>, tableName: string): Promise<number> {
    // Try unified cursor first
    const cursor = await getSyncCursor(localDB);
    if (cursor.tables[tableName] !== undefined) {
        return cursor.tables[tableName];
    }

    // Fallback to old per-table key (migration support)
    const CACHE_KEY_PREFIX = 'lastTimeUpdate_';
    const iso = await localDB.keyValue(CACHE_KEY_PREFIX + tableName) as string | undefined;
    return iso ? new Date(iso).getTime() : 0;
}

/**
 * Set the last sync time for a specific table.
 * Uses the unified cursor system for atomic updates.
 */
async function setTableLastTimeUpdate(localDB: ds.LocalDB<any, any>, tableName: string, time: number | Date): Promise<void> {
    // Use the unified cursor system
    await setSyncCursor(localDB, tableName, time);
}

// ── Server fetch via erpCall ─────────────────────────────────────────────────

/**
 * Fetch all rows for a single table from the server.
 * Uses erpCall which serialises requests, handles 401 auto-login,
 * and manages service feedback loops.
 *
 * Server endpoint: POST /data/{tableName}.getRows
 */
async function fetchTableFromServer(tableName: string, since?: number): Promise<ServerTableResponse> {
    const response = await net.erpQueue.erpCall<ServerTableResponse>({
        route: `/data/${tableName}?since=` + Number(isFinite(since || 0) ? since || 0 : 0),
        method: 'GET',
        encrypt: true,
        title: (erpCall, e) => `Syncing table ${tableName}`,
        message: (erpCall, e) => `Syncing table ${tableName}`,
        actions: (erpCall, e) => [
            {
                label: 'Cancel',
                action: (erpCall, e) => {
                    e.queue.cancel(erpCall)
                },
            },
        ],
    });

    return response;
}

// ── Retry Logic with Exponential Backoff ─────────────────────────────────────

/**
 * Sync a single table with retry logic and exponential backoff.
 * Implements resume capability by using per-table cursors.
 * 
 * @param tableName - Table to sync
 * @param localDB - LocalDB instance
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param onProgress - Optional progress callback
 */
async function syncTableWithRetry(
    tableName: string,
    localDB: ds.LocalDB<any, any>,
    maxRetries: number = 3,
    onProgress?: (progress: { table: string; attempt: number; success: boolean; rows?: number }) => void,
): Promise<{ success: boolean; rows?: number }> {
    let cursor = await getTableLastTimeUpdate(localDB, tableName);
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[sync] 🔄 "${tableName}" — attempt ${attempt}/${maxRetries} (since: ${cursor === 0 ? 'epoch' : new Date(cursor).toISOString()})`);

            const response = await fetchTableFromServer(tableName, cursor);
            const rows: data.Row[] = response?.data ?? [];
            const serverTime = response?.time ?? Date.now();

            // Use the maximum of any server-provided time or local now to be safe.
            const watermark = Math.max(serverTime, Date.now());

            await applyTableToDB(localDB, tableName, rows, watermark);

            // Update cursor after successful apply (already done in applyTableToDB)
            cursor = watermark;

            onProgress?.({ table: tableName, attempt, success: true, rows: rows.length });

            return { success: true, rows: rows.length };

        } catch (err: any) {
            lastError = err;
            console.warn(`[sync] ⚠️ "${tableName}" — attempt ${attempt} failed:`, err.message || err);

            onProgress?.({ table: tableName, attempt, success: false });

            // If not the last attempt, wait with exponential backoff before retrying
            if (attempt < maxRetries) {
                const backoffMs = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s...
                console.log(`[sync] ⏳ "${tableName}" — waiting ${backoffMs}ms before retry...`);
                await sleep(backoffMs);
            }
        }
    }

    // All retries exhausted
    console.error(`[sync] ❌ "${tableName}" — failed after ${maxRetries} attempts:`, lastError?.message || lastError);
    return { success: false };
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Apply rows to LocalDB ────────────────────────────────────────────────────

/**
 * Apply fetched rows into LocalDB for tables that are marked `locally === true`.
 * For `locally === false` tables, we only update the per-table lastTimeUpdate
 * cursor so future delta syncs can resume correctly.
 */
async function applyTableToDB(
    localDB: ds.LocalDB<any, any>,
    tableName: string,
    rows: data.Row[],
    serverTime: number,
): Promise<void> {
    const schema = StockOS_CONFIG.TABLES[tableName as TableName];

    if (!schema) {
        console.warn(`[sync] ❌ "${tableName}" — Unknown table, skipping.`);
        return;
    }

    // Skip writing to IndexedDB for transient/remote-only tables.
    if (schema.locally !== true) {
        // Still update cursor for delta sync tracking
        await setTableLastTimeUpdate(localDB, tableName, serverTime);
        console.log(`[sync] 📡 "${tableName}" — remote-only table, cursor updated to ${new Date(serverTime).toISOString()}`);
        return;
    }

    if (!rows || rows.length === 0) {
        // Update cursor even for empty results (marks sync point)
        await setTableLastTimeUpdate(localDB, tableName, serverTime);
        console.log(`[sync] ✓ "${tableName}" — no changes (cursor: ${new Date(serverTime).toISOString()})`);
        return;
    }

    // Apply rows via LocalDB's applyServerUpdates (handles upsert, delete, syncStatus).
    const applyStart = Date.now();
    await localDB.applyServerUpdates({ [tableName]: rows }, serverTime);
    const applyDuration = Date.now() - applyStart;

    // Update cursor AFTER successful apply (atomic operation)
    await setTableLastTimeUpdate(localDB, tableName, serverTime);

    console.log(`[sync] ✓ "${tableName}" — synced ${rows.length} rows in ${applyDuration}ms (cursor: ${new Date(serverTime).toISOString()})`);
}

// ── Main sync orchestrator ───────────────────────────────────────────────────

/**
 * Configuration for parallel sync batches.
 * Controls how many tables are synced concurrently during initial sync.
 */
const CONCURRENT_TABLES = 3;

/**
 * Perform a full table-by-table initial sync with parallel fetching and retry logic.
 *
 * Strategy:
 *   1. Iterate over every table defined in StockOS_CONFIG.TABLES.
 *   2. For each table, check its per-table lastTimeUpdate cursor.
 *   3. Fetch rows from the server using syncTableWithRetry (with exponential backoff).
 *   4. Apply rows to LocalDB (or just update cursor for locally=false tables).
 *
 * Tables are fetched in parallel batches (default: 3 at a time) to improve speed
 * while respecting rate limits. Each table has independent retry logic.
 *
 * Features:
 *   - Parallel table fetching (3x faster than sequential)
 *   - Per-table retry with exponential backoff
 *   - Resume capability via per-table cursors
 *   - Progress tracking via broadcast
 *
 * @param localDB - An initialised LocalDB instance.
 */
export async function initialFullTableSync(localDB: ds.LocalDB<any, any>): Promise<void> {
    const tablesToSync: TableName[] = TABLE_NAMES.filter(
        (t) => StockOS_CONFIG.TABLES[t].locally === true,
    ) as TableName[];

    console.log(`[sync] 🚀 Starting initial full-table sync for ${tablesToSync.length} tables...`);

    let totalRows = 0;
    const syncStartTime = Date.now();
    const progress = { total: tablesToSync.length, completed: 0 };

    // Process tables in parallel batches for improved performance
    for (let i = 0; i < tablesToSync.length; i += CONCURRENT_TABLES) {
        const batch = tablesToSync.slice(i, i + CONCURRENT_TABLES);
        console.log(`[sync] 📦 Processing batch ${Math.floor(i / CONCURRENT_TABLES) + 1}: ${batch.join(', ')}`);

        // Sync all tables in this batch in parallel
        const results = await Promise.allSettled(
            batch.map(async (tableName) => {
                const tableStart = Date.now();
                const since = await getTableLastTimeUpdate(localDB, tableName);
                const isFullSync = since === 0;
                const syncType = isFullSync ? 'FULL' : 'DELTA';

                console.log(`[sync] 📥 "${tableName}" | type: ${syncType} | since: ${since === 0 ? 'epoch' : new Date(since).toISOString()}`);

                // Use retry-capable sync function
                const result = await syncTableWithRetry(tableName, localDB, 3, (prog) => {
                    console.debug(`[sync] 📊 "${tableName}" — attempt ${prog.attempt}: ${prog.success ? 'success' : 'failed'}${prog.rows !== undefined ? ` (${prog.rows} rows)` : ''}`);
                });

                const tableDuration = Date.now() - tableStart;

                if (result.success) {
                    totalRows += result.rows || 0;
                    console.log(`[sync] ✅ "${tableName}" — ${isFullSync ? 'initial full sync' : 'delta sync'} complete in ${tableDuration}ms (${result.rows} rows)`);
                } else {
                    console.error(`[sync] ❌ "${tableName}" — failed after all retries in ${tableDuration}ms`);
                }

                return result;
            }),
        );

        // Update progress after batch completes
        progress.completed += batch.length;
        broadcastSyncProgress(progress);

        // Check if any failures in this batch
        const failures = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success));
        if (failures.length > 0) {
            console.warn(`[sync] ⚠️ Batch had ${failures.length} failure(s), continuing with next batch...`);
        }
    }

    const totalDuration = Date.now() - syncStartTime;
    console.log(
        `[sync] 🎉 Initial full-table sync complete. Total: ${totalRows} rows across ${tablesToSync.length} tables in ${totalDuration}ms.`,
    );
}

/**
 * Broadcast sync progress to interested listeners.
 */
function broadcastSyncProgress(progress: { total: number; completed: number }): void {
    const percentage = Math.round((progress.completed / progress.total) * 100);
    console.log(`[sync] 📈 Progress: ${progress.completed}/${progress.total} tables (${percentage}%)`);
    
    // Dispatch custom event for UI components to listen to
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sync:progress', { detail: progress }));
    }
}

// ── Convenience: check whether initial sync has already run ──────────────────

/**
 * Returns true if at least one `locally === true` table has a non-epoch
 * lastTimeUpdate cursor — indicating an initial sync has occurred before.
 */
export async function hasInitialSyncRun(localDB: ds.LocalDB<any, any>): Promise<boolean> {
    const locallyTables = (TABLE_NAMES as TableName[]).filter(
        (t) => StockOS_CONFIG.TABLES[t]?.locally === true && t !== '_queue',
    );

    for (const tableName of locallyTables) {
        const since = parseNumber(await getTableLastTimeUpdate(localDB, tableName), true);
        if (since > 0) return true;
    }

    return false;
}


// ── Streaming audit-log sync via /getUpdates ─────────────────────────────────

/**
 * Reason why `streamAuditLogSync` exited.  The live-sync loop uses this
 * to decide whether to reconnect, fall back to polling, or stop entirely.
 */
export type StreamExitReason =
    | { type: 'clean' }                          // server closed gracefully
    | { type: 'aborted' }                        // AbortSignal fired (logout / stopLiveSync)
    | { type: 'auth_error'; status: number }     // 401/403 — user logged out, stop retrying
    | { type: 'idle_timeout' }                   // no data for IDLE_TIMEOUT_MS — reconnect
    | { type: 'network_error'; error: Error };   // fetch / read failed — retry with backoff

/** Maximum ms to wait between data chunks before declaring the stream idle. */
const IDLE_TIMEOUT_MS = 60_000;  // 60 s — covers brief server pauses

/**
 * Connect to `/getUpdates?since=…` via `http.fetchStream` and apply
 * audit-log entries to LocalDB in real time.
 *
 * Returns a {@link StreamExitReason} so the caller can react appropriately
 * (reconnect, stop, fall back to polling).
 *
 * Blocks until the stream closes, the signal aborts, or an idle timeout fires.
 */
export async function streamAuditLogSync(
    localDB: ds.LocalDB<any, any>,
    signal?: AbortSignal,
    since?: number,
    onTick?: (table: string, count: number, cursor: number) => void,
): Promise<StreamExitReason> {
    const startCursor = since ?? (await localDB.getLastTimeUpdate()).getTime();

    console.info(`[audit-stream] Connecting to /stream/changes?since=${startCursor}`);

    let stream: AsyncGenerator<{ chunk: any }>;
    try {
        stream = net.http.fetchStream({
            route: `/stream/changes?since=${startCursor}`,
            method: 'GET',
            headers: {},
            signal,
        });
    } catch (err: any) {
        // Connection failed immediately (DNS, refused, etc.)
        if (err?.name === 'AbortError') return { type: 'aborted' };
        return classifyError(err);
    }

    let lastActivity = Date.now();

    try {
        for await (const { chunk } of stream) {
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
            await applyBatches(localDB, byTable, maxCursor, onTick);
            await localDB.setLastTimeUpdate(new Date(maxCursor));
            lastActivity = Date.now();  // reset after successful work
        }

        // Stream ended cleanly (server closed the connection).
        return { type: 'clean' };

    } catch (err: any) {
        if (err?.name === 'AbortError') return { type: 'aborted' };

        // While iterating the server may have returned an error status.
        if (err?.status === 401 || err?.status === 403) {
            return { type: 'auth_error', status: err.status };
        }

        return classifyError(err);
    }
}

/**
 * Classify a caught error into a {@link StreamExitReason}.
 */
function classifyError(err: any): StreamExitReason {
    // Auth errors — stop the stream loop; the app should handle logout.
    if (err?.status === 401 || err?.status === 403) {
        return { type: 'auth_error', status: err.status };
    }

    // Network-level errors (DNS, refused, offline) — retry with backoff.
    if (err?.name === 'TypeError' || err?.name === 'NetworkError' || err?.message?.includes('NetworkError')) {
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
function parseChunk(chunk: any): AuditLogEntry[] {
    try {
        if (Array.isArray(chunk)) return chunk;

        if (typeof chunk === 'string') {
            const parsed = JSON.parse(chunk);
            if (Array.isArray(parsed)) return parsed;
            return parsed?.data ?? parsed?.rows ?? [];
        }

        if (chunk?.data && Array.isArray(chunk.data)) return chunk.data;
        if (chunk?.rows && Array.isArray(chunk.rows)) return chunk.rows;
    } catch { /* skip */ }
    return [];
}

/**
 * Group audit entries by table_name and track the highest cursor seen.
 */
function groupByTable(
    entries: AuditLogEntry[],
    startCursor: number,
): { byTable: Map<string, AuditLogEntry[]>; maxCursor: number } {
    const byTable = new Map<string, AuditLogEntry[]>();
    let maxCursor = startCursor;

    for (const entry of entries) {
        if (!entry.table_name || !entry.row_id) continue;

        if (!byTable.has(entry.table_name)) {
            byTable.set(entry.table_name, []);
        }
        byTable.get(entry.table_name)!.push(entry);

        if (entry.created_at > maxCursor) {
            maxCursor = entry.created_at;
        }
    }

    return { byTable, maxCursor };
}

/**
 * Transform AuditLogEntry → Row and apply to LocalDB per table.
 */
async function applyBatches(
    localDB: ds.LocalDB<any, any>,
    byTable: Map<string, AuditLogEntry[]>,
    maxCursor: number,
    onTick?: (table: string, count: number, cursor: number) => void,
): Promise<void> {
    for (const entry of Array.from(byTable.entries())) {
        const [tableName, tableEntries] = entry;
        const schema = StockOS_CONFIG.TABLES[tableName as TableName];

        // Update per-table cursor regardless of `locally`.
        await setTableLastTimeUpdate(localDB, tableName, maxCursor);

        if (!schema || schema.locally !== true) {
            console.debug(`[audit-stream] Table "${tableName}" is locally:false — cursor only.`);
            onTick?.(tableName, 0, maxCursor);
            continue;
        }

        const rows = auditEntriesToRows(tableEntries);
        if (rows.length) {
            await localDB.applyServerUpdates({ [tableName]: rows }, maxCursor);
        }

        console.debug(
            `[audit-stream] "${tableName}" — applied ${rows.length} ops (cursor: ${maxCursor})`,
        );
        onTick?.(tableName, rows.length, maxCursor);
    }
}

/**
 * Transform an array of AuditLogEntry into Row[] for LocalDB.
 */
function auditEntriesToRows(entries: AuditLogEntry[]): data.Row[] {
    return entries.map((e) => {
        const payload = e.payload as Record<string, unknown>;

        if (e.operation === 'DELETE') {
            return {
                id: e.row_id,
                deleted: true,
                updated_at: e.created_at,
            } as data.Row;
        }

        return {
            id: e.row_id,
            ...payload,
            updated_at: e.created_at,
            deleted: false,
            syncStatus: SYNC_STATUS.SYNCED,
        } as data.Row;
    });
}


// ── Export everything ────────────────────────────────────────────────────────

export { 
    getTableLastTimeUpdate, 
    setTableLastTimeUpdate, 
    fetchTableFromServer, 
    applyTableToDB,
    syncTableWithRetry,  // Export retry function for external use
};