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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _http_services, _http_processData, _http_parsers;
Object.defineProperty(exports, "__esModule", { value: true });
exports.http = void 0;
const cache_1 = __importDefault(require("../cache"));
const common_1 = require("../common");
const encrypt_1 = require("../crypto/encrypt");
class http {
    static fetch(req, cert) {
        return __awaiter(this, void 0, void 0, function* () {
            var _b;
            const options = {
                method: req.method,
                body: req.encrypt && req.body ? JSON.stringify(yield (0, encrypt_1.encryptData)(req.body, cert || cache_1.default.cert)) : (req.body != null ? JSON.stringify(req.body) : undefined),
                headers: req.encrypt && req.body ? Object.assign(Object.assign({}, (req.headers || {})), { 'Content-Type': 'application/json', 'accept-service': 'true', 'sid': cache_1.default.sid, 'x-encrypt': 'true' }) : Object.assign(Object.assign({}, (req.headers || {})), { 'sid': cache_1.default.sid })
            };
            const p = yield self.fetch(req.url, options);
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
                body: req.encrypt && req.body
                    ? JSON.stringify(yield __await((0, encrypt_1.encryptData)(req.body, cert || cache_1.default.cert)))
                    : (req.body != null ? JSON.stringify(req.body) : undefined),
                headers: Object.assign(Object.assign(Object.assign({}, (req.headers || {})), { 'sid': cache_1.default.sid }), (req.encrypt && req.body ? {
                    'Content-Type': 'application/json',
                    'accept-service': 'true',
                    'x-encrypt': 'true'
                } : {}))
            };
            const response = yield __await(self.fetch(req.url, options));
            if (!response.body) {
                throw new Error("Response body is null; cannot stream.");
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
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
                    // Decode the stream chunk
                    let rawChunk = decoder.decode(value, { stream: true });
                    // If the chunk is encrypted or needs parsing, handle it here
                    // Note: Partial JSON chunks require a buffer if they aren't complete lines
                    let processedChunk = encrypted
                        ? yield __await(__classPrivateFieldGet(this, _a, "m", _http_processData).call(this, rawChunk, true, cert))
                        : rawChunk;
                    yield yield __await({
                        chunk: processedChunk,
                        fullResponse: meta
                    });
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
            if ('#SERVICE' in data) {
                const service = __classPrivateFieldGet(this, _a, "f", _http_services).get(data['#SERVICE']);
                return service ? yield service(result, data) : this.serviceNotFound(result);
            }
            else if ('#ERROR' in data) {
                return this.error(result);
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
}
exports.http = http;
_a = http, _http_processData = function _http_processData(data, encrypted, cert) {
    return __awaiter(this, void 0, void 0, function* () {
        if (typeof data === 'object') {
            if (encrypted) {
                if ('iv' in data && 'data' in data) {
                    data = JSON.parse(yield (0, encrypt_1.decryptData)(data, cert || cache_1.default.cert));
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
