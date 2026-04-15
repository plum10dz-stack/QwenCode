import { Row } from '../data/Row'
import { Datasource } from './Datasource'

import { uuid, now } from '../helpers.js'
import { LocalDB, OSLocalDB } from './LocalDB'
import { default as Env, fetch } from '../cache'


/**
 * ServerStore — talks to the remote API over HTTP and WebSocket.
 *
 * Architecture position:
 *   API Server  ──HTTP/WS──►  ServerStore  ──►  IndexedDBStore (LocalStore)
 *                                            └──►  Memory (via onSourceEvent)
 *
 * When there is no API server configured (VITE_API_URL is empty),
 * ServerStore operates in offline mode: it delegates everything to
 * IndexedDBStore directly and never opens a WebSocket.
 */
export class ServerStore extends Datasource<Row> {
  /**
   * Apply a server delta directly to the local IndexedDB store.
   * Called by the WebSocket message handler and by init().
   */
  async applyDelta(tableName: string, delta: { deletes: Row[]; updates: Row[] }): Promise<void> {
    await this._local.applyDelta(tableName, delta);
  }
  private _local: OSLocalDB
  private _apiUrl: any
  private _wsUrl: any
  private _online: any
  private _ws?: WebSocket;
  /**
   * @param {IndexedDBStore} localStore
   * @param {{ apiUrl?: string, wsUrl?: string }} opts
   */
  constructor(localStore: OSLocalDB, opts: { apiUrl?: string, wsUrl?: string } = {}) {
    super()
    this._local = localStore
    this._apiUrl = opts.apiUrl || Env.API_URL || ''
    this._wsUrl = opts.wsUrl || Env.WS_URL || ''



    /** @type {boolean} */
    this._online = !!this._apiUrl
  }

  get LocalStore() { return this._local }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  async _fetch(path: string, opts: any = {}) {
    if (!this._online) throw new Error('No API server configured (offline mode)')
    const res = await fetch(`${this._apiUrl}${path}`, {
      headers: { 'Content-Type': 'application/json', ...opts.headers },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    })
    if (!res.ok) throw new Error(`API ${opts.method || 'GET'} ${path} → ${res.status}`)
    return res.json()
  }

  // ── WebSocket live-sync ──────────────────────────────────────────────────────

  private _wsBackoff = 1_000;

  _connectWS() {
    if (!this._wsUrl || this._ws) return;
    try {
      this._ws = new WebSocket(this._wsUrl);
      this._ws.onopen = () => { this._wsBackoff = 1_000; }; // reset on success
      this._ws.onmessage = e => {
        try {
          const msg = JSON.parse(e.data);
          // Expected: { event, tableName, deletes, updates, eventTime }
          this.updateDate = new Date(msg.eventTime);
          this._local.applyDelta(msg.tableName, msg);
          this._emit(msg.event, { ...msg, eventTime: new Date(msg.eventTime) });
        } catch { /* ignore malformed messages */ }
      };
      this._ws.onclose = () => {
        this._ws = undefined;
        // Exponential backoff: 1 s, 2 s, 4 s … up to 30 s
        const delay = Math.min(this._wsBackoff, 30_000);
        this._wsBackoff = Math.min(this._wsBackoff * 2, 30_000);
        setTimeout(() => this._connectWS(), delay);
      };
    } catch { /* WS unavailable — stay offline */ }
  }

  // ── Store interface ───────────────────────────────────────────────────────────

  async getNewId(tableName: string) {
    if (!this._online) return uuid();
    try {
      const { id } = await this._fetch(`/api/new-id/${tableName}`);
      return id;
    } catch {
      return uuid();
    }
  }

  async newRow<T extends Row>(tableName: string) {
    const id = await this.getNewId(tableName)
    return { id, created_at: now() } as any as T
  }

  async auth(user: any, callback: any) {

  }

  /**
   * Pull delta updates from the server into LocalStore.
   * Falls back to LocalStore-only init when offline.
   */
  async init() {
    // Always ensure LocalStore (IndexedDB) is open
    await this._local.init()

    if (!this._online) {
      // Offline mode — nothing to pull from the server
      return this;
    }

    try {
      const since = this.updateDate.toISOString()
      // API returns: { tables: { [tableName]: { deletes, updates, eventTime } } }
      const delta = await this._fetch(`/api/sync?since=${encodeURIComponent(since)}`)

      for (const [tableName, change] of Object.entries(delta.tables || {})) {
        await this._local.applyDelta(tableName, <any>change)
        this.updateDate = new Date((change as any).eventTime)
      }
    } catch (err: any) {
      console.warn('ServerStore.init(): could not reach API, serving from local cache.', err.message)
    }

    // Open WebSocket for live updates
    this._connectWS();
    return this;
  }

  async getAll<T extends Row>(tableName: string) {
    // Always served from LocalStore — never from network on read
    return this._local.getAll(tableName) as any;
  }

  async saveRow(tableName: string, row: any) {
    if (this._online) {
      try {
        // Optimistic write to LocalStore first; let server confirm
        const saved = await this._local.saveRow(tableName, row)
        // Fire-and-forget to the API; if it fails we still have the local copy
        this._fetch(`/api/${tableName}`, {
          method: row.id && (this._local as any).rows ? 'PUT' : 'POST',
          body: saved,
        }).catch(err => console.warn('ServerStore.saveRow sync failed:', err.message))
        return saved
      } catch (err: any) {
        console.warn('ServerStore.saveRow local failed:', err.message)
        throw err
      }
    }
    // Offline — delegate entirely to LocalStore
    return this._local.saveRow(tableName, row)
  }

  async deleteRow(tableName: string, id: any) {
    await this._local.deleteRow(tableName, id)
    if (this._online) {
      this._fetch(`/api/${tableName}/${id}`, { method: 'DELETE' })
        .catch(err => console.warn('ServerStore.deleteRow sync failed:', err.message))
    }
  }
}
