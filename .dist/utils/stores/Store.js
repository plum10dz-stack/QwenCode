"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Store = void 0;
const EventEmitter_1 = require("../EventEmitter");
const schema_1 = require("../../data/schema");
/**
 * Abstract base class for all store implementations.
 * ServerStore, IndexedDBStore, and SQLiteStore all extend this class.
 */
class Store extends EventEmitter_1.EventEmitter {
    constructor() {
        super();
        /** Timestamp of the last event received from the data source */
        this._eventDate = new Date(0);
        this._listeners = [];
    }
    // ── updateDate (persisted in localStorage) ──────────────────────────────────
    /** @returns Last known server sync point, read from localStorage */
    get updateDate() {
        const v = localStorage.getItem(schema_1.UPDATE_DATE_KEY);
        return v ? new Date(v) : new Date(0);
    }
    /** @param value - The date to persist as the sync checkpoint */
    set updateDate(value) {
        localStorage.setItem(schema_1.UPDATE_DATE_KEY, value.toISOString());
    }
    // ── eventDate (in-memory, reset each session) ────────────────────────────────
    get eventDate() {
        return this._eventDate;
    }
    // ── onSourceEvent ────────────────────────────────────────────────────────────
    /**
     * Subscribe to data change events raised when the underlying source changes.
     */
    onSourceEvent(callback) {
        this._listeners.push(callback);
    }
    /** Internal — fire all listeners */
    _emit(event, payload) {
        this._eventDate = payload.eventTime;
        for (const fn of this._listeners) {
            fn(event, payload);
        }
    }
    /** The nested local cache store. null for leaf stores. */
    get LocalStore() {
        return null;
    }
}
exports.Store = Store;
