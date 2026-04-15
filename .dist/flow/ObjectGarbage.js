"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObjectGarbage = void 0;
const broadcast_1 = require("../utils/networking/broadcast");
const Row_1 = require("../utils/data/Row");
const config_1 = require("./config");
const EventEmitter_1 = require("../utils/EventEmitter");
const bc = new broadcast_1.Channel(config_1.StockOS_CONFIG.BROADCAST_DB_EVENTS);
class ObjectGarbage {
    /**
     * @param {ObjectGarbageOptions} [opts]
     */
    constructor(opts = {}) {
        var _a, _b, _c, _d;
        this._registry = new Map();
        this._tableIndex = new Map();
        this._makeReactive = (_a = opts.makeReactive) !== null && _a !== void 0 ? _a : ((x) => x);
        this._onCreate = (_b = opts.onCreate) !== null && _b !== void 0 ? _b : null;
        this._onUpdate = (_c = opts.onUpdate) !== null && _c !== void 0 ? _c : null;
        this._onDispose = (_d = opts.onDispose) !== null && _d !== void 0 ? _d : null;
        this._unsubs = [];
        this.attach();
    }
    // ── Lifecycle ─────────────────────────────────────────────────────────────
    /**
     * Start listening for BroadcastChannel events from the Service Worker.
     * @returns {this}
     */
    attach() {
        this._unsubs.push((0, broadcast_1.listenFor)(broadcast_1.EVT.ROWS_CHANGED, ({ payload: evt }) => {
            var _a;
            this.process(evt.tableName, (_a = evt.rows) !== null && _a !== void 0 ? _a : []);
        }, bc), (0, broadcast_1.listenFor)(broadcast_1.EVT.ROWS_DELETED, ({ payload: evt }) => {
            var _a;
            ;
            this.processDeleted(evt.tableName, (_a = evt.ids) !== null && _a !== void 0 ? _a : []);
        }, bc), (0, broadcast_1.listenFor)(broadcast_1.EVT.SYNC_STATUS, ({ payload: evt }) => {
            ;
            this._applySyncStatus(evt.tableName, evt.rowIds, evt.status);
        }, bc));
        return this;
    }
    /**
     * Stop listening.
     */
    detach() {
        this._unsubs.forEach((fn) => fn());
        this._unsubs = [];
    }
    // ── Main API ──────────────────────────────────────────────────────────────
    /**
     * Process a batch of plain row objects from the Service Worker.
     * @param {string} tableName
     * @param {any[]} rows
     */
    process(tableName, rows) {
        var _a, _b;
        for (const rowObj of rows) {
            if (!(rowObj === null || rowObj === void 0 ? void 0 : rowObj.id))
                continue;
            ;
            const key = `${tableName}:${rowObj.id}`;
            let row;
            let event = 'update';
            if (this._registry.has(key)) {
                row = this._registry.get(key);
                row.cloneFrom(rowObj);
                (_a = this._onUpdate) === null || _a === void 0 ? void 0 : _a.call(this, row);
            }
            else {
                const data = this._makeReactive ? this._makeReactive(Object.assign({}, rowObj)) : Object.assign({}, rowObj);
                row = new Row_1.Row(tableName, data, this);
                this._register(key, tableName, row);
                (_b = this._onCreate) === null || _b === void 0 ? void 0 : _b.call(this, row);
                if (this._onDispose)
                    row.onDispose(this._onDispose);
                event = 'create';
            }
            (0, config_1.getIdList)(tableName, row).forEach((idList) => {
                (0, EventEmitter_1.emit)('tables', idList, { event, row });
            });
        }
    }
    /**
     * Handle server-reported deletions.
     * @param {string} tableName
     * @param {string[]} ids
     */
    processDeleted(tableName, ids) {
        for (const id of ids) {
            const key = `${tableName}:${id}`;
            const row = this._registry.get(key);
            if (!row)
                continue;
            if (row[Row_1.ROW.DISPOSABLE]) {
                row.dispose();
            }
            else {
                row[Row_1.ROW.DATA].deleted = true;
            }
        }
    }
    // ── Lookups ───────────────────────────────────────────────────────────────
    /**
     * Get the unique Row for a (tableName, id) pair.
     */
    get(tableName, id) {
        return this._registry.get(`${tableName}:${id}`);
    }
    /**
     * All live (non-disposed) Rows for a table.
     */
    getTable(tableName) {
        const keys = this._tableIndex.get(tableName);
        if (!keys)
            return [];
        const rows = [];
        for (const key of keys) {
            const row = this._registry.get(key);
            if (row && !row[Row_1.ROW.DISPOSED])
                rows.push(row);
        }
        return rows;
    }
    /**
     * Total number of live Row instances.
     */
    get size() { return this._registry.size; }
    // ── Promise-based getter ──────────────────────────────────────────────────
    /**
     * Get or wait for a Row.
     */
    waitFor(tableName, id, timeout = 5000) {
        const existing = this.get(tableName, id);
        if (existing)
            return Promise.resolve(existing);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                unsub();
                reject(new Error(`[ObjectGarbage] waitFor(${tableName}, ${id}) timed out`));
            }, timeout);
            const unsub = (0, broadcast_1.listenFor)(broadcast_1.EVT.ROWS_CHANGED, (evt) => {
                if (evt.tableName !== tableName)
                    return;
                const row = this.get(tableName, id);
                if (row) {
                    clearTimeout(timer);
                    unsub();
                    resolve(row);
                }
            });
        });
    }
    // ── Bulk dispose ──────────────────────────────────────────────────────────
    /**
     * Dispose every registered Row.
     */
    disposeAll() {
        for (const row of [...this._registry.values()]) {
            row.dispose();
        }
        this._tableIndex.clear();
    }
    // ── Called by Row.dispose() ───────────────────────────────────────────────
    /**
     * Remove a Row from the registry.
     */
    _remove(key) {
        var _a;
        const row = this._registry.get(key);
        if (!row)
            return;
        this._registry.delete(key);
        (_a = this._tableIndex.get(row[Row_1.ROW.TABLE_NAME])) === null || _a === void 0 ? void 0 : _a.delete(key);
    }
    // ── Private ───────────────────────────────────────────────────────────────
    _register(key, tableName, row) {
        this._registry.set(key, row);
        if (!this._tableIndex.has(tableName)) {
            this._tableIndex.set(tableName, new Set());
        }
        this._tableIndex.get(tableName).add(key);
    }
    /**
     * Update syncStatus in the data payload of affected rows.
     */
    _applySyncStatus(tableName, rowIds, status) {
        for (const id of rowIds) {
            const row = this.get(tableName, id);
            if (row)
                row[Row_1.ROW.DATA].syncStatus = status;
        }
    }
}
exports.ObjectGarbage = ObjectGarbage;
