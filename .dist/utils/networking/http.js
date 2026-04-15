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
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
    function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
    function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
var _a, _http_services, _http_processData, _http_parsers;
Object.defineProperty(exports, "__esModule", { value: true });
exports.http = void 0;
const cache_1 = __importStar(require("../cache"));
const common_1 = require("../common");
const encrypt_1 = require("../crypto/encrypt");
class http {
    static fetch(req, cert) {
        return __awaiter(this, void 0, void 0, function* () {
            var _b;
            const options = {
                method: req.method,
                body: req.encrypt && req.body ? JSON.stringify(yield (0, encrypt_1.encryptData)(req.body, cert || cache_1.default.cert)) : (req.body != null ? JSON.stringify(req.body) : undefined),
                headers: req.encrypt && req.body ? Object.assign(Object.assign({}, (req.headers || {})), { 'Content-Type': 'application/json', 'accept-service': 'true', 'S-ID': cache_1.default.s_id, 'x-encrypt': 'true' }) : Object.assign(Object.assign({}, (req.headers || {})), { 'S-ID': cache_1.default.s_id })
            };
            const p = yield (0, cache_1.fetch)(req.url || new URL(req.route || '', cache_1.default.API_URL), Object.assign(Object.assign({}, options), { signal: req.signal }));
            const parser = __classPrivateFieldGet(this, _a, "f", _http_parsers).get(((_b = p.headers.get('Content-Type')) === null || _b === void 0 ? void 0 : _b.split(';')[0]) || '');
            const encrypted = p.headers.get('x-encrypt') === 'true';
            let data = parser ? yield __classPrivateFieldGet(this, _a, "m", _http_processData).call(this, yield parser(p), encrypted, cert) : yield p.text();
            return { url: p.url, data, status: p.status, headers: p.headers, ok: p.ok, bodyUsed: p.bodyUsed, type: p.type, statusText: p.statusText };
        });
    }
    static fetchStream(req, cert) {
        return __asyncGenerator(this, arguments, function* fetchStream_1() {
            const options = {
                method: req.method,
                credentials: 'include',
                body: req.encrypt && req.body
                    ? JSON.stringify(yield __await((0, encrypt_1.encryptData)(req.body, cert || cache_1.default.cert)))
                    : (req.body != null ? JSON.stringify(req.body) : undefined),
                headers: Object.assign(Object.assign(Object.assign({}, (req.headers || {})), { 'S-ID': cache_1.default.s_id }), (req.encrypt && req.body ? {
                    'Content-Type': 'application/json',
                    'accept-service': 'true',
                    'x-encrypt': 'true'
                } : {}))
            };
            const response = yield __await((0, cache_1.fetch)(req.url || new URL(req.route || '', cache_1.default.API_URL), Object.assign(Object.assign({}, options), { signal: req.signal })));
            if (!response.body) {
                throw new Error("Response body is null; cannot stream.");
            }
            const reader = response.body.getReader();
            const encrypted = response.headers.get('x-encrypt') === 'true';
            // Base response metadata
            const meta = {
                url: response.url,
                status: response.status,
                headers: response.headers,
                ok: response.ok
            };
            try {
                while (true) {
                    const { done, value } = yield __await(reader.read());
                    if (done)
                        break;
                    const decoder = new TextDecoder('utf-8');
                    // Decode the stream chunk
                    let rawChunk = decoder.decode(value, { stream: true });
                    const data = (0, common_1.tryParseJSON)(rawChunk);
                    // If the chunk is encrypted or needs parsing, handle it here
                    // Note: Partial JSON chunks require a buffer if they aren't complete lines
                    try {
                        let processedChunk = encrypted
                            ? yield __await(__classPrivateFieldGet(this, _a, "m", _http_processData).call(this, data, true, cert))
                            : data;
                        yield yield __await({
                            chunk: processedChunk,
                            fullResponse: meta
                        });
                    }
                    catch (error) {
                        debugger;
                        yield yield __await({
                            chunk: rawChunk,
                            fullResponse: meta
                        });
                    }
                }
            }
            finally {
                reader.releaseLock();
            }
        });
    }
    static call(req, cert) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.fetch(req, cert), data = result.data;
            if (typeof data === 'string' && result.status >= 400) {
                return new common_1.TaskControlSignal({ error: data });
            }
            if (typeof data === 'object') {
                if ('#SERVICE' in data) {
                    const service = __classPrivateFieldGet(this, _a, "f", _http_services).get(data['#SERVICE']);
                    return service ? yield service(result, data) : this.serviceNotFound(result);
                }
                else if ('#ERROR' in data || result.status >= 400) {
                    return this.error(result);
                }
            }
            return new common_1.TaskControlSignal({ result: data });
        });
    }
    static serviceNotFound(response) {
        return new common_1.TaskControlSignal({ error: "Service not found", result: response });
    }
    static error(response) {
        return new common_1.TaskControlSignal({ error: response.data['#ERROR'], result: response });
    }
    static addServices(services) {
        Object.entries(services).forEach(([service, task]) => {
            __classPrivateFieldGet(this, _a, "f", _http_services).set(service, task);
        });
    }
    static callAPI(_b) {
        return __awaiter(this, arguments, void 0, function* ({ method, route, body, headers }, cert = cache_1.default.cert) {
            //combine the Env.API_URL + route with URL
            const url = new URL(route, cache_1.default.API_URL);
            return _a.fetch({
                url: url,
                method: method || 'GET',
                body: body || undefined,
                encrypt: true,
                headers
            }, cert).then((res) => {
                return res.data;
            }).catch((err) => {
                return new Error(err);
            });
        });
    }
}
exports.http = http;
_a = http, _http_processData = function _http_processData(data, encrypted, cert) {
    return __awaiter(this, void 0, void 0, function* () {
        if (typeof data === 'object') {
            if (encrypted) {
                if ('iv' in data && 'data' in data) {
                    data = yield (0, encrypt_1.decryptData)(data, cert || cache_1.default.cert);
                }
                else
                    throw new Error("Invalid encrypted data");
            }
        }
        return data;
    });
};
_http_services = { value: new Map() };
_http_parsers = { value: new Map([
        ['application/json', (res) => res.json()],
        ['text/plain', (res) => res.text()],
        ['application/octet-stream', (res) => res.arrayBuffer()],
    ]) };
