/**
 * src/flow/sw/LocalDB.js
 *
 * Persists all application data in IndexedDB.
 *
 * lastTimeUpdate
 * ──────────────
 * Stored in localStorage (main thread) — NOT in IndexedDB here.
 * On SW boot the Orchestrator sends SW_INIT with the value read from
 * localStorage.  Each time the watermark advances the SW broadcasts
 * LAST_UPDATE so the main thread can persist it to localStorage.
 * This survives SW restarts without any extra IDB round-trip.
 *
 * id_list
 * ───────
 * Every mutation calls getIdList() from StockOS_CONFIG.ID_LIST_MAP to
 * compute the subscription channel IDs, then tags the BroadcastChannel
 * event with them.  Table instances whose `id` array overlaps with
 * the event's id_list react; others ignore it.
 *
 * Runs inside the Service Worker.
 */
import { SYNC_STATUS, SyncStatus } from '../data/Row';


import { DBConfig, getIdList, StockOS_CONFIG } from '../../workspace/config'
import { Row } from '../data/Row';
import { ServerDB } from './ServerDB';
import { Datasource } from './Datasource';
import { TableName } from './Memory';


const DB_EVENT = {
  ROWS_CHANGED: 'rows:changed',
  ROWS_DELETED: 'rows:deleted',
  ROWS_SYNC_STATUS: 'rows:sync-status',

  DB_UPDATED: 'db:updated',
  DB_UPDATE_ERROR: 'db:update-error',

  SYNC_STATUS: 'sync:status',
  CONNECTION: 'connection',
  CMD_RESULT: 'cmd:result',
  PONG: 'pong',
}

