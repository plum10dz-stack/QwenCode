export class AsyncLock {
    // A promise chain that acts as a queue for the lock
    private _queue: Promise<void> = Promise.resolve();

    /**
     * Acquires the lock. Returns a release function.
     * WARNING: You must manually call release(), preferably in a try/finally block.
     */
    public async acquire(): Promise<() => void> {
        let release: () => void;

        // Create a promise that represents the current lock being held
        const waitForMe = new Promise<void>((resolve) => {
            release = resolve;
        });

        // Chain our lock onto the queue, and update the queue to point to our new promise
        const previousLock = this._queue;
        this._queue = previousLock.then(() => waitForMe);

        // Wait for whoever currently has the lock to release it
        await previousLock;

        // Return the release function. 
        // The '!' tells TypeScript we are certain it was assigned by the Promise executor.
        return release!;
    }

    /**
     * Safer alternative: Runs a function exclusively and automatically releases the lock when done.
     */
    public async withLock<T>(task: () => Promise<T>): Promise<T> {
        const release = await this.acquire();
        try {
            return await task();
        } finally {
            release();
        }
    }
}