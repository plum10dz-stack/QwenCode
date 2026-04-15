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
exports.TaskControlSignal = exports.SCHEMA = void 0;
exports.openCache = openCache;
exports.setCacheValue = setCacheValue;
exports.getCacheValue = getCacheValue;
exports.sleep = sleep;
exports.saveFile = saveFile;
exports.LoadFile = LoadFile;
exports.tryParseJSON = tryParseJSON;
exports.parseEnvFile = parseEnvFile;
exports.parseNumber = parseNumber;
exports.SCHEMA = [
    { name: 'products', keyPath: 'id', indexes: [{ name: 'sku', keyPath: 'sku', unique: true }] },
    { name: 'categories', keyPath: 'id', indexes: [{ name: 'name', keyPath: 'name', unique: true }] },
    { name: 'suppliers', keyPath: 'id' },
    { name: 'customers', keyPath: 'id', indexes: [{ name: 'email', keyPath: 'email' }] },
    { name: 'endCustomers', keyPath: 'id' },
    { name: 'movements', keyPath: 'id', indexes: [{ name: 'product_id', keyPath: 'product_id' }] },
    { name: 'purchaseOrders', keyPath: 'id' },
    { name: 'salesOrders', keyPath: 'id' },
    { name: 'pPayments', keyPath: 'id', indexes: [{ name: 'order_id', keyPath: 'order_id' }] },
    { name: 'sPayments', keyPath: 'id', indexes: [{ name: 'order_id', keyPath: 'order_id' }] },
];
function openCache(callback) {
    return __awaiter(this, void 0, void 0, function* () {
        const cache = yield caches.open('sw-kv');
        return yield callback(cache);
    });
}
// Save a value
// 1. Added 'void' because setCacheValue doesn't return the Promise from openCache
function setCacheValue(cache, key, value) {
    return __awaiter(this, void 0, void 0, function* () {
        // 2. Ensure the key is a Request object so we can modify it
        const request = new Request(key, { method: 'GET' });
        return yield cache.put(request, new Response(JSON.stringify(value), {
            headers: { 'Content-Type': 'application/json' }
        })).then(v => {
            console.log(v);
        }).catch(r => {
            console.log(r);
        });
    });
}
// Read a value
function getCacheValue(cache, key) {
    return __awaiter(this, void 0, void 0, function* () {
        // 3. Also ensure the match uses GET
        const request = new Request(key, { method: 'GET' });
        const response = yield cache.match(request);
        // 4. Added a try/catch around .json() in case the cached data is corrupted
        if (response) {
            let data;
            try {
                data = yield response.text();
                return JSON.parse(data);
            }
            catch (_a) {
                return data;
            }
        }
        return undefined;
    });
}
function sleep(ms) {
    return __awaiter(this, void 0, void 0, function* () { if (!ms)
        return; return new Promise(res => setTimeout(res, ms)); });
}
// Example usage in SW
self.addEventListener('activate', () => __awaiter(void 0, void 0, void 0, function* () {
    yield openCache((cache) => __awaiter(void 0, void 0, void 0, function* () {
        yield setCacheValue(cache, '/lastUpdate', Date.now());
        yield getCacheValue(cache, '/lastUpdate');
    }));
}));
function saveFile() {
    return __awaiter(this, arguments, void 0, function* (file = '/.env', content) {
        try {
            return yield openCache((cache) => __awaiter(this, void 0, void 0, function* () {
                return yield setCacheValue(cache, file, content);
            }));
        }
        catch (error) {
            console.error(error);
            return undefined;
        }
    });
}
function LoadFile() {
    return __awaiter(this, arguments, void 0, function* (file = '/.env') {
        try {
            return yield openCache((cache) => __awaiter(this, void 0, void 0, function* () {
                return yield getCacheValue(cache, file);
            }));
        }
        catch (error) {
            console.error(error);
            return undefined;
        }
    });
}
function tryParseJSON(data) {
    try {
        if (typeof data !== 'string')
            return data;
        return JSON.parse(data);
    }
    catch (_a) {
        return data;
    }
}
function parseEnvFile(env_1) {
    return __awaiter(this, arguments, void 0, function* (env, { file, content } = { file: '/.env' }) {
        content = content ? content : yield LoadFile(file);
        if (typeof content === 'string') {
            content = tryParseJSON(content);
        }
        if (content === undefined)
            return;
        if (Array.isArray(content)) {
            for (const [key, value] of content) {
                env.set(key, value);
            }
        }
        else if (typeof content === 'object') {
            for (const [key, value] of Object.entries(content)) {
                env.set(key, value);
            }
        }
        else if (typeof content === 'string') {
            const lines = content.split('\n');
            for (const line of lines) {
                const [key, value] = line.split('=');
                env.set(key, value);
            }
        }
    });
}
;
class TaskControlSignal {
    constructor(data) {
        Object.assign(this, data);
    }
}
exports.TaskControlSignal = TaskControlSignal;
function parseNumber(value, positive = false) {
    value = Number(value);
    if (isNaN(value) || !isFinite(value)) {
        return 0;
    }
    if (positive && value < 0) {
        return 0;
    }
    return value;
}
