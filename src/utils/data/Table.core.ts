import { reactive } from 'vue';
import { Datasource } from '../datasource/Datasource';

/**
 * Base interface to ensure rows have a unique identifier.
 */
interface Row {
  id: string | number;
}

/**
 * Delta structure for real-time updates.
 */
interface Delta<T> {
  deletes?: { id: string | number }[];
  updates?: T[];
}

/**
 * Interface representing the Store dependency.
 * Adjust the return types/parameters based on your actual Store.js implementation.
 */
// export interface Store {
//   newRow<T>(tableName: string): Promise<T>;
//   saveRow<T>(tableName: string, row: T): Promise<T>;
//   deleteRow(tableName: string, id: string | number): Promise<void>;
// }

/**
 * Reactive in-memory cache for a single database table.
 */
export class Table<T extends Row = Row> {
  public readonly name: string;
  private readonly _store: Datasource<T>;

  /**
   * The reactive row cache. Vue components read directly from this array.
   */
  public readonly rows: T[];

  constructor(name: string, store: Datasource<T>) {
    this.name = name;
    this._store = store;

    // In Vue 3, reactive arrays behave like standard arrays 
    // but maintain reactivity for the UI.
    this.rows = reactive<T[]>([]) as T[];
  }

  /**
   * Seed the cache from an already-fetched array.
   * @internal
   */
  _hydrate(rows: T[]): void {
    this.rows.splice(0, this.rows.length, ...rows);
  }

  /**
   * Apply a server-push delta event.
   * @internal
   */
  _applyDelta({ deletes = [], updates = [] }: Delta<T>): void {
    for (const { id } of deletes) {
      const i = this.rows.findIndex((r) => r.id === id);
      if (i > -1) this.rows.splice(i, 1);
    }
    for (const row of updates) {
      const i = this.rows.findIndex((r) => r.id === row.id);
      if (i > -1) {
        this.rows[i] = row;
      } else {
        this.rows.push(row);
      }
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * Allocate a new empty row object — does NOT insert into DB.
   */
  async newRow(): Promise<T> {
    return this._store.newRow<T>(this.name);
  }

  /**
   * Persist a row (create or update).
   * Writes to the store first; updates the local cache only on success.
   */
  async save(row: T): Promise<T> {
    const saved = await this._store.saveRow<T>(this.name, row);
    const i = this.rows.findIndex((r) => r.id === saved.id);

    if (i > -1) {
      this.rows[i] = saved;
    } else {
      this.rows.push(saved);
    }
    return saved;
  }

  /**
   * Delete a row by id.
   * Removes from store first; removes from cache only on success.
   */
  async delete(id: T['id']): Promise<void> {
    await this._store.deleteRow(this.name, id);
    const i = this.rows.findIndex((r) => r.id === id);
    if (i > -1) {
      this.rows.splice(i, 1);
    }
  }

  /**
   * Find a row by id (synchronous, reads from cache).
   */
  find(id: T['id']): T | undefined {
    return this.rows.find((r) => r.id === id);
  }
}