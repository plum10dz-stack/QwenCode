# Data Sync — Architecture & AI Coding Map

> **Purpose:** This is an AI-actionable implementation guide. Every section names the exact file, method, and expected signature. Follow the checklist steps in order. Each Check Point confirms the step is working before moving to the next.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SERVICE WORKER                               │
│                                                                     │
│  sw/index.ts                                                        │
│    ├── loadEnv()      → reads Env (API_URL, S-ID, cert)            │
│    ├── initDB()       → mounts LocalDB + ServerDB                  │
│    ├── initialSync()  → catches up from lastTimeUpdate             │
│    └── startLiveSync()                                              │
│          ├── [PRIMARY]  ServerDB.connectStream(since)   ──SSE──►   │
│          └── [FALLBACK] ServerDB.startPolling()         ──poll─►   │
│                                                                     │
│  sw/init.ts                                                         │
│    ├── LocalDB  (IndexedDB adapter)                                 │
│    │     ├── applyServerUpdates(tables, time)                      │
│    │     │     └─ filters locally:false tables                     │
│    │     ├── setLastTimeUpdate(time) / getLastTimeUpdate()         │
│    │     ├── flushQueue(serverDB)                                  │
│    │     └── emit('rows:changed' | 'rows:deleted')                │
│    └── ServerDB (HTTP adapter)                                      │
│          ├── _post(tableName, method, data)  ← sequential queue   │
│          ├── getUpdates(since)               ← polls /data/...     │
│          ├── connectStream(since)            ← SSE stream          │
│          ├── applyDelta(tableName, delta)    ← feeds LocalDB       │
│          └── emit('updates', { data, time })                       │
│                                                                     │
│  swChannel (BroadcastChannel)                                       │
│    └── fires 'rows:changed' / 'rows:deleted' → all UI tabs        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key Files Reference

| File | Role |
|---|---|
| `src/sw/index.ts` | SW entry — boot, events, live-sync wiring |
| `src/sw/init.ts` | DB init — mounts `LocalDB` and `ServerDB` |
| `src/workspace/routers/dbStream.ts` | SSE connect stub (needs full impl.) |
| `src/utils/datasource/ServerDB.ts` | HTTP adapter. Wrap all server calls |
| `src/utils/datasource/LocalDB.ts` | IDB adapter. All local reads/writes |
| `src/utils/datasource/Datasource.ts` | Abstract base; has `applyDelta` abstract |
| `src/utils/networking/http.ts` | `http.fetch()` + `http.fetchStream()` |
| `src/workspace/config.ts` | `StockOS_CONFIG`, `TableName`, `TABLE_NAMES` |
| `src/workspace/types.ts` | `QueueEntry`, `SyncStatus`, `ServerUpdatePayload` |

---

## 1. Type Contracts (No Ambiguity)

### 1.1 StreamChunk — what the server sends per SSE event
```typescript
// src/workspace/types.ts  → ADD this interface
export interface StreamChunk {
  table: string;       // must match a key in StockOS_CONFIG.TABLES
  rows: BaseRow[];     // upserts — include the `deleted` flag
  deletes: BaseRow[];  // rows to hard-delete ({ id } is enough)
  time: number;        // epoch ms — becomes the new lastTimeUpdate
}
```

### 1.2 DeltaPayload — internal shape passed around in the SW
```typescript
// src/workspace/types.ts  → ADD this interface
export interface DeltaPayload {
  data: Record<string, BaseRow[]>;  // tableName → rows (with deleted flag)
  time: number;
}
```
> `ServerUpdatePayload` is already defined (tables → rows). The `DeltaPayload` adds a `time` field and flattens `rows + deletes` into a single array (deleted rows carry `deleted: true`).

---

## 2. `Datasource.ts` — Signature Fix

**File:** `src/utils/datasource/Datasource.ts`  
**Current:** `abstract applyDelta(tableName: any, delta: { deletes: ROW[], updates: ROW[] }): Promise<void>`  
**Keep as-is** — `LocalDB` implements this. `ServerDB` overrides it differently (see §4).

---

