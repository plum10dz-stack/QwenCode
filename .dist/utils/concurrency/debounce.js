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
exports.debounce = debounce;
// A unique symbol to silently identify cancelled calls without throwing errors
const CANCELLED = Symbol('DEBOUNCE_CANCELLED');
/**
 * A robust, enterprise-grade async debounce.
 * - Does not throw errors for cancellation (clean control flow).
 * - Aborts underlying async operations via AbortController.
 * - Exposes a `.cancel()` method.
 */
function debounce(fn, delayMs) {
    let timeoutId = null;
    let abortController = null;
    let resolvePending = null;
    const execute = function (...args) {
        // 1. Cancel previous pending execution
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
            abortController === null || abortController === void 0 ? void 0 : abortController.abort(); // Actually stop underlying fetches/network calls
            if (resolvePending) {
                resolvePending(CANCELLED); // Silent resolution, NO error thrown
                resolvePending = null;
            }
        }
        // 2. Setup new execution context
        abortController = new AbortController();
        const signal = abortController.signal;
        return new Promise((resolve) => {
            resolvePending = resolve;
            timeoutId = setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                const currentResolve = resolvePending;
                resolvePending = null; // Prevent double resolution
                try {
                    // Check if we were cancelled during the exact moment of execution
                    if (signal.aborted) {
                        currentResolve(CANCELLED);
                        return;
                    }
                    // Pass the signal as the last argument to the target function
                    // (Standard pattern for fetch, axios, etc.)
                    const result = yield fn.apply(this, [...args, signal]);
                    currentResolve(result);
                }
                catch (error) {
                    // ONLY reject on REAL errors (network failure, auth error)
                    // Ignore AbortErrors, as those are intentional cancellations
                    if (error instanceof DOMException && error.name === 'AbortError') {
                        currentResolve(CANCELLED);
                    }
                    else {
                        currentResolve(Promise.reject(error)); // Wrap in rejected promise to maintain async error throwing
                    }
                }
            }), delayMs);
        });
    };
    // Attach stateful control methods
    execute.cancel = () => {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
            abortController === null || abortController === void 0 ? void 0 : abortController.abort();
            if (resolvePending) {
                resolvePending(CANCELLED);
                resolvePending = null;
            }
            timeoutId = null;
        }
    };
    return execute;
}
