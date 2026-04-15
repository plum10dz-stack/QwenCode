// import { Store } from '../core/Store.js'
// import { uuid, now } from '@/utils/helpers.js'

// /**
//  * SQLiteStore — persists data in a SQLite database file.
//  *
//  * Target platforms: desktop (Tauri), mobile (Capacitor / Expo).
//  * On these targets, a native plugin exposes a `window.__sqlite` bridge.
//  *
//  * LocalStore is null — this is the bottom of the persistence chain,
//  * equivalent to IndexedDBStore on web.
//  *
//  * ⚠  This implementation is a STUB.
//  *    Replace the `_exec` / `_query` helpers with your native bridge.
//  *    The Store interface contract is fully implemented.
//  */
// export class SQLiteStore extends Store {
//   constructor(dbPath = 'stockos.db') {
//     super()
//     this._dbPath  = dbPath
//     this._bridge  = null   // set to window.__sqlite or your Tauri/Capacitor plugin
//   }

//   get LocalStore() { return null }

//   // ── Bridge helpers (replace with real native calls) ──────────────────────────

//   /** Execute a write statement */
//   async _exec(sql, params = []) {
//     if (!this._bridge) throw new Error('SQLiteStore: no native bridge available')
//     return this._bridge.execute(sql, params)
//   }

//   /** Execute a read query, return rows */
//   async _query(sql, params = []) {
//     if (!this._bridge) throw new Error('SQLiteStore: no native bridge available')
//     return this._bridge.query(sql, params)
//   }

//   // ── Store interface ───────────────────────────────────────────────────────────

//   async init() {
//     // On Tauri: acquire the bridge from the injected global
//     if (typeof window !== 'undefined' && window.__sqlite) {
//       this._bridge = window.__sqlite
//     }
//     // Create tables if they don't exist yet (run from schema)
//     const { SCHEMA } = await import('../schema.js')
//     for (const table of SCHEMA) {
//       await this._exec(
//         `CREATE TABLE IF NOT EXISTS "${table.name}" (data TEXT NOT NULL, id TEXT PRIMARY KEY)`
//       ).catch(() => {})
//     }
//   }

//   async getNewId(_tableName) { return uuid() }

//   async newRow(tableName) {
//     return { id: await this.getNewId(tableName), created_at: now() }
//   }

//   async auth(_user, _callback) { return true }

//   async getAll(tableName) {
//     const rows = await this._query(`SELECT data FROM "${tableName}"`)
//     return rows.map(r => JSON.parse(r.data))
//   }

//   async saveRow(tableName, row) {
//     const n     = now()
//     const saved = { ...row, updated_at: n, created_at: row.created_at || n, id: row.id || uuid() }
//     const json  = JSON.stringify(saved)
//     await this._exec(
//       `INSERT INTO "${tableName}" (id, data) VALUES (?, ?)
//        ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
//       [saved.id, json]
//     )
//     return saved
//   }

//   async deleteRow(tableName, id) {
//     await this._exec(`DELETE FROM "${tableName}" WHERE id = ?`, [id])
//   }

//   async applyDelta(tableName, { deletes = [], updates = [] }) {
//     for (const { id } of deletes) await this.deleteRow(tableName, id)
//     for (const row of updates)    await this.saveRow(tableName, row)
//   }

//   async clearAll() {
//     const { SCHEMA } = await import('../schema.js')
//     for (const table of SCHEMA) {
//       await this._exec(`DELETE FROM "${table.name}"`).catch(() => {})
//     }
//   }
// }
