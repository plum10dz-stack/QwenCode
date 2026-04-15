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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Table_1 = require("../utils/data/Table");
const ObjectGarbage_1 = require("../utils/ObjectGarbage");
const channels_1 = require("../utils/channels");
const config_1 = require("./config");
const cache_1 = __importDefault(require("../utils/cache"));
class Orchestrator {
    get isReady() { return !cache_1.default.get(Orchestrator); }
    constructor(gc, swUrl = `/worker.js`) {
        this.gc = gc;
        this.swUrl = swUrl;
        this.ready = new Promise((res, rej) => { cache_1.default.set(Orchestrator, { res, rej }); });
        this.reg = null;
        this._jwt = null;
        this._online = navigator.onLine;
        this._serverReachable = false;
        this.gc = gc;
        this._watchNetwork();
        this._watchSW();
        this.init();
    }
    // ── Lifecycle ─────────────────────────────────────────────────────────────
    /**
     * Register the Service Worker, wait for PONG, then send SW_INIT with the
     * persisted watermark and current JWT (if any).
     * Await this once during app start-up before issuing any data calls.
     */
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!('serviceWorker' in navigator)) {
                console.warn('[Orchestrator] Service Workers not supported in this browser.');
                return;
            }
            this.reg = yield navigator.serviceWorker.register(this.swUrl, { type: 'module', updateViaCache: 'imports', scope: '/' });
            yield new Promise((resolve) => {
                const timer = setTimeout(resolve, 5000);
                channels_1.swChannel.once(config_1.DbEvents.PONG, () => { clearTimeout(timer); resolve(); });
                channels_1.swChannel.broadcast(config_1.DbEvents.PING);
            });
            const { res, rej } = cache_1.default.get(Orchestrator);
            cache_1.default.set(Orchestrator, undefined);
            res(this);
            // Seed the SW with the persisted watermark and any existing JWT
            channels_1.swChannel.broadcast(config_1.DbEvents.SW_INIT, {
                jwt: this._jwt,
            });
        });
    }
    // ── Auth ──────────────────────────────────────────────────────────────────
    /**
     * Set the JWT.  Broadcasts it to the SW which starts polling and flushes
     * any queued offline operations.
     * @param {string} jwt
     */
    setJwt(jwt) {
        this._jwt = jwt;
        channels_1.swChannel.broadcast(config_1.DbEvents.AUTH_SET, { jwt });
    }
    /** Clear the JWT and stop server polling. */
    clearJwt() {
        this._jwt = null;
        channels_1.swChannel.broadcast(config_1.DbEvents.AUTH_CLEAR);
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
            const rows = (yield channels_1.swChannel.smartCall(config_1.DbEvents.CMD_GET_ALL, { tableName })).data;
            const result = rows !== null && rows !== void 0 ? rows : [];
            (_a = this.gc) === null || _a === void 0 ? void 0 : _a.process(tableName, result);
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
            const { data: row } = yield channels_1.swChannel.smartCall(config_1.DbEvents.CMD_GET, { tableName, id });
            if (row)
                (_a = this.gc) === null || _a === void 0 ? void 0 : _a.process(tableName, [row]);
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
            const { data: rows } = yield channels_1.swChannel.smartCall(config_1.DbEvents.CMD_GET_BY_INDEX, { tableName, indexName, value });
            const result = rows !== null && rows !== void 0 ? rows : [];
            (_a = this.gc) === null || _a === void 0 ? void 0 : _a.process(tableName, result);
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
            const result = yield channels_1.swChannel.smartCall(config_1.DbEvents.CMD_CREATE, { tableName, data });
            const row = result.data;
            if (row)
                (_a = this.gc) === null || _a === void 0 ? void 0 : _a.process(tableName, [row]);
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
            const { data: row } = yield channels_1.swChannel.smartCall(config_1.DbEvents.CMD_UPDATE, { tableName, id, changes });
            if (row)
                (_a = this.gc) === null || _a === void 0 ? void 0 : _a.process(tableName, [row]);
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
            yield channels_1.swChannel.smartCall(config_1.DbEvents.CMD_DELETE, { tableName, id });
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
        return __awaiter(this, void 0, void 0, function* () { return this.create('sales_orders', data); });
    }
    updateSalesOrder(id, changes) {
        return __awaiter(this, void 0, void 0, function* () { return this.update('sales_orders', id, changes); });
    }
    deleteSalesOrder(id) {
        return __awaiter(this, void 0, void 0, function* () { return this.delete('sales_orders', id); });
    }
    createOrderLine(data) {
        return __awaiter(this, void 0, void 0, function* () { return this.create('order_lines', data); });
    }
    updateOrderLine(id, changes) {
        return __awaiter(this, void 0, void 0, function* () { return this.update('order_lines', id, changes); });
    }
    deleteOrderLine(id) {
        return __awaiter(this, void 0, void 0, function* () { return this.delete('order_lines', id); });
    }
    createPurchaseOrder(data) {
        return __awaiter(this, void 0, void 0, function* () { return this.create('purchase_orders', data); });
    }
    updatePurchaseOrder(id, changes) {
        return __awaiter(this, void 0, void 0, function* () { return this.update('purchase_orders', id, changes); });
    }
    deletePurchaseOrder(id) {
        return __awaiter(this, void 0, void 0, function* () { return this.delete('purchase_orders', id); });
    }
    createSPayment(data) {
        return __awaiter(this, void 0, void 0, function* () { return this.create('s_payments', data); });
    }
    createPPayment(data) {
        return __awaiter(this, void 0, void 0, function* () { return this.create('p_payments', data); });
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
        channels_1.swChannel.broadcast(config_1.DbEvents.CMD_FLUSH_QUEUE);
    }
    /**
     * Read the pending offline queue (for debug / UI display).
     * @returns {Promise<any[]>}
     */
    getPendingQueue() {
        return __awaiter(this, void 0, void 0, function* () {
            const rows = (yield channels_1.swChannel.smartCall(config_1.DbEvents.CMD_GET_ALL, { tableName: '_queue' })).data;
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
        channels_1.swChannel.listenFor(config_1.DbEvents.CONNECTION, ({ online, hasServer }) => {
            this._online = online;
            this._serverReachable = !!hasServer;
        });
    }
    _watchSW() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('pinging SW', new Date(Date.now()));
            const ping = yield channels_1.swChannel.smartCall(config_1.DbEvents.PING, {}, 500).catch(v => ({ error: v }));
            console.log('ping', ping, new Date(Date.now()));
            if (ping === null || ping === void 0 ? void 0 : ping.error) {
                console.log('waiting for PONG', new Date(Date.now()));
                while (!(yield channels_1.swChannel.smartCall(config_1.DbEvents.PONG, 500).then(v => true).catch(v => false)))
                    ;
                console.log('PONG received', new Date(Date.now()));
                return;
            }
            console.log('PONG received', new Date(Date.now()));
        });
    }
}
exports.default = new Orchestrator(ObjectGarbage_1.ObjectGarbage.instance({
    channel: channels_1.swChannel,
    onCreate(row, e) {
    },
    onUpdate(row, e) {
    },
    onDispose(row) {
    }
}), '/worker.js');
