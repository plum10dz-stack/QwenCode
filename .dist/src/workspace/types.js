"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QUEUE_ENTRY_STATUS = exports.QUEUE_OP = exports.SYNC_STATUS = void 0;
/** @type {Record<string, SyncStatus>} */
exports.SYNC_STATUS = Object.freeze({
    /** Row was created/edited offline and is waiting to be sent to server. */
    PENDING: 'pending',
    /** Row is currently being sent to the server. */
    SYNCING: 'syncing',
    /** Row is confirmed synced with the server. */
    SYNCED: 'synced',
    /** The last sync attempt failed (see queue entry for error). */
    ERROR: 'error',
});
/** @type {Record<string, QueueOperation>} */
exports.QUEUE_OP = Object.freeze({
    INSERT: 'insert',
    UPDATE: 'update',
    DELETE: 'delete',
});
/** @type {Record<string, QueueEntryStatus>} */
exports.QUEUE_ENTRY_STATUS = Object.freeze({
    PENDING: 'pending',
    PROCESSING: 'processing',
    FAILED: 'failed',
});
