
/**
 * Every row in LocalDB carries these system columns.
 */
interface BaseRow {
    id: string
    updated_at: number
    deleted?: boolean
    syncStatus?: SyncStatus
}

// ── Broadcast event shapes ─────────────────────────────────────────────────

interface BroadcastEvt {
    type: string
    _ts: number
}

type RowsChangedEvt = BroadcastEvt & {
    tableName: string
    id_list: string[]
    rows: BaseRow[]
    operation: 'insert' | 'update'
}

type RowsDeletedEvt = BroadcastEvt & {
    tableName: string
    id_list: string[]
    ids: string[]
}

type SyncStatusEvt = BroadcastEvt & {
    tableName: string
    rowIds: string[]
    status: SyncStatus
}

type ConnectionEvt = BroadcastEvt & {
    online: boolean
    hasServer: boolean
    error?: string
}

type CmdResultEvt = BroadcastEvt & {
    reqId: string
    rows?: BaseRow[]
    row?: BaseRow
    error?: string
    ok?: boolean
}

/**
 * Customer-side sync tracking column present on every row in LocalDB.
 */


/** @type {Record<string, SyncStatus>} */
// const SYNC_STATUS = Object.freeze({
//     /** Row was created/edited offline and is waiting to be sent to server. */
//     PENDING: 'pending',
//     /** Row is currently being sent to the server. */
//     SYNCING: 'syncing',
//     /** Row is confirmed synced with the server. */
//     SYNCED: 'synced',
//     /** The last sync attempt failed (see queue entry for error). */
//     ERROR: 'error',
// })

// ── Queue ──────────────────────────────────────────────────────────────────

type QueueOperation = 'insert' | 'update' | 'delete'

/** @type {Record<string, QueueOperation>} */
const QUEUE_OP = Object.freeze({
    INSERT: 'insert',
    UPDATE: 'update',
    DELETE: 'delete',
})

type QueueEntryStatus = 'pending' | 'processing' | 'failed'

/** @type {Record<string, QueueEntryStatus>} */
const QUEUE_ENTRY_STATUS = Object.freeze({
    PENDING: 'pending',
    PROCESSING: 'processing',
    FAILED: 'failed',
})

// ── JSDoc row shapes ───────────────────────────────────────────────────────


interface QueueEntry {
    id: string
    operation: QueueOperation
    tableName: string
    rowId: string
    data: Object
    created_at: string
    retryCount: number
    status: QueueEntryStatus
    error: string | null
}

/**
 * Shape returned by system.getUpdates (polling).
 * Key is tableName, value is array of rows (may carry deleted:true).
 */
interface ServerUpdatePayload {
    tables: { [tableName: string]: { rows: BaseRow[] } }
}

/**
 * A single Server-Sent Event chunk from /stream/changes.
 * The server emits one per commit, covering one table.
 */
interface StreamChunk {
    /** Must match a key in StockOS_CONFIG.TABLES. */
    table: string;
    /** Rows to upsert (rows carry deleted:false or no deleted field). */
    rows: BaseRow[];
    /** Rows to remove — only `id` is strictly required. */
    deletes: BaseRow[];
    /** Server-side epoch ms of the latest updated_at in this batch. */
    time: number;
}

/**
 * Internal envelope emitted on the 'updates' event by ServerDB.
 * `data` maps tableName → merged row array (deleted rows carry deleted:true).
 */
interface DeltaPayload {
    data: Record<string, BaseRow[]>;
    /** Epoch ms — used to advance lastTimeUpdate in LocalDB. */
    time: number;
}
