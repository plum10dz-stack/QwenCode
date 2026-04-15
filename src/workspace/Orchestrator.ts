import { Table, TableOptions } from '../utils/data/Table';
import { ObjectGarbage } from '../utils/ObjectGarbage';
import { DataRowType, Row } from '../utils/data';
import { swChannel as sw } from '../utils/channels';
import { DbEvents, TableName } from './config';
import Env from '../utils/cache';

class Orchestrator {
  private _jwt: string | null;
  private _online: boolean;
  private _serverReachable: boolean;
  public readonly ready: Promise<void> = new Promise((res, rej) => { Env.set(Orchestrator, { res, rej }); });
  public get isReady() { return !Env.get(Orchestrator); }
  private reg: ServiceWorkerRegistration | null = null;

  constructor(readonly gc: ObjectGarbage, readonly swUrl: string = `/worker.js`) {
    this._jwt = null;
    this._online = navigator.onLine;
    this._serverReachable = false;
    this.gc = gc;
    this._watchNetwork();
    this._watchSW();
    this.init();
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Register the Service Worker, wait for PONG, then send SW_INIT with the
   * persisted watermark and current JWT (if any).
   * Await this once during app start-up before issuing any data calls.
   */
  private async init(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      console.warn('[Orchestrator] Service Workers not supported in this browser.');
      return;
    }

    this.reg = await navigator.serviceWorker.register(this.swUrl, { type: 'module', updateViaCache: 'imports', scope: '/' });

    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 5_000);
      sw.once(DbEvents.PONG, () => { clearTimeout(timer); resolve(); });
      sw.broadcast(DbEvents.PING);
    });
    const { res, rej } = Env.get(Orchestrator);
    Env.set(Orchestrator, undefined);
    res(this);
    // Seed the SW with the persisted watermark and any existing JWT
    sw.broadcast(DbEvents.SW_INIT, {
      jwt: this._jwt,
    });
  }


  // ── Auth ──────────────────────────────────────────────────────────────────

  /**
   * Set the JWT.  Broadcasts it to the SW which starts polling and flushes
   * any queued offline operations.
   * @param {string} jwt
   */
  setJwt(jwt: string): void {
    this._jwt = jwt;
    sw.broadcast(DbEvents.AUTH_SET, { jwt });
  }

  /** Clear the JWT and stop server polling. */
  clearJwt(): void {
    this._jwt = null;
    sw.broadcast(DbEvents.AUTH_CLEAR);
  }

  get isAuthenticated(): boolean { return !!this._jwt; }
  get isOnline(): boolean { return this._online; }
  get hasServer(): boolean { return this._online && this._serverReachable; }

  // ── Read ──────────────────────────────────────────────────────────────────

  /**
   * Get all non-deleted rows from a table (via Service Worker → IndexedDB).
   * Also feeds rows through gc.process() when ObjectGarbage is attached.
   *
   * @param {string} tableName
   * @returns {Promise<any[]>}
   */
  async getAll(tableName: TableName): Promise<any[]> {
    const rows = (await sw.smartCall(DbEvents.CMD_GET_ALL, { tableName })).data;
    const result = rows ?? [];
    this.gc?.process(tableName, result);
    return result;
  }

  /**
   * @param {string} tableName
   * @param {string} id
   * @returns {Promise<any|null>}
   */
  async get(tableName: TableName, id: string): Promise<any | null> {
    const { data: row } = await sw.smartCall(DbEvents.CMD_GET, { tableName, id });
    if (row) this.gc?.process(tableName, [row]);
    return row ?? null;
  }

  /**
   * @param {string} tableName
   * @param {string} indexName
   * @param {any}    value
   * @returns {Promise<any[]>}
   */
  async getByIndex(tableName: TableName, indexName: string, value: any): Promise<any[]> {
    const { data: rows } = await sw.smartCall(DbEvents.CMD_GET_BY_INDEX, { tableName, indexName, value });
    const result = rows ?? [];
    this.gc?.process(tableName, result);
    return result;
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  /**
   * Create a row.  SW tries the server first; falls back to local + queue when
   * offline or unauthenticated.
   *
   * @param {string} tableName
   * @param {object} data  Should include a customer-generated UUID `id`.
   * @returns {Promise<any>}
   */
  async create(tableName: TableName, data: object): Promise<any> {
    const result = await sw.smartCall(DbEvents.CMD_CREATE, { tableName, data });
    const row = result.data;
    if (row) this.gc?.process(tableName, [row]);
    return row;
  }

  /**
   * @param {string} tableName
   * @param {string} id
   * @param {object} changes  Partial row.
   * @returns {Promise<any>}
   */
  async update(tableName: TableName, id: string, changes: object): Promise<any> {
    const { data: row } = await sw.smartCall(DbEvents.CMD_UPDATE, { tableName, id, changes });

    if (row) this.gc?.process(tableName, [row]);
    return row;
  }

  /**
   * Soft-delete a row.
   * @param {string} tableName
   * @param {string} id
   * @returns {Promise<void>}
   */
  async delete(tableName: string, id: string): Promise<void> {
    await sw.smartCall(DbEvents.CMD_DELETE, { tableName, id });
  }

  // ── Domain helpers ────────────────────────────────────────────────────────

  async createProduct(data: object) { return this.create('products', data); }
  async updateProduct(id: string, changes: object) { return this.update('products', id, changes); }
  async deleteProduct(id: string) { return this.delete('products', id); }

  async createCustomer(data: object) { return this.create('customers', data); }
  async updateCustomer(id: string, changes: object) { return this.update('customers', id, changes); }
  async deleteCustomer(id: string) { return this.delete('customers', id); }

  async createSalesOrder(data: object) { return this.create('sales_orders', data); }
  async updateSalesOrder(id: string, changes: object) { return this.update('sales_orders', id, changes); }
  async deleteSalesOrder(id: string) { return this.delete('sales_orders', id); }

  async createOrderLine(data: object) { return this.create('order_lines', data); }
  async updateOrderLine(id: string, changes: object) { return this.update('order_lines', id, changes); }
  async deleteOrderLine(id: string) { return this.delete('order_lines', id); }

  async createPurchaseOrder(data: object) { return this.create('purchase_orders', data); }
  async updatePurchaseOrder(id: string, changes: object) { return this.update('purchase_orders', id, changes); }
  async deletePurchaseOrder(id: string) { return this.delete('purchase_orders', id); }

  async createSPayment(data: object) { return this.create('s_payments', data); }
  async createPPayment(data: object) { return this.create('p_payments', data); }
  async deleteSPayment(id: string) { return this.delete('sPayments', id); }
  async deletePPayment(id: string) { return this.delete('pPayments', id); }

  // ── Table factory ─────────────────────────────────────────────────────────

  /**
   * Create a reactive Table subscribed to one or more channel IDs, then
   * hydrate it with all current rows from the local cache.
   *
   * @param {string|string[]} subscriptionId  Channel IDs to subscribe to.
   * @param {string}          tableName
   * @param {object}          [opts]          Passed to the Table constructor.
   * @returns {Promise<Table>}
   */
  async makeTable(subscriptionId: string | string[], tableName: TableName, opts: TableOptions<DataRowType, Row<DataRowType>>): Promise<Table<DataRowType, Row<DataRowType>>> {
    const table = new Table(subscriptionId, tableName, opts);
    table.hydrate(await this.getAll(tableName));
    return table;
  }

  /**
   * Create a Table for rows matching a specific index value.
   *
   * Example:
   * const lines = await orch.makeIndexedTable(
   * `items_${orderId}`, 'orderLines', 'order_id', orderId
   * )
   *
   * @param {string} subscriptionId  e.g. 'items_abc'
   * @param {string} tableName
   * @param {string} indexName
   * @param {any}    value
   * @param {object} [opts]
   * @returns {Promise<Table>}
   */
  async makeIndexedTable(subscriptionId: string, tableName: TableName, indexName: string, value: any, opts: TableOptions<DataRowType, Row<DataRowType>>): Promise<Table<DataRowType, Row<DataRowType>>> {
    const table = new Table([subscriptionId], tableName, opts);
    table.hydrate(await this.getByIndex(tableName, indexName, value));
    return table;
  }

  // ── Queue ─────────────────────────────────────────────────────────────────

  /** Trigger an immediate queue flush (also happens automatically on reconnect). */
  flushQueue(): void {
    sw.broadcast(DbEvents.CMD_FLUSH_QUEUE);
  }

  /**
   * Read the pending offline queue (for debug / UI display).
   * @returns {Promise<any[]>}
   */
  async getPendingQueue(): Promise<any[]> {
    const rows = (await sw.smartCall(DbEvents.CMD_GET_ALL, { tableName: '_queue' })).data;
    return rows ?? [];
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _watchNetwork(): void {
    window.addEventListener('online', () => {
      this._online = true;
      setTimeout(() => this.flushQueue(), 1_500);
    });
    window.addEventListener('offline', () => {
      this._online = false;
    });
    sw.listenFor(DbEvents.CONNECTION, ({ online, hasServer }: { online: boolean, hasServer: boolean }) => {
      this._online = online;
      this._serverReachable = !!hasServer;
    });
  }

  private async _watchSW(): Promise<void> {
    console.log('pinging SW', new Date(Date.now()));
    const ping = await sw.smartCall(DbEvents.PING, {}, 500).catch(v => ({ error: v }));
    console.log('ping', ping, new Date(Date.now()));
    if (ping?.error) {
      console.log('waiting for PONG', new Date(Date.now()));
      while (!await sw.smartCall(DbEvents.PONG, 500).then(v => true).catch(v => false));
      console.log('PONG received', new Date(Date.now()));
      return;
    }
    console.log('PONG received', new Date(Date.now()));
  }
}

export default new Orchestrator(
  ObjectGarbage.instance({
    channel: sw,
    onCreate(row, e) {

    },
    onUpdate(row, e) {

    },
    onDispose(row) {

    }
  }),
  '/worker.js'
);