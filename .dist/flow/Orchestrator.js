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
exports.Orchestrator = exports.garbage = void 0;
exports.getUrl = getUrl;
const broadcast_1 = require("../utils/channels/broadcast");
const Table_1 = require("../utils/data/Table");
const ObjectGarbage_1 = require("../utils/ObjectGarbage");
const channels_1 = require("../utils/channels");
/**
 * using SmartGraph to fetch all tables from ServiceWorker and create tables and start listen events from broadcast channel
 */
function getTablesFromDB() {
    self.serviceWorker.controller.postMessage({ type: broadcast_1.DbEvents.CMD_GET_ALL_TABLES });
}
exports.garbage = new ObjectGarbage_1.ObjectGarbage({
    channel: channels_1.swChannel,
    onCreate: (row) => {
    },
    onUpdate: (row) => {
    },
    onDispose: (row) => {
    }
});
/**
 * Path to the Service Worker script, relative to the web root.
 * Adjust if you place worker.js at a different URL.
 */
const SW_URL = '/flow/sw/worker.js';
// @ts-ignore
const moduleUrl = new URL(import.meta.url, document.URL);
/**
 * Resolve the service worker URL relative to a base URL,
 * and return it without any query parameters.
 *
 * @param {string|URL} [base=moduleUrl] - Base URL to resolve against.
 * @returns {URL} A URL object pointing to "sw/worker.js" with no params.
 */
