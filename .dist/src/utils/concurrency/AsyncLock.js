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
exports.AsyncLock = void 0;
class AsyncLock {
    constructor() {
        // A promise chain that acts as a queue for the lock
        this._queue = Promise.resolve();
    }
    /**
     * Acquires the lock. Returns a release function.
     * WARNING: You must manually call release(), preferably in a try/finally block.
     */
    acquire() {
        return __awaiter(this, void 0, void 0, function* () {
            let release;
            // Create a promise that represents the current lock being held
            const waitForMe = new Promise((resolve) => {
                release = resolve;
            });
            // Chain our lock onto the queue, and update the queue to point to our new promise
            const previousLock = this._queue;
            this._queue = previousLock.then(() => waitForMe);
            // Wait for whoever currently has the lock to release it
            yield previousLock;
            // Return the release function. 
            // The '!' tells TypeScript we are certain it was assigned by the Promise executor.
            return release;
        });
    }
    /**
     * Safer alternative: Runs a function exclusively and automatically releases the lock when done.
     */
    withLock(task) {
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
}
exports.AsyncLock = AsyncLock;