## 3. `ServerDB.ts` Refactoring

**File:** `src/utils/datasource/ServerDB.ts`

### 3.1 Add private state fields (constructor)
```typescript
// After this._postQueue = Promise.resolve()
private _streamAbort: AbortController | null = null;
private _isStreaming: boolean = false;
```

### 3.2 `applyDelta` — Override the abstract
Signature must match `Datasource`:
```typescript
async applyDelta(tableName: string, delta: { deletes: Row[], updates: Row[] }): Promise<void> {
  // Merge updates and deletes into a single array using the deleted flag
  const merged = [
    ...delta.updates,
    ...delta.deletes.map(r => ({ ...r, deleted: true })),
  ];
  // Emit 'updates' so the listener in init.ts calls localDB.applyServerUpdates
  this.emit('updates', {
    data: { [tableName]: merged },
    time: Date.now(),
  });
}
```

### 3.3 `sync(since)` — Fetch & Apply a Full Delta Round
```typescript
async sync(since: Date | number = new Date(0)): Promise<void> {
  const tables = await this.getUpdates(since);
  if (!tables || typeof tables !== 'object') return;
  // tables is Record<tableName, Row[]> — emit once for all tables
  this.emit('updates', { data: tables, time: Date.now() });
}
```

### 3.4 `connectStream(since)` — SSE loop with abort
```typescript
async connectStream(since: Date | number = new Date(0)): Promise<void> {
  // Convert to ms
  const sinceMs = since instanceof Date ? since.getTime() : Number(since || 0);
  this._isStreaming = true;
  this._streamAbort = new AbortController();

  const stream = http.fetchStream({
    route: '/stream/changes',
    method: 'GET',
    headers: { 'since': sinceMs.toString() },
  });

  try {
    for await (const { chunk } of stream) {
      if (!this._isStreaming) break;           // aborted externally
      let parsed: StreamChunk;
      try { parsed = typeof chunk === 'string' ? JSON.parse(chunk) : chunk; }
      catch { continue; }                      // skip malformed chunk

      if (!parsed.table) continue;

      // Re-use applyDelta per table
      await this.applyDelta(parsed.table, {
        updates: parsed.rows ?? [],
        deletes: parsed.deletes ?? [],
      });

      // Signal init.ts that lastTimeUpdate should advance
      this.emit('stream:tick', { time: parsed.time ?? Date.now() });
    }
  } finally {
    this._isStreaming = false;
  }
}
```

### 3.5 `stopStream()` — Clean disconnect
```typescript
stopStream(): void {
  this._isStreaming = false;
  this._streamAbort?.abort();
  this._streamAbort = null;
}
```

### 3.6 `getUpdates(since)` — Fix `since` serialization
```typescript
async getUpdates(since: Date | string | number) {
  // Always send ISO string so the server can parse it reliably
  const s = since instanceof Date
    ? since.toISOString()
    : (typeof since === 'number' ? new Date(since).toISOString() : since);
  return (await this._post('system', 'getUpdates', { since: s })).data;
}
```

---

## 4. `LocalDB.ts` — Verify & Harden

**File:** `src/utils/datasource/LocalDB.ts`

### 4.1 `applyServerUpdates` must skip `locally: false` tables
```typescript
async applyServerUpdates(tables: Record<string, Row[]>, time: any) {
  if (!tables) return;
  for (const [tableName, tableData] of Object.entries(tables)) {
    // ── GATE: only process tables that are locally cached ──
    const schema = this._cfg.TABLES[tableName as N];
    if (!schema || schema.locally === false) continue;   // ← ADD THIS CHECK

    const rows = tableData ?? [];
    if (!rows.length) continue;
    // ... rest of existing upsert/delete logic unchanged
  }
  await this.setLastTimeUpdate(time);
}
```

### 4.2 `setLastTimeUpdate` / `getLastTimeUpdate` — Already implemented via `keyValue()`
Verify:
- `setLastTimeUpdate(time)` stores ISO string at key `'lastUpdate'` in the `cache` object store. ✓
- `getLastTimeUpdate()` returns a `Date`, defaults to `new Date(0)`. ✓

