export class ReadWriteLock {
    private readers = 0;
    private writerWaiting = false;
    private writerActive = false;
    private queue: Array<(value?: any) => void> = [];

    async read<T>(task: () => Promise<T>): Promise<T> {
        // Wait if a writer is active or waiting
        while (this.writerActive || this.writerWaiting) {
            await new Promise(resolve => this.queue.push(resolve));
        }
        this.readers++;

        try {
            return await task(); // Multiple reads can happen simultaneously
        } finally {
            this.readers--;
            if (this.readers === 0) this.flushQueue();
        }
    }

    async write<T>(task: () => Promise<T>): Promise<T> {
        this.writerWaiting = true;
        // Wait for all current readers and writers to finish
        while (this.readers > 0 || this.writerActive) {
            await new Promise(resolve => this.queue.push(resolve));
        }
        this.writerWaiting = false;
        this.writerActive = true;

        try {
            return await task(); // Only ONE write happens at a time
        } finally {
            this.writerActive = false;
            this.flushQueue();
        }
    }

    private flushQueue() {
        if (this.queue.length > 0) this.queue.shift()!();
    }
}


