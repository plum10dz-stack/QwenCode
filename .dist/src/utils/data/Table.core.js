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
exports.Table = void 0;
const vue_1 = require("vue");
/**
 * Interface representing the Store dependency.
 * Adjust the return types/parameters based on your actual Store.js implementation.
 */
// export interface Store {
//   newRow<T>(tableName: string): Promise<T>;
//   saveRow<T>(tableName: string, row: T): Promise<T>;
//   deleteRow(tableName: string, id: string | number): Promise<void>;
// }
/**
 * Reactive in-memory cache for a single database table.
 */
class Table {
    constructor(name, store) {
        this.name = name;
        this._store = store;
        // In Vue 3, reactive arrays behave like standard arrays 
        // but maintain reactivity for the UI.
        this.rows = (0, vue_1.reactive)([]);
    }
    /**
     * Seed the cache from an already-fetched array.
     * @internal
     */
    _hydrate(rows) {
        this.rows.splice(0, this.rows.length, ...rows);
    }
    /**
     * Apply a server-push delta event.
     * @internal
     */
    _applyDelta({ deletes = [], updates = [] }) {
        for (const { id } of deletes) {
            const i = this.rows.findIndex((r) => r.id === id);
            if (i > -1)
                this.rows.splice(i, 1);
        }
        for (const row of updates) {
            const i = this.rows.findIndex((r) => r.id === row.id);
            if (i > -1) {
                this.rows[i] = row;
            }
            else {
                this.rows.push(row);
            }
        }
    }
    // ── Public API ───────────────────────────────────────────────────────────────
    /**
     * Allocate a new empty row object — does NOT insert into DB.
     */
    newRow() {
        return __awaiter(this, void 0, void 0, function* () {
            return this._store.newRow(this.name);
        });
    }
    /**
     * Persist a row (create or update).
     * Writes to the store first; updates the local cache only on success.
     */
    save(row) {
        return __awaiter(this, void 0, void 0, function* () {
            const saved = yield this._store.saveRow(this.name, row);
            const i = this.rows.findIndex((r) => r.id === saved.id);
            if (i > -1) {
                this.rows[i] = saved;
            }
            else {
                this.rows.push(saved);
            }
            return saved;
        });
    }
    /**
     * Delete a row by id.
     * Removes from store first; removes from cache only on success.
     */
    delete(id) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this._store.deleteRow(this.name, id);
            const i = this.rows.findIndex((r) => r.id === id);
            if (i > -1) {
                this.rows.splice(i, 1);
            }
        });
    }
    /**
     * Find a row by id (synchronous, reads from cache).
     */
    find(id) {
        return this.rows.find((r) => r.id === id);
    }
}
exports.Table = Table;
