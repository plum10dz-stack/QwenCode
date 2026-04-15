export class Semaphore {
    private _active: number = 0;
    private _queue: Array<() => void> = [];
    private readonly _maxConcurrency: number;

    /**
     * @param maxConcurrency Maximum number of tasks allowed to run at the same time.
     */
    constructor(maxConcurrency: number) {
        if (maxConcurrency < 1) {
            throw new Error("Semaphore maxConcurrency must be at least 1");
        }
        this._maxConcurrency = maxConcurrency;
    }

    /** Returns the number of tasks currently executing */
    public get active(): number {
        return this._active;
    }

    /** Returns the number of tasks waiting in the queue */
    public get waiting(): number {
        return this._queue.length;
    }

    /**
     * Executes a task. If the concurrency limit is reached, it waits in line.
     * Automatically releases the lock when the task finishes or throws an error.
     * 
     * @param task An async function to execute
     * @returns The result of the task
     */
    public async run<T>(task: () => Promise<T>): Promise<T> {
        const release = await this.acquire();
        try {
            return await task();
        } finally {
            release();
        }
    }

    /**
     * Manually acquire a lock. Returns a release function.
     * WARNING: You MUST call the release function, preferably in a try/finally block.
     */
    public async acquire(): Promise<() => void> {
        // If we are at the limit, wait at the back of the queue
        if (this._active >= this._maxConcurrency) {
            await new Promise<void>((resolve) => {
                this._queue.push(resolve);
            });
        }

        // We got a spot! Increment active count.
        this._active++;

        // Return the release function
        return this._release.bind(this);
    }

    /**
     * Internal release mechanism. Decrements active count and lets the next task in line go.
     */
    private _release(): void {
        this._active--;

        // If there are tasks waiting, pull the next one out of the queue
        if (this._queue.length > 0) {
            const nextResolve = this._queue.shift();
            // Calling resolve() allows the next `await new Promise(...)` to finish
            nextResolve?.();
        }
    }
}