import { http } from "../networking/http";
import { TaskControlSignal } from "../common";
export interface QueueJob<ARGS extends any[] = any[], T = any> {
    fn: (task: QueueJob<ARGS, T>, ...args: ARGS) => Promise<T>;
    args?: ARGS;
    self?: T;
}
interface QueueEntry<ARGS extends any[] = any[], T = any> {
    job: QueueJob<ARGS, T>;
    resolve: (v: any) => void;
    reject: (err: any) => void;
}
export class AsyncTaskQueue {
    // Idle/Wait state management
    #idlePromise?: Promise<void>;
    #idleResolve?: () => void;
    #idleReject?: (err: any) => void;

    // Queue state
    protected _queue: QueueEntry[] = [];
    #isProcessing = false;

    constructor(readonly parent?: AsyncTaskQueue) {
        this.#initializeIdlePromise();
    }

    // --- Public API ---

    // async fetch(req: Request, cert?: string) {
    //     return this.push({
    //         fn: (task: QueueJob, req: Request, cert?: string) => http.call(req, cert), // Simplified: closure captures url/options
    //         args: [req, cert]
    //     });
    // }

    async push(job: QueueJob, before?: QueueJob): Promise<any> {
        return new Promise((resolve, reject) => {
            const entry = { job, resolve, reject };

            const i = before ? this._queue.findIndex((item) => item.job === before) : -1;
            if (i !== -1) {
                this._queue.splice(i, 0, entry);
            } else {
                this._queue.push(entry);
            }

            if (!this.#isProcessing) {
                this.#process().catch(err => console.error("Queue processing failed unexpectedly:", err));
            }
        });
    }

    pause(): void {
        this.#isProcessing = false;
    }

    resume(): void {
        if (!this.#isProcessing && this._queue.length > 0) {
            this.#process().catch(err => console.error("Queue processing failed unexpectedly:", err));
        }
    }

    clear(): void {
        for (const item of this._queue) {
            item.reject(new Error("Queue cleared"));
        }
        this._queue = [];
        this.#isProcessing = false;
    }

    /** Waits until the queue is completely empty and idle */
    onIdle(): Promise<void> {
        if (!this.#idlePromise) {
            this.#initializeIdlePromise();
        }
        return this.#idlePromise!;
    }

    toJob(): QueueJob {
        return { fn: () => this.onIdle() };
    }

    get length(): number {
        return this._queue.length;
    }

    get isProcessing(): boolean {
        return this.#isProcessing;
    }

    get currentJob(): QueueJob | undefined {
        return this._queue[0]?.job;
    }

    // --- Private Implementation ---

    #initializeIdlePromise() {
        this.#idlePromise = new Promise((res, rej) => {
            this.#idleResolve = res;
            this.#idleReject = rej;
        });
    }
    protected filterQueue(filter: (job: QueueEntry) => boolean) {
        this._queue = this._queue.filter(filter);
        return this._queue;
    }
    protected findIndex<T>(erpCall: T) {
        return this._queue.findIndex((item) => item.job === erpCall);
    }
    cancel<T>(erpCall: T) {
        const index = this.findIndex<T>(erpCall);
        // but if index is 0, that mean the job is currently processing
        // so we need to reject the current job throw error and restart queue
        if (index === 0) {
            this._queue[index].reject(new Error("Queue cancelled"));

        }
        if (index !== -1) {
            this._queue.splice(index, 1);
            this._queue[index].reject(new Error("Queue cancelled"));
        }
    }
    #currentJob: Promise<any> | undefined;
    async #process(): Promise<void> {
        if (this.#isProcessing) return;
        this.#isProcessing = true;

        while (this._queue.length > 0 && this.#isProcessing) {
            const entry = this._queue[0];

            try {
                this.#currentJob = entry.job.fn(entry.job, ...(entry.job.args || []));
                const result = await this.#currentJob;
                if (result instanceof TaskControlSignal) {

                    // 2. Handle Replace (Update the job, but keep the entry wrapper so we don't lose resolve/reject)
                    if (result.replace) {
                        entry.job = result.replace;
                    }

                    // 3. Handle Retry
                    if (result.retry) {
                        if (result.pause) {
                            // If BOTH retry and pause are true, we break the loop 
                            // but DO NOT shift. This allows injecting tasks at the front.
                            this.#isProcessing = false;
                            break;
                        }
                        // CRITICAL FIX: Yield to the event loop to prevent infinite freezing loop
                        //await new Promise(resolve => setTimeout(resolve, 0));
                        continue; // Do not shift, retry the same queue item
                    } if (!result.replace) {
                        if (result.error) {
                            entry.reject(result.error);
                        } else {
                            entry.resolve(result.result);
                        }
                    }

                    // 4. Handle Pause (without retry)
                    if (result.pause) {
                        this._queue.shift(); // Task is done, remove it before pausing
                        this.#isProcessing = false; // Break loop and pause
                        break;
                    }
                } else {
                    // Standard non-signal return
                    entry.resolve(result);
                }
            } catch (error) {
                entry.reject(error);
            }

            // If we didn't `continue` or `break`, shift the successful item off the queue
            this._queue.shift();
        }

        // If the queue is empty, resolve the idle promise
        if (this._queue.length === 0) {
            this.#idleResolve?.();
            this.#idlePromise = undefined; // Allow onIdle() to create a new promise next time
        }

        this.#isProcessing = false;
    }
}
