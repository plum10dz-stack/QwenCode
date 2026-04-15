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
exports.swChannel = exports.IBroadcastChannel = exports.ISWChannel = void 0;
const channel_1 = require("./channel");
class ISWChannel {
    get isServiceWorker() {
        return typeof ServiceWorkerGlobalScope !== 'undefined' && self instanceof ServiceWorkerGlobalScope;
    }
    sendResponse(res, state) {
        var _a;
        const event = state.bridge;
        if (!event) {
            // role : serviceWorker
            self.customers.get(event.id).then((customer) => {
                customer === null || customer === void 0 ? void 0 : customer.postMessage(res);
            });
        }
        else
            (_a = event.source) === null || _a === void 0 ? void 0 : _a.postMessage(res);
    }
    get Clients() {
        return new Promise((res) => {
            self.clients.matchAll({ includeUncontrolled: true }).then((v) => {
                res(v);
            }).catch((err) => {
                res([]);
            });
        });
    }
    sendRequest(req, state) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            if (this.isServiceWorker) {
                const p = state.bridge;
                if (p && p.source)
                    (_a = p.source) === null || _a === void 0 ? void 0 : _a.postMessage(req);
                else {
                    const clients = yield this.Clients;
                    clients.forEach((client) => {
                        client === null || client === void 0 ? void 0 : client.postMessage(req);
                    });
                }
            }
            else
                (_b = navigator.serviceWorker.controller) === null || _b === void 0 ? void 0 : _b.postMessage(req);
        });
    }
    onMessage(callback) {
        this._callback = callback;
    }
    constructor(target = navigator.serviceWorker) {
        this._callback = null;
        if (target) {
            target.addEventListener('message', (event) => {
                if (this._callback)
                    this._callback(event.data, event);
            });
        }
        else {
            self.addEventListener('message', (event) => {
                if (this._callback)
                    this._callback(event.data, event);
            });
        }
    }
}
exports.ISWChannel = ISWChannel;
class IBroadcastChannel {
    onMessage(callback) {
        this._callback = callback;
    }
    sendRequest(req, state) {
        this.bc.postMessage(req);
    }
    sendResponse(res, state) {
        var _a;
        const event = state.bridge;
        if (!event) {
            // role : serviceWorker
            self.customers.get(event.id).then((customer) => {
                customer === null || customer === void 0 ? void 0 : customer.postMessage(res);
            });
        }
        else
            (_a = event.source) === null || _a === void 0 ? void 0 : _a.postMessage(res);
    }
    constructor(name) {
        this.name = name;
        this._callback = null;
        this.bc = new BroadcastChannel(name);
        this.bc.addEventListener('message', (e) => {
            if (this._callback)
                this._callback(e.data, e);
        });
    }
}
exports.IBroadcastChannel = IBroadcastChannel;
exports.swChannel = new channel_1.Channel(new ISWChannel());
exports.default = exports.swChannel;
