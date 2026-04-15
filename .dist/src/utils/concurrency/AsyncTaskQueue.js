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
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var _AsyncTaskQueue_instances, _AsyncTaskQueue_idlePromise, _AsyncTaskQueue_idleResolve, _AsyncTaskQueue_idleReject, _AsyncTaskQueue_queue, _AsyncTaskQueue_isProcessing, _AsyncTaskQueue_initializeIdlePromise, _AsyncTaskQueue_process;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AsyncTaskQueue = void 0;
const http_1 = require("../networking/http");
const common_1 = require("../common");
class AsyncTaskQueue {
    constructor(parent) {
        _AsyncTaskQueue_instances.add(this);
        this.parent = parent;
        // Idle/Wait state management
        _AsyncTaskQueue_idlePromise.set(this, void 0);
        _AsyncTaskQueue_idleResolve.set(this, void 0);
        _AsyncTaskQueue_idleReject.set(this, void 0);
        // Queue state
        _AsyncTaskQueue_queue.set(this, []);
        _AsyncTaskQueue_isProcessing.set(this, false);
        __classPrivateFieldGet(this, _AsyncTaskQueue_instances, "m", _AsyncTaskQueue_initializeIdlePromise).call(this);
    }
    // --- Public API ---
    fetch(req, cert) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.push({
                fn: (task, req, cert) => http_1.http.call(req, cert), // Simplified: closure captures url/options
                args: [req, cert]
            });
        });
    }
    push(job, before) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                const entry = { job, resolve, reject };
                const i = before ? __classPrivateFieldGet(this, _AsyncTaskQueue_queue, "f").findIndex((item) => item.job === before) : -1;
                if (i !== -1) {
                    __classPrivateFieldGet(this, _AsyncTaskQueue_queue, "f").splice(i, 0, entry);
                }
                else {
                    __classPrivateFieldGet(this, _AsyncTaskQueue_queue, "f").push(entry);
                }
                if (!__classPrivateFieldGet(this, _AsyncTaskQueue_isProcessing, "f")) {
                    __classPrivateFieldGet(this, _AsyncTaskQueue_instances, "m", _AsyncTaskQueue_process).call(this).catch(err => console.error("Queue processing failed unexpectedly:", err));
                }
            });
        });
    }
    pause() {
        __classPrivateFieldSet(this, _AsyncTaskQueue_isProcessing, false, "f");
    }
    resume() {
        if (!__classPrivateFieldGet(this, _AsyncTaskQueue_isProcessing, "f") && __classPrivateFieldGet(this, _AsyncTaskQueue_queue, "f").length > 0) {
            __classPrivateFieldGet(this, _AsyncTaskQueue_instances, "m", _AsyncTaskQueue_process).call(this).catch(err => console.error("Queue processing failed unexpectedly:", err));
        }
    }
    clear() {
        for (const item of __classPrivateFieldGet(this, _AsyncTaskQueue_queue, "f")) {
            item.reject(new Error("Queue cleared"));
        }
        __classPrivateFieldSet(this, _AsyncTaskQueue_queue, [], "f");
        __classPrivateFieldSet(this, _AsyncTaskQueue_isProcessing, false, "f");
    }
    /** Waits until the queue is completely empty and idle */
    onIdle() {
        if (!__classPrivateFieldGet(this, _AsyncTaskQueue_idlePromise, "f")) {
            __classPrivateFieldGet(this, _AsyncTaskQueue_instances, "m", _AsyncTaskQueue_initializeIdlePromise).call(this);
        }
        return __classPrivateFieldGet(this, _AsyncTaskQueue_idlePromise, "f");
    }
    toJob() {
        return { fn: () => this.onIdle() };
    }
    get length() {
        return __classPrivateFieldGet(this, _AsyncTaskQueue_queue, "f").length;
    }
    get isProcessing() {
        return __classPrivateFieldGet(this, _AsyncTaskQueue_isProcessing, "f");
    }
    get currentJob() {
        var _a;
        return (_a = __classPrivateFieldGet(this, _AsyncTaskQueue_queue, "f")[0]) === null || _a === void 0 ? void 0 : _a.job;
    }
}
exports.AsyncTaskQueue = AsyncTaskQueue;
_AsyncTaskQueue_idlePromise = new WeakMap(), _AsyncTaskQueue_idleResolve = new WeakMap(), _AsyncTaskQueue_idleReject = new WeakMap(), _AsyncTaskQueue_queue = new WeakMap(), _AsyncTaskQueue_isProcessing = new WeakMap(), _AsyncTaskQueue_instances = new WeakSet(), _AsyncTaskQueue_initializeIdlePromise = function _AsyncTaskQueue_initializeIdlePromise() {
    __classPrivateFieldSet(this, _AsyncTaskQueue_idlePromise, new Promise((res, rej) => {
        __classPrivateFieldSet(this, _AsyncTaskQueue_idleResolve, res, "f");
        __classPrivateFieldSet(this, _AsyncTaskQueue_idleReject, rej, "f");
    }), "f");
}, _AsyncTaskQueue_process = function _AsyncTaskQueue_process() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (__classPrivateFieldGet(this, _AsyncTaskQueue_isProcessing, "f"))
            return;
        __classPrivateFieldSet(this, _AsyncTaskQueue_isProcessing, true, "f");
        while (__classPrivateFieldGet(this, _AsyncTaskQueue_queue, "f").length > 0 && __classPrivateFieldGet(this, _AsyncTaskQueue_isProcessing, "f")) {
            const entry = __classPrivateFieldGet(this, _AsyncTaskQueue_queue, "f")[0];
            try {
                const result = yield entry.job.fn(entry.job, ...(entry.job.args || []));
                if (result instanceof common_1.TaskControlSignal) {
                    // 1. Settle the user's promise with the ACTUAL data, not the wrapper
                    if (result.error) {
                        entry.reject(result.error);
                    }
                    else {
                        entry.resolve(result.result);
                    }
                    // 2. Handle Replace (Update the job, but keep the entry wrapper so we don't lose resolve/reject)
                    if (result.replace) {
                        entry.job = result.replace;
                    }
                    // 3. Handle Retry
                    if (result.retry) {
                        if (result.pause) {
                            __classPrivateFieldGet(this, _AsyncTaskQueue_queue, "f").shift(); // Remove finished attempt
                            __classPrivateFieldSet(this, _AsyncTaskQueue_isProcessing, false, "f"); // Break loop and pause
                            break;
                        }
                        // CRITICAL FIX: Yield to the event loop to prevent infinite freezing loop
                        yield new Promise(resolve => setTimeout(resolve, 0));
                        continue; // Do not shift, retry the same queue item
                    }
                    // 4. Handle Pause (without retry)
                    if (result.pause) {
                        __classPrivateFieldGet(this, _AsyncTaskQueue_queue, "f").shift(); // Task is done, remove it before pausing
                        __classPrivateFieldSet(this, _AsyncTaskQueue_isProcessing, false, "f"); // Break loop and pause
                        break;
                    }
                }
                else {
                    // Standard non-signal return
                    entry.resolve(result);
                }
            }
            catch (error) {
                entry.reject(error);
            }
            // If we didn't `continue` or `break`, shift the successful item off the queue
            __classPrivateFieldGet(this, _AsyncTaskQueue_queue, "f").shift();
        }
        // If the queue is empty, resolve the idle promise
        if (__classPrivateFieldGet(this, _AsyncTaskQueue_queue, "f").length === 0) {
            (_a = __classPrivateFieldGet(this, _AsyncTaskQueue_idleResolve, "f")) === null || _a === void 0 ? void 0 : _a.call(this);
            __classPrivateFieldSet(this, _AsyncTaskQueue_idlePromise, undefined, "f"); // Allow onIdle() to create a new promise next time
        }
        __classPrivateFieldSet(this, _AsyncTaskQueue_isProcessing, false, "f");
    });
};
