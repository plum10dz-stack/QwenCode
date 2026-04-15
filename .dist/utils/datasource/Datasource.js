"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Datasource = exports.UPDATE_DATE_KEY = void 0;
const EventEmitter_1 = require("../EventEmitter");
/** localStorage key for the last sync timestamp */
exports.UPDATE_DATE_KEY = 'stockos-updateDate';
/**
 * Abstract base class for all store implementations.
 * ServerStore, IndexedDBStore, and SQLiteStore all extend this class.
 */
class Datasource extends EventEmitter_1.EventEmitter {
    constructor() {
        super();
        // ── updateDate (sync checkpoint) ────────────────────────────────────────────
        //
        // IMPORTANT: localStorage is not available in Service Worker scope.
        // In the SW, lastTimeUpdate is stored in IndexedDB via LocalDB.keyValue().
        // This base-class property is kept only for main-thread (ServerStore) use.
        // Never access it from sw/ code — call localDB.getLastTimeUpdate() instead.
        this._updateDate = new Date(0);
        /** Timestamp of the last event received from the data source */
        this._eventDate = new Date(0);
        this._listeners = [];
    }
    /** Last known server sync point. Reads localStorage on the main thread; falls back to epoch in SW. */
    get updateDate() {
        try {
            // `localStorage` is undefined in SW scope — this will throw.
            const v = localStorage.getItem(exports.UPDATE_DATE_KEY);
            return v ? new Date(v) : this._updateDate;
        }
        catch (_a) {
            return this._updateDate;
        }
    }
    /** Persists the sync checkpoint. No-op in SW scope (IDB is used there instead). */
    set updateDate(value) {
        this._updateDate = value;
        try {
            localStorage.setItem(exports.UPDATE_DATE_KEY, value.toISOString());
        }
        catch (_a) {
            // Service Worker — silently ignore; LocalDB.setLastTimeUpdate() is the
            // authoritative store in that context.
        }
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
exports.Datasource = Datasource;
