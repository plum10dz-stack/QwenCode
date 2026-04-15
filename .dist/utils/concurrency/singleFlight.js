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
exports.ResourceCoalescer = void 0;
exports.singleFlight = singleFlight;
// A wrapper that adds the "Single-Flight" behavior to ANY async function
function singleFlight(fn) {
    let inFlightPromise = null;
    return () => {
        if (inFlightPromise)
            return inFlightPromise;
        let _res;
        let _rej;
        inFlightPromise = new Promise((res, rej) => { _res = res; _rej = rej; });
        inFlightPromise.finally(() => {
            inFlightPromise = null;
        });
        fn(_res, _rej, inFlightPromise);
        return inFlightPromise;
    };
}
class ResourceCoalescer {
    /**
     * @param fetcher The heavy function that actually fetches the data (e.g., DB query)
     */
    constructor(fetcher) {
        this.fetcher = fetcher;
        // Stores the promises of currently executing requests
        this.inFlightRequests = new Map();
    }
    /**
     * Requests a resource. If it's already being fetched, it waits for that exact Promise.
     */
    get(key) {
        return __awaiter(this, void 0, void 0, function* () {
            // 1. If a request for this key is currently running, just return its Promise
            const existingPromise = this.inFlightRequests.get(key);
            if (existingPromise) {
                return existingPromise;
            }
            // 2. Otherwise, become the "leader". Execute the provided fetcher function.
            const taskPromise = this.fetcher(key).finally(() => {
                // 3. CRITICAL: Always clean up the map when the promise settles (success OR error).
                // This ensures subsequent requests trigger a fresh fetch if needed.
                this.inFlightRequests.delete(key);
            });
            // 4. Store the promise so subsequent callers can attach to it
            this.inFlightRequests.set(key, taskPromise);
            // 5. Return the promise to the caller (and any waiters)
            return taskPromise;
        });
    }
    /**
     * Optional: Utility to manually clear an in-flight request (e.g., if you know the DB is down
     * and you want to force-stop waiting threads).
     */
    clearInFlight(key) {
        this.inFlightRequests.delete(key);
    }
}
exports.ResourceCoalescer = ResourceCoalescer;
