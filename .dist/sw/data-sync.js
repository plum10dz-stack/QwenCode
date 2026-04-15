"use strict";
/// <reference types="@types/serviceworker" />
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
exports.default = init;
exports.ensureInitialized = ensureInitialized;
/**
 * data-sync.ts
 *
 * Central orchestration for all data-sync lifecycle:
 *   - Boot: load env, init DBs, register channel handlers
 *   - Auth CONNECTED  → initial sync → delta catch-up → flush queue → start live sync
 *   - Auth DISCONNECTED → stop live sync
 *   - Network online → flush queue + restart live sync
 *
 * Imported by `src/sw/index.ts` which only handles the SW lifecycle boilerplate.
 */
const services_1 = require("./services");
const init_1 = __importStar(require("./init"));
const utils_1 = require("../utils");
const utils_2 = require("../utils");
const channels_1 = require("../utils/channels");
const data_sync_server_to_db_1 = require("./data-sync-server-to-db");
const data_live_sync_1 = require("./data-live-sync");
require("./help");
if (!(0, utils_2.isServiceWorker)())
    throw new Error('Not a service worker');
// ── SW entry point ────────────────────────────────────────────────────────────
function init() {
    return __awaiter(this, void 0, void 0, function* () {
        console.info('[SW] Booting…', yield (0, utils_1.AsyncEnv)());
        yield (0, utils_1.loadEnv)();
        yield (0, init_1.default)();
        // Register channel-command handlers (read/write/flush etc.)
        (0, services_1.main)(init_1.DB.localDB, init_1.DB.serverDB);
        // ── AUTH events ───────────────────────────────────────────────────────────
        (0, utils_1.on)('AUTH', 'CONNECTED', (e) => __awaiter(this, void 0, void 0, function* () {
            console.info('[SW] AUTH.CONNECTED', e);
            (0, init_1.setAuth)(true);
            yield _onAuthConnected();
        }));
        (0, utils_1.on)('AUTH', 'DISCONNECTED', (e) => {
            console.info('[SW] AUTH.DISCONNECTED', e);
            (0, init_1.setAuth)(false);
            (0, data_live_sync_1.stopLiveSync)();
        });
        // ── Network events ────────────────────────────────────────────────────────
        self.addEventListener('online', () => __awaiter(this, void 0, void 0, function* () {
            console.info('[SW] Network online — flushing queue');
            yield init_1.DB.localDB.flushQueue(init_1.DB.serverDB).catch(err => console.warn('[SW] Queue flush on online failed:', err));
            if (!(0, data_live_sync_1.isLiveSyncRunning)())
                (0, data_live_sync_1.startLiveSync)();
        }));
        // ── Channel ───────────────────────────────────────────────────────────────
        channels_1.swChannel.listenFor('PING', () => __awaiter(this, void 0, void 0, function* () {
            yield ensureInitialized();
            return true;
        }));
    });
}
// ── Auth-connected sequence ───────────────────────────────────────────────────
function _onAuthConnected() {
    return __awaiter(this, void 0, void 0, function* () {
        // 1. Initial full-table sync (first run only)
        try {
            const alreadySynced = yield (0, data_sync_server_to_db_1.hasInitialSyncRun)(init_1.DB.localDB);
            if (!alreadySynced) {
                console.info('[SW] No prior sync detected — running initial full-table sync…');
                yield (0, data_sync_server_to_db_1.initialFullTableSync)(init_1.DB.localDB);
            }
        }
        catch (err) {
            console.error('[SW] Initial full-table sync failed:', err);
        }
        // 2. Delta catch-up: fetch anything missed while the SW was inactive
        try {
            const since = yield init_1.DB.localDB.getLastTimeUpdate();
            yield init_1.DB.serverDB.sync(since);
        }
        catch (err) {
            console.warn('[SW] Boot sync failed:', err);
        }
        // 3. Flush offline queue
        yield init_1.DB.localDB.flushQueue(init_1.DB.serverDB).catch(err => console.warn('[SW] Queue flush on auth failed:', err));
        // 4. Start live sync (stream → polling fallback)
        (0, data_live_sync_1.startLiveSync)();
    });
}
// ── Export for index.ts ───────────────────────────────────────────────────────
let _initialized = false;
function ensureInitialized() {
    return __awaiter(this, void 0, void 0, function* () {
        if (_initialized)
            return;
        _initialized = true;
        init();
        channels_1.swChannel.wait('CLOSE');
        return clients.claim();
    });
}
