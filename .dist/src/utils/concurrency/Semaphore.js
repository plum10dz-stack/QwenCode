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
exports.Semaphore = void 0;
class Semaphore {
    /**
     * @param maxConcurrency Maximum number of tasks allowed to run at the same time.
     */
    constructor(maxConcurrency) {
        this._active = 0;
        this._queue = [];
        if (maxConcurrency < 1) {
            throw new Error("Semaphore maxConcurrency must be at least 1");
        }
        this._maxConcurrency = maxConcurrency;
    }
    /** Returns the number of tasks currently executing */
    get active() {
        return this._active;
    }
    /** Returns the number of tasks waiting in the queue */
    get waiting() {
        return this._queue.length;
    }
    /**
     * Executes a task. If the concurrency limit is reached, it waits in line.
     * Automatically releases the lock when the task finishes or throws an error.
     *
     * @param task An async function to execute
     * @returns The result of the task
     */
    run(task) {
        return __awaiter(this, void 0, void 0, function* () {
            const release = yield this.acquire();
            try {
                return yield task();
            }
            finally {
                release();
            }
        });
    }
    /**
     * Manually acquire a lock. Returns a release function.
     * WARNING: You MUST call the release function, preferably in a try/finally block.
     */
    acquire() {
        return __awaiter(this, void 0, void 0, function* () {
            // If we are at the limit, wait at the back of the queue
            if (this._active >= this._maxConcurrency) {
                yield new Promise((resolve) => {
                    this._queue.push(resolve);
                });
            }
            // We got a spot! Increment active count.
            this._active++;
            // Return the release function
            return this._release.bind(this);
        });
    }
    /**
     * Internal release mechanism. Decrements active count and lets the next task in line go.
     */
    _release() {
        this._active--;
        // If there are tasks waiting, pull the next one out of the queue
        if (this._queue.length > 0) {
            const nextResolve = this._queue.shift();
            // Calling resolve() allows the next `await new Promise(...)` to finish
            nextResolve === null || nextResolve === void 0 ? void 0 : nextResolve();
        }
    }
}
exports.Semaphore = Semaphore;
