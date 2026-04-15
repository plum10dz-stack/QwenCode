declare type PromiseCallback<T> = (value: T | PromiseLike<T>) => void;
declare type PromiseRejector = (reason?: any) => void;
declare type PromiseExecutor<T> = (res: PromiseCallback<T>, rej: PromiseRejector, p: Promise<T>) => void;
// A wrapper that adds the "Single-Flight" behavior to ANY async function
export function singleFlight<T>(fn: PromiseExecutor<T>): () => Promise<T> {
    let inFlightPromise: Promise<T> | null = null;

    return () => {
        if (inFlightPromise) return inFlightPromise;
        let _res: PromiseCallback<T>;
        let _rej: PromiseRejector;
        inFlightPromise = new Promise((res, rej) => { _res = res; _rej = rej; });
        inFlightPromise.finally(() => {
            inFlightPromise = null;
        });
        fn(_res!, _rej!, inFlightPromise);
        return inFlightPromise;
    };
}
// Define the shape of the function the user must provide
type FetcherFunction<TKey, TResult> = (key: TKey) => Promise<TResult>;

export class ResourceCoalescer<TKey extends string | number = string, TResult = unknown> {
    // Stores the promises of currently executing requests
    private inFlightRequests = new Map<TKey, Promise<TResult>>();

    /**
     * @param fetcher The heavy function that actually fetches the data (e.g., DB query)
     */
    constructor(private fetcher: FetcherFunction<TKey, TResult>) { }

    /**
     * Requests a resource. If it's already being fetched, it waits for that exact Promise.
     */
    public async get(key: TKey): Promise<TResult> {
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
    }

    /**
     * Optional: Utility to manually clear an in-flight request (e.g., if you know the DB is down
     * and you want to force-stop waiting threads).
     */
    public clearInFlight(key: TKey): void {
        this.inFlightRequests.delete(key);
    }
}