export class LocalDB<N extends string, T extends DBConfig<N>> extends Datasource<Row> {
  async clearAll() {
    throw new Error('Method not implemented.');
  }
  async applyDelta(tableName: any, delta: { deletes: Row[], updates: Row[] }): Promise<void> {
    const { deletes = [], updates = [] } = delta;
    const db = await this._open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(tableName, 'readwrite')
      const store = tx.objectStore(tableName)
      for (const { id } of deletes) store.delete(id)
      for (const row of updates) store.put(row)
      tx.oncomplete = () => resolve()
      tx.onerror = (e: any) => reject(e.target.error)
    })

  }
  getNewId(tableName: string): Promise<any> {
    throw new Error('Method not implemented.');
  }
  newRow<T = object>(tableName: string): Promise<T> {
    throw new Error('Method not implemented.');
  }
  auth(user: any, callback: () => Promise<void>): Promise<void> {
    throw new Error('Method not implemented.');
  }
  saveRow<T = object>(tableName: string, row: T): Promise<T> {
    throw new Error('Method not implemented.');
  }
  deleteRow(tableName: string, id: any): Promise<void> {
    throw new Error('Method not implemented.');
  }
  private _cfg: T;
  private _db: IDBDatabase | undefined;
  /** @param {StockOS_CONFIG} config */
  constructor(config: T) {
    super()
    this._cfg = config
    /** @type {IDBDatabase|null} */
    /** ISO — seeded by Orchestrator via SW_INIT, updated via applyServerUpdates */

  }



  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Open (or upgrade) IndexedDB, then hard-delete all soft-deleted rows.
   * Must be awaited before any other method.
   */
  async init(): Promise<this> {
    this._db = await this._open()
    await this._cleanDeleted()
    return this;
  }


  // ── id_list helper ────────────────────────────────────────────────────────

  /**
   * Returns the subscription channel IDs for a given row.
   *
   * @param {string} tableName
   * @param {Object} row
   * @returns {string[]}
   *
   * Examples (from config.js):
   *   getIdList('orderLines', { order_id:'abc' })
   *       → ['order_lines', 'items_abc']
   *   getIdList('sPayments', { customer_id:'x', order_id:'y' })
   *       → ['payments', 'payments_x', 'payments_y']
   */
  getIdList(tableName: N, row: any) {
    const fn = this._cfg.TABLES[tableName]?.id_list;
    if (!fn) return [tableName]
    return fn(row)
  }

  // ── Server delta application ───────────────────────────────────────────────

  /**
   * Apply a batch of server rows.
   * Called whenever ServerDB emits 'updates'.
   *
   * For each row:
   *   deleted = true  → hard-delete from IDB + broadcast ROWS_DELETED
   *   otherwise       → upsert, set syncStatus = synced + broadcast ROWS_CHANGED
   *
   * Advances lastTimeUpdate to the highest updated_at seen and broadcasts
   * LAST_UPDATE so the main thread can persist it to localStorage.
   *
   * @param {import('../flow/types.js').ServerUpdatePayload} payload
   */
  async applyServerUpdates(tables: Record<string, Row[]>, time: any) {
    if (!tables) return;
    for (const [tableName, tableData] of Object.entries(tables)) {
      // ── Guard: only write tables that are declared as locally-cached ──────
      // Tables with locally:false (order_lines, movements, payments) and
      // internal stores (_queue) are explicitly excluded from the sync engine.
      const schema = (this._cfg.TABLES as any)[tableName];
      if (!schema || schema.locally !== true) continue;

      const rows = tableData ?? []
      if (!rows.length) continue;
      const upserted: any[] = [];
      const deleted: any[] = [];
      const result = await this._reqs(tableName, 'readwrite', (store) => {
        for (const serverRow of rows) {
          const localRow = { ...serverRow, syncStatus: SYNC_STATUS.SYNCED }

          if ('deleted' in serverRow && serverRow.deleted) {
            store.delete(serverRow.id);
            deleted.push(serverRow.id)
          } else {
            store.put(localRow);
            upserted.push(localRow)
          }
        }
      });
      ;
      if (upserted.length) {
        this._emitChanged(tableName, upserted, 'update')
      }

      if (deleted.length) {
        this._emitDeleted(tableName, deleted)
      }

    }
    await this.setLastTimeUpdate(time)

  }
  /**
 * Store the last update time in the "cache" store.
 *
 * @param {string|number|Date} [time] - Time value to persist.
 *   - string → parsed with Date.parse
 *   - number → treated as ms since epoch
 *   - Date   → used directly
 *   - undefined → defaults to epoch (0)
 * @returns {Promise<void>}
 */
  async setLastTimeUpdate(time: Date | string | number) {
    let date;

    if (typeof time === 'string') {
      date = new Date(Date.parse(time));
    } else if (typeof time === 'number') {
      date = new Date(time || 0);
    } else if (time instanceof Date) {
      date = time;
    } else {
      date = new Date(0);
    }
    // Persist ISO string in the cache store
    return await this.keyValue('lastUpdate', date.toISOString());
  }

  /**
 * Retrieve the last update time from the "cache" store.
 *
 * @returns {Promise<Date>} Resolves with a Date object.
 */
  async getLastTimeUpdate() {
    const iso = await this.keyValue('lastUpdate') as string;
    // If nothing stored, default to epoch
    return iso ? new Date(iso) : new Date(0);
  }


  // ── Canonical CRUD ────────────────────────────────────────────────────────

  /**
   * Insert a new row.
   * Sets updated_at = now(), deleted = false, syncStatus = pending.
   * Broadcasts ROWS_CHANGED with the row's id_list.
   *
   * @param {string} tableName
   * @param {Object} data  Must include `id` (UUID).
   * @returns {Promise<Object>}
   */
  async insert(tableName: string, data: Row): Promise<Row> {
    const row: Row = {
      ...data,
      updated_at: this._now(),
      deleted: false,
      syncStatus: SYNC_STATUS.PENDING,
    } as any as Row;
    await this._idbPut(tableName, row)
    this._emitChanged(tableName, [row], 'insert')
    return row
  }

  /**
   * Update an existing row.
   * Merges changes, bumps updated_at = now(), sets syncStatus = pending.
   *
   * @param {string} tableName
   * @param {string} id
   * @param {Object} changes
   * @returns {Promise<Object>}
   */
  async update(tableName: string, id: string, changes: any): Promise<Row> {
    const existing = await this.get(tableName, id)
    if (!existing) throw new Error(`[LocalDB] update: ${tableName}/${id} not found`)

    const row: Row = {
      ...existing,
      ...changes,
      id,
      updated_at: this._now(),
      syncStatus: SYNC_STATUS.PENDING,
    }
    await this._idbPut(tableName, row)
    this._emitChanged(tableName, [row], 'update')
    return row
  }

  /**
   * Soft-delete a row (sets deleted = true).
   * id_list is computed BEFORE the deletion so FK channels are still available.
   *
   * @param {string} tableName
   * @param {string} id
   */
  async delete(tableName: N, id: string) {
    const existing = await this.get(tableName, id)
    if (!existing) return

    const id_list = getIdList(this._cfg, tableName, existing)
    const row: Row = {
      ...existing,
      deleted: true,
      updated_at: this._now(),
      syncStatus: SYNC_STATUS.PENDING,
    } as any;
    await this._idbPut(tableName, row)
    this._emitDeleted(tableName, [id])
  }

  /**
   * Update syncStatus for a list of row IDs.
   */
  async setSyncStatus(tableName: string, ids: string[], status: SyncStatus) {
    for (const id of ids) {
      const row = await this.get(tableName, id)
      if (row) await this._idbPut(tableName, { ...row, syncStatus: status })
    }
    this.emit(DB_EVENT.ROWS_SYNC_STATUS, { tableName, rowIds: ids, status })
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  async get(tableName: string, id: string): Promise<Row | null> {
    return this._req(tableName, 'readonly', (s) => s.get(id))
  }

  /** Non-deleted rows only. and where updated_at > lastTimeUpdate */
  async getAll<T extends Row>(tableName: string, lastTimeUpdate?: number): Promise<T[]> {
    const rows = await this._req(tableName, 'readonly', (s) => {
      if (lastTimeUpdate) {
        const index = s.index("updated_at");
        const range = IDBKeyRange.lowerBound(lastTimeUpdate, true);
        return index.getAll(range)
      }
      return s.getAll()

    })
    return rows ? rows.filter((r: Row) => !r.deleted) : [];
  }
  /** All rows including soft-deleted (internal use). */
  async getAllRows(tableName: string): Promise<Row[]> {
    return await this._req(tableName, 'readonly', (s: IDBObjectStore) => s.getAll()) ?? []
  }

  /**
   * @param {string} tableName
   * @param {string} indexName
   * @param {any}    value
   * @returns {Promise<Object[]>} Non-deleted rows.
   */
  async getByIndex(tableName: string, indexName: string, value: any) {
    return new Promise((resolve, reject) => {
      const tx = this._db!.transaction(tableName, 'readonly')
      const idx = tx.objectStore(tableName).index(indexName)
      const req = idx.getAll(IDBKeyRange.only(value))
      req.onsuccess = () => resolve((req.result ?? []).filter((r: Row) => !r.deleted))
      req.onerror = () => reject(req.error)
    })
  }

  // ── Queue ─────────────────────────────────────────────────────────────────

  /**
   * Enqueue an offline operation.
   * Entries are processed in created_at order by flushQueue().
   *
   * @param {import('../flow/types.js').QueueOperation} operation
   * @param {string} tableName
   * @param {Object} row  Full row snapshot.
   * @returns {Promise<import('../flow/types.js').QueueEntry>}
   */
  async enqueue(operation: QueueOperation, tableName: string, row: Row): Promise<QueueEntry> {
    const entry = {
      id: this._uuid(),
      operation,
      tableName,
      rowId: row.id,
      data: { ...row },
      created_at: this._now(),
      retryCount: 0,
      status: QUEUE_ENTRY_STATUS.PENDING,
      error: null,
    }
    await this._idbPut('_queue', entry)
    return entry
  }

  async getPendingQueue() {
    const all = await this._req('_queue', 'readonly', (s) => s.getAll()) ?? []
    return all
      .filter((e: QueueEntry) =>
        e.status === QUEUE_ENTRY_STATUS.PENDING ||
        e.status === QUEUE_ENTRY_STATUS.FAILED
      )
      .sort((a: QueueEntry, b: QueueEntry) => a.created_at.localeCompare(b.created_at))
  }

  async markQueueProcessing(entryId: string) {
    await this._patchQueueEntry(entryId, { status: QUEUE_ENTRY_STATUS.PROCESSING })
  }

  async markQueueDone(entryId: string) {
    await this._req('_queue', 'readwrite', (s) => s.delete(entryId))
  }

  async markQueueFailed(entryId: string, errorMsg: string) {
    const entry = await this.get('_queue', entryId)
    if (!entry) return
    await this._idbPut('_queue', {
      ...entry,
      status: QUEUE_ENTRY_STATUS.FAILED,
      retryCount: entry.retryCount + 1,
      error: errorMsg,
    })
  }

  /**
   * Process all pending queue entries against the server in created_at order.
   * Updates syncStatus and removes entries on success.
   *
   * @param {import('./ServerDB.js').ServerDB} serverDB
   */
  async flushQueue(serverDB: ServerDB) {
    // Do not attempt network operations if the browser reports as offline.
    if (!navigator.onLine) return;

    const entries = await this.getPendingQueue()
    if (!entries.length) return

    for (const entry of entries) {
      await this.markQueueProcessing(entry.id)
      await this.setSyncStatus(entry.tableName, [entry.rowId], SYNC_STATUS.SYNCING)

      try {
        let serverRow = null

        switch (entry.operation) {
          case QUEUE_OP.INSERT:
            serverRow = await serverDB.create(entry.tableName, entry.data)
            break
          case QUEUE_OP.UPDATE:
            serverRow = await serverDB.update(entry.tableName, entry.rowId, entry.data)
            break
          case QUEUE_OP.DELETE:
            await serverDB.delete(entry.tableName, entry.rowId)
            break
        }

        if (serverRow) {
          const reconciled = { ...serverRow, syncStatus: SYNC_STATUS.SYNCED }
          await this._idbPut(entry.tableName, reconciled)
          this._emitChanged(entry.tableName, [<any>reconciled], 'update')
        } else {
          await this.setSyncStatus(entry.tableName, [entry.rowId], SYNC_STATUS.SYNCED)
        }

        await this.markQueueDone(entry.id)
      } catch (err: any) {
        console.warn(
          `[LocalDB] queue flush failed: ${entry.operation} ${entry.tableName}/${entry.rowId}:`,
          err.message,
        )
        await this.markQueueFailed(entry.id, err.message)
        await this.setSyncStatus(entry.tableName, [entry.rowId], SYNC_STATUS.ERROR)
      }
    }
  }

  // ── IDB open / upgrade ────────────────────────────────────────────────────

  /**
 * Get or set a value in the "cache" object store.
 *
 * @param {string} key - The key to look up or store.
 * @param {*} [value] - If provided, the value to store. If omitted, the value is read.
 * @returns {Promise<*>} Resolves with the stored value (for get) or undefined (for set).
 */
  async keyValue(key: string, value: any = undefined) {
    const tx = this._db!.transaction('cache', 'readwrite');
    const store = tx.objectStore('cache');

    return new Promise((resolve) => {
      let req: IDBRequest;
      if (arguments.length === 1) {
        // GET
        req = store.get(key);
        req.onsuccess = () => resolve(req.result?.value);
        req.onerror = () => resolve(undefined);
      } else {
        // PUT
        req = store.put({ key, value });
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      }
    });
  }

  async _open(): Promise<IDBDatabase> {

    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this._cfg.DB_NAME, this._cfg.DB_VERSION)

      req.onupgradeneeded = (e) => {
        const db = (e.target! as any).result as IDBDatabase;
        if (!db.objectStoreNames.contains('cache')) {
          const store = db.createObjectStore('cache', { keyPath: 'key' });
        }
        for (const schemaName of Object.keys(this._cfg.TABLES)) {
          const schema = this._cfg.TABLES[schemaName as N];
          if (db.objectStoreNames.contains(schemaName)) continue
          const store = db.createObjectStore(schemaName, { keyPath: schema.keyPath })

          schema.indexes.forEach((idx) => {
            store.createIndex(idx.name, idx.keyPath, { unique: !!idx.unique })
          });
        }
      }

      req.onsuccess = (e) => resolve((e.target as any).result as IDBDatabase)
      req.onerror = (e) => reject((e.target as any).error as Error)
    })
  }

  /** Hard-delete all rows where deleted = true (runs once on init). */
  async _cleanDeleted() {
    for (const name in this._cfg.TABLES) {
      if (name.startsWith('_')) continue;
      const rows = await this.getAllRows(name)
      for (const row of rows) {
        if (row.deleted) await this._idbDelete(name, row.id)
      }
    }
  }

  // ── IDB helpers ───────────────────────────────────────────────────────────

  /**
  * Run one or more IndexedDB requests inside a transaction.
  *
  * @param {string} storeName - Object store name.
  * @param {"readonly"|"readwrite"} mode - Transaction mode.
  * @param {(store: IDBObjectStore) => void} fn - Callback that issues requests but returns nothing.
  * @returns {Promise<void>} Resolves when the transaction completes.
  */
  async _reqs(storeName: string, mode: "readonly" | "readwrite", fn: (store: IDBObjectStore) => void | Promise<void>) {
    return new Promise(async (resolve, reject) => {
      const tx = this._db!.transaction(storeName, mode);
      const store = tx.objectStore(storeName);

      // Execute user callback — it can issue many requests
      await fn(store);

      tx.oncomplete = (ev) => resolve((ev.target as any).result);
      tx.onerror = (ev) => reject((ev.target as any).error);
      tx.onabort = (ev) => reject((ev.target as any).error);
    });
  }

  _req<R extends Row | Row[]>(storeName: string, mode: "readonly" | "readwrite", fn: (store: IDBObjectStore) => IDBRequest): Promise<R | null> {
    return new Promise((resolve: (value: R | null) => void, reject: (reason?: any) => void) => {
      const tx = this._db!.transaction(storeName, mode)
      const store = tx.objectStore(storeName)
      const req = fn(store)
      req.onsuccess = () => resolve(req.result as R)
      req.onerror = () => reject(req.error)
    }).catch((e) => {
      console.error(e)
      return null;
    });
  }

  _idbPut(storeName: string, row: any) {
    return this._req(storeName, 'readwrite', (s: IDBObjectStore) => s.put(row))
  }

  _idbDelete(storeName: string, id: string) {
    return this._req(storeName, 'readwrite', (s: IDBObjectStore) => s.delete(id))
  }

  async _patchQueueEntry(entryId: string, changes: any) {
    const entry = await this.get('_queue', entryId)
    if (!entry) return
    await this._idbPut('_queue', { ...entry, ...changes })
  }

  // ── Broadcast helpers ─────────────────────────────────────────────────────

  _emitChanged(tableName: string, rows: Row[], operation: string) {
    this.emit(DB_EVENT.ROWS_CHANGED, { tableName, rows, operation })
  }

  _emitDeleted(tableName: string, ids: string[]) {
    this.emit(DB_EVENT.ROWS_DELETED, { tableName, ids })
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  _now() { return new Date().toISOString() }

  _uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
    })
  }
}
export declare type OSLocalDB = LocalDB<TableName, typeof StockOS_CONFIG>;

const cache = new LocalDB<"cache", DBConfig<"cache">>({
  DB_NAME: 'cache', DB_VERSION: 1, TABLES: {
    cache: {
      indexes: [],
      name: "cache",
      keyPath: "key",
      id_list: () => ['keys']
    }
  }
});
