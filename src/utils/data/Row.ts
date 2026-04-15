/**
 * src/flow/Row.ts
 */

import { ObjectGarbage } from "../ObjectGarbage";

// Placeholder interface based on the JSDoc in the original code
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'error'
export const SYNC_STATUS = Object.freeze({
  /** Row was created/edited offline and is waiting to be sent to server. */
  PENDING: 'pending',
  /** Row is currently being sent to the server. */
  SYNCING: 'syncing',
  /** Row is confirmed synced with the server. */
  SYNCED: 'synced',
  /** The last sync attempt failed (see queue entry for error). */
  ERROR: 'error',
})
//export  declare type SYNC_STATUS
// ── Symbol registry ────────────────────────────────────────────────────────
const TABLE_NAME = Symbol('Row.tableName');


/** boolean — auto-dispose when server marks row deleted */
const DISPOSABLE = Symbol('Row.disposable');

/** boolean — true once dispose() has been called */
const DISPOSED = Symbol('Row.disposed');

/** ObjectGarbage — owning registry; used by dispose() to de-register */
const REGISTRY = Symbol('Row.registry');

/** Function[] — callbacks registered via onDispose() */
const DISPOSE_HANDLERS = Symbol('Row.disposeHandlers');

// Computed-property getter keys (used in `get [ROW.ID]()` syntax)

/** Getter → this.id */
const ID = Symbol('Row.id');

/** Getter → `${tableName}:${id}` — registry lookup key */
const KEY = Symbol('Row.key');
const DATA = Symbol('Row.data');
export const ROW = Object.freeze({

  DATA,
  /** string — table name, e.g. 'products' */
  TABLE_NAME,

  /** boolean — auto-dispose when server marks row deleted */
  DISPOSABLE,

  /** boolean — true once dispose() has been called */
  DISPOSED,

  /** ObjectGarbage — owning registry; used by dispose() to de-register */
  REGISTRY,

  /** Function[] — callbacks registered via onDispose() */
  DISPOSE_HANDLERS,

  // Computed-property getter keys (used in `get [ROW.ID]()` syntax)

  /** Getter → this.id */
  ID,

  /** Getter → `${tableName}:${id}` — registry lookup key */
  KEY,
});

// ── Row class ──────────────────────────────────────────────────────────────

export class Row<T extends DataRowType = DataRowType> implements BaseRow {
  // Declare Symbol-keyed properties for TS tracking
  public [DATA]: Record<string, any>;
  public [TABLE_NAME]: string = '';
  [DISPOSABLE]: boolean = true;
  [DISPOSED]: boolean = false;
  [REGISTRY]: ObjectGarbage = <any>undefined;
  [DISPOSE_HANDLERS]: Array<(row: Row) => void> = [];

  // Public properties
  id: string = '';
  // This allows the class to accept the dynamic properties from rawData
  [key: string]: any;

  /**
   * Do not call directly. Use ObjectGarbage.process() to create Rows.
   *
   * @param {string}        tableName
   * @param {Record<string, any>} rawData     Plain or reactive data object.
   * @param {ObjectGarbage} registry
   */
  constructor(tableName: string, rawData: Record<string, any>, registry: ObjectGarbage) {
    // All meta stored under Symbol keys — invisible to spread / JSON
    this[TABLE_NAME] = tableName;

    this[DISPOSABLE] = true;
    this[DISPOSED] = false;
    this[REGISTRY] = registry;
    this[DISPOSE_HANDLERS] = [];
    this[DATA] = rawData;

    // copy all properties of rawData to this
    Object.assign(this, rawData);

    const id = rawData.id;
    Object.defineProperty(this, 'id', {
      get() {
        return id;
      },
      set(value: any) { },
      enumerable: true,
      configurable: false
    });

    // make tableName property of this immutable
    Object.defineProperty(this, 'tableName', {
      get() {
        return tableName;
      }, set(v) {

      },
      enumerable: true,
      configurable: false
    });
  }
  updated_at: number = 0;
  deleted?: boolean;
  syncStatus?: SyncStatus;

  // ── Computed-property getters (Symbol-keyed) ──────────────────────────────

  /**
   * The row's primary key, read from the data payload.
   * Access via:  row[ID]
   * @returns {string}
   */
  get [ID](): string {
    return this.id;
  }

  /**
   * The registry lookup key: `"${tableName}:${id}"`.
   * Access via:  row[KEY]
   * @returns {string}
   */
  get [KEY](): string {
    return `${this[TABLE_NAME]}:${this.id}`;
  }

  // ── Public API (string-keyed — the intended external interface) ───────────

  /**
   * Update the data payload in-place from a plain object.
   *
   * @param {Record<string, any>} obj  Partial or full server 
   * @returns {this}
   */
  cloneFrom(obj: Record<string, any>): this {
    if (this[DISPOSED]) {
      console.warn(`[Row] cloneFrom called on a disposed row (${this[KEY]})`);
      return this;
    }
    Object.assign(this, obj);
    return this;
  }

  /**
   * Return a plain (non-reactive) snapshot of the data payload.
   *
   * @returns {Record<string, any>}
   */
  toJSON(): Record<string, any> {
    return { ...this };
  }

  /**
   * Register a callback invoked when this Row is disposed.
   *
   * @param {(row: Row) => void} handler
   * @returns {this}
   */
  onDispose(handler: (row: Row) => void): this {
    this[DISPOSE_HANDLERS].push(handler);
    return this;
  }

  /**
   * Dispose this 
   */
  dispose(): void {
    if (this[DISPOSED]) return;
    this[DISPOSED] = true;
    this[REGISTRY]._remove(this[KEY]);
    for (const fn of this[DISPOSE_HANDLERS]) {
      try {
        fn(this);
      } catch (e) {
        console.error('[onDispose]', e);
      }
    }
    this[DISPOSE_HANDLERS] = [];
  }
  as<T>() { return this as any as T; }
}

export interface DataRowType {
  id: string;
  updated_at?: number;
  deleted_at?: number;
}
