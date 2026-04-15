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
var _Table_unsubs, _Table_eventChannel;
Object.defineProperty(exports, "__esModule", { value: true });
exports.Table = void 0;
const Row_1 = require("./Row");
const fastArray_1 = require("../fastArray");
const EventEmitter_1 = require("../EventEmitter");
class Table extends fastArray_1.FastArray {
    save(row) {
        return __awaiter(this, void 0, void 0, function* () {
            const id = row.id;
            if (!id)
                row.id = yield this.opts.newID(this, row);
            if (row instanceof Row_1.Row) {
            }
            else {
                const existing = this.getById(id);
                row = existing ? existing.cloneFrom(row) : yield this.opts.newRow(this, row);
            }
            return this.upsert(row);
        });
    }
    new(data_1) {
        return __awaiter(this, arguments, void 0, function* (data, upsert = true) {
            const row = yield this.opts.newRow(this, data);
            if (upsert)
                return this.upsert(row);
            this.push(row);
            return row;
        });
    }
    constructor(tableID, tableName, opts) {
        super(undefined, 'id');
        this.opts = opts;
        /** Unsubscribe callbacks */
        _Table_unsubs.set(this, []);
        _Table_eventChannel.set(this, void 0);
        this.tableName = tableName;
        __classPrivateFieldSet(this, _Table_eventChannel, tableID, "f");
        __classPrivateFieldGet(this, _Table_unsubs, "f").push((0, EventEmitter_1.on)('tables', tableID, (evt) => {
            if (evt.event === 'create')
                this.upsert(evt.row);
            else if (evt.event === 'update')
                this.upsert(evt.row);
            else if (evt.event === 'delete')
                this.delete(evt.row);
        }));
    }
    // ── Public API ────────────────────────────────────────────────────────────
    _validateItem(item) {
        if (!(item instanceof Row_1.Row)) {
            throw new TypeError('Item must be an instance of Row.');
        }
        if (!item.id) {
            throw new TypeError(`Item key "${String(this._idKey)}" must be valid.`);
        }
        if (item.tableName !== this.tableName) {
            throw new TypeError(`Item table name "${item.tableName}" must match table name "${this.tableName}".`);
        }
    }
    /**
     * Populate rows from an initial snapshot.
     * Typically called once on component mount with data from Orchestrator.getAll().
     */
    hydrate(rows) {
        this.splice(0, this.length, ...rows);
    }
    applyDelta({ deletes = [], updates = [] }) {
        throw new Error('Method not implemented.');
    }
    /**
     * Stop listening for broadcast events.
     * Always call this on component/module unmount to prevent memory leaks.
     */
    destroy() {
        __classPrivateFieldGet(this, _Table_unsubs, "f").forEach((fn) => fn());
        __classPrivateFieldSet(this, _Table_unsubs, [], "f");
        super.destroy();
    }
}
exports.Table = Table;
_Table_unsubs = new WeakMap(), _Table_eventChannel = new WeakMap();