### 4.3 `flushQueue` — Add online guard
```typescript
async flushQueue(serverDB: ServerDB): Promise<void> {
  if (!navigator.onLine) return;    // ← ADD: do not attempt if offline
  const entries = await this.getPendingQueue();
  // ... existing logic unchanged
}
```

---

## 5. `sw/init.ts` — Wire the DB Lifecycle

**File:** `src/sw/init.ts`

### 5.1 Add `_auth` toggle and online handler
```typescript
let _auth = false;                         // already exists

// After serverDB.on({ 'updates': ..., 'startPolling': ..., 'stopPolling': ... })
// ADD:
serverDB.on('stream:tick', async ({ time }: { time: number }) => {
  await localDB.setLastTimeUpdate(time);
});
```

### 5.2 `_tick` — use `localDB.getLastTimeUpdate()`
Already implemented. Confirm it calls `serverDB.getUpdates(await localDB.getLastTimeUpdate())`. ✓

### 5.3 Initial sync on boot
```typescript
// At the end of _boot(), AFTER serverDB.startPolling():
const since = await localDB.getLastTimeUpdate();
await serverDB.sync(since);              // fetch anything missed while SW was inactive
```

### 5.4 Export `setAuth` helper for `sw/index.ts` to call
```typescript
export function setAuth(value: boolean) {
  _auth = value;
}
```

---

## 6. `sw/index.ts` — Live Sync Wiring

**File:** `src/sw/index.ts`

### 6.1 Start SSE after initDB and initial sync
```typescript
export default async function init() {
  await loadEnv();
  await initDB();

  // ── Initial catch-up sync ──────────────────────────────────────────
  const since = await DB.localDB.getLastTimeUpdate();
  await DB.serverDB.sync(since);                  // one-shot delta fetch

  // ── Live SSE stream with polling fallback ─────────────────────────
  startLiveSync();

  // ── Auth events ───────────────────────────────────────────────────
  on('AUTH', 'CONNECTED', () => {
    setAuth(true);
    DB.localDB.flushQueue(DB.serverDB);           // flush offline queue on login
  });
  on('AUTH', 'DISCONNECTED', () => setAuth(false));
}
```

### 6.2 `startLiveSync()` — SSE + polling fallback
```typescript
async function startLiveSync() {
  let usingSSE = false;

  async function connectSSE() {
    usingSSE = true;
    DB.serverDB.stopPolling();                    // disable polling while SSE is live
    try {
      const since = await DB.localDB.getLastTimeUpdate();
      await DB.serverDB.connectStream(since);     // blocks until stream closes
    } catch (err) {
      console.warn('[SW] SSE stream ended:', err);
    } finally {
      usingSSE = false;
      DB.serverDB.startPolling();                 // fall back to polling
    }
  }

  // First connection attempt
  connectSSE();

  // On every online event: reconnect SSE + flush queue
  self.addEventListener('online', async () => {
    await DB.localDB.flushQueue(DB.serverDB);
    if (!usingSSE) connectSSE();
  });
}
```

---

## 7. `dbStream.ts` — Promote to Full Module

**File:** `src/workspace/routers/dbStream.ts`  
This file is currently a standalone stub. Promote it by removing the self-assignment and replacing with a clean export:

```typescript
import { http } from '../../utils/networking/http';
import { StreamChunk } from '../../workspace/types';

/**
 * Raw SSE generator — yields parsed StreamChunk objects.
 * Caller (ServerDB.connectStream) handles filtering and applyDelta.
 */
export async function* streamChanges(since: number): AsyncGenerator<StreamChunk> {
  const stream = http.fetchStream({
    route: '/stream/changes',
    method: 'GET',
    headers: { 'since': since.toString() },
  });
  for await (const { chunk } of stream) {
    try {
      const parsed = typeof chunk === 'string' ? JSON.parse(chunk) : chunk;
      if (parsed?.table) yield parsed as StreamChunk;
    } catch { /* skip */ }
  }
}
```

> `ServerDB.connectStream` can then import `streamChanges` to avoid duplicating parsing logic.

