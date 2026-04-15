"use strict";
/// <reference types="@types/serviceworker" />
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
exports.DB = exports.serverDB = exports.localDB = void 0;
exports.setAuth = setAuth;
exports.default = initDB;
const datasource_1 = require("../../utils/datasource");
const datasource_2 = require("../../utils/datasource");
const utils_1 = require("../../utils");
const config_1 = require("../../workspace/config");
if (!(0, utils_1.isServiceWorker)())
    throw new Error("Not a service worker");
let initialized = false;
let _auth = false;
exports.localDB = null;
exports.serverDB = null;
/** Toggle authentication state. Called from sw/index.ts via AUTH events. */
function setAuth(value) {
    _auth = value;
}
function _boot() {
    return __awaiter(this, void 0, void 0, function* () {
        initialized = true;
        exports.localDB = yield new datasource_2.LocalDB(config_1.StockOS_CONFIG).init();
        exports.serverDB = yield new datasource_1.ServerDB(config_1.StockOS_CONFIG.API_BASE).init();
        let _tickTimer = false;
        let _pollTimer;
        exports.serverDB.on({
            /**
             * Fired by ServerDB.applyDelta (SSE path) and ServerDB.sync (poll path).
             * Writes rows to IndexedDB and broadcasts ROWS_CHANGED to all tabs.
             * `payload.time` is used to advance lastTimeUpdate so the next sync
             * only fetches rows newer than this batch.
             */
            'updates': (payload) => __awaiter(this, void 0, void 0, function* () {
                try {
                    yield exports.localDB.applyServerUpdates(payload.data, payload.time);
                }
                catch (err) {
                    console.error('[SW] applyServerUpdates failed:', err);
                }
            }),
            /**
             * Fired by ServerDB.connectStream on each SSE chunk with the server's
             * authoritative `updated_at` timestamp.  We persist this separately so
             * clock-skew between client and server doesn't cause rows to be missed
             * on the next `since` query.
             */
            'stream:tick': (_a) => __awaiter(this, [_a], void 0, function* ({ time }) {
                try {
                    yield exports.localDB.setLastTimeUpdate(time);
                }
                catch (err) {
                    console.error('[SW] setLastTimeUpdate failed:', err);
                }
            }),
            'startPolling': () => {
                if (_pollTimer)
                    clearInterval(_pollTimer);
                _pollTimer = setInterval(() => _tick(), config_1.StockOS_CONFIG.POLL_INTERVAL);
                _tick(); // run immediately
            },
            'stopPolling': () => {
                if (_pollTimer)
                    clearInterval(_pollTimer);
                _pollTimer = undefined;
            },
        });
        // Polling is the initial (safe) fallback.
        // sw/index.ts will call stopPolling() when SSE connects successfully.
        exports.serverDB.startPolling();
    });
}
let _tickTimer = false;
function _tick() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!_auth)
            return; // do nothing until authenticated
        if (_tickTimer)
            return; // prevent overlapping ticks
        _tickTimer = true;
        try {
            const since = yield exports.localDB.getLastTimeUpdate();
            yield exports.serverDB.sync(since);
        }
        catch (err) {
            exports.serverDB.emit(config_1.DbEvents.DB_UPDATE_ERROR, { error: err.message });
        }
        finally {
            _tickTimer = false;
        }
    });
}
exports.DB = {
    get localDB() { return exports.localDB; },
    get serverDB() { return exports.serverDB; },
    get Config() { return config_1.StockOS_CONFIG; },
    get EVT() { return config_1.DbEvents; },
};
function initDB() {
    return __awaiter(this, void 0, void 0, function* () {
        return initialized ? exports.DB : (yield _boot(), exports.DB);
    });
}
