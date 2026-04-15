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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.API = void 0;
exports.start = start;
const SmartGraph_1 = require("../SmartGraph");
const cache_1 = __importDefault(require("../cache"));
const broadCastProperies_1 = __importStar(require("./broadCastProperies"));
const EventEmitter_1 = require("../EventEmitter");
const crypto_1 = require("../crypto");
const http_1 = require("./http");
const concurrency_1 = require("../concurrency");
exports.API = {
    AUTH_API: 'http://localhost:3000/auth',
};
function isConnected() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!cache_1.default.username) {
            return "USERID";
        }
        if (!cache_1.default.cert) {
            return "PASSWORD";
        }
        const resp = yield http_1.http.fetch({ url: cache_1.default.AUTH_API, method: 'GET', headers: { 'username': cache_1.default.username } });
        const x = resp.data;
        return (resp.ok && x === "CONNECTED") ? "CONNECTED" : (x === "NOT_REGISTERED") ? "USERID" : "PASSWORD";
    });
}
function START(ctx, graph) {
    return navigator.onLine ? 'AUTOSIGNIN' : 'OFFLINE';
}
function AUTOSIGNIN(ctx, graph) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield isConnected();
    });
}
function USERID(ctx, graph) {
    return __awaiter(this, void 0, void 0, function* () {
        broadCastProperies_1.default.set('AUTH.CONNECTED', false);
        const x = yield broadCastProperies_1.default.call('getUSERID', {}, 5000);
        if (!x) {
            return "USERID";
        }
        cache_1.default.username = x;
        return "PASSWORD";
    });
}
function PASSWORD(ctx, graph) {
    return __awaiter(this, void 0, void 0, function* () {
        broadCastProperies_1.default.set('AUTH.CONNECTED', false);
        cache_1.default.cert = '';
        if (!cache_1.default.username)
            return "USERID";
        const x = yield broadCastProperies_1.default.call('getPWD', {}, 5000);
        if (!x) {
            return "PASSWORD";
        }
        return HANDSHAKE(cache_1.default.username, x);
    });
}
function HANDSHAKE(username, pwd) {
    return __awaiter(this, void 0, void 0, function* () {
        yield cache_1.default.clearAll(['username', 'cert']);
        const resp = yield http_1.http.fetch({ url: exports.API.AUTH_API, method: 'GET', headers: { 'handshake': 'true', 'username': username }, encrypt: true }, (0, crypto_1.md5)(pwd));
        if (!resp.ok)
            return new Error("Failed to get handshake data");
        yield cache_1.default.set('username', username, true);
        const handShakeDATA = (yield (0, crypto_1.decryptData)(resp.data, (0, crypto_1.md5)(pwd)));
        if (!handShakeDATA.pwdSuffix)
            return new Error("Invalid handshake data");
        {
            const cert = (0, crypto_1.md5)(pwd + handShakeDATA.pwdSuffix);
            const resp = yield http_1.http.fetch({ url: exports.API.AUTH_API, method: 'POST', headers: { 'handshake': 'true' }, body: handShakeDATA, encrypt: true }, cert);
            if (!resp.ok)
                return resp.data;
            if (resp.data === 'CONNECTED') {
                yield cache_1.default.set('cert', cert, true);
                return 'CONNECTED';
            }
            else
                throw new Error('PASSWORD-ERROR');
        }
    });
}
function OFFLINE(ctx, graph) {
    return __awaiter(this, void 0, void 0, function* () {
        const signedIn = cache_1.default.username && cache_1.default.cert;
        broadCastProperies_1.default.set('AUTH.OFFLINE', true);
        if (signedIn) {
            return 'CONNECTED';
        }
        else {
            return 'DISCONNECTED';
        }
    });
}
function CONNECTED(ctx, graph) {
    return __awaiter(this, void 0, void 0, function* () {
        broadCastProperies_1.default.set('AUTH.CONNECTED', true);
    });
}
function DISCONNECTED(ctx, graph) {
    return __awaiter(this, void 0, void 0, function* () {
        broadCastProperies_1.default.set('AUTH.DISCONNECTED', true);
    });
}
const auth = (0, SmartGraph_1.createGraph)({
    START: {
        executer: START,
        edges: [
            { value: 'OFFLINE', target: 'OFFLINE' },
            { value: 'AUTOSIGNIN', target: 'AUTOSIGNIN' }
        ]
    },
    AUTOSIGNIN: {
        executer: AUTOSIGNIN,
        edges: [
            { value: 'CONNECTED', target: 'CONNECTED' },
            { value: 'USERID', target: 'USERID' },
            { value: 'PASSWORD', target: 'PASSWORD' }
        ],
        retry: { attempts: 3, delayMs: 1000, when: (error) => error instanceof Error }
    },
    SIGNIN: {
        executer: USERID,
        edges: [
            { value: 'CONNECTED', target: 'CONNECTED' },
            { value: 'USERID', target: 'USERID' },
            { value: 'PASSWORD', target: 'PASSWORD' }
        ],
        retry: { attempts: 3, delayMs: 1000, when: (error) => error instanceof Error }
    },
    USERID: {
        executer: USERID,
        edges: [
            { value: 'USERID', target: 'USERID' },
            { value: 'PASSWORD', target: 'PASSWORD' }
        ],
        retry: { attempts: 3, delayMs: 1000, when: (error) => error instanceof Error }
    },
    PASSWORD: {
        executer: PASSWORD,
        edges: [
            { value: 'CONNECTED', target: 'CONNECTED' },
            { value: 'USERID', target: 'USERID' },
            { value: 'PASSWORD', target: 'PASSWORD' },
            { type: 'error', target: 'PASSWORD' }
        ],
        retry: { attempts: 3, delayMs: 1000, when: (error) => error instanceof Error }
    },
    CONNECTED: {
        executer: CONNECTED,
        edges: []
    },
    DISCONNECTED: {
        executer: DISCONNECTED,
        edges: []
    },
    OFFLINE: {
        executer: OFFLINE,
        edges: [
            { value: 'CONNECTED', target: 'CONNECTED' },
            { value: 'DISCONNECTED', target: 'DISCONNECTED' }
        ]
    },
    FINISHED: {
        executer: (ctx, gr) => {
            return undefined;
        },
        edges: [
            { value: 'CONNECTED', target: 'CONNECTED' }
        ]
    },
});
function sleep(ms) {
    return __awaiter(this, void 0, void 0, function* () { if (!ms)
        return; return new Promise(res => setTimeout(res, ms)); });
}
const _lock = new concurrency_1.AsyncLock();
function start() {
    return __awaiter(this, void 0, void 0, function* () {
        const connect = (0, concurrency_1.singleFlight)(rawConnect);
        (0, EventEmitter_1.on)('NET', 'OFFLINE', (e) => {
            if (!e.newValue) {
                connect();
            }
        });
        return connect();
        function rawConnect() {
            return __awaiter(this, void 0, void 0, function* () {
                while (!broadCastProperies_1.remoteObject._get('NET.OFFLINE'))
                    try {
                        const STATE = yield isConnected();
                        if (STATE !== 'CONNECTED')
                            if ((yield process(STATE || 'START')) instanceof Error)
                                continue;
                    }
                    catch (e) {
                        continue;
                    }
                    finally {
                        yield sleep(5000);
                    }
            });
        }
        function process() {
            return __awaiter(this, arguments, void 0, function* (STATE = 'START') {
                try {
                    return auth.execute([STATE], 'DISCONNECTED');
                }
                catch (error) {
                    return error instanceof Error ? error : new Error(error);
                }
            });
        }
    });
}
self['xfetch'] = () => __awaiter(void 0, void 0, void 0, function* () {
    http_1.http.fetch({ url: 'http://127.0.0.1:3000/session', method: 'GET' }).then(console.log).catch(console.error);
});
