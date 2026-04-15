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
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _a, _ObjectGarbage_instance, _ObjectGarbage_channel;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObjectGarbage = void 0;
const Row_1 = require("./data/Row");
const config_1 = require("../workspace/config");
const EventEmitter_1 = require("./EventEmitter");
const data_1 = require("./data");
const helpers_1 = require("./helpers");
const vue_1 = require("vue");
class ObjectGarbage {
    /**
     * @param {ObjectGarbageOptions} [opts]
     */
    constructor(opts) {
        _ObjectGarbage_channel.set(this, void 0);
        /**
         * Secondary index: tableName → Set<registryKey>.
         */
        this._tableIndex = new Map();
        /** BC unsubscribe callbacks */
        this._unsubs = [];
        this._registry = new Map();
        __classPrivateFieldSet(this, _ObjectGarbage_channel, opts.channel, "f");
        this._onCreate = opts.onCreate;
        this._onUpdate = opts.onUpdate;
        this._onDispose = opts.onDispose;
        const self = this;
        this._tableOptions = {
            newID(table, data) {
                return __awaiter(this, void 0, void 0, function* () {
                    return (0, helpers_1.uuid)();
                });
            },
            newRow(table, data) {
                return __awaiter(this, void 0, void 0, function* () {
                    return (0, vue_1.reactive)(new Row_1.Row(table.tableName, data, self));
                });
            }
        };
        if (opts.channel)
            this.listenForChannelEvents();
    }
    static instance(opts) {
        if (!__classPrivateFieldGet(_a, _a, "f", _ObjectGarbage_instance)) {
            __classPrivateFieldSet(_a, _a, new _a(opts), "f", _ObjectGarbage_instance);
        }
        return __classPrivateFieldGet(_a, _a, "f", _ObjectGarbage_instance);
    }
    // ── Lifecycle ─────────────────────────────────────────────────────────────
    listenForChannelEvents() {
        const ch = __classPrivateFieldGet(this, _ObjectGarbage_channel, "f");
        this._unsubs.push(ch.listenFor(config_1.DbEvents.ROWS_CHANGED, (evt) => {
            var _b;
            this.process(evt.tableName, (_b = evt.rows) !== null && _b !== void 0 ? _b : []);
        }), ch.listenFor(config_1.DbEvents.ROWS_DELETED, (evt) => {
            var _b;
            this.processDeleted(evt.tableName, (_b = evt.ids) !== null && _b !== void 0 ? _b : []);
        }), ch.listenFor(config_1.DbEvents.SYNC_STATUS, ({ payload: evt }) => {
            this._applySyncStatus(evt.tableName, evt.rowIds, evt.status);
        }));
    }
    /**
     * Stop listening.
     */
    detach() {
        this._unsubs.forEach((fn) => fn());
        this._unsubs.length = 0;
    }
    // ── Main API ──────────────────────────────────────────────────────────────
    /**
     * Process a batch of plain row objects from the Service Worker.
     * @param {string} tableName
     * @param {any[]} rows
     */
    process(tableName, rows) {
        var _b, _c;
        const table = this.getTable(tableName);
        const e = { gc: this, table };
        for (const rowObj of rows) {
            if (!(rowObj === null || rowObj === void 0 ? void 0 : rowObj.id))
                continue;
            ;
            const key = `${tableName}:${rowObj.id}`;
            let row;
            let event = 'update';
            if (this._registry.has(key)) {
                row = this._registry.get(key);
                if (row === rowObj)
                    continue;
                row.cloneFrom(rowObj);
                (_b = this._onUpdate) === null || _b === void 0 ? void 0 : _b.call(this, row, e);
            }
            else {
                row = (0, vue_1.ref)(new Row_1.Row(tableName, rowObj, this));
                this._register(key, table, row);
                (_c = this._onCreate) === null || _c === void 0 ? void 0 : _c.call(this, row, e);
                if (this._onDispose)
                    row.onDispose(this._onDispose);
                event = 'create';
            }
            (0, config_1.getIdList)(config_1.StockOS_CONFIG, tableName, row).forEach((idList) => {
                (0, EventEmitter_1.emit)('tables', idList, { event, row, table });
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
        let _table = this._tableIndex.get(tableName);
        if (_table)
            return _table;
        const table = (0, vue_1.reactive)(new data_1.Table(tableName, tableName, this._tableOptions));
        this._tableIndex.set(tableName, table);
        return table;
    }
    /**
     * Total number of live Row instances.
     */
    get size() { return this._registry.size; }
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
        var _b;
        const row = this._registry.get(key);
        if (!row)
            return;
        this._registry.delete(key);
        (_b = this._tableIndex.get(row[Row_1.ROW.TABLE_NAME])) === null || _b === void 0 ? void 0 : _b.delete(key);
    }
    // ── Private ───────────────────────────────────────────────────────────────
    _register(key, table, row) {
        this._registry.set(key, row);
        table.push(row);
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
_a = ObjectGarbage, _ObjectGarbage_channel = new WeakMap();
_ObjectGarbage_instance = { value: void 0 };
