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
var _Channel_instances, _Channel_onMessage, _Channel_request, _Channel_response;
Object.defineProperty(exports, "__esModule", { value: true });
exports.Channel = void 0;
const EventEmitter_1 = require("../EventEmitter");
class Channel extends EventEmitter_1.EventEmitter {
    constructor(channel, id = crypto.randomUUID()) {
        super();
        _Channel_instances.add(this);
        this.channel = channel;
        this.id = id;
        channel.onMessage((msg, channelState) => { __classPrivateFieldGet(this, _Channel_instances, "m", _Channel_onMessage).call(this, msg, channelState); });
    }
    createRequest(action, payload, timeout) {
        return { id: crypto.randomUUID(), type: 'request', action, payload, sourceId: this.id, timeout: timeout || 5000 };
    }
    call(req, state) {
        return new Promise((resolve) => {
            const timeout = typeof req.timeout === 'number' ? setTimeout(() => {
                this.off(req.id, handler);
                resolve({ id: req.id, type: 'response', payload: null, error: 'timeout', targetId: this.id, sourceId: '' });
            }, req.timeout) : null;
            const handler = this.once(req.id, (res) => {
                if (timeout)
                    clearTimeout(timeout);
                resolve(res.payload);
            });
            this.channel.sendRequest(req, state || { self: this, bridge: undefined });
        });
    }
    fire(action, data, state) {
        this.channel.sendRequest(this.createRequest(action, data), state || { self: this, bridge: undefined });
    }
    smartCall(action, payload, timeout, state) {
        return __awaiter(this, void 0, void 0, function* () {
            const resp = yield this.call(this.createRequest(action, payload, timeout), state);
            if (resp.error)
                throw resp.error;
            else
                return resp.payload;
        });
    }
    broadcast(action, payload) {
        this.fire(action, payload);
    }
    listen(handler) {
        this.on(EventEmitter_1.ALL, handler);
        return () => this.off(EventEmitter_1.ALL, handler);
    }
    listenFor(action, handler) {
        this.on(action, handler);
        return () => this.off(action, handler);
    }
    listenOnce(action, handler) {
        return this.once(action, handler);
    }
}
exports.Channel = Channel;
_Channel_instances = new WeakSet(), _Channel_onMessage = function _Channel_onMessage(msg, bridge) {
    const state = { self: this, bridge: bridge, payload: msg };
    if (msg.type === 'request')
        __classPrivateFieldGet(this, _Channel_instances, "m", _Channel_request).call(this, state);
    else if (msg.type === 'response')
        __classPrivateFieldGet(this, _Channel_instances, "m", _Channel_response).call(this, state);
}, _Channel_request = function _Channel_request(state) {
    return __awaiter(this, void 0, void 0, function* () {
        const msg = state.payload;
        if (!this.has(msg.action))
            return;
        const response = {
            targetId: msg.sourceId,
            sourceId: this.id,
            id: msg.id,
            type: 'response',
            payload: null
        };
        try {
            response.payload = yield this.emitAsync(msg.action, state);
        }
        catch (error) {
            response.error = String(error);
        }
        this.channel.sendResponse(response, state);
    });
}, _Channel_response = function _Channel_response(state) {
    const msg = state.payload;
    if (msg.targetId === this.id) {
        this.emit(msg.id, state);
    }
};
