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
exports.DB = exports.serverDB = exports.localDB = void 0;
exports.default = init;
const datasource_1 = require("../utils/datasource");
const datasource_2 = require("../utils/datasource");
const utils_1 = require("../utils");
const config_1 = require("../workspace/config");
if (!(0, utils_1.isServiceWorker)())
    throw new Error("Not a service worker");
let initialized = false;
let _auth = false;
exports.localDB = null;
exports.serverDB = null;
function _boot() {
    return __awaiter(this, void 0, void 0, function* () {
        initialized = true;
        exports.localDB = yield new datasource_2.LocalDB(config_1.StockOS_CONFIG).init();
        exports.serverDB = yield new datasource_1.ServerDB(config_1.StockOS_CONFIG.API_BASE).init();
        let _tickTimer = null;
        let timer;
        exports.serverDB.on({
            'updates': (payload) => __awaiter(this, void 0, void 0, function* () {
                try {
                    yield exports.localDB.applyServerUpdates(payload.data, 0);
                    yield exports.localDB.setLastTimeUpdate(payload.time);
                }
                catch (err) {
                    console.error('[SW] applyServerUpdates failed:', err);
                }
            }),
            'startPolling': () => {
                if (timer)
                    clearInterval(timer);
                timer = setInterval(() => _tick(), config_1.StockOS_CONFIG.POLL_INTERVAL);
                _tick();
            },
            'stopPolling': (args) => {
                if (timer)
                    clearInterval(timer);
                timer = undefined;
            },
        });
        exports.serverDB.startPolling();
        function _tick() {
            return __awaiter(this, void 0, void 0, function* () {
                if (!_auth)
                    return;
                if (_tickTimer)
                    return;
                _tickTimer = true;
                try {
                    const time = Date.now();
                    const { data: response } = yield exports.serverDB.getUpdates(yield exports.localDB.getLastTimeUpdate());
                    yield exports.localDB.applyServerUpdates(response, time);
                }
                catch (err) {
                    exports.serverDB.emit(config_1.DbEvents.DB_UPDATE_ERROR, { error: err.message });
                }
                finally {
                    _tickTimer = false;
                }
            });
        }
    });
}
exports.DB = {
    get localDB() { return exports.localDB; },
    get serverDB() { return exports.serverDB; },
    get Config() { return config_1.StockOS_CONFIG; },
    get EVT() { return config_1.DbEvents; },
};
function init() {
    return __awaiter(this, void 0, void 0, function* () {
        return initialized ? exports.DB : (yield _boot(), exports.DB);
    });
}