function getUrl(base = moduleUrl) {
    const baseUrl = typeof base === 'string'
        ? new URL(base, location.href)
        : base;
    const g = new URL('worker.js', baseUrl);
    // Remove all query parameters
    g.search = '';
    return g;
}
class Orchestrator {
    /**
     * @param {OrchestratorOptions} [opts]
     */
    constructor(opts = {}) {
        var _a, _b;
        this._jwt = null;
        this._online = navigator.onLine;
        this._serverReachable = false;
        this._swReady = false;
        this._gc = (_a = opts.gc) !== null && _a !== void 0 ? _a : null;
        this._swUrl = (_b = opts.swUrl) !== null && _b !== void 0 ? _b : SW_URL;
        this._watchNetwork();
        this._watchSW();
    }
    // ── Lifecycle ─────────────────────────────────────────────────────────────
    /**
     * Register the Service Worker, wait for PONG, then send SW_INIT with the
     * persisted watermark and current JWT (if any).
     *
     * Await this once during app start-up before issuing any data calls.
     */
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!('serviceWorker' in navigator)) {
                console.warn('[Orchestrator] Service Workers not supported in this browser.');
                return;
            }
            const reg = yield navigator.serviceWorker.register('./worker.js', { type: 'module', updateViaCache: 'imports', scope: '/' });
            // Wait up to 5 s for the SW to signal PONG
            yield new Promise((resolve) => {
                const timer = setTimeout(resolve, 5000);
                (0, broadcast_1.once)(broadcast_1.DbEvents.PONG, () => { clearTimeout(timer); resolve(); });
                (0, broadcast_1.broadcast)(broadcast_1.DbEvents.PING);
            });
            this._swReady = true;
            // Seed the SW with the persisted watermark and any existing JWT
            (0, broadcast_1.broadcast)(broadcast_1.DbEvents.SW_INIT, {
                jwt: this._jwt,
            });
        });
    }
    // ── ObjectGarbage ─────────────────────────────────────────────────────────
    /**
     * Attach an ObjectGarbage instance after construction.
     * @param {ObjectGarbage} gc
     * @returns {this}
     */
    setObjectGarbage(gc) {
        this._gc = gc;
        return this;
    }
    // ── Auth ──────────────────────────────────────────────────────────────────
    /**
     * Set the JWT.  Broadcasts it to the SW which starts polling and flushes
     * any queued offline operations.
     * @param {string} jwt
     */
    setJwt(jwt) {
        this._jwt = jwt;
        (0, broadcast_1.broadcast)(broadcast_1.DbEvents.AUTH_SET, { jwt });
    }
    /** Clear the JWT and stop server polling. */
    clearJwt() {
        this._jwt = null;
        (0, broadcast_1.broadcast)(broadcast_1.DbEvents.AUTH_CLEAR);
    }
    get isAuthenticated() { return !!this._jwt; }
    get isOnline() { return this._online; }
    get hasServer() { return this._online && this._serverReachable; }
    // ── Read ──────────────────────────────────────────────────────────────────
    /**
     * Get all non-deleted rows from a table (via Service Worker → IndexedDB).
     * Also feeds rows through gc.process() when ObjectGarbage is attached.
     *
     * @param {string} tableName
     * @returns {Promise<any[]>}
     */
    getAll(tableName) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const rows = (yield (0, broadcast_1.sendCommand)(broadcast_1.DbEvents.CMD_GET_ALL, { tableName })).data;
            const result = rows !== null && rows !== void 0 ? rows : [];
            (_a = this._gc) === null || _a === void 0 ? void 0 : _a.process(tableName, result);
            return result;
        });
    }
    /**
     * @param {string} tableName
     * @param {string} id
     * @returns {Promise<any|null>}
     */
    get(tableName, id) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const { data: row } = yield (0, broadcast_1.sendCommand)(broadcast_1.DbEvents.CMD_GET, { tableName, id });
            if (row)
                (_a = this._gc) === null || _a === void 0 ? void 0 : _a.process(tableName, [row]);
            return row !== null && row !== void 0 ? row : null;
        });
    }
    /**
     * @param {string} tableName
     * @param {string} indexName
     * @param {any}    value
     * @returns {Promise<any[]>}
     */
    getByIndex(tableName, indexName, value) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const { data: rows } = yield (0, broadcast_1.sendCommand)(broadcast_1.DbEvents.CMD_GET_BY_INDEX, { tableName, indexName, value });
            const result = rows !== null && rows !== void 0 ? rows : [];
            (_a = this._gc) === null || _a === void 0 ? void 0 : _a.process(tableName, result);
            return result;
        });
    }
    // ── Write ─────────────────────────────────────────────────────────────────
    /**
     * Create a row.  SW tries the server first; falls back to local + queue when
     * offline or unauthenticated.
     *
     * @param {string} tableName
     * @param {object} data  Should include a customer-generated UUID `id`.
     * @returns {Promise<any>}
     */
    create(tableName, data) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const result = yield (0, broadcast_1.sendCommand)(broadcast_1.DbEvents.CMD_CREATE, { tableName, data });
            const row = result.data;
            if (row)
                (_a = this._gc) === null || _a === void 0 ? void 0 : _a.process(tableName, [row]);
            return row;
        });
    }
    /**
     * @param {string} tableName
     * @param {string} id
     * @param {object} changes  Partial row.
     * @returns {Promise<any>}
     */
    update(tableName, id, changes) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const { data: row } = yield (0, broadcast_1.sendCommand)(broadcast_1.DbEvents.CMD_UPDATE, { tableName, id, changes });
            if (row)
                (_a = this._gc) === null || _a === void 0 ? void 0 : _a.process(tableName, [row]);
            return row;
        });
    }
    /**
     * Soft-delete a row.
     * @param {string} tableName
     * @param {string} id
     * @returns {Promise<void>}
     */
    delete(tableName, id) {
        return __awaiter(this, void 0, void 0, function* () {
            yield (0, broadcast_1.sendCommand)(broadcast_1.DbEvents.CMD_DELETE, { tableName, id });
        });
    }
    // ── Domain helpers ────────────────────────────────────────────────────────
    createProduct(data) {
        return __awaiter(this, void 0, void 0, function* () { return this.create('products', data); });
    }
    updateProduct(id, changes) {
        return __awaiter(this, void 0, void 0, function* () { return this.update('products', id, changes); });
    }
    deleteProduct(id) {
        return __awaiter(this, void 0, void 0, function* () { return this.delete('products', id); });
    }
    createCustomer(data) {
        return __awaiter(this, void 0, void 0, function* () { return this.create('customers', data); });
    }
    updateCustomer(id, changes) {
        return __awaiter(this, void 0, void 0, function* () { return this.update('customers', id, changes); });
    }
    deleteCustomer(id) {
        return __awaiter(this, void 0, void 0, function* () { return this.delete('customers', id); });
    }
    createSalesOrder(data) {
        return __awaiter(this, void 0, void 0, function* () { return this.create('salesOrders', data); });
    }
    updateSalesOrder(id, changes) {
        return __awaiter(this, void 0, void 0, function* () { return this.update('salesOrders', id, changes); });
    }
    deleteSalesOrder(id) {
        return __awaiter(this, void 0, void 0, function* () { return this.delete('salesOrders', id); });
    }
    createOrderLine(data) {
        return __awaiter(this, void 0, void 0, function* () { return this.create('orderLines', data); });
    }
    updateOrderLine(id, changes) {
        return __awaiter(this, void 0, void 0, function* () { return this.update('orderLines', id, changes); });
    }
    deleteOrderLine(id) {
        return __awaiter(this, void 0, void 0, function* () { return this.delete('orderLines', id); });
    }
    createPurchaseOrder(data) {
        return __awaiter(this, void 0, void 0, function* () { return this.create('purchaseOrders', data); });
    }
    updatePurchaseOrder(id, changes) {
        return __awaiter(this, void 0, void 0, function* () { return this.update('purchaseOrders', id, changes); });
    }
    deletePurchaseOrder(id) {
        return __awaiter(this, void 0, void 0, function* () { return this.delete('purchaseOrders', id); });
    }
    createSPayment(data) {
        return __awaiter(this, void 0, void 0, function* () { return this.create('sPayments', data); });
    }
    createPPayment(data) {
        return __awaiter(this, void 0, void 0, function* () { return this.create('pPayments', data); });
    }
    deleteSPayment(id) {
        return __awaiter(this, void 0, void 0, function* () { return this.delete('sPayments', id); });
    }
    deletePPayment(id) {
        return __awaiter(this, void 0, void 0, function* () { return this.delete('pPayments', id); });
    }
    // ── Table factory ─────────────────────────────────────────────────────────
    /**
     * Create a reactive Table subscribed to one or more channel IDs, then
     * hydrate it with all current rows from the local cache.
     *
     * @param {string|string[]} subscriptionId  Channel IDs to subscribe to.
     * @param {string}          tableName
     * @param {object}          [opts]          Passed to the Table constructor.
     * @returns {Promise<Table>}
     */
    makeTable(subscriptionId, tableName, opts) {
        return __awaiter(this, void 0, void 0, function* () {
            const table = new Table_1.Table(subscriptionId, tableName, opts);
            table.hydrate(yield this.getAll(tableName));
            return table;
        });
    }
    /**
     * Create a Table for rows matching a specific index value.
     *
     * Example:
     * const lines = await orch.makeIndexedTable(
     * `items_${orderId}`, 'orderLines', 'order_id', orderId
     * )
     *
     * @param {string} subscriptionId  e.g. 'items_abc'
     * @param {string} tableName
     * @param {string} indexName
     * @param {any}    value
     * @param {object} [opts]
     * @returns {Promise<Table>}
     */
    makeIndexedTable(subscriptionId, tableName, indexName, value, opts) {
        return __awaiter(this, void 0, void 0, function* () {
            const table = new Table_1.Table([subscriptionId], tableName, opts);
            table.hydrate(yield this.getByIndex(tableName, indexName, value));
            return table;
        });
    }
    // ── Queue ─────────────────────────────────────────────────────────────────
    /** Trigger an immediate queue flush (also happens automatically on reconnect). */
    flushQueue() {
        (0, broadcast_1.broadcast)(broadcast_1.DbEvents.CMD_FLUSH_QUEUE);
    }
    /**
     * Read the pending offline queue (for debug / UI display).
     * @returns {Promise<any[]>}
     */
    getPendingQueue() {
        return __awaiter(this, void 0, void 0, function* () {
            const rows = (yield (0, broadcast_1.sendCommand)(broadcast_1.DbEvents.CMD_GET_ALL, { tableName: '_queue' })).data;
            return rows !== null && rows !== void 0 ? rows : [];
        });
    }
    // ── Private ───────────────────────────────────────────────────────────────
    _watchNetwork() {
        window.addEventListener('online', () => {
            this._online = true;
            setTimeout(() => this.flushQueue(), 1500);
        });
        window.addEventListener('offline', () => {
            this._online = false;
        });
        (0, broadcast_1.listenFor)(broadcast_1.DbEvents.CONNECTION, ({ online, hasServer }) => {
            this._online = online;
            this._serverReachable = !!hasServer;
        });
    }
    _watchSW() {
        (0, broadcast_1.listenFor)(broadcast_1.DbEvents.PONG, () => { this._swReady = true; });
    }
}
exports.Orchestrator = Orchestrator;
