
import { DataRowType, Row } from './Row';
import { FastArray } from '../fastArray';
import { on } from '../EventEmitter';
import { SourceEventPayload } from '../datasource/Datasource';
import { TableName } from '../../workspace/config';

interface TableEvent<T extends Row> {
  event: 'create' | 'update' | 'delete';
  row: T;
}

// Options for Table
export interface TableOptions<DataType extends DataRowType, RowType extends Row<DataType> = Row<DataType>> {
  newID(table: Table<DataType, RowType>, data: DataType | RowType): string | PromiseLike<string>;
  newRow(table: Table<DataType, RowType>, data: DataType): Promise<RowType>;
}

export class Table<DataType extends DataRowType, RowType extends Row<DataType> = Row<DataType>> extends FastArray<RowType> {
  async save(row: DataType | RowType): Promise<RowType> {
    const id = row.id;
    if (!id) row.id = await this.opts.newID(this, row);
    if (row instanceof Row) {

    } else {
      const existing = this.getById(id) as RowType;
      row = existing ? existing.cloneFrom(row) : await this.opts.newRow(this, row);
    }
    return this.upsert(row) as RowType;
  }
  async new(data: DataType, upsert: boolean = true): Promise<RowType> {
    const row = await this.opts.newRow(this, data);
    if (upsert) return this.upsert(row);
    this.push(row);
    return row;
  }
  /** Unsubscribe callbacks */
  #unsubs: Array<() => void> = [];
  #eventChannel: string | string[];

  public tableName: string;

  constructor(tableID: string | string[], tableName: string, readonly opts: TableOptions<DataType, RowType>) {
    super(undefined, 'id');
    this.tableName = tableName;
    this.#eventChannel = tableID;

    this.#unsubs.push(
      on('tables', tableID, (evt: TableEvent<RowType>) => {
        if (evt.event === 'create') this.upsert(evt.row);
        else if (evt.event === 'update') this.upsert(evt.row);
        else if (evt.event === 'delete') this.delete(evt.row);
      })
    );
  }

  // ── Public API ────────────────────────────────────────────────────────────
  protected _validateItem(item: RowType): void {
    if (!(item instanceof Row)) {
      throw new TypeError('Item must be an instance of Row.');
    }
    if (!item.id) {
      throw new TypeError(`Item key "${String(this._idKey)}" must be valid.`);
    }
    if (item.tableName !== this.tableName) {
      throw new TypeError(
        `Item table name "${item.tableName}" must match table name "${this.tableName}".`
      );
    }
  }

  /**
   * Populate rows from an initial snapshot.
   * Typically called once on component mount with data from Orchestrator.getAll().
   */
  hydrate(rows: RowType[]): void {
    this.splice(0, this.length, ...rows);
  }
  applyDelta({ deletes = [], updates = [] }: DeltaPayload): void {
    throw new Error('Method not implemented.');
  }
  /**
   * Stop listening for broadcast events.
   * Always call this on component/module unmount to prevent memory leaks.
   */
  destroy(): void {
    this.#unsubs.forEach((fn) => fn());
    this.#unsubs = [];
    super.destroy();
  }
}


export interface DeltaPayload extends SourceEventPayload {
  tableName: TableName;
}