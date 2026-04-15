"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.ServerStore = void 0;
const Datasource_1 = require("./Datasource");
const helpers_js_1 = require("../helpers.js");
const cache_1 = __importStar(require("../cache"));
/**
 * ServerStore — talks to the remote API over HTTP and WebSocket.
 *
 * Architecture position:
 *   API Server  ──HTTP/WS──►  ServerStore  ──►  IndexedDBStore (LocalStore)
 *                                            └──►  Memory (via onSourceEvent)
 *
 * When there is no API server configured (VITE_API_URL is empty),
 * ServerStore operates in offline mode: it delegates everything to
 * IndexedDBStore directly and never opens a WebSocket.
 */
class ServerStore extends Datasource_1.Datasource {
    /**
     * Apply a server delta directly to the local IndexedDB store.
     * Called by the WebSocket message handler and by init().
     */
    applyDelta(tableName, delta) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this._local.applyDelta(tableName, delta);
        });
    }
    /**
     * @param {IndexedDBStore} localStore
     * @param {{ apiUrl?: string, wsUrl?: string }} opts
     */
    constructor(localStore, opts = {}) {
        super();
        // ── WebSocket live-sync ──────────────────────────────────────────────────────
        this._wsBackoff = 1000;
        this._local = localStore;
        this._apiUrl = opts.apiUrl || cache_1.default.API_URL || '';
        this._wsUrl = opts.wsUrl || cache_1.default.WS_URL || '';
        /** @type {boolean} */
        this._online = !!this._apiUrl;
    }
    get LocalStore() { return this._local; }
    // ── Helpers ──────────────────────────────────────────────────────────────────
    _fetch(path_1) {
        return __awaiter(this, arguments, void 0, function* (path, opts = {}) {
            if (!this._online)
                throw new Error('No API server configured (offline mode)');
            const res = yield (0, cache_1.fetch)(`${this._apiUrl}${path}`, Object.assign(Object.assign({ headers: Object.assign({ 'Content-Type': 'application/json' }, opts.headers) }, opts), { body: opts.body ? JSON.stringify(opts.body) : undefined }));
            if (!res.ok)
                throw new Error(`API ${opts.method || 'GET'} ${path} → ${res.status}`);
            return res.json();
        });
    }
    _connectWS() {
        if (!this._wsUrl || this._ws)
            return;
        try {
            this._ws = new WebSocket(this._wsUrl);
            this._ws.onopen = () => { this._wsBackoff = 1000; }; // reset on success
            this._ws.onmessage = e => {
                try {
                    const msg = JSON.parse(e.data);
                    // Expected: { event, tableName, deletes, updates, eventTime }
                    this.updateDate = new Date(msg.eventTime);
                    this._local.applyDelta(msg.tableName, msg);
                    this._emit(msg.event, Object.assign(Object.assign({}, msg), { eventTime: new Date(msg.eventTime) }));
                }
                catch ( /* ignore malformed messages */_a) { /* ignore malformed messages */ }
            };
            this._ws.onclose = () => {
                this._ws = undefined;
                // Exponential backoff: 1 s, 2 s, 4 s … up to 30 s
                const delay = Math.min(this._wsBackoff, 30000);
                this._wsBackoff = Math.min(this._wsBackoff * 2, 30000);
                setTimeout(() => this._connectWS(), delay);
            };
        }
        catch ( /* WS unavailable — stay offline */_a) { /* WS unavailable — stay offline */ }
    }
    // ── Store interface ───────────────────────────────────────────────────────────
    getNewId(tableName) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this._online)
                return (0, helpers_js_1.uuid)();
            try {
                const { id } = yield this._fetch(`/api/new-id/${tableName}`);
                return id;
            }
            catch (_a) {
                return (0, helpers_js_1.uuid)();
            }
        });
    }
    newRow(tableName) {
        return __awaiter(this, void 0, void 0, function* () {
            const id = yield this.getNewId(tableName);
            return { id, created_at: (0, helpers_js_1.now)() };
        });
    }
    auth(user, callback) {
        return __awaiter(this, void 0, void 0, function* () {
        });
    }
    /**
     * Pull delta updates from the server into LocalStore.
     * Falls back to LocalStore-only init when offline.
     */
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            // Always ensure LocalStore (IndexedDB) is open
            yield this._local.init();
            if (!this._online) {
                // Offline mode — nothing to pull from the server
                return this;
            }
            try {
                const since = this.updateDate.toISOString();
                // API returns: { tables: { [tableName]: { deletes, updates, eventTime } } }
                const delta = yield this._fetch(`/api/sync?since=${encodeURIComponent(since)}`);
                for (const [tableName, change] of Object.entries(delta.tables || {})) {
                    yield this._local.applyDelta(tableName, change);
                    this.updateDate = new Date(change.eventTime);
                }
            }
            catch (err) {
                console.warn('ServerStore.init(): could not reach API, serving from local cache.', err.message);
            }
            // Open WebSocket for live updates
            this._connectWS();
            return this;
        });
    }
    getAll(tableName) {
        return __awaiter(this, void 0, void 0, function* () {
            // Always served from LocalStore — never from network on read
            return this._local.getAll(tableName);
        });
    }
    saveRow(tableName, row) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._online) {
                try {
                    // Optimistic write to LocalStore first; let server confirm
                    const saved = yield this._local.saveRow(tableName, row);
                    // Fire-and-forget to the API; if it fails we still have the local copy
                    this._fetch(`/api/${tableName}`, {
                        method: row.id && this._local.rows ? 'PUT' : 'POST',
                        body: saved,
                    }).catch(err => console.warn('ServerStore.saveRow sync failed:', err.message));
                    return saved;
                }
                catch (err) {
                    console.warn('ServerStore.saveRow local failed:', err.message);
                    throw err;
                }
            }
            // Offline — delegate entirely to LocalStore
            return this._local.saveRow(tableName, row);
        });
    }
    deleteRow(tableName, id) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this._local.deleteRow(tableName, id);
            if (this._online) {
                this._fetch(`/api/${tableName}/${id}`, { method: 'DELETE' })
                    .catch(err => console.warn('ServerStore.deleteRow sync failed:', err.message));
            }
        });
    }
}
exports.ServerStore = ServerStore;
