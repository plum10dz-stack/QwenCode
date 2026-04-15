"use strict";
// import { Store } from '../core/Store'
// import { SCHEMA, DB_NAME, DB_VERSION } from '../schema'
// import { uuid, now } from '../../utils/helpers'
// import { LocalDB } from '../../utils/LocalDB'
// import { Row } from '../../utils/Row'
// /**
//  * IndexedDBStore — persists all data in the browser's IndexedDB.
//  *
//  * Used as the LocalStore inside ServerStore on web/Electron targets.
//  * Can also be used as a standalone store when there is no backend.
//  *
//  * LocalStore is null — this is the bottom of the persistence chain.
//  */
// export class IndexedDBStore extends Store<Row> {
//   constructor(readonly localDB: LocalDB) {
//     super();
//     /** @type {IDBDatabase|null} */
//   }
//   get LocalStore() { return null }
//   // ── Open / upgrade the database ─────────────────────────────────────────────
//   // ── Store interface implementation ───────────────────────────────────────────
//   async getNewId(_tableName: any) {
//     return uuid()
//   }
//   async newRow(tableName: any) {
//     const id = await this.getNewId(tableName)
//     return { id, created_at: now() } as any
//   }
//   async auth(_user: any, _callback: any) {
//   }
//   /**
//    * init() for IndexedDB just opens the database.
//    * Hydration of Memory is done by Memory.init() calling getAll().
//    */
//   async init() {
//   }
//   async getAll(tableName: string) {
//     return await this.localDB.getAll(tableName) as any;
//   }
//   async saveRow(tableName: any, row: any) {
//     const n = now()
//     const saved = {
//       ...row,
//       updated_at: n,
//       created_at: row.created_at || n,
//       id: row.id || uuid(),
//     }
//     return await this.localDB.insert(tableName, <any>saved) as any as Promise<any>;
//     //await this._tx(tableName, 'readwrite', (store: { put: (arg0: any) => any }) => store.put(saved))
//   }
//   async deleteRow(tableName: any, id: any) {
//     return await this.localDB.delete(tableName, id);
//     //await this._tx(tableName, 'readwrite', (store: { delete: (arg0: any) => any }) => store.delete(id))
//   }
//   /**
//    * Bulk-apply a delta received from the server.
//    * Used by ServerStore after an API sync.
//    * @param {string} tableName
//    * @param {{ deletes:{id:any}[], updates:object[] }} delta
//    */
//   async applyDelta(tableName: any, { deletes = [], updates = [] }: any) {
//     // const db = await this._open()
//     // return new Promise((resolve, reject) => {
//     //   const tx = db.transaction(tableName, 'readwrite')
//     //   const store = tx.objectStore(tableName)
//     //   for (const { id } of deletes) store.delete(id)
//     //   for (const row of updates) store.put(row)
//     //   tx.oncomplete = resolve
//     //   tx.onerror = (e: { target: { error: any } }) => reject(e.target.error)
//     // })
//   }
//   /**
//    * Clear all data from all tables (used for reset / re-seed).
//    */
//   async clearAll() {
//   }
// }
