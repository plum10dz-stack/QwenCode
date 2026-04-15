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
exports.main = main;
const networking_1 = require("../utils/networking");
const utils_1 = require("../utils");
const channels_1 = require("../utils/channels");
const config_1 = require("../workspace/config");
function main(localDB, serverDB) {
    if (!(0, utils_1.isServiceWorker)())
        throw new Error("Not a service worker");
    initProperties(localDB, serverDB);
    initEventsAPI(localDB, serverDB);
}
function initProperties(localDB, serverDB) {
    (0, networking_1.buildEventProperty)({ broadcast: true, type: 'boolean', ns: 'AUTH', name: 'CONNECTED' });
    (0, networking_1.buildEventProperty)({ broadcast: true, type: 'boolean', ns: 'NET', name: 'OFFLINE', value: false });
    (0, networking_1.addProperties)({
        userid: {
            type: 'property',
            signature: { returns: 'string' },
            value: { value: 'anonymous' }
        },
        getTable: {
            type: 'method',
            signature: { args: ['string', 'number'], returns: 'any[]' },
            value: (tableName, lastTimeUpdate) => __awaiter(this, void 0, void 0, function* () {
                return yield localDB.getAll(tableName, lastTimeUpdate).catch(v => ({ error: v }));
            })
        },
        getUpdates: {
            type: 'method',
            signature: { args: ['number'], returns: 'any[]' },
            value: (lastTimeUpdate) => __awaiter(this, void 0, void 0, function* () {
            })
        },
        createRow: {
            type: 'method',
            signature: { args: ['string', 'any'], returns: 'any' },
            value: (tableName, row) => __awaiter(this, void 0, void 0, function* () {
            })
        },
        updateRow: {
            type: 'method',
            signature: { args: ['string', 'any'], returns: 'any' },
            value: (tableName, row) => __awaiter(this, void 0, void 0, function* () {
            })
        },
        deleteRow: {
            type: 'method',
            signature: { args: ['string', 'any'], returns: 'any' },
            value: (tableName, id) => __awaiter(this, void 0, void 0, function* () {
            })
        },
    });
}
function initEventsAPI(localDB, serverDB) {
    function _reply(reqId, payload) {
        channels_1.swChannel.broadcast(`${config_1.DbEvents.CMD_RESULT}:${reqId}`, payload);
    }
    channels_1.swChannel.listenFor(config_1.DbEvents.SW_INIT, (_a) => __awaiter(this, [_a], void 0, function* ({ lastTimeUpdate }) {
        // Seed watermark so the first poll is a delta, not a full reload.
        if (lastTimeUpdate && localDB) {
            yield localDB.setLastTimeUpdate(lastTimeUpdate);
        }
        // Queue flush only — polling/SSE lifecycle is owned by sw/index.ts.
        if (localDB && serverDB) {
            yield localDB.flushQueue(serverDB);
        }
    }));
    // ── Auth ──────────────────────────────────────────────────────────────────
    channels_1.swChannel.listenFor(config_1.DbEvents.AUTH_SET, () => __awaiter(this, void 0, void 0, function* () {
        // Queue flush only — SSE/polling lifecycle is owned by sw/index.ts.
        // The AUTH.CONNECTED event fired by the properties system handles
        // the full startLiveSync() + catch-up sync sequence.
        if (localDB && serverDB) {
            yield localDB.flushQueue(serverDB);
        }
    }));
    channels_1.swChannel.listenFor(config_1.DbEvents.AUTH_CLEAR, () => {
        // Polling/SSE teardown is handled by on('AUTH','DISCONNECTED') in index.ts.
    });
    // ── Ping ──────────────────────────────────────────────────────────────────
    channels_1.swChannel.listenFor(config_1.DbEvents.PING, () => channels_1.swChannel.broadcast(config_1.DbEvents.PONG, { ready: !!localDB }));
    // ── Queue flush ───────────────────────────────────────────────────────────
    channels_1.swChannel.listenFor(config_1.DbEvents.CMD_FLUSH_QUEUE, () => __awaiter(this, void 0, void 0, function* () {
        if (localDB && serverDB) {
            yield localDB.flushQueue(serverDB);
        }
    }));
    // ── Read commands ─────────────────────────────────────────────────────────
    channels_1.swChannel.listenFor(config_1.DbEvents.CMD_GET_ALL, (_a) => __awaiter(this, [_a], void 0, function* ({ tableName, reqId }) {
        try {
            _reply(reqId, { rows: yield localDB.getAll(tableName) });
        }
        catch (e) {
            _reply(reqId, { error: e.message });
        }
    }));
    channels_1.swChannel.listenFor(config_1.DbEvents.CMD_GET, (_a) => __awaiter(this, [_a], void 0, function* ({ tableName, id, reqId }) {
        var _b;
        try {
            _reply(reqId, { row: (_b = (yield localDB.get(tableName, id))) !== null && _b !== void 0 ? _b : null });
        }
        catch (e) {
            _reply(reqId, { error: e.message });
        }
    }));
    channels_1.swChannel.listenFor(config_1.DbEvents.CMD_GET_BY_INDEX, (_a) => __awaiter(this, [_a], void 0, function* ({ tableName, indexName, value, reqId }) {
        try {
            _reply(reqId, { rows: yield localDB.getByIndex(tableName, indexName, value) });
        }
        catch (e) {
            _reply(reqId, { error: e.message });
        }
    }));
    // ── Write commands ────────────────────────────────────────────────────────
    channels_1.swChannel.listenFor(config_1.DbEvents.CMD_CREATE, (_a) => __awaiter(this, [_a], void 0, function* ({ tableName, data, reqId }) {
        if (!localDB)
            return _reply(reqId, { error: 'LocalDB not ready' });
        try {
            if (serverDB) {
                try {
                    const serverRow = yield serverDB.create(tableName, data);
                    const row = yield localDB.insert(tableName, Object.assign(Object.assign({}, serverRow), { syncStatus: 'synced' }));
                    return _reply(reqId, { row });
                }
                catch (serverErr) {
                    console.warn('[SW] server create failed, queueing offline:', serverErr.message);
                }
            }
            const row = yield localDB.insert(tableName, data);
            yield localDB.enqueue('insert', tableName, row);
            _reply(reqId, { row });
        }
        catch (e) {
            _reply(reqId, { error: e.message });
        }
    }));
    channels_1.swChannel.listenFor(config_1.DbEvents.CMD_UPDATE, (_a) => __awaiter(this, [_a], void 0, function* ({ tableName, id, changes, reqId }) {
        if (!localDB)
            return _reply(reqId, { error: 'LocalDB not ready' });
        try {
            if (serverDB) {
                try {
                    const serverRow = yield serverDB.update(tableName, id, changes);
                    const row = yield localDB.update(tableName, id, Object.assign(Object.assign({}, serverRow), { syncStatus: 'synced' }));
                    return _reply(reqId, { row });
                }
                catch (serverErr) {
                    console.warn('[SW] server update failed, queueing offline:', serverErr.message);
                }
            }
            const row = yield localDB.update(tableName, id, changes);
            yield localDB.enqueue('update', tableName, row);
            _reply(reqId, { row });
        }
        catch (e) {
            _reply(reqId, { error: e.message });
        }
    }));
    channels_1.swChannel.listenFor(config_1.DbEvents.CMD_DELETE, (_a) => __awaiter(this, [_a], void 0, function* ({ tableName, id, reqId }) {
        var _b;
        if (!localDB)
            return _reply(reqId, { error: 'LocalDB not ready' });
        try {
            if (serverDB) {
                try {
                    yield serverDB.delete(tableName, id);
                    yield localDB.delete(tableName, id);
                    return _reply(reqId, { ok: true });
                }
                catch (serverErr) {
                    console.warn('[SW] server delete failed, queueing offline:', serverErr.message);
                }
            }
            yield localDB.delete(tableName, id);
            const existing = (_b = (yield localDB.get(tableName, id))) !== null && _b !== void 0 ? _b : { id };
            yield localDB.enqueue('delete', tableName, existing);
            _reply(reqId, { ok: true });
        }
        catch (e) {
            _reply(reqId, { error: e.message });
        }
    }));
}
exports.default = main;
