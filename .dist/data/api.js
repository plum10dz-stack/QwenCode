"use strict";
// import { Memory } from '../utils/stores/Memory'
// // @ts-ignore
// const env = (import.meta as any).env;
// const USE_SUPABASE = !!env?.VITE_SUPABASE_URL
// const USE_API = !!env?.VITE_API_URL
// //const localDB = DB.localDB;
// let _memory: Memory;
// export function getMemory() { return _memory }
// export async function importFile(file: string) {
//   // @ts-ignore
//   return await require(file);
// }
// async function buildStoreChain() {
//   // const localStore = localDB
//   // if (USE_SUPABASE) {
//   //   const { SupabaseStore } = await importFile('./stores/SupabaseStore.js')
//   //   return { store: new SupabaseStore(localStore), localStore }
//   // }
//   // if (USE_API) {
//   //   const { ServerStore } = await importFile('./stores/ServerStore.js')
//   //   return {
//   //     store: new ServerStore(localStore, {
//   //       apiUrl: env.VITE_API_URL,
//   //       wsUrl: env.VITE_WS_URL ?? '',
//   //     }),
//   //     localStore,
//   //   }
//   // }
//   // return { store: localStore, localStore }
// }
// export async function initApi() {
//   // const { store } = await buildStoreChain()
//   _memory = new Memory(store)
//   //await _memory.init()
//   return _memory
// }
// /** Full API object */
// export const api = {
//   get store() { return DB.serverDB; },
//   get memory() { return _memory },
// }
