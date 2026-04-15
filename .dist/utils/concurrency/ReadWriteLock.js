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
exports.ReadWriteLock = void 0;
class ReadWriteLock {
    constructor() {
        this.readers = 0;
        this.writerWaiting = false;
        this.writerActive = false;
        this.queue = [];
    }
    read(task) {
        return __awaiter(this, void 0, void 0, function* () {
            // Wait if a writer is active or waiting
            while (this.writerActive || this.writerWaiting) {
                yield new Promise(resolve => this.queue.push(resolve));
            }
            this.readers++;
            try {
                return yield task(); // Multiple reads can happen simultaneously
            }
            finally {
                this.readers--;
                if (this.readers === 0)
                    this.flushQueue();
            }
        });
    }
    write(task) {
        return __awaiter(this, void 0, void 0, function* () {
            this.writerWaiting = true;
            // Wait for all current readers and writers to finish
            while (this.readers > 0 || this.writerActive) {
                yield new Promise(resolve => this.queue.push(resolve));
            }
            this.writerWaiting = false;
            this.writerActive = true;
            try {
                return yield task(); // Only ONE write happens at a time
            }
            finally {
                this.writerActive = false;
                this.flushQueue();
            }
        });
    }
    flushQueue() {
        if (this.queue.length > 0)
            this.queue.shift()();
    }
}
exports.ReadWriteLock = ReadWriteLock;
