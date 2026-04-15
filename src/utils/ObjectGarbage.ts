import { Channel } from './channels/channel';
import { ROW, Row } from './data/Row';
import { DbEvents, getIdList, StockOS_CONFIG } from '../workspace/config';
import { emit } from './EventEmitter';
import { DataRowType, Table, TableOptions } from './data';
import { uuid } from './helpers';
import { reactive, ref } from 'vue';
import { TableName } from './datasource';



// Extension for the window object


//const bc = new Channel(StockOS_CONFIG.BROADCAST_DB_EVENTS);

export interface ObjectGarbageOptions {
  channel: Channel;

  onCreate?: (row: Row, e: { gc: ObjectGarbage, table: Table<DataRowType, Row<DataRowType>> }) => void;
  onUpdate?: (row: Row, e: { gc: ObjectGarbage, table: Table<DataRowType, Row<DataRowType>> }) => void;
  onDispose?: (row: Row) => void;
}

export class ObjectGarbage {
  static #instance: ObjectGarbage;
  readonly #channel: Channel;
  /**
   * Primary registry. Key = `${tableName}:${id}`.
   */
  private _registry: Map<string, Row>;

  /**
   * Secondary index: tableName → Set<registryKey>.
   */
  private _tableIndex: Map<string, Table<DataRowType, Row<DataRowType>>> = new Map<string, Table<DataRowType, Row<DataRowType>>>();


  private _onCreate?: (row: Row<DataRowType>, e: { gc: ObjectGarbage, table: Table<DataRowType, Row<DataRowType>> }) => void;
  private _onUpdate?: (row: Row<DataRowType>, e: { gc: ObjectGarbage, table: Table<DataRowType, Row<DataRowType>> }) => void;
  private _onDispose?: (row: Row<DataRowType>) => void;

  /** BC unsubscribe callbacks */
  private readonly _unsubs: (() => void)[] = [];

  /**
   * @param {ObjectGarbageOptions} [opts]
   */
  private constructor(opts: ObjectGarbageOptions) {
    this._registry = new Map<string, Row>();
    this.#channel = opts.channel;
    this._onCreate = opts.onCreate;
    this._onUpdate = opts.onUpdate;
    this._onDispose = opts.onDispose;
    const self = this;
    this._tableOptions = {
      async newID(table, data) {
        return uuid();
      },
      async newRow(table, data) {
        return reactive(new Row(table.tableName, data, self)) as any;
      }
    }

    if (opts.channel) this.listenForChannelEvents();
  }

  public static instance(opts: ObjectGarbageOptions) {
    if (!ObjectGarbage.#instance) {
      ObjectGarbage.#instance = new ObjectGarbage(opts);
    }
    return ObjectGarbage.#instance;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  private listenForChannelEvents() {
    const ch = this.#channel;
    this._unsubs.push(
      ch.listenFor(DbEvents.ROWS_CHANGED, (evt: any) => {
        this.process(evt.tableName, evt.rows ?? []);
      }),
      ch.listenFor(DbEvents.ROWS_DELETED, (evt: any) => {
        this.processDeleted(evt.tableName, evt.ids ?? []);
      }),
      ch.listenFor(DbEvents.SYNC_STATUS, ({ payload: evt }: { payload: any }) => {
        this._applySyncStatus(evt.tableName, evt.rowIds, evt.status);
      }),
    );
  }


  /**
   * Stop listening.
   */
  detach(): void {
    this._unsubs.forEach((fn) => fn());
    this._unsubs.length = 0;
  }

  // ── Main API ──────────────────────────────────────────────────────────────

  /**
   * Process a batch of plain row objects from the Service Worker.
   * @param {string} tableName
   * @param {any[]} rows
   */
  process(tableName: TableName, rows: any[]): void {
    const table = this.getTable(tableName)
    const e = { gc: this, table };
    for (const rowObj of rows) {
      if (!rowObj?.id) continue;
      ;
      const key = `${tableName}:${rowObj.id}`;
      let row: Row;
      let event = 'update';
      if (this._registry.has(key)) {
        row = this._registry.get(key)!;
        if (row === rowObj) continue;
        row.cloneFrom(rowObj);
        this._onUpdate?.(row, e);
      } else {
        row = ref(new Row(tableName, rowObj, this)) as any;
        this._register(key, table, row);
        this._onCreate?.(row, e);
        if (this._onDispose) row.onDispose(this._onDispose);
        event = 'create';
      }

      getIdList(StockOS_CONFIG, tableName, row).forEach((idList) => {
        emit('tables', idList, { event, row, table });
      });
    }
  }

  /**
   * Handle server-reported deletions.
   * @param {string} tableName
   * @param {string[]} ids
   */
  processDeleted(tableName: string, ids: string[]): void {
    for (const id of ids) {
      const key = `${tableName}:${id}`;
      const row = this._registry.get(key);
      if (!row) continue;

      if (row[ROW.DISPOSABLE]) {
        row.dispose();
      } else {
        row[ROW.DATA].deleted = true;
      }
    }
  }

  // ── Lookups ───────────────────────────────────────────────────────────────

  /**
   * Get the unique Row for a (tableName, id) pair.
   */
  get(tableName: string, id: string): Row | undefined {
    return this._registry.get(`${tableName}:${id}`);
  }

  /**
   * All live (non-disposed) Rows for a table.
   */

  getTable<T extends DataRowType, R extends Row<T>>(tableName: string): Table<T, R> {
    let _table = this._tableIndex.get(tableName);
    if (_table) return _table as any;
    const table = reactive(new Table<T, R>(tableName, tableName, this._tableOptions as any)) as any as Table<T, R>;
    this._tableIndex.set(tableName, table as any);
    return table;
  }


  private readonly _tableOptions: TableOptions<DataRowType, Row<DataRowType>>;



  /**
   * Total number of live Row instances.
   */
  get size(): number { return this._registry.size; }

  // ── Bulk dispose ──────────────────────────────────────────────────────────

  /**
   * Dispose every registered Row.
   */
  disposeAll(): void {
    for (const row of [...this._registry.values()]) {
      row.dispose();
    }
    this._tableIndex.clear();
  }

  // ── Called by Row.dispose() ───────────────────────────────────────────────

  /**
   * Remove a Row from the registry.
   */
  _remove(key: string): void {
    const row = this._registry.get(key);
    if (!row) return;
    this._registry.delete(key);
    this._tableIndex.get(row[ROW.TABLE_NAME])?.delete(key);
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _register(key: string, table: Table<DataRowType, Row<DataRowType>>, row: Row): void {
    this._registry.set(key, row);
    table.push(row);
  }

  /**
   * Update syncStatus in the data payload of affected rows.
   */
  private _applySyncStatus(tableName: string, rowIds: string[], status: string): void {
    for (const id of rowIds) {
      const row = this.get(tableName, id);
      if (row) row[ROW.DATA].syncStatus = status;
    }
  }
}