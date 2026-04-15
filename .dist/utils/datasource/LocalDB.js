"use strict";
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
exports.LocalDB = void 0;
/**
 * src/flow/sw/LocalDB.js
 *
 * Persists all application data in IndexedDB.
 *
 * lastTimeUpdate
 * ──────────────
 * Stored in localStorage (main thread) — NOT in IndexedDB here.
 * On SW boot the Orchestrator sends SW_INIT with the value read from
 * localStorage.  Each time the watermark advances the SW broadcasts
 * LAST_UPDATE so the main thread can persist it to localStorage.
 * This survives SW restarts without any extra IDB round-trip.
 *
 * id_list
 * ───────
 * Every mutation calls getIdList() from StockOS_CONFIG.ID_LIST_MAP to
 * compute the subscription channel IDs, then tags the BroadcastChannel
 * event with them.  Table instances whose `id` array overlaps with
 * the event's id_list react; others ignore it.
 *
 * Runs inside the Service Worker.
 */
const Row_1 = require("../data/Row");
const config_1 = require("../../workspace/config");
const Datasource_1 = require("./Datasource");
const DB_EVENT = {
    ROWS_CHANGED: 'rows:changed',
    ROWS_DELETED: 'rows:deleted',
    ROWS_SYNC_STATUS: 'rows:sync-status',
    DB_UPDATED: 'db:updated',
    DB_UPDATE_ERROR: 'db:update-error',
    SYNC_STATUS: 'sync:status',
    CONNECTION: 'connection',
    CMD_RESULT: 'cmd:result',
    PONG: 'pong',
};
class LocalDB extends Datasource_1.Datasource {
    clearAll() {
        return __awaiter(this, void 0, void 0, function* () {
            throw new Error('Method not implemented.');
        });
    }
    applyDelta(tableName, delta) {
        return __awaiter(this, void 0, void 0, function* () {
            const { deletes = [], updates = [] } = delta;
            const db = yield this._open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(tableName, 'readwrite');
                const store = tx.objectStore(tableName);
                for (const { id } of deletes)
                    store.delete(id);
                for (const row of updates)
                    store.put(row);
                tx.oncomplete = () => resolve();
                tx.onerror = (e) => reject(e.target.error);
            });
        });
    }
    getNewId(tableName) {
        throw new Error('Method not implemented.');
    }
    newRow(tableName) {
        throw new Error('Method not implemented.');
    }
    auth(user, callback) {
        throw new Error('Method not implemented.');
    }
    saveRow(tableName, row) {
        throw new Error('Method not implemented.');
    }
    deleteRow(tableName, id) {
        throw new Error('Method not implemented.');
    }
    /** @param {StockOS_CONFIG} config */
    constructor(config) {
        super();
        this._cfg = config;
        /** @type {IDBDatabase|null} */
        /** ISO — seeded by Orchestrator via SW_INIT, updated via applyServerUpdates */
    }
    // ── Lifecycle ─────────────────────────────────────────────────────────────
    /**
     * Open (or upgrade) IndexedDB, then hard-delete all soft-deleted rows.
     * Must be awaited before any other method.
     */
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            this._db = yield this._open();
            yield this._cleanDeleted();
            return this;
        });
    }
    // ── id_list helper ────────────────────────────────────────────────────────
    /**
     * Returns the subscription channel IDs for a given row.
     *
     * @param {string} tableName
     * @param {Object} row
     * @returns {string[]}
     *
     * Examples (from config.js):
     *   getIdList('orderLines', { order_id:'abc' })
     *       → ['order_lines', 'items_abc']
     *   getIdList('sPayments', { customer_id:'x', order_id:'y' })
     *       → ['payments', 'payments_x', 'payments_y']
     */
    getIdList(tableName, row) {
        var _a;
        const fn = (_a = this._cfg.TABLES[tableName]) === null || _a === void 0 ? void 0 : _a.id_list;
        if (!fn)
            return [tableName];
        return fn(row);
    }
    // ── Server delta application ───────────────────────────────────────────────
    /**
     * Apply a batch of server rows.
     * Called whenever ServerDB emits 'updates'.
     *
     * For each row:
     *   deleted = true  → hard-delete from IDB + broadcast ROWS_DELETED
     *   otherwise       → upsert, set syncStatus = synced + broadcast ROWS_CHANGED
     *
     * Advances lastTimeUpdate to the highest updated_at seen and broadcasts
     * LAST_UPDATE so the main thread can persist it to localStorage.
     *
     * @param {import('../flow/types.js').ServerUpdatePayload} payload
     */
    applyServerUpdates(tables, time) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!tables)
                return;
            for (const [tableName, tableData] of Object.entries(tables)) {
                // ── Guard: only write tables that are declared as locally-cached ──────
                // Tables with locally:false (order_lines, movements, payments) and
                // internal stores (_queue) are explicitly excluded from the sync engine.
                const schema = this._cfg.TABLES[tableName];
                if (!schema || schema.locally !== true)
                    continue;
                const rows = tableData !== null && tableData !== void 0 ? tableData : [];
                if (!rows.length)
                    continue;
                const upserted = [];
                const deleted = [];
                const result = yield this._reqs(tableName, 'readwrite', (store) => {
                    for (const serverRow of rows) {
                        const localRow = Object.assign(Object.assign({}, serverRow), { syncStatus: Row_1.SYNC_STATUS.SYNCED });
                        if ('deleted' in serverRow && serverRow.deleted) {
                            store.delete(serverRow.id);
                            deleted.push(serverRow.id);
                        }
                        else {
                            store.put(localRow);
                            upserted.push(localRow);
                        }
                    }
                });
                ;
                if (upserted.length) {
                    this._emitChanged(tableName, upserted, 'update');
                }
                if (deleted.length) {
                    this._emitDeleted(tableName, deleted);
                }
            }
            yield this.setLastTimeUpdate(time);
        });
    }
    /**
   * Store the last update time in the "cache" store.
   *
   * @param {string|number|Date} [time] - Time value to persist.
   *   - string → parsed with Date.parse
   *   - number → treated as ms since epoch
   *   - Date   → used directly
   *   - undefined → defaults to epoch (0)
   * @returns {Promise<void>}
   */
    setLastTimeUpdate(time) {
        return __awaiter(this, void 0, void 0, function* () {
            let date;
            if (typeof time === 'string') {
                date = new Date(Date.parse(time));
            }
            else if (typeof time === 'number') {
                date = new Date(time || 0);
            }
            else if (time instanceof Date) {
                date = time;
            }
            else {
                date = new Date(0);
            }
            // Persist ISO string in the cache store
            return yield this.keyValue('lastUpdate', date.toISOString());
        });
    }
    /**
   * Retrieve the last update time from the "cache" store.
   *
   * @returns {Promise<Date>} Resolves with a Date object.
   */
    getLastTimeUpdate() {
        return __awaiter(this, void 0, void 0, function* () {
            const iso = yield this.keyValue('lastUpdate');
            // If nothing stored, default to epoch
            return iso ? new Date(iso) : new Date(0);
        });
    }
    // ── Canonical CRUD ────────────────────────────────────────────────────────
    /**
     * Insert a new row.
     * Sets updated_at = now(), deleted = false, syncStatus = pending.
     * Broadcasts ROWS_CHANGED with the row's id_list.
     *
     * @param {string} tableName
     * @param {Object} data  Must include `id` (UUID).
     * @returns {Promise<Object>}
     */
    insert(tableName, data) {
        return __awaiter(this, void 0, void 0, function* () {
            const row = Object.assign(Object.assign({}, data), { updated_at: this._now(), deleted: false, syncStatus: Row_1.SYNC_STATUS.PENDING });
            yield this._idbPut(tableName, row);
            this._emitChanged(tableName, [row], 'insert');
            return row;
        });
    }
    /**
     * Update an existing row.
     * Merges changes, bumps updated_at = now(), sets syncStatus = pending.
     *
     * @param {string} tableName
     * @param {string} id
     * @param {Object} changes
     * @returns {Promise<Object>}
     */
    update(tableName, id, changes) {
        return __awaiter(this, void 0, void 0, function* () {
            const existing = yield this.get(tableName, id);
            if (!existing)
                throw new Error(`[LocalDB] update: ${tableName}/${id} not found`);
            const row = Object.assign(Object.assign(Object.assign({}, existing), changes), { id, updated_at: this._now(), syncStatus: Row_1.SYNC_STATUS.PENDING });
            yield this._idbPut(tableName, row);
            this._emitChanged(tableName, [row], 'update');
            return row;
        });
    }
    /**
     * Soft-delete a row (sets deleted = true).
     * id_list is computed BEFORE the deletion so FK channels are still available.
     *
     * @param {string} tableName
     * @param {string} id
     */
    delete(tableName, id) {
        return __awaiter(this, void 0, void 0, function* () {
            const existing = yield this.get(tableName, id);
            if (!existing)
                return;
            const id_list = (0, config_1.getIdList)(this._cfg, tableName, existing);
            const row = Object.assign(Object.assign({}, existing), { deleted: true, updated_at: this._now(), syncStatus: Row_1.SYNC_STATUS.PENDING });
            yield this._idbPut(tableName, row);
            this._emitDeleted(tableName, [id]);
        });
    }
    /**
     * Update syncStatus for a list of row IDs.
     */
    setSyncStatus(tableName, ids, status) {
        return __awaiter(this, void 0, void 0, function* () {
            for (const id of ids) {
                const row = yield this.get(tableName, id);
                if (row)
                    yield this._idbPut(tableName, Object.assign(Object.assign({}, row), { syncStatus: status }));
            }
            this.emit(DB_EVENT.ROWS_SYNC_STATUS, { tableName, rowIds: ids, status });
        });
    }
    // ── Read ──────────────────────────────────────────────────────────────────
    get(tableName, id) {
        return __awaiter(this, void 0, void 0, function* () {
            return this._req(tableName, 'readonly', (s) => s.get(id));
        });
    }
    /** Non-deleted rows only. and where updated_at > lastTimeUpdate */
    getAll(tableName, lastTimeUpdate) {
        return __awaiter(this, void 0, void 0, function* () {
            const rows = yield this._req(tableName, 'readonly', (s) => {
                if (lastTimeUpdate) {
                    const index = s.index("updated_at");
                    const range = IDBKeyRange.lowerBound(lastTimeUpdate, true);
                    return index.getAll(range);
                }
                return s.getAll();
            });
            return rows ? rows.filter((r) => !r.deleted) : [];
        });
    }
    /** All rows including soft-deleted (internal use). */
    getAllRows(tableName) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            return (_a = yield this._req(tableName, 'readonly', (s) => s.getAll())) !== null && _a !== void 0 ? _a : [];
        });
    }
    /**
     * @param {string} tableName
     * @param {string} indexName
     * @param {any}    value
     * @returns {Promise<Object[]>} Non-deleted rows.
     */
    getByIndex(tableName, indexName, value) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                const tx = this._db.transaction(tableName, 'readonly');
                const idx = tx.objectStore(tableName).index(indexName);
                const req = idx.getAll(IDBKeyRange.only(value));
                req.onsuccess = () => { var _a; return resolve(((_a = req.result) !== null && _a !== void 0 ? _a : []).filter((r) => !r.deleted)); };
                req.onerror = () => reject(req.error);
            });
        });
    }
    // ── Queue ─────────────────────────────────────────────────────────────────
    /**
     * Enqueue an offline operation.
     * Entries are processed in created_at order by flushQueue().
     *
     * @param {import('../flow/types.js').QueueOperation} operation
     * @param {string} tableName
     * @param {Object} row  Full row snapshot.
     * @returns {Promise<import('../flow/types.js').QueueEntry>}
     */
    enqueue(operation, tableName, row) {
        return __awaiter(this, void 0, void 0, function* () {
            const entry = {
                id: this._uuid(),
                operation,
                tableName,
                rowId: row.id,
                data: Object.assign({}, row),
                created_at: this._now(),
                retryCount: 0,
                status: QUEUE_ENTRY_STATUS.PENDING,
                error: null,
            };
            yield this._idbPut('_queue', entry);
            return entry;
        });
    }
    getPendingQueue() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const all = (_a = yield this._req('_queue', 'readonly', (s) => s.getAll())) !== null && _a !== void 0 ? _a : [];
            return all
                .filter((e) => e.status === QUEUE_ENTRY_STATUS.PENDING ||
                e.status === QUEUE_ENTRY_STATUS.FAILED)
                .sort((a, b) => a.created_at.localeCompare(b.created_at));
        });
    }
    markQueueProcessing(entryId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this._patchQueueEntry(entryId, { status: QUEUE_ENTRY_STATUS.PROCESSING });
        });
    }
    markQueueDone(entryId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this._req('_queue', 'readwrite', (s) => s.delete(entryId));
        });
    }
    markQueueFailed(entryId, errorMsg) {
        return __awaiter(this, void 0, void 0, function* () {
            const entry = yield this.get('_queue', entryId);
            if (!entry)
                return;
            yield this._idbPut('_queue', Object.assign(Object.assign({}, entry), { status: QUEUE_ENTRY_STATUS.FAILED, retryCount: entry.retryCount + 1, error: errorMsg }));
        });
    }
    /**
     * Process all pending queue entries against the server in created_at order.
     * Updates syncStatus and removes entries on success.
     *
     * @param {import('./ServerDB.js').ServerDB} serverDB
     */
    flushQueue(serverDB) {
        return __awaiter(this, void 0, void 0, function* () {
            // Do not attempt network operations if the browser reports as offline.
            if (!navigator.onLine)
                return;
            const entries = yield this.getPendingQueue();
            if (!entries.length)
                return;
            for (const entry of entries) {
                yield this.markQueueProcessing(entry.id);
                yield this.setSyncStatus(entry.tableName, [entry.rowId], Row_1.SYNC_STATUS.SYNCING);
                try {
                    let serverRow = null;
                    switch (entry.operation) {
                        case QUEUE_OP.INSERT:
                            serverRow = yield serverDB.create(entry.tableName, entry.data);
                            break;
                        case QUEUE_OP.UPDATE:
                            serverRow = yield serverDB.update(entry.tableName, entry.rowId, entry.data);
                            break;
                        case QUEUE_OP.DELETE:
                            yield serverDB.delete(entry.tableName, entry.rowId);
                            break;
                    }
                    if (serverRow) {
                        const reconciled = Object.assign(Object.assign({}, serverRow), { syncStatus: Row_1.SYNC_STATUS.SYNCED });
                        yield this._idbPut(entry.tableName, reconciled);
                        this._emitChanged(entry.tableName, [reconciled], 'update');
                    }
                    else {
                        yield this.setSyncStatus(entry.tableName, [entry.rowId], Row_1.SYNC_STATUS.SYNCED);
                    }
                    yield this.markQueueDone(entry.id);
                }
                catch (err) {
                    console.warn(`[LocalDB] queue flush failed: ${entry.operation} ${entry.tableName}/${entry.rowId}:`, err.message);
                    yield this.markQueueFailed(entry.id, err.message);
                    yield this.setSyncStatus(entry.tableName, [entry.rowId], Row_1.SYNC_STATUS.ERROR);
                }
            }
        });
    }
    // ── IDB open / upgrade ────────────────────────────────────────────────────
    /**
   * Get or set a value in the "cache" object store.
   *
   * @param {string} key - The key to look up or store.
   * @param {*} [value] - If provided, the value to store. If omitted, the value is read.
   * @returns {Promise<*>} Resolves with the stored value (for get) or undefined (for set).
   */
    keyValue(key_1) {
        var arguments_1 = arguments;
        return __awaiter(this, arguments, void 0, function* (key, value = undefined) {
            const tx = this._db.transaction('cache', 'readwrite');
            const store = tx.objectStore('cache');
            return new Promise((resolve) => {
                let req;
                if (arguments_1.length === 1) {
                    // GET
                    req = store.get(key);
                    req.onsuccess = () => { var _a; return resolve((_a = req.result) === null || _a === void 0 ? void 0 : _a.value); };
                    req.onerror = () => resolve(undefined);
                }
                else {
                    // PUT
                    req = store.put({ key, value });
                    req.onsuccess = () => resolve(true);
                    req.onerror = () => resolve(false);
                }
            });
        });
    }
    _open() {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                const req = indexedDB.open(this._cfg.DB_NAME, this._cfg.DB_VERSION);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('cache')) {
                        const store = db.createObjectStore('cache', { keyPath: 'key' });
                    }
                    for (const schemaName of Object.keys(this._cfg.TABLES)) {
                        const schema = this._cfg.TABLES[schemaName];
                        if (db.objectStoreNames.contains(schemaName))
                            continue;
                        const store = db.createObjectStore(schemaName, { keyPath: schema.keyPath });
                        schema.indexes.forEach((idx) => {
                            store.createIndex(idx.name, idx.keyPath, { unique: !!idx.unique });
                        });
                    }
                };
                req.onsuccess = (e) => resolve(e.target.result);
                req.onerror = (e) => reject(e.target.error);
            });
        });
    }
    /** Hard-delete all rows where deleted = true (runs once on init). */
    _cleanDeleted() {
        return __awaiter(this, void 0, void 0, function* () {
            for (const name in this._cfg.TABLES) {
                if (name.startsWith('_'))
                    continue;
                const rows = yield this.getAllRows(name);
                for (const row of rows) {
                    if (row.deleted)
                        yield this._idbDelete(name, row.id);
                }
            }
        });
    }
    // ── IDB helpers ───────────────────────────────────────────────────────────
    /**
    * Run one or more IndexedDB requests inside a transaction.
    *
    * @param {string} storeName - Object store name.
    * @param {"readonly"|"readwrite"} mode - Transaction mode.
    * @param {(store: IDBObjectStore) => void} fn - Callback that issues requests but returns nothing.
    * @returns {Promise<void>} Resolves when the transaction completes.
    */
    _reqs(storeName, mode, fn) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                const tx = this._db.transaction(storeName, mode);
                const store = tx.objectStore(storeName);
                // Execute user callback — it can issue many requests
                yield fn(store);
                tx.oncomplete = (ev) => resolve(ev.target.result);
                tx.onerror = (ev) => reject(ev.target.error);
                tx.onabort = (ev) => reject(ev.target.error);
            }));
        });
    }
    _req(storeName, mode, fn) {
        return new Promise((resolve, reject) => {
            const tx = this._db.transaction(storeName, mode);
            const store = tx.objectStore(storeName);
            const req = fn(store);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        }).catch((e) => {
            console.error(e);
            return null;
        });
    }
    _idbPut(storeName, row) {
        return this._req(storeName, 'readwrite', (s) => s.put(row));
    }
    _idbDelete(storeName, id) {
        return this._req(storeName, 'readwrite', (s) => s.delete(id));
    }
    _patchQueueEntry(entryId, changes) {
        return __awaiter(this, void 0, void 0, function* () {
            const entry = yield this.get('_queue', entryId);
            if (!entry)
                return;
            yield this._idbPut('_queue', Object.assign(Object.assign({}, entry), changes));
        });
    }
    // ── Broadcast helpers ─────────────────────────────────────────────────────
    _emitChanged(tableName, rows, operation) {
        this.emit(DB_EVENT.ROWS_CHANGED, { tableName, rows, operation });
    }
    _emitDeleted(tableName, ids) {
        this.emit(DB_EVENT.ROWS_DELETED, { tableName, ids });
    }
    // ── Utilities ─────────────────────────────────────────────────────────────
    _now() { return new Date().toISOString(); }
    _uuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
    }
}
exports.LocalDB = LocalDB;
const cache = new LocalDB({
    DB_NAME: 'cache', DB_VERSION: 1, TABLES: {
        cache: {
            indexes: [],
            name: "cache",
            keyPath: "key",
            id_list: () => ['keys']
        }
    }
});
