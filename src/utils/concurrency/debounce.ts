// A unique symbol to silently identify cancelled calls without throwing errors
const CANCELLED = Symbol('DEBOUNCE_CANCELLED');

export interface DebouncedAsync<T extends (...args: any[]) => Promise<any>> {
    /**
     * The debounced function. Returns the original type OR the CANCELLED symbol.
     */
    (...args: Parameters<T>): Promise<ReturnType<T> | typeof CANCELLED>;

    /**
     * Imperatively cancel any pending execution and abort underlying work.
     */
    cancel: () => void;
}

/**
 * A robust, enterprise-grade async debounce.
 * - Does not throw errors for cancellation (clean control flow).
 * - Aborts underlying async operations via AbortController.
 * - Exposes a `.cancel()` method.
 */
export function debounce<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    delayMs: number
): DebouncedAsync<T> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let abortController: AbortController | null = null;
    let resolvePending: ((value: any) => void) | null = null;

    const execute = function (this: any, ...args: any[]): Promise<any> {
        // 1. Cancel previous pending execution
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
            abortController?.abort(); // Actually stop underlying fetches/network calls
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

            timeoutId = setTimeout(async () => {
                const currentResolve = resolvePending;
                resolvePending = null; // Prevent double resolution

                try {
                    // Check if we were cancelled during the exact moment of execution
                    if (signal.aborted) {
                        currentResolve!(CANCELLED);
                        return;
                    }

                    // Pass the signal as the last argument to the target function
                    // (Standard pattern for fetch, axios, etc.)
                    const result = await fn.apply(this, [...args, signal]);
                    currentResolve!(result);
                } catch (error) {
                    // ONLY reject on REAL errors (network failure, auth error)
                    // Ignore AbortErrors, as those are intentional cancellations
                    if (error instanceof DOMException && error.name === 'AbortError') {
                        currentResolve!(CANCELLED);
                    } else {
                        currentResolve!(Promise.reject(error)); // Wrap in rejected promise to maintain async error throwing
                    }
                }
            }, delayMs);
        });
    };

    // Attach stateful control methods
    execute.cancel = () => {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
            abortController?.abort();
            if (resolvePending) {
                resolvePending(CANCELLED);
                resolvePending = null;
            }
            timeoutId = null;
        }
    };

    return execute as DebouncedAsync<T>;
}