---

## 8. Implementation Checklist

### STEP 1 — Type Contracts
- [x] `src/workspace/types.ts`: Added `StreamChunk` interface
- [x] `src/workspace/types.ts`: Added `DeltaPayload` interface

### STEP 2 — ServerDB
- [x] `src/utils/datasource/ServerDB.ts`: Added `_streamAbort` + `_isStreaming` private fields
- [x] `src/utils/datasource/ServerDB.ts`: Implemented `applyDelta(tableName, delta)`
- [x] `src/utils/datasource/ServerDB.ts`: Implemented `sync(since)`
- [x] `src/utils/datasource/ServerDB.ts`: Implemented `connectStream(since)` with abort support + `stream:tick`
- [x] `src/utils/datasource/ServerDB.ts`: Implemented `stopStream()`
- [x] `src/utils/datasource/ServerDB.ts`: Fixed `getUpdates` — always sends ISO string
- [x] `src/utils/networking/http.ts`: Added `signal?: AbortSignal` to `request` interface, wired to both `fetch` and `fetchStream`

### STEP 3 — dbStream.ts
- [x] `src/workspace/routers/dbStream.ts`: Replaced stub with `streamChanges()` NDJSON/SSE generator
  - Handles both `data: <JSON>` (SSE) and raw NDJSON lines
  - Accumulates partial lines in a buffer — no dropped chunks
  - Forwards `AbortSignal` to `http.fetchStream`

### STEP 4 — LocalDB hardening
- [x] `src/utils/datasource/LocalDB.ts`: Added `locally !== true` guard in `applyServerUpdates`
- [x] `src/utils/datasource/LocalDB.ts`: Added `!navigator.onLine` guard in `flushQueue`

### STEP 5 — init.ts
- [x] `src/sw/init.ts`: Fixed `updates` handler — passes `payload.time` (not 0) to `applyServerUpdates`
- [x] `src/sw/init.ts`: Added `stream:tick` handler — persists server-authoritative timestamp
- [x] `src/sw/init.ts`: Exported `setAuth(value: boolean)`
- [x] `src/sw/init.ts`: `_tick()` now calls `serverDB.sync(since)` instead of lower-level getUpdates

### STEP 6 — index.ts
- [x] `src/sw/index.ts`: Initial catch-up `sync()` on `AUTH.CONNECTED`
- [x] `src/sw/index.ts`: `startLiveSync()` — SSE primary, polling fallback, exponential backoff (1 s → 30 s, ×2, ±500 ms jitter)
- [x] `src/sw/index.ts`: `flushQueue()` on both `AUTH.CONNECTED` and `'online'` events
- [x] `src/sw/index.ts`: `stopLiveSync()` on `AUTH.DISCONNECTED`
- [x] `src/sw/index.ts`: Idempotent `startLiveSync` / `stopLiveSync` via `_liveSync` handle

### STEP 7 — End-to-End Validation (TODO: run after server ready)
- [ ] **✅ Check (SSE):** Update a Product on the server. Verify SSE chunk arrives and `products` IDB store updates within 1–2 s without a page refresh.
- [ ] **✅ Check (Polling fallback):** Disable the SSE endpoint. Verify polling activates every `POLL_INTERVAL` and still applies updates.
- [ ] **✅ Check (Queue flush):** Create a Sales Order offline. Reconnect. Verify `syncStatus` transitions `pending → synced`.
- [ ] **✅ Check (Filter):** Send an `order_lines` chunk via SSE. Verify IndexedDB `order_lines` store is NOT written (locally:false guard active).

---

## 9. Known Bugs to Fix

| Location | Bug | Fix |
|---|---|---|
| `dbStream.ts` L12 | `since.getUTCMilliseconds()` returns only the ms component (0–999), not the epoch | Use `since.getTime()` or `since.toISOString()` |
| `Datasource.ts` L39 | `localStorage` is not available in SW scope | Move `lastTimeUpdate` to `LocalDB.keyValue()` (already done in LocalDB) |
| `ServerDB.ts` L124 | Stale `sleep()` stub causes TS error | Remove it |
