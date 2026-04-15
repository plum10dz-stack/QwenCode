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
exports.Memory = void 0;
//import { Table } from '../../data/core/Table';
//import { TABLE_NAMES } from '../schema';
const Store_1 = require("./Store");
const config_1 = require("../../flow/config");
const Table_1 = require("../data/Table");
/**
 * Memory — the reactive working layer consumed by the UI.
 */
class Memory extends Store_1.Store {
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
    getAll(tableName) {
        throw new Error('Method not implemented.');
    }
    applyDelta(tableName, delta) {
        throw new Error('Method not implemented.');
    }
    constructor(serverStore) {
        super();
        this.serverStore = serverStore;
        this.tables = new Map();
        // Create one Table instance for every table in the schema
        for (const name in config_1.StockOS_CONFIG.TABLES) {
            this.tables.set(name, new Table_1.Table(name, name));
        }
        // Wire up live-sync
        serverStore === null || serverStore === void 0 ? void 0 : serverStore.onSourceEvent((event, payload) => {
            this._onDelta(event, payload);
        });
    }
    /**
     * Return a Table by name with strict type checking.
     */
    table(name) {
        const t = this.tables.get(name);
        if (!t) {
            throw new Error(`Memory: unknown table "${name}"`);
        }
        return t;
    }
    /**
     * Initialise all tables from the store.
     */
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            // Step 1 — sync with backend
            yield this.serverStore.init();
            // Step 2 — load every table from LocalStore or ServerStore
            const source = (_a = this.serverStore.LocalStore) !== null && _a !== void 0 ? _a : this.serverStore;
            yield Promise.all(config_1.TABLE_NAMES.map((name) => __awaiter(this, void 0, void 0, function* () {
                const rows = yield source.getAll(name);
                this.table(name).hydrate(rows);
            })));
        });
    }
    /**
     * Apply a server-push delta to the relevant Table.
     */
    _onDelta(event, delta) {
        const { tableName } = delta;
        const t = this.tables.get(tableName);
        if (!t)
            return;
        t.applyDelta(delta);
    }
}
exports.Memory = Memory;
/**
 * Payload interface for incoming server events.
 */
