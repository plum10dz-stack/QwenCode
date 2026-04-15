"use strict";
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var _Channel_channel, _Channel_name;
Object.defineProperty(exports, "__esModule", { value: true });
exports.bc = exports.Channel = exports.EVT = void 0;
exports.broadcast = broadcast;
exports.listen = listen;
exports.listenFor = listenFor;
exports.listenForAny = listenForAny;
exports.once = once;
exports.sendCommand = sendCommand;
const helpers_1 = require("../helpers");
exports.EVT = Object.freeze({
    ROWS_CHANGED: 'rows:changed',
    ROWS_DELETED: 'rows:deleted',
    ROWS_SYNC_STATUS: 'rows:sync-status',
    DB_UPDATED: 'db:updated',
    DB_UPDATE_ERROR: 'db:update-error',
    SYNC_STATUS: 'sync:status',
    CONNECTION: 'connection',
    CMD_RESULT: 'cmd:result',
    PONG: 'pong',
    LAST_UPDATE: 'last:update',
    SW_INIT: 'sw:init',
    AUTH_SET: 'auth:set',
    AUTH_CLEAR: 'auth:clear',
    CMD_CREATE: 'cmd:create',
    CMD_UPDATE: 'cmd:update',
    CMD_DELETE: 'cmd:delete',
    CMD_GET_ALL: 'cmd:get_all',
    CMD_GET: 'cmd:get',
    CMD_GET_BY_INDEX: 'cmd:get_by_index',
    CMD_FLUSH_QUEUE: 'cmd:flush_queue',
    PING: 'ping',
    CMD_GET_ALL_TABLES: 'cmd:get_all_tables',
    GET_ALL_TABLES: 'cmd:get_all_tables',
});
const CHANNEL_NAME = 'flow-db';
/**
 * FlowBroadcast class wraps BroadcastChannel operations.
 */
class Channel {
    get name() {
        return __classPrivateFieldGet(this, _Channel_name, "f");
    }
    constructor(name = CHANNEL_NAME) {
        _Channel_channel.set(this, void 0);
        _Channel_name.set(this, void 0);
        __classPrivateFieldSet(this, _Channel_channel, new BroadcastChannel((__classPrivateFieldSet(this, _Channel_name, name || CHANNEL_NAME, "f"))), "f");
    }
    /**
     * Broadcast a message object via the channel.
     * @param {string} type - Message type identifier.
     * @param {any} [payload={}] - Optional payload.
     * @returns {MessageRequest} The posted request object.
     */
    broadcast(type, payload = {}) {
        const reqId = (0, helpers_1.uuid)();
        const ts = Date.now();
        const req = { type, payload, ts, reqId };
        __classPrivateFieldGet(this, _Channel_channel, "f").postMessage(req);
        return req;
    }
    /**
     * Listen for messages with optional filtering and one-time execution.
     * @param {(data: any) => void} handler - Callback for message data.
     * @param {Object} [options]
     * @param {string|string[]} [options.types] - Event type(s) to filter.
     * @param {boolean} [options.once=false] - Auto-unsubscribe after first event.
     * @returns {() => void} Unsubscribe function.
     */
    listen(handler, options = {}) {
        const set = options.types && new Set([].concat(options.types));
        const fn = (e) => {
            const d = e.data;
            if (!set || set.has(d === null || d === void 0 ? void 0 : d.type)) {
                handler(d);
                if (options.once)
                    unlisten();
            }
        };
        const unlisten = () => __classPrivateFieldGet(this, _Channel_channel, "f").removeEventListener('message', fn);
        __classPrivateFieldGet(this, _Channel_channel, "f").addEventListener('message', fn);
        return unlisten;
    }
    /**
     * Listen for a single event type.
     * @param {string} type
     * @param {function(any): void} handler
     * @returns {function} Unsubscribe.
     */
    listenFor(type, handler) {
        return this.listen(handler, { types: type });
    }
    /**
     * Listen for multiple event types.
     * @param {string[]} types
     * @param {function(any): void} handler
     * @returns {function} Unsubscribe.
     */
    listenForAny(types, handler) {
        return this.listen(handler, { types });
    }
    /**
     * One-shot listener: fires once then unsubscribes.
     * @param {string} type
     * @param {function(any): void} handler
     */
    once(type, handler) {
        return this.listen(handler, { types: type, once: true });
    }
    /**
     * Send a command to the SW and await the response.
     * @param {string} type - EVT.CMD_* constant.
     * @param {any} payload - Command parameters.
     * @param {number} [timeout=8000] - Timeout in ms.
     * @returns {Promise<CommandResponse>} The response payload.
     */
    sendCommand(type, payload = {}, timeout = 8000) {
        return new Promise((resolve) => {
            const request = this.broadcast(type, payload);
            const timer = setTimeout(() => {
                unlisten();
                resolve({
                    error: new Error(`[flow] command ${type} timed out (reqId=${request.reqId})`),
                    request,
                });
            }, timeout);
            const unlisten = this.listen((data) => {
                clearTimeout(timer);
                resolve({
                    error: data.error ? new Error(data.error) : undefined,
                    request,
                    data,
                });
            }, { types: `${exports.EVT.CMD_RESULT}:${request.reqId}`, once: true });
        });
    }
}
exports.Channel = Channel;
_Channel_channel = new WeakMap(), _Channel_name = new WeakMap();
exports.bc = new Channel();
// ── Public API ─────────────────────────────────────────────────────────────
function broadcast(type, payload = {}, broadcastChannel = exports.bc) {
    return broadcastChannel.broadcast(type, payload);
}
function listen(handler, options = {}, broadcastChannel = exports.bc) {
    return broadcastChannel.listen(handler, options);
}
function listenFor(type, handler, broadcastChannel = exports.bc) {
    return broadcastChannel.listen(handler, { types: type });
}
function listenForAny(types, handler, broadcastChannel = exports.bc) {
    return broadcastChannel.listen(handler, { types });
}
function once(type, handler, broadcastChannel = exports.bc) {
    return broadcastChannel.listen(handler, { types: type, once: true });
}
function sendCommand(type, payload = {}, timeout = 8000, broadcastChannel = exports.bc) {
    return broadcastChannel.sendCommand(type, payload, timeout);
}
