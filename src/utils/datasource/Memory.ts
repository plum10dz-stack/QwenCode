//import { Table } from '../../data/core/Table';
//import { TABLE_NAMES } from '../schema';
import { SourceEventPayload, Datasource } from './Datasource';
import { StockOS_CONFIG, TABLE_NAMES } from '../../workspace/config';
import { DataRowType, Row } from "../data/Row";

import { DeltaPayload, Table, TableOptions } from "../data/Table";
import { uuid } from '../helpers';
import { ObjectGarbage } from '../ObjectGarbage';
/**
 * Memory — the reactive working layer consumed by the UI.
 */
export class Memory extends Datasource<Row> {
  getNewId(tableName: string): Promise<any> {
    throw new Error('Method not implemented.');
  }
  newRow<T extends Row = Row>(tableName: string): Promise<T> {
    throw new Error('Method not implemented.');
  }
  auth(user: any, callback: () => Promise<void>): Promise<void> {
    throw new Error('Method not implemented.');
  }
  saveRow<T extends Row = Row>(tableName: string, row: T): Promise<T> {
    throw new Error('Method not implemented.');
  }
  deleteRow(tableName: string, id: any): Promise<void> {
    throw new Error('Method not implemented.');
  }
  getAll<T extends Row = Row>(tableName: string): Promise<T[]> {
    throw new Error('Method not implemented.');
  }
  applyDelta(tableName: any, delta: { deletes: Row[]; updates: Row[]; }): Promise<void> {
    throw new Error('Method not implemented.');
  }
  private serverStore: Datasource<Row>;
  public tables: Map<TableName, Table<DataRowType, Row<DataRowType>>>;

  constructor(serverStore: Datasource<Row>) {
    super()
    this.serverStore = serverStore;
    this.tables = new Map<TableName, Table<DataRowType, Row<DataRowType>>>();
    const registry: ObjectGarbage = undefined!;
    const opts: TableOptions<DataRowType, Row<DataRowType>> = {

      async newID(table, data) {
        return uuid();
      },
      async newRow(table, data) {
        return new Row(table.tableName, data, registry);
      }


    }
    // Create one Table instance for every table in the schema
    for (const name in StockOS_CONFIG.TABLES) {
      this.tables.set(name as TableName, new Table<DataRowType, Row<DataRowType>>(name, name, opts));
    }

    // Wire up live-sync
    serverStore?.onSourceEvent((event: string, payload: SourceEventPayload) => {
      this._onDelta(event, payload as DeltaPayload);
    });
  }

  /**
   * Return a Table by name with strict type checking.
   */
  public table<DataType extends DataRowType, T extends Row<DataType> = Row<DataType>>(name: TableName): Table<DataType, T> {
    const t = this.tables.get(name);
    if (!t) {
      throw new Error(`Memory: unknown table "${name}"`);
    }
    return t as any as Table<DataType, T>;
  }

  /**
   * Initialise all tables from the store.
   */
  public async init(): Promise<this> {
    // Step 1 — sync with backend
    await this.serverStore.init();

    // Step 2 — load every table from LocalStore or ServerStore
    const source = this.serverStore.LocalStore ?? this.serverStore;

    await Promise.all(
      TABLE_NAMES.map(async (name: TableName) => {
        const rows = await source.getAll(name) as Row[];
        this.table(name).hydrate(rows);
      })
    );
    return this;
  }

  /**
   * Apply a server-push delta to the relevant Table.
   */
  private _onDelta(event: string, delta: DeltaPayload): void {
    const { tableName } = delta;
    const t = this.tables.get(tableName);
    if (!t) return;
    t.applyDelta(delta);
  }
}
/**
 * Define the union of valid table names based on your schema constants.
 */
export type TableName = keyof typeof StockOS_CONFIG.TABLES;

/**
 * Payload interface for incoming server events.
 */
