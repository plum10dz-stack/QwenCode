

import { EventEmitter } from '../EventEmitter';

/** localStorage key for the last sync timestamp */
export const UPDATE_DATE_KEY = 'stockos-updateDate'
export interface Row {
  id: string | number;
}
export interface SourceEventPayload {
  eventTime: Date;
  deletes: Row[];
  updates: Row[];
}

export type StoreEventType = 'delete' | 'update';

export type StoreListener = (event: StoreEventType, payload: SourceEventPayload) => void;

/**
 * Abstract base class for all store implementations.
 * ServerStore, IndexedDBStore, and SQLiteStore all extend this class.
 */
export abstract class Datasource<ROW> extends EventEmitter<any> {
  protected _eventDate: Date;
  protected _listeners: StoreListener[];

  constructor() {
    super();
    /** Timestamp of the last event received from the data source */
    this._eventDate = new Date(0);
    this._listeners = [];
  }

  // ── updateDate (sync checkpoint) ────────────────────────────────────────────
  //
  // IMPORTANT: localStorage is not available in Service Worker scope.
  // In the SW, lastTimeUpdate is stored in IndexedDB via LocalDB.keyValue().
  // This base-class property is kept only for main-thread (ServerStore) use.
  // Never access it from sw/ code — call localDB.getLastTimeUpdate() instead.

  private _updateDate: Date = new Date(0);

  /** Last known server sync point. Reads localStorage on the main thread; falls back to epoch in SW. */
  get updateDate(): Date {
    try {
      // `localStorage` is undefined in SW scope — this will throw.
      const v = localStorage.getItem(UPDATE_DATE_KEY);
      return v ? new Date(v) : this._updateDate;
    } catch {
      return this._updateDate;
    }
  }

  /** Persists the sync checkpoint. No-op in SW scope (IDB is used there instead). */
  set updateDate(value: Date) {
    this._updateDate = value;
    try {
      localStorage.setItem(UPDATE_DATE_KEY, value.toISOString());
    } catch {
      // Service Worker — silently ignore; LocalDB.setLastTimeUpdate() is the
      // authoritative store in that context.
    }
  }

  // ── eventDate (in-memory, reset each session) ────────────────────────────────

  get eventDate(): Date {
    return this._eventDate;
  }

  // ── onSourceEvent ────────────────────────────────────────────────────────────

  /**
   * Subscribe to data change events raised when the underlying source changes.
   */
  onSourceEvent(callback: StoreListener): void {
    this._listeners.push(callback);
  }

  /** Internal — fire all listeners */
  protected _emit(event: StoreEventType, payload: SourceEventPayload): void {
    this._eventDate = payload.eventTime;
    for (const fn of this._listeners) {
      fn(event, payload);
    }
  }

  // ── Abstract methods (must be overridden) ────────────────────────────────────

  /**
   * Return a new unique ID for a row in the given table.
   */
  abstract getNewId(tableName: string): Promise<any>;

  /**
   * Allocate a new empty row object shape — does NOT persist it.
   */
  abstract newRow<T extends ROW = ROW>(tableName: string): Promise<T>;

  /**
   * Authenticate a user. The callback is invoked if additional
   * information is required (MFA, password challenge, etc.).
   */
  abstract auth(user: any, callback: () => Promise<void>): Promise<void>;

  /**
   * Initialise: pull updates from the upstream source into this store.
   */
  abstract init(): Promise<this>;

  /**
   * Persist a single row to this store.
   */
  abstract saveRow<T extends ROW = ROW>(tableName: string, row: T): Promise<T>;

  /**
   * Delete a row by id from this store.
   */
  abstract deleteRow(tableName: string, id: any): Promise<void>;

  /**
   * Query all rows from a table.
   */
  abstract getAll<T extends ROW = ROW>(tableName: string): Promise<T[]>;

  /** The nested local cache store. null for leaf stores. */
  get LocalStore(): Datasource<ROW> | null {
    return null;
  }

  abstract applyDelta(tableName: any, delta: { deletes: ROW[], updates: ROW[] }): Promise<void>;
}