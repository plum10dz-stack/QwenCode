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
exports.SESSION_ERRORS = exports.login = void 0;
const SmartGraph_1 = require("../SmartGraph");
const cache_1 = __importStar(require("../cache"));
const broadCastProperies_1 = __importStar(require("./broadCastProperies"));
const EventEmitter_1 = require("../EventEmitter");
const crypto_1 = require("../crypto");
const http_1 = require("./http");
const concurrency_1 = require("../concurrency");
const common_1 = require("../common");
function isConnected() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!navigator.onLine)
            return 'OFFLINE';
        const resp = yield http_1.http.callAPI({ route: cache_1.default.AUTH_API, headers: { 'username': cache_1.default.username } });
        if (resp instanceof Error)
            return 'USERID';
        return (resp === "CONNECTED") ? "CONNECTED" : (resp === "NOT_REGISTERED") ? "USERID" : "PASSWORD";
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
        if (!x || x instanceof Error) {
            return "USERID";
        }
        cache_1.default.set('username', x, true);
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
        const resp = yield http_1.http.callAPI({ route: cache_1.default.AUTH_API, headers: { 'handshake': 'true', 'username': username } }, (0, crypto_1.md5)(pwd));
        if (resp instanceof Error)
            return resp;
        yield cache_1.default.set('username', username, true);
        const handShakeDATA = resp;
        if (!handShakeDATA.pwdSuffix)
            return new Error("Invalid handshake data");
        {
            const cert = (0, crypto_1.md5)(pwd + handShakeDATA.pwdSuffix);
            const resp = yield http_1.http.callAPI({ route: cache_1.default.AUTH_API, method: 'POST', headers: { 'handshake': 'true' }, body: handShakeDATA }, cert);
            if (resp instanceof Error)
                return resp;
            if (resp === 'CONNECTED') {
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
        return 'DISCONNECTED';
        // const signedIn = Env.username && Env.cert;
        // RemoteObject.set('AUTH.OFFLINE', true);
        // if (signedIn) {
        //     return 'CONNECTED';
        // } else {
        //     return 'DISCONNECTED';
        // }
    });
}
function CONNECTED(ctx, graph) {
    return __awaiter(this, void 0, void 0, function* () {
        broadCastProperies_1.default.set('AUTH.CONNECTED', true);
        (0, EventEmitter_1.emit)("AUTH", "CONNECTED", [true]);
        return "CONNECTED";
    });
}
function DISCONNECTED(ctx, graph) {
    return __awaiter(this, void 0, void 0, function* () {
        broadCastProperies_1.default.set('AUTH.DISCONNECTED', true);
        (0, EventEmitter_1.emit)("AUTH", "DISCONNECTED", [true]);
        return "DISCONNECTED";
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
        edges: []
    },
    // OFFLINE: {
    //     executer: OFFLINE,
    //     edges: [
    //         // { value: 'CONNECTED', target: 'CONNECTED' },
    //         // { value: 'DISCONNECTED', target: 'DISCONNECTED' }
    //     ]
    // },
    FINISHED: {
        executer: (ctx, gr) => {
        },
        edges: [
            { value: 'CONNECTED', target: 'CONNECTED' }
        ]
    },
});
exports.login = (0, concurrency_1.singleFlight)((res, _, p) => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, cache_1.loadEnv)();
    ;
    if (navigator.onLine)
        start();
    else
        addEventListener('online', start);
    p.finally(() => {
        removeEventListener('online', start);
    });
    function start() {
        return __awaiter(this, void 0, void 0, function* () {
            while (navigator.onLine) {
                switch (yield process('START')) {
                    case 'CONNECTED':
                        return res(true);
                    case 'OFFLINE':
                        yield broadCastProperies_1.remoteObject.call('UI.show', { message: 'Error connecting to server' }, 2000);
                        return;
                }
                yield (0, common_1.sleep)(2000);
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
}));
(0, broadCastProperies_1.addProperties)({
    'login': {
        type: 'method',
        value: exports.login,
        signature: {
            args: [],
            returns: 'boolean'
        }
    }
});
exports.SESSION_ERRORS = {
    'SESSION_NOT_FOUND': 'Session not found',
    'INVALID_SESSION': 'Invalid session',
    'SESSION_EXPIRED': 'Session expired',
    'SESSION_TERMINATED': 'Session terminated',
    "NOT_CONNECTED": 'Not connected to server',
    "INVALID_HANDSHAKE": "Invalid handshake",
    "DB_CONNECTION_ERROR": "Database connection error",
    "USER_NOT_FOUND": "User not found",
    "PASSWORD_ERROR": "Password error",
};
;
self['xfetch'] = () => __awaiter(void 0, void 0, void 0, function* () {
    http_1.http.fetch({ url: new URL('/session', cache_1.default.API_URL), method: 'GET' }).then(console.log).catch(console.error);
});
//login().then(console.log).catch(console.error); remoteObject
