"use strict";
/**
 * src/flow/sw/ServerDB.js
 *
 * Communicates exclusively with the server API.
 *
 * Protocol: every call is
 *   POST  <API_BASE>/api
 *   Body  { action: "<tableName>.<method>", data: { ...params } }
 *
 * The polling action is "system.getUpdates" with data: { since: ISO }.
 * The server returns rows whose updated_at > since across all tables.
 *
 * Runs inside the Service Worker.
 */
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
exports.ServerDB = void 0;
const Store_1 = require("./Store");
const help_1 = require("../../help");
class ServerDB extends Store_1.Store {
    applyDelta(tableName, delta) {
        throw new Error('Method not implemented.');
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
    init() {
        return Promise.resolve();
    }
    saveRow(tableName, row) {
        throw new Error('Method not implemented.');
    }
    deleteRow(tableName, id) {
        throw new Error('Method not implemented.');
    }
    /**
     * @param {import('../flow/config.js').StockOS_CONFIG} config
     
     */
    constructor(config) {
        super();
        this._cfg = config;
        this._running = false;
        /** ISO last acknowledged by LocalDB after a successful delta apply */
        /** Queue to ensure _post requests are executed sequentially */
        this._postQueue = Promise.resolve();
    }
    // ── Polling ───────────────────────────────────────────────────────────────
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
    /** action: "system.getUpdates"  data: { since } */
    getUpdates(since) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this._post('system', 'getUpdates', { since });
        });
    }
    /** action: "{tableName}.getAll"  data: {} */
    getAll(tableName) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this._post(tableName, 'getAll', {});
        });
    }
    /** action: "{tableName}.get"  data: { id } */
    get(tableName, id) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this._post(tableName, 'get', { id });
        });
    }
    /** action: "{tableName}.create"  data: { ...rowData } */
    create(tableName, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this._post(tableName, 'create', data);
        });
    }
    /**
     * action: "{tableName}.update"  data: { id, ...changes }
     * Server merges changes and bumps updated_at via trigger.
     */
    update(tableName, id, changes) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this._post(tableName, 'update', Object.assign({ id }, changes));
        });
    }
    /** action: "{tableName}.delete"  data: { id } — server soft-deletes */
    delete(tableName, id) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this._post(tableName, 'delete', { id });
        });
    }
    // ── Single POST endpoint ──────────────────────────────────────────────────
    // make this _post thread safe  
    _post(tableName, method, data) {
        const task = () => __awaiter(this, void 0, void 0, function* () {
            const action = `${tableName}.${method}`;
            const res = yield (0, help_1.fetch)(`${this._cfg.API_BASE}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ action, params: data }),
            }, "");
            if (!res.ok) {
                let body = '';
                try {
                    body = yield res.text();
                }
                catch (_a) { }
                throw new Error(`[ServerDB] ${action} → HTTP ${res.status}: ${body}`);
            }
            return res.json();
        });
        const queuedTask = this._postQueue.then(() => task());
        this._postQueue = queuedTask.catch((e) => { ; });
        return queuedTask;
    }
}
exports.ServerDB = ServerDB;
