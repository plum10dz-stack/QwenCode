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
exports.setCacheValue = setCacheValue;
exports.getCacheValue = getCacheValue;
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
// Save a value
function setCacheValue(key, value) {
    return __awaiter(this, void 0, void 0, function* () {
        const cache = yield caches.open('sw-kv');
        yield cache.put(key, new Response(JSON.stringify(value)));
    });
}
// Read a value
function getCacheValue(key) {
    return __awaiter(this, void 0, void 0, function* () {
        const cache = yield caches.open('sw-kv');
        const res = yield cache.match(key);
        return res ? res.json() : undefined;
    });
}
// Example usage in SW
self.addEventListener('activate', () => __awaiter(void 0, void 0, void 0, function* () {
    yield setCacheValue('/lastUpdate', Date.now());
    const lastUpdate = yield getCacheValue('/lastUpdate');
}));
;
class TaskControlSignal {
    constructor(data) {
        Object.assign(this, data);
    }
}
exports.TaskControlSignal = TaskControlSignal;
