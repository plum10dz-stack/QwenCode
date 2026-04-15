"use strict";
/// <reference path="../../../api/database/types/schema.d.ts" />
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerDB = void 0;
const Datasource_1 = require("./Datasource");
const http_1 = require("../networking/http");
const dbStream_1 = require("../../workspace/routers/dbStream");
class ServerDB extends Datasource_1.Datasource {
    // ── Abstract implementations (required by Datasource) ────────────────────
    /**
     * Receives a per-table delta from the poll or stream cycle and emits the
     * 'updates' event so the listener in `sw/init.ts` can apply it to LocalDB.
     *
     * Merges `updates` and `deletes` into a single array where deleted rows
     * carry `deleted: true` — matching the shape LocalDB.applyServerUpdates
     * expects.
     */
    applyDelta(tableName, delta) {
        return __awaiter(this, void 0, void 0, function* () {
            const merged = [
                ...delta.updates,
                ...delta.deletes.map(r => (Object.assign(Object.assign({}, r), { deleted: true }))),
            ];
            if (!merged.length)
                return;
            this.emit('updates', {
                data: { [tableName]: merged },
                time: Date.now(),
            });
        });
    }
    getNewId(_tableName) {
        throw new Error('ServerDB.getNewId: IDs are assigned by the server.');
    }
    newRow(_tableName) {
        throw new Error('ServerDB.newRow: rows originate from the server.');
    }
    auth(_user, _callback) {
        throw new Error('ServerDB.auth: use the http auth layer directly.');
    }
    init() {
        return Promise.resolve(this);
    }
    saveRow(tableName, row) {
        return this.create(tableName, row);
    }
    deleteRow(tableName, id) {
        return this.delete(tableName, String(id));
    }
    getAll(tableName) {
        return this._post(tableName, 'getAll', {}).then(r => { var _a; return ((_a = r.data) !== null && _a !== void 0 ? _a : []); });
    }
    constructor(API_BASE) {
        super();
        this.API_BASE = API_BASE;
        // ── Private state ─────────────────────────────────────────────────────────
        this._running = false;
        this._postQueue = Promise.resolve();
        this._streamAbort = null;
        this._isStreaming = false;
    }
    // ── Polling ───────────────────────────────────────────────────────────────
    /**
     * One-shot delta fetch: pull all rows updated since `since` from the
     * server and emit a single 'updates' event so LocalDB can apply them all
     * in one transaction batch.
     *
     * Use this on SW boot (catch-up) and as the polling fallback body.
     */
    sync() {
        return __awaiter(this, arguments, void 0, function* (since = new Date(0)) {
            const tables = yield this.getUpdates(since);
            if (!tables || typeof tables !== 'object')
                return;
            this.emit('updates', { data: tables, time: Date.now() });
        });
    }
    /**
     * Open the Server-Sent Events stream and block until it closes or is
     * aborted. Each parsed {@link StreamChunk} is turned into an 'updates'
     * event via `applyDelta`.
     *
     * The caller is responsible for reconnect / backoff logic.
     * Call `stopStream()` to abort cleanly from the outside.
     */
    connectStream() {
        return __awaiter(this, arguments, void 0, function* (since = new Date(0)) {
            var _a, e_1, _b, _c;
            if (this._isStreaming) {
                console.warn('[ServerDB] connectStream called while already streaming — ignoring.');
                return;
            }
            const sinceMs = since instanceof Date ? since.getTime() : Number(since || 0);
            this._streamAbort = new AbortController();
            this._isStreaming = true;
            try {
                try {
                    for (var _d = true, _e = __asyncValues((0, dbStream_1.streamChanges)(sinceMs, this._streamAbort.signal)), _f; _f = yield _e.next(), _a = _f.done, !_a; _d = true) {
                        _c = _f.value;
                        _d = false;
                        const chunk = _c;
                        if (!this._isStreaming)
                            break;
                        yield this.applyDelta(chunk.table, {
                            updates: chunk.rows,
                            deletes: chunk.deletes,
                        });
                        // Let init.ts persist the server-authoritative timestamp.
                        this.emit('stream:tick', { time: chunk.time });
                    }
                }
                catch (e_1_1) { e_1 = { error: e_1_1 }; }
                finally {
                    try {
                        if (!_d && !_a && (_b = _e.return)) yield _b.call(_e);
                    }
                    finally { if (e_1) throw e_1.error; }
                }
            }
            finally {
                this._isStreaming = false;
                this._streamAbort = null;
            }
        });
    }
    /**
     * Gracefully abort the active SSE stream.
     * `connectStream` will return (and its finally block cleans up state).
     */
    stopStream() {
        var _a;
        this._isStreaming = false;
        (_a = this._streamAbort) === null || _a === void 0 ? void 0 : _a.abort();
        this._streamAbort = null;
    }
    startPolling() {
        if (this._running)
            return;
        this._running = true;
        this.emit('startPolling');
    }
    stopPolling() {
        if (!this._running)
            return;
        this._running = false;
        this.emit('stopPolling');
    }
    // ── Server API — all POST ─────────────────────────────────────────────────
    /**
     * action: "system.getUpdates"  params: { since: ISO string }
     * Returns Record<tableName, Row[]>
     */
    getUpdates(since) {
        return __awaiter(this, void 0, void 0, function* () {
            const iso = since instanceof Date ? since.toISOString() :
                typeof since === 'number' ? new Date(since).toISOString() :
                    since;
            return (yield this._post('system', 'getUpdates', { since: iso })).data;
        });
    }
    /** action: "{tableName}.get"  params: { id } */
    get(tableName, id) {
        return __awaiter(this, void 0, void 0, function* () {
            return (yield this._post(tableName, 'get', { id })).data;
        });
    }
    /** action: "{tableName}.create"  params: { ...rowData } */
    create(tableName, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return (yield this._post(tableName, 'create', data)).data;
        });
    }
    /**
     * action: "{tableName}.update"  params: { id, ...changes }
     * Server merges & bumps updated_at via trigger.
     */
    update(tableName, id, changes) {
        return __awaiter(this, void 0, void 0, function* () {
            return (yield this._post(tableName, 'update', Object.assign({ id }, changes))).data;
        });
    }
    /** action: "{tableName}.delete"  params: { id }  — server soft-deletes */
    delete(tableName, id) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this._post(tableName, 'delete', { id });
        });
    }
    // ── Internal — thread-safe sequential POST queue ──────────────────────────
    /**
     * All server writes are serialised through a promise chain so concurrent
     * callers never interleave requests on the same connection.
     * Errors are caught on the chain so one failure never blocks future calls.
     */
    _post(tableName, method, data) {
        const task = () => __awaiter(this, void 0, void 0, function* () {
            const action = `${tableName}/${method}`;
            return http_1.http.fetch({
                route: action,
                method: 'POST',
                body: JSON.stringify({ action, params: data }),
            });
        });
        const queuedTask = this._postQueue.then(() => task());
        // Swallow the error on the chain to keep future calls unblocked.
        // The error still propagates to the original caller via queuedTask.
        this._postQueue = queuedTask.catch(() => undefined);
        return queuedTask;
    }
}
exports.ServerDB = ServerDB;
