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
var _EventEmitter_set;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventEmitter = exports.ALL = void 0;
exports.getEventEmitter = getEventEmitter;
exports.removeEventEmitter = removeEventEmitter;
exports.hasEventEmitter = hasEventEmitter;
exports.on = on;
exports.off = off;
exports.once = once;
exports.emit = emit;
exports.removeAllListeners = removeAllListeners;
exports.ALL = Symbol('ALL');
class EventEmitter {
    constructor() {
        _EventEmitter_set.set(this, new Map());
    }
    on(event, handler) {
        if (typeof event === 'function') {
            return this.on(exports.ALL, event);
        }
        if (typeof event === 'object') {
            for (const [key, value] of Object.entries(event)) {
                this.on(key, value);
            }
            return this;
        }
        if (!__classPrivateFieldGet(this, _EventEmitter_set, "f").has(event))
            __classPrivateFieldGet(this, _EventEmitter_set, "f").set(event, new Set());
        __classPrivateFieldGet(this, _EventEmitter_set, "f").get(event).add(handler);
        return this;
    }
    /**
     * @param {string}   event
     * @param {Function} handler
     * @returns {this}
     */
    off(event, handler) {
        var _a;
        (_a = __classPrivateFieldGet(this, _EventEmitter_set, "f").get(event)) === null || _a === void 0 ? void 0 : _a.delete(handler);
        return this;
    }
    /**
     * Register a handler that fires exactly once then removes itself.
     * @param {string}   event
     * @param {Function} handler
     * @returns {Function} returns a function to remove the handler
     */
    once(event, handler) {
        const w = (...args) => { this.off(event, w); return handler(...args); };
        this.on(event, w);
        return () => this.off(event, w);
    }
    /**
     * Synchronously invoke all handlers registered for `event`.
     * Errors are caught and logged; they do not stop remaining handlers.
     * @param {string} event
     * @param {...any}  args
     */
    emit(event, ...args) {
        const handlers = __classPrivateFieldGet(this, _EventEmitter_set, "f").get(event);
        if (handlers)
            for (const fn of handlers) {
                try {
                    fn(...args);
                }
                catch (e) {
                    console.error(`[EventEmitter:${String(event)}]`, e);
                }
            }
        if (event !== exports.ALL) {
            this.emit(exports.ALL, ...args);
        }
    }
    /**
     * Check if an event has any handlers.
     * @param {string} event
     * @returns {boolean}
     */
    has(event) {
        return __classPrivateFieldGet(this, _EventEmitter_set, "f").has(event);
    }
    /**
     * Asynchronously invoke all handlers registered for `event`.
     * Errors are caught and logged; they do not stop remaining handlers.
     * @param {string} event
     * @param {...any}  args
     * @returns {Promise<any>}
     */
    emitAsync(event, ...args) {
        return __awaiter(this, void 0, void 0, function* () {
            const handlers = __classPrivateFieldGet(this, _EventEmitter_set, "f").get(event);
            const ret = [];
            if (handlers)
                for (const fn of handlers) {
                    try {
                        ret.push(yield fn(...args));
                    }
                    catch (e) {
                        console.error(`[EventEmitter:${String(event)}]`, e);
                    }
                }
            if (event !== exports.ALL) {
                const resp = yield this.emitAsync(exports.ALL, ...args);
                if (Array.isArray(resp))
                    ret.push(...resp);
            }
            return ret.length <= 1 ? ret[0] : ret;
        });
    }
    /** Remove all handlers for an event, or all handlers if no event given. */
    removeAllListeners(event) {
        if (event)
            __classPrivateFieldGet(this, _EventEmitter_set, "f").delete(event);
        else
            __classPrivateFieldGet(this, _EventEmitter_set, "f").clear();
    }
    wait(event, timeout) {
        return new Promise((resolve) => {
            const timeoutId = typeof timeout === 'number' ? setTimeout(() => {
                handler();
                resolve(null);
            }, timeout) : null;
            const handler = this.once(event, (...args) => {
                if (timeoutId !== null)
                    clearTimeout(timeoutId);
                resolve(args);
            });
        });
    }
}
exports.EventEmitter = EventEmitter;
_EventEmitter_set = new WeakMap();
/**
 * @type {Map<string, EventEmitter>}
 */
const _eventEmitters = new Map();
/**
 * Get an EventEmitter by name.
 * @param {string} name
 * @returns {EventEmitter<any[]>}
 */
function getEventEmitter(name) {
    if (!name)
        throw new Error('EventEmitter name is required');
    if (!_eventEmitters.has(name))
        _eventEmitters.set(name, new EventEmitter());
    return _eventEmitters.get(name);
}
/**
 * Remove an EventEmitter by name.
 * @param {string} name
 */
function removeEventEmitter(name) {
    if (!name)
        throw new Error('EventEmitter name is required');
    _eventEmitters.delete(name);
}
/**
 * Check if an EventEmitter exists by name.
 * @param {string} name
 * @returns {boolean}
 */
function hasEventEmitter(name) {
    if (!name)
        throw new Error('EventEmitter name is required');
    return _eventEmitters.has(name);
}
function buildObject(props, value) {
    const o = {};
    for (let i = 0; i < props.length; i++) {
        o[props[i]] = value;
    }
    return o;
}
/**
 * Register a handler for an event.
 * @param {string} eventGroup
 * @param {string} event
 * @param {Function} handler
 */
function on(eventGroup, event, handler) {
    event = typeof event === 'string' ? [event] : event;
    const events = buildObject(event, handler);
    getEventEmitter(eventGroup).on(events);
    return () => {
        const x = getEventEmitter(eventGroup);
        for (const event in events) {
            x.off(event, handler);
        }
    };
}
/**
 * Remove a handler for an event.
 * @param {string} eventGroup
 * @param {string} event
 * @param {Function} handler
 */
function off(eventGroup, event, handler) {
    getEventEmitter(eventGroup).off(event, handler);
}
/**
 * Register a handler for an event that fires exactly once.
 * @param {string} eventGroup
 * @param {string} event
 * @param {Function} handler
 */
function once(eventGroup, event, handler) {
    getEventEmitter(eventGroup).once(event, handler);
}
/**
* Emit an event.
* @param {string} eventGroup
* @param {string} event
* @param {...any} args
*/
function emit(eventGroup, event, ...args) {
    getEventEmitter(eventGroup).emit(event, ...args);
}
/**
 * Remove all handlers for an event.
 * @param {string} eventGroup
 * @param {string} event
 */
function removeAllListeners(eventGroup, event) {
    getEventEmitter(eventGroup).removeAllListeners(event);
}
